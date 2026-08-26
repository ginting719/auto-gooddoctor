/**
 * LOG update stok untuk "Generator Update Stok".
 *
 * CARA PASANG (sekali saja):
 * 1. Buka spreadsheet yang berisi sheet "LOG" (spreadsheet GDT).
 * 2. Klik menu: Extensions > Apps Script.
 * 3. Hapus isi editor, tempel seluruh isi file ini, lalu simpan (Ctrl+S).
 * 4. Klik Deploy > New deployment > pilih type "Web app".
 *    - Description      : bebas, misal "LOG update stok"
 *    - Execute as       : Me
 *    - Who has access   : Anyone
 * 5. Klik Deploy, setujui izin, lalu salin URL Web App (berakhiran /exec).
 * 6. Isi URL tersebut ke konstanta LOG_WEBAPP_URL di server.js.
 *
 * Server mengirim POST ke URL ini setiap kali tombol
 * "Download Hasil CSV" diklik, dengan body JSON:
 *   { "tanggal": "26/08/2026", "jam": "14:30:05", "namaToko": "..." }
 */

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('LOG') || ss.insertSheet('LOG');

    // Buat header sekali saja jika sheet masih kosong.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Tanggal', 'Jam', 'Nama Toko']);
    }

    sheet.appendRow([data.tanggal || '', data.jam || '', data.namaToko || '']);

    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
