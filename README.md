# Generator Update Stok

Web app (tanpa dependency) untuk meng-generate stok baru dari template CSV,
berdasarkan stock per toko (sheet STOCK) dan Item Factor (sheet GDT).

## Setup (lokal)

1. Salin `.env.example` menjadi `.env`:
   ```
   copy .env.example .env
   ```
2. Isi nilai di `.env`:
   - `GDT_SPREADSHEET_ID` — ID spreadsheet GDT (dari URL spreadsheet).
   - `STOCK_SPREADSHEET_ID` — ID spreadsheet STOCK.
   - `LOG_WEBAPP_URL` — URL Web App Apps Script untuk menulis ke sheet LOG
     (lihat bagian Log download).
   - `ADMIN_PASSWORD` — password untuk membuka dashboard admin (log).

   > `.env` tidak ikut di-commit (ada di `.gitignore`). Jangan pernah
   > meng-hardcode rahasia di kode atau menampilkannya di repo publik.

3. Jalankan:
   ```
   node server.js
   ```
4. Buka `http://localhost:3000`.

## Deploy ke Render

Repo ini sudah menyertakan `render.yaml` (Render Blueprint), jadi deploy
hampir otomatis:

1. Push kode ke GitHub.
2. Buka [dashboard.render.com](https://dashboard.render.com) →
   **New +** → **Blueprint** → pilih repo `auto-gooddoctor`.
3. Saat Render membuat service, isi **Environment Variables** ini
   (nilai sama seperti `.env` lokal kamu):
   - `GDT_SPREADSHEET_ID`
   - `STOCK_SPREADSHEET_ID`
   - `LOG_WEBAPP_URL`
   - `ADMIN_PASSWORD`
4. Klik **Apply**. Render build (`npm install`) lalu start
   (`node server.js`) dan memberi URL publik `https://auto-gooddoctor.onrender.com`.

> Catatan: jangan pernah mengisi nilai rahasia di `render.yaml` atau file
> lain yang di-commit — gunakan Environment Variables di dashboard Render.

## Alur pengguna

1. Pilih toko (daftar diambil dari sheet STOCK).
2. Generate langsung — daftar produk ditarik otomatis dari sheet **TEMPLATE**.
3. Opsional: upload template CSV sendiri (kolom `product_name, product_id, price, stock`)
   untuk menggantikan template otomatis.
4. Klik **Generate**, lalu **Download Hasil CSV**.

## Logika per baris

- `product_id` dicocokkan ke kolom **ID** di sheet **GDT**.
- Hanya jika kolom **Status Jual** pada baris GDT tersebut bernilai
  **jual approve** (termasuk "jual approve - mapping satuan box") maka
  `stock` dan `price` di-update; selain itu (termasuk produk tidak ditemukan
  di GDT) kedua kolom diisi `0`.
- Untuk baris yang approve:
  - **Item Code Mother** dipakai mencari stok di sheet **STOCK** untuk toko
    yang dipilih; `stock` baru = `qty stok toko ÷ Item Factor × 75%`
    (dibulatkan ke bawah). Jika item tidak ada di sheet STOCK, stock menjadi `0`.
  - `price` diambil dari kolom `Harga Member + 10% Round up` di sheet GDT.

Output tetap 4 kolom yang sama: `product_name, product_id, price, stock`.

## Sumber data

- Sheet **GDT**, **TEMPLATE** (template produk otomatis): di spreadsheet GDT
  (ID via `GDT_SPREADSHEET_ID`).
- Sheet **STOCK**: spreadsheet terpisah (ID via `STOCK_SPREADSHEET_ID`).
- Sheet **LOG**: di spreadsheet GDT, ditulis lewat Apps Script.

Semua sheet harus berbagi "Anyone with the link can view" (read-only).

Data sheet di-cache 10 menit; restart server (`node server.js`) untuk me-refresh.

## Dashboard admin (log)

Klik ikon gembok di pojok kanan bawah, lalu masukkan `ADMIN_PASSWORD`.
Dashboard menampilkan log download CSV (tanggal, jam, nama toko) dengan
filter tanggal dan pencarian nama toko.

## Log download (sheet LOG)

Setiap kali tombol **Download Hasil CSV** diklik, server mencatat
**tanggal, jam, dan nama toko** ke sheet **LOG** di spreadsheet GDT.
Penulisan dilakukan lewat Google Apps Script Web App (bukan API key):

1. Buka spreadsheet GDT, menu **Extensions > Apps Script**.
2. Tempel isi `apps-script/Code.gs`, lalu **Deploy > New deployment > Web app**:
   - Execute as: **Me**, Who has access: **Anyone**
3. Salin URL Web App (berakhir `/exec`) dan isi ke `LOG_WEBAPP_URL` di `.env`.

Jika URL belum diisi, log dilewati tanpa error sehingga download tetap berjalan.

## Struktur

```
server.js           // HTTP server + API (stores, generate, log, admin, refresh)
render.yaml         // Blueprint deploy otomatis ke Render
lib/config.js       // baca konfigurasi dari env/.env (rahasia tidak di-commit)
lib/csv.js          // parser/serializer CSV (mendukung field ber-tanda kutip)
lib/sheets.js       // fetch + parse Google Sheets (GDT, STOCK, TEMPLATE, LOG)
lib/process.js      // logika generate stok
lib/log.js          // kirim log ke sheet LOG via Apps Script
apps-script/Code.gs // Web App Apps Script untuk menulis baris LOG
public/index.html   // UI
public/app.js       // logika frontend
```
