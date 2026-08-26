'use strict';

// Parse CSV text into an array of row arrays. Handles quoted fields,
// escaped quotes (""), and embedded commas / newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }

  // Last field if there's trailing content without a newline
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// Serialize an array of row arrays (or objects with a header row) to CSV text.
// `rows` must be an array of arrays. Quotes fields containing comma, quote or newline.
function toCsv(rows) {
  return rows
    .map((row) =>
      row.map((cell) => {
        const s = String(cell == null ? '' : cell);
        if (/[",\r\n]/.test(s)) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',')
    )
    .join('\r\n');
}

// Convert parsed rows (first row = headers) into an array of objects keyed by header.
function toObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (r[idx] != null ? r[idx] : '').trim();
    });
    return obj;
  });
}

module.exports = { parseCsv, toCsv, toObjects };