'use strict';

const https = require('https');
const { parseCsv } = require('./csv');
const cfg = require('./config');

const GDT_SPREADSHEET_ID = cfg.gdtSpreadsheetId;
const GDT_GID = '34427666'; // sheet name: GDT
const TEMPLATE_GID = '839524543'; // sheet name: TEMPLATE (template produk otomatis)

const STOCK_SPREADSHEET_ID = cfg.stockSpreadsheetId;
const STOCK_GID = '440347658'; // sheet name: STOCK

// Fetch a URL with a GET, manually following up to `maxRedirects` redirects.
// Node's http/https does not follow redirects automatically.
function getWithRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const doGet = (target, hops) => {
      const mod = target.startsWith('https') ? https : require('http');
      const req = mod.get(
        target,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume(); // drain
            const next = new URL(res.headers.location, target).toString();
            if (hops >= maxRedirects) {
              return reject(new Error(`Terlalu banyak redirect (${hops}) saat mengambil sheet.`));
            }
            return doGet(next, hops + 1);
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolve({ status, body: Buffer.concat(chunks).toString('utf8') })
          );
        }
      );
      req.on('error', (err) => reject(new Error('Network error: ' + err.message)));
    };
    doGet(url, 0);
  });
}

function fetchGoogleSheetCsv(spreadsheetId, gid) {
  const url =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export` +
    `?format=csv&gid=${gid}`;

  return getWithRedirects(url).then(({ status, body }) => {
    if (status !== 200) {
      throw new Error(
        `Google Sheets responded with HTTP ${status}. ` +
          'Make sure the sheet is shared "Anyone with the link can view".'
      );
    }
    if (!body.includes(',')) {
      throw new Error(
        'The sheet returned an empty or unexpected response. ' +
          'Check that the spreadsheet is publicly viewable.'
      );
    }
    return body;
  });
}

function normalizeCode(v) {
  return String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
}

// Parse an Indonesian-formatted number.
// - When the comma is a thousands separator ("17,000", "196,900"), strip commas.
// - When the comma is a decimal separator ("0,7", "39,57"), turn it into a dot.
// Heuristic: /^\d{1,3}(,\d{3})+$/ => thousands separator; otherwise commas are decimals.
function parseNumber(raw) {
  const s = String(raw == null ? '' : raw).replace(/"/g, '').trim();
  if (!s) return null;
  const compact = s.replace(/\s/g, '');
  if (!/^[\d.,-]+$/.test(compact)) return null;

  // Handle negative sign.
  let neg = false;
  let v = compact;
  if (v.startsWith('-')) { neg = true; v = v.slice(1); }

  if (/,/.test(v) && !/\./.test(v) && /^\d{1,3}(,\d{3})+$/.test(v)) {
    // thousands separator, e.g. 17,000
    v = v.replace(/,/g, '');
  } else if (/,/.test(v)) {
    // decimal separator, e.g. 0,7 or 39,57
    v = v.replace(/,/g, '.');
  }

  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

// STOCK quantities: comma is always a decimal separator here (e.g. "0,7").
function parseStockQty(raw) {
  const n = parseNumber(raw);
  if (n === null) return 0;
  // Keep fractional boxes as-is (e.g. 0.7).
  return n;
}

// Load STOCK sheet: rows keyed by item code, with a map of store name -> qty.
async function loadStockSheet() {
  const csv = await fetchGoogleSheetCsv(STOCK_SPREADSHEET_ID, STOCK_GID);
  const rows = parseCsv(csv);
  const header = rows[0].map((h) => h.trim().toUpperCase());

  const idxToko = header.indexOf('NAMA TOKO');
  const idxCode = header.indexOf('ITEM CODE');
  const idxStok = header.indexOf('STOK'); // sheet header uses "STOK"
  const idxStok2 = header.indexOf('STOCK');

  const stockIndex = idxStok >= 0 ? idxStok : idxStok2;
  if (idxToko < 0 || idxCode < 0 || stockIndex < 0) {
    throw new Error(
      `STOCK sheet column not found. Headers: [${header.join(', ')}]`
    );
  }

  const stores = new Set();
  // store name -> item code -> qty (number)
  const byStore = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const toko = (r[idxToko] || '').trim();
    const code = normalizeCode(r[idxCode]);
    const qty = parseStockQty(r[stockIndex]);
    if (!toko || !code) continue;

    stores.add(toko);
    if (!byStore.has(toko)) byStore.set(toko, new Map());
    byStore.get(toko).set(code, qty);
  }

  return {
    sheetName: 'STOCK',
    stores: [...stores].sort(),
    byStore,
  };
}

// Load GDT sheet: map ID -> { mother, itemFactor, gdtPrice }.
async function loadGdtSheet() {
  const csv = await fetchGoogleSheetCsv(GDT_SPREADSHEET_ID, GDT_GID);
  const rows = parseCsv(csv);
  const header = rows[0].map((h) => h.trim().toUpperCase());

  const idxId = header.indexOf('ID');
  const idxMother = header.indexOf('ITEM CODE MOTHER');
  const idxFactor = header.indexOf('ITEM FACTOR');
  const idxGdtPrice = header.indexOf('HARGA MEMBER + 10% ROUND UP');
  const idxStatusJual = header.indexOf('STATUS JUAL');

  if (
    idxId < 0 ||
    idxMother < 0 ||
    idxFactor < 0 ||
    idxGdtPrice < 0 ||
    idxStatusJual < 0
  ) {
    throw new Error(
      `GDT sheet column not found. Headers: [${header.join(', ')}]`
    );
  }

  const byId = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = normalizeCode(r[idxId]);
    if (!id) continue;

    const mother = normalizeCode(r[idxMother]);
    const factor = parseNumber(r[idxFactor]);
    const gdtPrice = parseNumber(r[idxGdtPrice]);
    const statusJual = (r[idxStatusJual] || '').trim().toLowerCase();

    const rec = {
      id,
      mother,
      itemFactor: factor === null || factor === 0 ? 1 : factor,
      gdtPrice,
      jualApprove: isJualApprove(statusJual),
    };

    if (!byId.has(id)) byId.set(id, rec);
  }

  return { sheetName: 'GDT', byId };
}

// A row is "approve to sell" when Status Jual mentions "jual approve"
// (covers both "jual approve" and "jual approve - mapping satuan box").
function isJualApprove(statusJual) {
  return /jual approve/.test(statusJual);
}

// Load TEMPLATE sheet: the default product list used when the user does not
// upload a CSV. Returns the raw CSV text so it can be fed to processCsv().
async function loadTemplateSheet() {
  const csv = await fetchGoogleSheetCsv(GDT_SPREADSHEET_ID, TEMPLATE_GID);
  const rows = parseCsv(csv);
  const header = (rows[0] || []).map((h) => h.trim().toLowerCase());
  if (header.indexOf('product_name') < 0 || header.indexOf('product_id') < 0) {
    throw new Error(
      `TEMPLATE sheet column not found. Headers: [${header.join(', ')}]`
    );
  }
  return { sheetName: 'TEMPLATE', csvText: csv, rowsCount: Math.max(0, rows.length - 1) };
}

// Load LOG sheet rows (tanggal, jam, nama toko) for the admin panel.
// Uses the gviz endpoint with sheet name so no gid is needed.
async function loadLogSheet() {
  const url =
    `https://docs.google.com/spreadsheets/d/${GDT_SPREADSHEET_ID}/gviz/tq` +
    `?sheet=LOG&tqx=out:csv`;

  const { status, body } = await getWithRedirects(url);
  if (status !== 200) {
    throw new Error(`Google Sheets responded with HTTP ${status} saat membaca LOG.`);
  }

  const rows = parseCsv(body);
  const header = (rows[0] || []).map((h) => h.trim().toLowerCase());

  const idxTgl = header.indexOf('tanggal');
  const idxJam = header.indexOf('jam');
  const idxToko = header.indexOf('nama toko');
  if (idxTgl < 0 || idxJam < 0 || idxToko < 0) {
    throw new Error(
      `LOG sheet column not found. Headers: [${header.join(', ')}]`
    );
  }

  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const tanggal = (r[idxTgl] || '').trim();
    const jam = (r[idxJam] || '').trim();
    const namaToko = (r[idxToko] || '').trim();
    if (!tanggal && !jam && !namaToko) continue;
    entries.push({ tanggal, jam, namaToko });
  }
  // Terbaru dulu
  entries.reverse();
  return { sheetName: 'LOG', entries };
}

module.exports = {
  loadStockSheet,
  loadGdtSheet,
  loadTemplateSheet,
  loadLogSheet,
  normalizeCode,
  parseNumber,
};