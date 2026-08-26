'use strict';

const { parseCsv, toCsv } = require('./csv');
const { normalizeCode } = require('./sheets');

const EXPECTED_HEADERS = ['product_name', 'product_id', 'price', 'stock'];

/**
 * Process an uploaded template CSV against the given store.
 *
 * Returns the generated CSV text (same 4 columns as the input) plus statistics
 * so the UI can report how many rows matched / produced results.
 */
function processCsv({ csvText, store, gdt, stock }) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error('File CSV kosong.');

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colProduct = header.indexOf('product_name');
  const colProductId = header.indexOf('product_id');

  if (colProduct < 0 || colProductId < 0) {
    throw new Error(
      'Kolom pada CSV tidak sesuai. Butuh kolom: ' +
        EXPECTED_HEADERS.join(', ') +
        '. Ditemukan: ' +
        (header.join(', ') || '(kosong)')
    );
  }

  // price / stock columns are optional — nilai akhir ditentukan dari GDT,
  // bukan dari template, jadi tidak perlu membaca kolom template tersebut.
  const storeStock = stock.byStore.get(store) || new Map();

  const stats = {
    totalRows: 0,
    matchedGdt: 0,
    matchedStock: 0,
    computed: 0,
    noGdt: 0,
    noStock: 0,
    notApprove: 0,
    zeroFactor: 0,
  };

  const outRows = [EXPECTED_HEADERS.slice()];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 0 || (r.length === 1 && r[0].trim() === '')) continue;
    stats.totalRows++;

    const productId = normalizeCode(r[colProductId]);
    const productName = (r[colProduct] || '').trim();

    // Lookup product_id against the GDT ID column.
    const gdtRec = gdt.byId.get(productId);
    if (gdtRec) stats.matchedGdt++;

    // Hanya item yang ada di GDT & ber-status "jual approve" yang di-update;
    // selain itu stock & price menjadi 0.
    let price = '0';
    let stockVal = '0';

    if (gdtRec && gdtRec.jualApprove) {
      if (gdtRec.mother) {
        const qty = storeStock.get(gdtRec.mother);
        if (qty !== undefined) {
          stats.matchedStock++;
          const factor = gdtRec.itemFactor;
          if (!factor || factor === 0) {
            stats.zeroFactor++;
          } else {
            // Hanya 75% dari hasil bagi yang masuk, dibulatkan ke bawah
            // (floor) sehingga tidak ada nilai desimal.
            const computed = Math.floor((qty / factor) * 0.75);
            stockVal = String(computed);
            stats.computed++;
          }
        } else {
          stats.noStock++;
        }

        // Price diambil dari kolom "Harga Member + 10% Round up" (GDT).
        if (gdtRec.gdtPrice != null && gdtRec.gdtPrice !== '') {
          price = formatPrice(gdtRec.gdtPrice);
        }
      }
    } else if (gdtRec) {
      stats.notApprove++;
    } else {
      stats.noGdt++;
    }

    outRows.push([
      productName,
      productId,
      price,
      stockVal,
    ]);
  }

  return { csv: toCsv(outRows), stats };
}

function round(n) {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r;
}

// Format a number for the price column: whole numbers without decimals,
// otherwise with up to 2 decimals.
function formatPrice(n) {
  const r = round(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

module.exports = { processCsv, EXPECTED_HEADERS };