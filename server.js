'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { loadStockSheet, loadGdtSheet, loadTemplateSheet, loadLogSheet } = require('./lib/sheets');
const { processCsv } = require('./lib/process');
const { sendLog, nowParts } = require('./lib/log');
const cfg = require('./lib/config');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// Password admin diambil dari env/.env (lihat lib/config.js) — tanpa default.
const ADMIN_PASSWORD = cfg.adminPassword;

// Validasi konfigurasi wajib sebelum server berjalan.
if (!cfg.gdtSpreadsheetId || !cfg.stockSpreadsheetId) {
  console.error(
    'Konfigurasi tidak lengkap. Salin .env.example menjadi .env dan isi ' +
      'GDT_SPREADSHEET_ID serta STOCK_SPREADSHEET_ID.'
  );
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error(
    'ADMIN_PASSWORD belum diisi. Isi di file .env (lihat .env.example).'
  );
  process.exit(1);
}

let cache = null;
let cacheAge = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // refetch sheets at most every 10 min

// Token sesi admin sederhana (in-memory).
const adminTokens = new Set();
function randomToken() {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

async function getSheets(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && cache && now - cacheAge < CACHE_TTL_MS) {
    return cache;
  }
  const [stock, gdt, template] = await Promise.all([
    loadStockSheet(),
    loadGdtSheet(),
    loadTemplateSheet(),
  ]);
  cache = { stock, gdt, template };
  cacheAge = now;
  return cache;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  const setJson = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  try {
    // GET /api/stores -> list of stores + sheet status
    if (url.pathname === '/api/stores' && req.method === 'GET') {
      const { stock, gdt, template } = await getSheets(false);
      setJson(200, {
        stores: stock.stores,
        storeCount: stock.stores.length,
        gdtIdCount: gdt.byId.size,
        templateCount: template ? template.rowsCount : 0,
      });
      return;
    }
    // POST /api/generate
    else if (url.pathname === '/api/generate' && req.method === 'POST') {
      const body = await readBody(req);
      const { store, csvText, refresh } = body || {};
      if (!store) {
        setJson(400, { error: 'Pilih toko terlebih dahulu.' });
        return;
      }
      const sheets = await getSheets(!!refresh);
      // If no CSV is uploaded, fall back to the automatic TEMPLATE sheet.
      const text = csvText && csvText.trim() ? csvText : sheets.template.csvText;
      const result = processCsv({
        csvText: text,
        store,
        gdt: sheets.gdt,
        stock: sheets.stock,
      });
      setJson(200, result);
      return;
    }
    // Log download CSV ke sheet LOG (via Apps Script)
    else if (url.pathname === '/api/log' && req.method === 'POST') {
      const body = await readBody(req);
      const { namaToko } = body || {};
      await sendLog({ ...nowParts(), namaToko });
      setJson(200, { ok: true });
      return;
    }
    // Admin: verifikasi password -> token sesi
    else if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await readBody(req);
      if ((body && body.password) === ADMIN_PASSWORD) {
        const token = randomToken();
        adminTokens.add(token);
        setJson(200, { ok: true, token });
      } else {
        setJson(401, { error: 'Password salah.' });
      }
      return;
    }
    // Admin: ambil isi sheet LOG (butuh token sesi)
    else if (url.pathname === '/api/admin/log' && req.method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token || !adminTokens.has(token)) {
        setJson(401, { error: 'Sesi admin tidak valid.' });
        return;
      }
      const log = await loadLogSheet();
      setJson(200, { ok: true, entries: log.entries });
      return;
    }
    // Force refresh sheets
    else if (url.pathname === '/api/refresh' && req.method === 'POST') {
      await getSheets(true);
      setJson(200, { ok: true });
      return;
    }
    // Static files
    else {
      const ext = path.extname(url.pathname) || '.html';
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
      };
      let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
      let body;
      try {
        body = fs.readFileSync(filePath);
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': types[ext] || 'application/octet-stream',
      });
      res.end(body);
    }
  } catch (err) {
    setJson(500, { error: err.message || 'Terjadi kesalahan.' });
  }
});

server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Stock Generator berjalan: http://localhost:${PORT}`);
  // warm the cache so the first request is fast
  getSheets(false).catch((e) => console.error('Gagal memuat sheet awal:', e.message));
});