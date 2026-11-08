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
- **Folder bertingkat** (sampai 5 tingkat) di sidebar; pindahkan catatan lewat pilihan folder di editor
- **Kalender harian**: lihat catatan per tanggal, titik penanda hari yang berisi catatan atau pengingat, dan buat catatan untuk tanggal tertentu
- **Pengingat & alarm**: halaman penuh dengan tab **Pengingat Umum**, **Jobdesk Karyawan** (tugas untuk seorang kontak, bisa berulang harian/mingguan), dan **Daftar Kontak**. Tiap pengingat bisa memberi alarm H-1 hari, H-60 menit, dan tepat waktu, plus tombol WhatsApp siap kirim. Pengingat per catatan (ikon lonceng di editor) tetap ada dan ikut tampil di halaman ini
- **Rekam suara**: tombol *Rekam* membuat catatan dari ucapan (bahasa Indonesia); tombol mikrofon di toolbar menyisipkan dikte ke catatan yang sedang dibuka
- **Berita terkini**: headline dari RSS publik (Antara, CNN Indonesia, BBC Indonesia, CNBC Indonesia, Republika), bisa dicari dan disimpan ke catatan (tag `berita`)
- Tombol **mikrofon melayang** dan tombol *Input Suara* di layar sambutan untuk merekam dari mana saja
- **Tampilan koordinasi di Chat room dan Pesan grup**: pesan berupa kartu dengan nama, label peran (PEMILIK/ANGGOTA), **atribut klasifikasi** (mis. Absen, Pengeluaran; bisa pilihan ganda), gambar, tombol salin dan hapus, filter menurut atribut, pencarian, dan panel **Kelola Atribut** untuk pemilik ruang
- Di layar lebar, Chat room dan Pesan grup langsung membuka ruang terakhir yang aktif; bila belum punya ruang, panel kanan menampilkan sambutan dengan tombol **Buat ruang koordinasi**
- **Pesan WhatsApp Cepat** (menu Pesan darurat): pilih kontak tersimpan atau ketik nomor, tulis pesan (ada templat darurat dan opsi tautan lokasi), lalu buka WhatsApp dengan pesan siap kirim. Kontak yang sama dipakai di halaman Pengingat
- **Pesan grup**: pesan terjadwal ke grup WhatsApp (judul, nama grup, isi, jadwal sekali/harian/mingguan/bulanan, aktif/jeda, hitungan terkirim), tab **Kirim cepat**, dan tab **Impor chat** (ekspor chat WhatsApp `.txt` jadi satu catatan). Catatan tidak mengirim otomatis: saat jadwal tiba muncul alarm dan tombol yang membuka WhatsApp dengan pesan siap kirim
- **Chat room** (tab *Ruang terbuka* dan *Grup privat* dengan kode undangan) dan **Pesan darurat** (pesan berprioritas ke grup: alarm + notifikasi di perangkat anggota, plus lokasi bila diizinkan), semuanya realtime
- **Reservasi meja**: pemilik tempat membuat tempat, meja, dan jam buka lalu membagikan tautan pemesanan; pelanggan memilih tanggal, jam, dan meja; bentrok dicegah di database
- Tombol **Salin**, **Pindahkan ke folder**, **mode fokus**, **Gabung catatan** (gambar ikut disalin), daftar dikelompokkan per waktu, ikon catatan suara
- Ajakan **Instal aplikasi** (PWA) di Chrome/Edge/Android, dan petunjuk untuk iPhone/iPad
- Akun: **masuk dengan Google** (pengguna baru), masuk dengan email + kata sandi untuk akun lama, lupa sandi, ganti sandi/email, hapus akun

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
│   ├── social.js        # Chat room, Pesan grup, Pesan darurat
│   ├── booking.js       # Reservasi meja
│   ├── reminders.js     # halaman Pengingat & Alarm (umum, jobdesk, kontak)
│   ├── wagroups.js      # Pesan grup: pesan terjadwal WhatsApp, kirim cepat, impor chat
│   ├── privasi.html     # Kebijakan Privasi (ditautkan dari form login)
│   ├── ketentuan.html   # Ketentuan Layanan
│   ├── sw.js            # service worker (offline / PWA)
│   ├── manifest.webmanifest
│   └── icons/
├── api/
│   └── news.py          # Vercel Function (Python): mengambil RSS berita untuk menu Berita terkini
├── supabase/
│   ├── schema.sql                     # tabel notes + kebijakan RLS
│   ├── migrations/002_fitur_baru.sql  # gambar, berbagi, riwayat, realtime, hapus akun
│   ├── migrations/003_folder_pengingat.sql  # folder bertingkat + pengingat
│   ├── migrations/004_chat_darurat_reservasi.sql  # chat, grup, darurat, reservasi meja
│   ├── migrations/005_pengingat_kontak.sql  # pengingat umum, jobdesk, kontak
│   ├── migrations/006_chat_atribut_gambar.sql  # atribut pesan + gambar di chat
│   ├── migrations/007_pesan_terjadwal.sql  # pesan terjadwal ke grup WhatsApp
│   └── email-templates/               # template email berbahasa Indonesia (tempel manual di Supabase)
└── vercel.json          # konfigurasi hosting Vercel
```

## Setup (sekali saja)

1. **Buat project** di https://supabase.com/dashboard (paket gratis cukup).
2. **Buat tabel:** buka **SQL Editor → New query**, tempel isi [`supabase/schema.sql`](supabase/schema.sql), klik **Run**.
   Lalu ulangi dengan [`supabase/migrations/002_fitur_baru.sql`](supabase/migrations/002_fitur_baru.sql).
   Tanpa migrasi 002 aplikasi tetap jalan, tapi fitur gambar, berbagi, riwayat versi, dan hapus akun disembunyikan.
   Terakhir jalankan [`supabase/migrations/003_folder_pengingat.sql`](supabase/migrations/003_folder_pengingat.sql)
   untuk **folder** dan **pengingat**. Tanpa migrasi 003, dua fitur itu tampil sebagai petunjuk saja;
   kalender, rekam suara, dan tombol instal tidak butuh migrasi.
   Terakhir [`supabase/migrations/004_chat_darurat_reservasi.sql`](supabase/migrations/004_chat_darurat_reservasi.sql)
   untuk **chat, grup, darurat, dan reservasi meja** (tanpa migrasi 004, menu-menu itu menampilkan petunjuk).
   Lalu [`supabase/migrations/005_pengingat_kontak.sql`](supabase/migrations/005_pengingat_kontak.sql)
   untuk **pengingat mandiri, jobdesk, dan kontak** (tanpa migrasi 005, halamannya menampilkan petunjuk).
   Lalu [`supabase/migrations/006_chat_atribut_gambar.sql`](supabase/migrations/006_chat_atribut_gambar.sql)
   untuk **atribut pesan dan gambar di chat** (tanpa migrasi 006, chat tetap berfungsi tanpa atribut dan gambar).
   Lalu [`supabase/migrations/007_pesan_terjadwal.sql`](supabase/migrations/007_pesan_terjadwal.sql)
   untuk **pesan terjadwal ke grup WhatsApp** (tanpa migrasi 007, tab Kirim cepat dan Impor chat tetap bisa dipakai).
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

### Mode "Google saja"

Selama Google aktif di Supabase, halaman masuk hanya menampilkan tombol **Lanjutkan dengan Google**. Form email (khusus *masuk*)
tersembunyi di balik tautan "Sudah punya akun dengan email? Masuk di sini" agar akun email yang sudah ada tidak terkunci, dan
tab *Daftar* tidak ditampilkan. Bila Google dinonaktifkan, tampilan lama (email + daftar) kembali otomatis. Ini hanya mengatur
tampilan: server Supabase tetap menerima pendaftaran email lewat API, dan tidak ada tombol untuk menutup pendaftaran email saja
(mematikan provider Email juga mematikan login email lama).

## Catatan tentang folder, pengingat, dan rekam suara

- **Folder** disimpan sebagai satu baris per pengguna (tabel `user_folders`, JSON) dan folder tiap catatan di kolom `notes.folder_id`.
  Menghapus folder tidak menghapus catatan: catatan dipindah ke folder induknya (atau ke "tanpa folder").
- **Pengingat** disimpan di kolom `notes.remind_at`. Alarm dicek di browser setiap 15 detik, jadi berbunyi **selama Catatan terbuka**
  (tab di latar belakang boleh, tapi browser bisa menunda hingga sekitar semenit). Tidak ada server push: kalau aplikasi tertutup,
  pengingat yang terlewat berbunyi begitu aplikasi dibuka lagi. Notifikasi sistem butuh izin dari browser.
- **Rekam suara** memakai Web Speech API bawaan browser (Chrome, Edge, Safari; Firefox belum mendukung, tombolnya disembunyikan).
  Di Chrome/Edge audio diproses oleh layanan pengenalan suara milik penyedia browser, bukan oleh Catatan, dan Catatan tidak menyimpan audionya.
  Header `Permissions-Policy` di `vercel.json` mengizinkan mikrofon hanya untuk situs ini.

### Halaman Pengingat & Alarm

- Data di tabel `reminders` dan `contacts` (hanya bisa diakses pemiliknya lewat RLS; batas 500 pengingat dan 200 kontak per pengguna).
- Alarm dicek di browser tiap 15 detik, jadi berbunyi **selama Catatan terbuka**. Tiga tahap: H-1 hari dan H-60 menit hanya berbunyi bila aplikasi terbuka pada saat itu
  (maksimal 15 menit setelahnya); tahap tepat waktu tetap berbunyi sampai 3 hari setelah jadwal, dengan label "Terlewat". Status "sudah berbunyi" disimpan per perangkat,
  jadi dua perangkat yang sama-sama terbuka akan sama-sama berbunyi.
- **WhatsApp tidak dikirim otomatis.** Pengiriman otomatis butuh layanan WhatsApp Business API berbayar dan server; di sini alarm menyediakan tombol yang membuka WhatsApp
  (`wa.me`) dengan pesan siap kirim ke kontak yang dipilih.
- Jobdesk berulang: "Selesai" memajukan jadwal ke periode berikutnya alih-alih menutupnya. Pengingat sekali jalan ditandai selesai.

### Chat, grup, pesan darurat

- Pengguna memilih **nama tampilan** (2-30 karakter) saat pertama memakai chat; email dan akun Google tidak ditampilkan ke orang lain.
- **Chat room** terlihat oleh semua pengguna yang login dan bisa dimasuki siapa saja. **Pesan grup** privat: hanya yang punya kode undangan 8 karakter (maks. 50 anggota).
  Pemilik bisa menghapus pesan siapa pun di ruangnya dan menghapus ruang (dengan keluar sebagai pemilik).
- Semua penulisan data lewat fungsi database (`send_chat_message`, `join_chat_group`, dst.) yang memeriksa keanggotaan, panjang pesan, dan batas laju
  (maks. 20 pesan per 30 detik, 10 pesan darurat per 10 menit). Tabel hanya bisa dibaca langsung, dan dibatasi RLS ke ruang yang diikuti.
- **Alarm darurat ke grup** (bagian bawah halaman Pesan darurat) hanya untuk grup. Penerima yang sedang membuka Catatan mendengar alarm dan melihat lokasi (tautan OpenStreetMap) bila pengirim mengizinkan lokasi.
  Ini **bukan layanan darurat resmi**: tidak ada pengiriman SMS/telepon dan tidak ada notifikasi saat aplikasi tertutup. Untuk keadaan darurat sungguhan hubungi 112.
- Pesan **tidak dienkripsi ujung ke ujung**: administrator proyek Supabase secara teknis dapat membacanya. Hapus pesan lewat tombol "hapus" hanya terlihat di perangkat lain setelah memuat ulang
  (peristiwa DELETE sengaja tidak dilanggan, karena tidak bisa disaring per pengguna).

### Pesan grup (WhatsApp terjadwal)

- Pesan tersimpan di tabel `wa_scheduled` (hanya pemiliknya yang bisa mengaksesnya; batas 200 per pengguna). Kolom `send_at` adalah jadwal berikutnya; pesan berulang maju sendiri setelah dikirim atau dilewati.
- **Tidak ada pengiriman otomatis.** Mengirim pesan ke grup WhatsApp secara otomatis butuh bot atau WhatsApp Business API plus server. Di sini, selama Catatan terbuka, alarm berbunyi saat jadwal tiba
  dan tombol **Buka WhatsApp** membuka `wa.me/?text=…` sehingga kamu memilih grup tujuan dan menekan kirim sendiri. Membuka WhatsApp dihitung sebagai "terkirim" (aplikasi tidak bisa memastikan pesannya benar-benar dikirim).
- **Impor chat** membaca ekspor chat WhatsApp (`.txt`, format Android dan iPhone) di browser tanpa mengunggahnya, lalu menyimpannya sebagai satu catatan per tanggal (tag `chat-wa`).
- Grup privat dengan kode undangan (yang dipakai Pesan darurat) kini ada di **Chat room**, tab *Grup privat*.

### Atribut dan gambar di chat

- Pemilik ruang membuat **atribut** (nama, dengan atau tanpa **pilihan ganda**) lewat tombol *Kelola Atribut*. Anggota memilih atribut (dan opsinya) saat mengirim pesan, lalu semua anggota bisa menyaring pesan menurut atribut atau mencari teks.
  Mengganti nama atribut ikut mengubah pesan lama; menghapus atribut membiarkan pesan lama tanpa klasifikasi.
- **Gambar** (PNG/JPG/GIF/WebP, maks. 5 MB; foto besar diperkecil) disimpan di bucket privat `chat-images` pada `<id ruang>/<id pengirim>/<berkas>`. Hanya anggota ruang yang bisa melihat dan mengunggah,
  pengirim dan pemilik ruang bisa menghapus. Pesan boleh hanya berisi gambar. Server memeriksa bahwa path gambar milik pengirim dan ruang itu.
- Pesan darurat tidak boleh membawa atribut atau gambar. Menghapus ruang (oleh pemilik) juga menghapus gambarnya (sebisanya).

### Pesan WhatsApp Cepat

Halaman Pesan darurat berisi formulir WhatsApp (penerima dari kontak tersimpan atau nomor yang diketik, isi pesan, tautan lokasi opsional) dan daftar kontak.
Pengiriman dilakukan di aplikasi WhatsApp milikmu lewat tautan `wa.me`; Catatan tidak mengirim pesan sendiri dan tidak melihat isinya. Kontak disimpan di tabel `contacts`
(migrasi 005); tanpa migrasi itu, nomor tetap bisa diketik langsung tetapi daftar kontak tidak tersedia.

### Reservasi meja

- Pemilik membuat **tempat** (jam buka, lama per reservasi, zona waktu WIB/WITA/WIT, konfirmasi otomatis atau manual), menambah **meja** berikut kapasitasnya, lalu membagikan **tautan pemesanan** (`?reservasi=<id tempat>`).
- Pelanggan membuka tautan, masuk dengan Google, memilih tanggal, jumlah tamu, jam, dan meja. Database (`book_table`) menolak jam di luar jam buka, waktu lampau atau lebih dari 60 hari,
  melebihi kapasitas, bentrok dengan reservasi lain (dengan kunci baris agar dua pemesan tidak lolos bersamaan), dan lebih dari 5 reservasi aktif per pengguna.
- Pemilik melihat nama dan telepon pemesan serta bisa mengonfirmasi, menyelesaikan, atau membatalkan. Pemesan hanya melihat reservasinya sendiri; ketersediaan yang dilihat publik tidak memuat data pribadi.
- Meja yang punya riwayat reservasi tidak bisa dihapus (nonaktifkan saja). Menghapus tempat menghapus meja dan reservasinya.

### Pengujian SQL

Aturan di migrasi 004, 005, 006, dan 007 diuji terhadap Postgres sungguhan (bukan tiruan) dengan peran `anon` dan `authenticated` dan tiga pengguna (pemilik, anggota, orang luar):
akses lintas pengguna, kode undangan, batas laju, pesan darurat, bentrok jadwal, jam buka, batas reservasi, dan keamanan fungsi. Migrasi juga aman dijalankan dua kali.

### Berita terkini

Browser tidak boleh mengambil RSS situs lain langsung (CORS), jadi [`api/news.py`](api/news.py) berjalan sebagai Vercel Function:
mengambil RSS dari daftar tetap `FEEDS` di dalam berkas itu, merapikannya, lalu mengembalikan JSON (di-cache 10 menit di edge Vercel).
Alamat yang diambil tidak pernah berasal dari pengguna (anti-SSRF), tautan/gambar hanya http(s), dan XML ber-DOCTYPE ditolak.
Untuk menambah sumber, tambahkan satu baris di `FEEDS` dan satu entri di `NEWS_SOURCES` pada `public/app.js`.
Menu ini hanya jalan di hosting Vercel; di server statis lokal biasa muncul pesan bahwa berita belum tersedia
(gunakan `vercel dev` untuk mencobanya secara lokal). Sebagian media bisa memblokir permintaan dari server; sumber yang gagal dilewati.

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

## Lisensi

[MIT](LICENSE) © 2026 yoghi. Kode aplikasi ini bebas dipakai, diubah, dan disebarkan dengan tetap menyertakan pemberitahuan hak cipta.
Pustaka pihak ketiga (supabase-js, docx, pdfmake, ExcelJS, PptxGenJS) tidak disertakan di repo; semuanya dimuat dari CDN dan tunduk pada lisensinya masing-masing.
