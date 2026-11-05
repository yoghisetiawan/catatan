# Catatan

Aplikasi catatan modern dengan login dan penyimpanan cloud memakai **Supabase**
(Auth + Postgres dengan Row Level Security). Frontend-nya situs statis biasa (HTML, CSS, JS),
tanpa build step dan tanpa server sendiri.

## Fitur

- Markdown dengan toolbar format (tebal, miring, judul, daftar, checklist, kutipan, kode, tautan)
- Tag, warna, sematkan, pencarian, urutkan, mode gelap
- **Gambar**: tempel, seret, atau pilih file; foto besar otomatis diperkecil (Supabase Storage, privat)
- **Sinkron realtime** antar perangkat dan antar tab
- **Offline & bisa dipasang** (PWA): catatan tetap bisa dibuka dan diedit tanpa internet, lalu tersinkron saat online
- **Bagikan lewat link** (hanya baca, tanpa login) dan hentikan kapan saja
- **Riwayat versi**: versi lama tersimpan otomatis, bisa dipulihkan
- Sampah dengan hapus otomatis setelah 30 hari + tombol kosongkan sampah
- Unduh catatan sebagai Markdown atau cetak/simpan PDF; ekspor/impor semua catatan (JSON)
- Akun: daftar/masuk email, **login Google/GitHub**, lupa sandi, ganti sandi/email, hapus akun

## Struktur

```
catatan/
├── public/              # situs statis, yang di-hosting
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── config.js        # URL + kunci anon Supabase (isi sendiri)
│   ├── sw.js            # service worker (offline / PWA)
│   ├── manifest.webmanifest
│   └── icons/
├── supabase/
│   ├── schema.sql                     # tabel notes + kebijakan RLS
│   └── migrations/002_fitur_baru.sql  # gambar, berbagi, riwayat, realtime, hapus akun
└── vercel.json          # konfigurasi hosting Vercel
```

## Setup (sekali saja)

1. **Buat project** di https://supabase.com/dashboard (paket gratis cukup).
2. **Buat tabel:** buka **SQL Editor → New query**, tempel isi [`supabase/schema.sql`](supabase/schema.sql), klik **Run**.
   Lalu ulangi dengan [`supabase/migrations/002_fitur_baru.sql`](supabase/migrations/002_fitur_baru.sql).
   Tanpa migrasi 002 aplikasi tetap jalan, tapi fitur gambar, berbagi, riwayat versi, dan hapus akun disembunyikan.
3. **Isi konfigurasi:** buka **Project Settings → API Keys**, salin *Project URL* dan kunci
   **anon / publishable** ke `public/config.js`:
   ```js
   window.CATATAN_CONFIG = {
     supabaseUrl: "https://abcdefghijkl.supabase.co",
     supabaseAnonKey: "sb_publishable_...",
   };
   ```
   Kunci anon memang aman berada di browser karena data dilindungi RLS.
   **Jangan pernah** menaruh kunci `service_role` / `secret` di sini (aplikasi akan menolaknya).
4. **Atur URL redirect:** buka **Authentication → URL Configuration**:
   - *Site URL*: alamat aplikasimu, mis. `https://catatan-wt5e.vercel.app/`.
   - *Redirect URLs*: tambahkan alamat yang sama, plus `http://localhost:8080/**` untuk pengembangan.

## Menjalankan secara lokal

```bash
python3 -m http.server 8080 --directory public
```

Buka http://localhost:8080. (File `index.html` tidak bisa dibuka langsung dengan klik dua kali,
karena login Supabase butuh alamat `http://`.)

## Deploy

Aplikasi di-hosting di **Vercel**: https://catatan-wt5e.vercel.app/

Repo GitHub ini terhubung ke Vercel, jadi setiap push ke `main` otomatis ter-deploy
(dan setiap branch/PR mendapat preview URL sendiri). Pengaturannya ada di [`vercel.json`](vercel.json):
tanpa build step, folder `public/` yang disajikan, plus header keamanan (CSP, nosniff, dll.).

Agar login dan tautan email berfungsi, di Supabase **Authentication → URL Configuration**:
- *Site URL*: `https://catatan-wt5e.vercel.app/`
- *Redirect URLs*: `https://catatan-wt5e.vercel.app/**` (dan `http://localhost:8080/**` untuk pengembangan)

## Login Google / GitHub (opsional)

Tombolnya muncul otomatis di halaman masuk begitu provider-nya diaktifkan di Supabase.

**Google**
1. Buka https://console.cloud.google.com → buat project → **APIs & Services → OAuth consent screen**
   (pilih *External*, isi nama aplikasi & email).
2. **Credentials → Create credentials → OAuth client ID** → tipe *Web application*.
   Di *Authorized redirect URIs* isi: `https://tgztswbgnhevyxaxbawz.supabase.co/auth/v1/callback`
3. Salin *Client ID* dan *Client secret* ke Supabase **Authentication → Sign In / Providers → Google**, aktifkan, simpan.

**GitHub**
1. Buka https://github.com/settings/developers → **New OAuth App**.
   *Homepage URL*: `https://catatan-wt5e.vercel.app/` ·
   *Authorization callback URL*: `https://tgztswbgnhevyxaxbawz.supabase.co/auth/v1/callback`
2. Buat *client secret*, lalu salin *Client ID* + *secret* ke Supabase **Authentication → Sign In / Providers → GitHub**.

## Fitur akun

- Daftar dan masuk dengan email + kata sandi (minimal 8 karakter).
- Konfirmasi email: aktif secara bawaan di Supabase. Bisa dimatikan di
  **Authentication → Sign In / Providers → Email → Confirm email** agar pengguna langsung masuk setelah daftar.
- Lupa kata sandi: tautan reset dikirim ke email, lalu pengguna membuat kata sandi baru di aplikasi.
- Catatan dari versi lama (tersimpan di browser) otomatis dipindahkan ke akun saat pertama kali masuk.

> Server email bawaan Supabase hanya untuk uji coba dan dibatasi beberapa email per jam.
> Untuk produksi, pasang SMTP sendiri di **Authentication → Emails → SMTP Settings**.

## Keamanan

- Login, hash kata sandi, dan sesi ditangani Supabase Auth.
- Row Level Security: setiap pengguna hanya bisa membaca dan mengubah catatannya sendiri;
  pengguna anonim tidak punya akses ke tabel.
- Trigger database mengabaikan pembaruan yang lebih lama dari versi tersimpan (last-write-wins)
  dan mencegah pemilik catatan diganti.
- Content-Security-Policy membatasi skrip hanya dari situs sendiri dan jsDelivr; pustaka
  supabase-js dikunci di versi 2.119.0 dengan hash Subresource Integrity.
