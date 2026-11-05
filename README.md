# Catatan

Aplikasi catatan modern dengan login dan penyimpanan cloud memakai **Supabase**
(Auth + Postgres dengan Row Level Security). Frontend-nya situs statis biasa (HTML, CSS, JS),
tanpa build step dan tanpa server sendiri.

## Struktur

```
catatan/
├── public/              # situs statis, yang di-hosting
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── config.js        # URL + kunci anon Supabase (isi sendiri)
├── supabase/
│   └── schema.sql       # tabel notes + kebijakan RLS
└── vercel.json          # konfigurasi hosting Vercel
```

## Setup (sekali saja)

1. **Buat project** di https://supabase.com/dashboard (paket gratis cukup).
2. **Buat tabel:** buka **SQL Editor → New query**, tempel isi [`supabase/schema.sql`](supabase/schema.sql), klik **Run**.
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
