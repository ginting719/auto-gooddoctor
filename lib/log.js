'use strict';

// URL Web App Apps Script yang menulis baris ke sheet "LOG".
// Wajib diisi lewat env LOG_WEBAPP_URL (atau file .env) — tanpa default rahasia.
const LOG_WEBAPP_URL = require('./config').logWebAppUrl;

const https = require('https');
const http = require('http');

/**
 * Kirim satu baris log (tanggal, jam, nama toko) ke Apps Script.
 * Tidak melempar error — cukup log ke console bila gagal, supaya
 * proses download CSV user tidak terganggu.
 */
function sendLog({ tanggal, jam, namaToko }) {
  if (!LOG_WEBAPP_URL) return Promise.resolve();
  return new Promise((resolve) => {
    const body = JSON.stringify({ tanggal, jam, namaToko });
    const mod = LOG_WEBAPP_URL.startsWith('https') ? https : http;
    const req = mod.request(
      LOG_WEBAPP_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve());
      }
    );
    req.on('error', (err) => {
      console.error('Gagal menulis log:', err.message);
      resolve();
    });
    req.end(body);
  });
}

function nowParts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const tanggal = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const jam = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return { tanggal, jam };
}

module.exports = { sendLog, nowParts, LOG_WEBAPP_URL };
