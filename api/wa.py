"""Teruskan pesan chat beratribut ke WhatsApp lewat Fonnte.

Berjalan sebagai Vercel Function (Python). Alur tiap permintaan:
  1. Browser mengirim {"message": <id pesan>} atau {"test": <id ruang>} + token sesi Supabase (header Authorization).
  2. Fungsi ini memeriksa token ke Supabase (hanya pengguna yang masuk).
  3. Fungsi ini memanggil wa_claim() / wa_claim_test() di database ATAS NAMA pengguna (migrasi 011). Database yang menentukan
     boleh-tidaknya: pesan harus milik pemanggil, beratribut, ruangnya dikonfigurasi admin, belum terkirim, kuota harian, dst.
     Tujuan WA TIDAK pernah diterima dari browser; diambil dari database.
  4. Baru setelah itu memanggil API Fonnte memakai token rahasia dari environment variable FONNTE_TOKEN (diatur pemilik di
     Vercel; tidak pernah dikirim ke browser maupun disimpan di repo), lalu melaporkan hasilnya lewat wa_mark().

Environment variable:
  FONNTE_TOKEN        wajib (token perangkat dari dashboard Fonnte). Tanpa ini fitur menjawab 503 "belum diaktifkan".
  SUPABASE_URL        opsional, bawaan proyek Catatan.
  SUPABASE_ANON_KEY   opsional; bila kosong dipakai kunci publik yang dikirim browser (header x-supabase-key).
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://tgztswbgnhevyxaxbawz.supabase.co").rstrip("/")
FONNTE_URL = os.environ.get("FONNTE_API_URL", "https://api.fonnte.com/send")


def fonnte_token():
    return os.environ.get("FONNTE_TOKEN", "").strip()


def http_json(url, method="GET", headers=None, body=None, timeout=20, form=False):
    data = None
    if body is not None:
        data = urllib.parse.urlencode(body).encode("utf-8") if form else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, method=method, headers=headers or {}, data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read(500_000)
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read(200_000)
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"message": raw[:200].decode("utf-8", "replace")}


def clean(s, n):
    """Buang karakter kontrol; potong ke n karakter."""
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(s or ""))
    return s[:n]


def compose(c):
    """Susun teks WhatsApp dari data pesan. Format WA: *tebal*, _miring_."""
    tag = clean(c.get("attr"), 40)
    if c.get("option"):
        tag += " · " + clean(c.get("option"), 40)
    # tanda * dan _ dari pengguna dinetralkan agar tidak merusak format judul
    tag = re.sub(r"\s+", " ", tag.replace("*", "").replace("_", " ")).strip()
    body = clean(c.get("body"), 1000).strip()
    if c.get("has_image"):
        body = (body + "\n" if body else "") + "(ada gambar di aplikasi Catatan)"
    sender = clean(c.get("sender"), 40).strip()
    room = clean(c.get("room"), 50).strip()
    return f"*{tag}*\n{body}\n\n— {sender} · {room}"


def send_fonnte(token, target, message):
    """Kirim satu pesan. Mengembalikan (ok, alasan)."""
    status, out = http_json(
        FONNTE_URL,
        "POST",
        {"Authorization": token, "Content-Type": "application/x-www-form-urlencoded"},
        {"target": target, "message": message, "countryCode": "62"},
        timeout=20,
        form=True,
    )
    if status == 200 and isinstance(out, dict) and (out.get("status") is True or out.get("Status") is True):
        return True, ""
    reason = ""
    if isinstance(out, dict):
        reason = str(out.get("reason") or out.get("detail") or out.get("message") or "")
    return False, reason


def friendly(reason):
    r = (reason or "").lower()
    if "token" in r:
        return "Token Fonnte ditolak. Pemilik aplikasi perlu memeriksa FONNTE_TOKEN di Vercel."
    if "target" in r:
        return "Tujuan WhatsApp tidak valid. Periksa nomor atau ID grup di pengaturan ruang."
    if "quota" in r:
        return "Kuota Fonnte habis. Pemilik aplikasi perlu mengisi ulang paket Fonnte."
    if "device" in r or "disconnect" in r:
        return "Perangkat WhatsApp di Fonnte sedang terputus. Sambungkan ulang di dashboard Fonnte."
    return "Fonnte tidak menerima pesan. Coba lagi sebentar lagi."


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 2_000:
                return self.reply(413, {"error": "Permintaan tidak valid."})
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return self.reply(400, {"error": "Permintaan tidak valid."})

        msg_id = data.get("message")
        room_id = data.get("test")
        if isinstance(msg_id, bool) or not (
            (isinstance(msg_id, int) and 0 < msg_id < 2**62 and room_id is None)
            or (msg_id is None and isinstance(room_id, str) and re.match(r"^[0-9a-fA-F-]{36}$", room_id))
        ):
            return self.reply(400, {"error": "Permintaan tidak valid."})

        token = fonnte_token()
        if not token:
            return self.reply(503, {"error": "Penerusan WhatsApp belum diaktifkan. Pemilik aplikasi perlu memasang FONNTE_TOKEN di pengaturan Vercel lalu Redeploy."})

        auth = self.headers.get("Authorization", "")
        m = re.match(r"^Bearer ([A-Za-z0-9._-]{20,4000})$", auth)
        anon = os.environ.get("SUPABASE_ANON_KEY") or self.headers.get("x-supabase-key", "")
        if not m or not re.match(r"^[A-Za-z0-9._-]{10,400}$", anon or ""):
            return self.reply(401, {"error": "Masuk dulu."})
        hdr = {"apikey": anon, "Authorization": f"Bearer {m.group(1)}", "Content-Type": "application/json"}

        try:
            status, user = http_json(f"{SUPABASE_URL}/auth/v1/user", headers=hdr)
        except Exception:
            return self.reply(502, {"error": "Tidak bisa memeriksa sesi. Coba lagi."})
        if status != 200 or not user or not user.get("id"):
            return self.reply(401, {"error": "Sesi tidak valid. Masuk ulang lalu coba lagi."})

        # database memutuskan boleh-tidaknya dan memberi tujuan
        fn, args = ("wa_claim", {"p_message": msg_id}) if msg_id is not None else ("wa_claim_test", {"p_room": room_id})
        try:
            status, claim = http_json(f"{SUPABASE_URL}/rest/v1/rpc/{fn}", "POST", hdr, args)
        except Exception:
            return self.reply(502, {"error": "Tidak bisa memeriksa izin. Coba lagi."})
        if status != 200 or not isinstance(claim, dict):
            msg = (claim or {}).get("message", "") if isinstance(claim, dict) else ""
            code = (claim or {}).get("code", "") if isinstance(claim, dict) else ""
            if status == 404 or code in ("PGRST202", "42883"):
                return self.reply(503, {"error": "Fitur WhatsApp belum disiapkan. Jalankan migrasi 011 di Supabase (lihat README)."})
            if status == 400 and code == "P0001" and msg:  # pesan aturan dari fungsi kita (mis. sudah terkirim)
                return self.reply(409, {"error": msg})
            return self.reply(502, {"error": "Tidak bisa memeriksa izin. Coba lagi."})

        target = str(claim.get("target") or "")
        if not re.match(r"^([0-9]{8,15}|[0-9]{10,25}(-[0-9]{5,15})?@g\.us)$", target):
            return self.reply(502, {"error": "Tujuan WhatsApp tidak valid."})
        if msg_id is not None:
            text = compose(claim)
        else:
            text = f"Tes dari Catatan: ruang \"{clean(claim.get('room'), 50)}\" berhasil tersambung ke WhatsApp."

        # kirim lewat Fonnte
        try:
            ok, reason = send_fonnte(token, target, text)
        except Exception:
            ok, reason = False, "network"
        if msg_id is not None:
            try:
                http_json(f"{SUPABASE_URL}/rest/v1/rpc/wa_mark", "POST", hdr, {"p_message": msg_id, "p_ok": bool(ok)})
            except Exception:
                pass
        if not ok:
            return self.reply(502, {"error": friendly(reason)})
        return self.reply(200, {"ok": True})

    def do_GET(self):
        self.reply(405, {"error": "Gunakan POST."})

    def reply(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass
