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
- **Ekspor ke Word (.docx), PDF, Excel (.xlsx), PowerPoint (.pptx)** dan Markdown; atau cetak. Ekspor semua catatan ke Excel/JSON dari Pengaturan
- **Tabel Markdown** (tombol tabel di toolbar); di Excel, tiap tabel jadi lembar sendiri
- Akun: daftar/masuk email, **login Google/GitHub**, lupa sandi, ganti sandi/email, hapus akun

## Struktur

```
catatan/
├── public/              # situs statis, yang di-hosting
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── config.js        # URL + kunci anon Supabase (isi sendiri)
│   ├── markdown.js      # parser Markdown bersama (pratinjau + ekspor)
│   ├── export.js        # ekspor Word / PDF / Excel / PowerPoint
│   ├── privasi.html     # Kebijakan Privasi (ditautkan dari form login)
│   ├── ketentuan.html   # Ketentuan Layanan
│   ├── sw.js            # service worker (offline / PWA)
│   ├── manifest.webmanifest
│   └── icons/
├── supabase/
│   ├── schema.sql                     # tabel notes + kebijakan RLS
│   ├── migrations/002_fitur_baru.sql  # gambar, berbagi, riwayat, realtime, hapus akun
│   └── email-templates/               # template email berbahasa Indonesia (tempel manual di Supabase)
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

## Ekspor ke Word, PDF, Excel, PowerPoint

Buka menu **⋯ → Ekspor** pada sebuah catatan. File dibuat langsung di browser (tidak dikirim ke server mana pun).

| Format | Hasil |
|---|---|
| Word | Judul, heading, daftar, checklist (☐/☑), kutipan, kode, tabel, tautan, dan gambar |
| PDF | Tata letak rapi A4 dengan nomor halaman. Emoji dibuang karena font PDF tidak mendukungnya |
| Excel | Lembar "Catatan": tiap poin/tugas jadi baris (kolom Jenis, Isi, Status). Tiap tabel Markdown jadi lembar sendiri; angka dikenali sebagai angka |
| PowerPoint | Slide judul, lalu satu slide per judul `#`/`##`. Isi panjang otomatis dipecah; tiap gambar mendapat slide sendiri |

Pustaka ekspor (docx, pdfmake, ExcelJS, PptxGenJS) dimuat dari jsDelivr **hanya saat dipakai**, dengan versi tetap dan hash SRI, lalu disimpan oleh service worker sehingga ekspor juga jalan offline setelah pernah dipakai sekali. Versi dan hash ada di bagian atas `public/export.js`.

Tabel ditulis dengan sintaks Markdown:

```
| Item | Jumlah |
| --- | ---: |
| Konsumsi | 1500000 |
```

## Email akun: template Indonesia dan SMTP

Email konfirmasi, atur ulang kata sandi, dan ganti email dikirim Supabase dengan teks bawaan (Inggris).
Template berbahasa Indonesia ada di [`supabase/email-templates/`](supabase/email-templates/).

> **Syarat:** Supabase hanya mengizinkan template diedit **setelah SMTP sendiri aktif** (lihat bagian SMTP di bawah).
> Selama masih memakai email bawaan, halaman Templates hanya menampilkan banner *"Set up custom SMTP to edit templates"*.

Setelah SMTP aktif, tempel di **Supabase → Authentication → Emails → Templates** (tab *Preview* untuk melihat hasilnya), lalu **Save**:

| Template di Supabase | File | Subject |
|---|---|---|
| Confirm sign up | `confirm-signup.html` | `Konfirmasi emailmu untuk Catatan` |
| Reset password | `reset-password.html` | `Atur ulang kata sandi Catatan` |
| Change email address | `change-email.html` | `Konfirmasi perubahan email Catatan` |

Template memakai variabel Supabase `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`; jangan dihapus.
*Magic link*, *Invite user*, dan *Reauthentication* tidak dipakai aplikasi ini, jadi dibiarkan bawaan.

Email bawaan Supabase hanya sampai ke anggota tim project dan dibatasi **2 email per jam untuk seluruh project**
(batas ini terkunci di halaman Rate Limits sampai SMTP sendiri aktif; setelahnya bawaannya 30 per jam dan bisa diubah). Agar bisa mengirim ke siapa saja,
pasang SMTP sendiri di **Authentication → Emails → SMTP Settings**. Contoh Resend (butuh domain milik sendiri yang
sudah diverifikasi): host `smtp.resend.com`, port `465`, username `resend`, password = API key, sender email di domain
terverifikasi. Kunci API hanya ditempel di Supabase, jangan di repo.

## Login Google / GitHub (opsional)

Tombolnya muncul otomatis di halaman masuk begitu provider-nya diaktifkan di Supabase.

**Google**
1. Buka https://console.cloud.google.com → buat project → **APIs & Services → OAuth consent screen**
   (pilih *External*, isi nama aplikasi & email).
2. **Credentials → Create credentials → OAuth client ID** → tipe *Web application*.
   Di *Authorized redirect URIs* isi: `https://tgztswbgnhevyxaxbawz.supabase.co/auth/v1/callback`
3. Salin *Client ID* dan *Client secret* ke Supabase **Authentication → Sign In / Providers → Google**, aktifkan, simpan.
   Tempel secret dengan bersih (kolom dikosongkan dulu). Google hanya mengizinkan 2 secret per client dan tidak menampilkan secret lama lagi.
4. Di **Google Auth Platform → Branding** isi *Application home page* (`https://catatan-wt5e.vercel.app`),
   *privacy policy* (`https://catatan-wt5e.vercel.app/privasi.html`), dan *terms* (`https://catatan-wt5e.vercel.app/ketentuan.html`).
   **Jangan unggah logo**: logo memicu kewajiban verifikasi aplikasi.
5. Di **Audience** klik **Publish app** agar semua orang bisa masuk (selama *Testing*, hanya *Test users*). Scope dasar
   (`openid`, email, profil) tidak perlu verifikasi.

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
