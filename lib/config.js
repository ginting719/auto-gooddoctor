'use strict';

// Loader .env minimal (tanpa dependency) + akses konfigurasi terpusat.
// Rahasia TIDAK boleh di-hardcode di kode — semua lewat env / file .env.

const fs = require('fs');
const path = require('path');

// Muat file .env di root project jika ada (tidak akan di-commit).
(function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return; // tidak ada .env — andalkan process.env
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Lepas kutip jika ada
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Jangan timpa env yang sudah ada di process.env
    if (process.env[key] === undefined) process.env[key] = value;
  }
})();

const cfg = {
  // Spreadsheet ID — wajib diisi lewat env/.env (lihat .env.example).
  // Tanpa default agar identitas spreadsheet tidak bocor di repo publik.
  gdtSpreadsheetId: process.env.GDT_SPREADSHEET_ID || '',
  stockSpreadsheetId: process.env.STOCK_SPREADSHEET_ID || '',

  // URL Web App Apps Script untuk menulis log (wajib via env, tanpa default rahasia)
  logWebAppUrl: process.env.LOG_WEBAPP_URL || '',

  // Password admin — WAJIB via env; tanpa default agar tidak bocor di repo
  adminPassword: process.env.ADMIN_PASSWORD || '',
};

module.exports = cfg;
