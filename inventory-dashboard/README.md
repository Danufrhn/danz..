# Dashboard Stok Gudang + Sinkron Shopee

Aplikasi web untuk mencatat stok keluar/masuk barang, dipakai bersama tim,
dan bisa disinkronkan dengan stok di Shopee Seller Center.

## Fitur
- Login multi-user dengan role **admin** dan **staff**
- CRUD data produk (SKU, nama, kategori, satuan, stok minimum)
- Catat stok **masuk**, **keluar**, dan **penyesuaian**, otomatis update jumlah stok
- Riwayat lengkap semua transaksi (siapa, kapan, jumlah, catatan)
- Ringkasan dashboard: total produk, total unit, stok menipis, transaksi hari ini
- Modul sinkron **Shopee Open Platform**: hubungkan toko, tarik stok dari Shopee
  (cocok berdasarkan SKU), dan dorong perubahan stok lokal ke Shopee
- Manajemen pengguna tim (khusus admin)

## Menjalankan di komputer lokal

1. Pastikan **Node.js 18+** terpasang.
2. Buka folder ini di terminal, lalu jalankan:
   ```bash
   npm install
   cp .env.example .env
   npm start
   ```
3. Buka `http://localhost:3000` di browser.
4. Login pertama kali dengan akun default:
   - Email: `admin@toko.com`
   - Password: `admin123`
   - **Segera buat akun baru & hapus/ganti password akun default ini** setelah login (menu Tim).

Database tersimpan otomatis di file `inventory.db` (SQLite) — tidak perlu
setup database server terpisah untuk mulai. Untuk pemakaian tim dalam skala
lebih besar, `db.js` bisa diarahkan ke PostgreSQL/MySQL nanti.

## Menghubungkan ke Shopee

1. Daftar sebagai Shopee Developer di **https://open.shopee.com**, buat App
   dengan tipe **Individual Seller** (atau sesuai jenis akun Anda).
2. Setelah App disetujui, salin **Partner ID** dan **Partner Key** dari Console.
3. Isi di file `.env`:
   ```
   SHOPEE_PARTNER_ID=xxxxx
   SHOPEE_PARTNER_KEY=xxxxx
   SHOPEE_REDIRECT_URL=https://domain-anda.com/api/shopee/callback
   SHOPEE_SANDBOX=true
   ```
   `SHOPEE_REDIRECT_URL` harus persis sama dengan yang didaftarkan di App
   Shopee Anda (Console → App Management → Callback URL). Gunakan
   `SHOPEE_SANDBOX=true` dulu untuk uji coba di lingkungan sandbox Shopee,
   baru ganti ke `false` saat sudah siap produksi.
4. Restart server (`npm start`), lalu buka menu **Sinkron Shopee** di dashboard,
   klik **"Hubungkan Toko Shopee"**, login dengan akun Seller Center Anda.
5. Klik **"Tarik Stok dari Shopee"** — sistem akan mencocokkan produk berdasarkan
   **SKU**, jadi pastikan SKU di Shopee sama persis dengan SKU di sistem ini.

> Catatan: endpoint Shopee yang dipakai (`get_item_list`, `get_item_base_info`,
> `update_stock`) mengikuti Shopee Open Platform API v2. Jika Shopee mengubah
> struktur responsnya di masa depan, sesuaikan `routes/shopee.js`.

## Deploy ke server / hosting

Aplikasi ini adalah Node.js standar, bisa dideploy ke:
- **VPS** (misal Ubuntu + PM2 + Nginx reverse proxy)
- **Railway**, **Render**, atau **Fly.io** (upload folder ini, set environment
  variables sesuai `.env.example`, start command `npm start`)

Pastikan `SHOPEE_REDIRECT_URL` di `.env` menggunakan domain publik (HTTPS)
setelah dideploy, dan daftarkan ulang URL callback tersebut di Console Shopee
Open Platform.

## Struktur proyek

```
inventory-dashboard/
├── server.js           # entry point Express
├── db.js                # setup & skema SQLite
├── middleware/auth.js    # JWT auth & role check
├── routes/
│   ├── auth.js           # login, kelola user tim
│   ├── products.js       # CRUD produk
│   ├── stock.js          # stok masuk/keluar/riwayat
│   └── shopee.js         # OAuth & sinkron Shopee
└── public/               # frontend (HTML/CSS/JS)
```

## Peran pengguna

- **Admin**: semua akses, termasuk kelola tim & sinkron Shopee
- **Staff**: mencatat stok masuk/keluar, lihat riwayat & produk (tidak bisa
  kelola tim atau menghubungkan Shopee)
