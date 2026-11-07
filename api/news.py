"""Berita terkini untuk Catatan: mengambil RSS publik dari beberapa media Indonesia.

Berjalan sebagai Vercel Function (Python). Browser tidak bisa mengambil RSS situs lain langsung
(CORS), jadi fungsi ini yang mengambil, merapikan, lalu mengembalikan JSON.

Keamanan:
  - Hanya mengambil dari daftar FEEDS di bawah. Alamat tidak pernah datang dari pengguna (anti-SSRF).
  - Tautan dan gambar hanya diterima bila http(s); teks dibersihkan dari HTML.
  - XML yang memuat DOCTYPE/ENTITY ditolak (anti "billion laughs").
  - Hasil di-cache di edge Vercel 10 menit.
"""
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

FEEDS = {
    "antara": ("Antara", "https://www.antaranews.com/rss/terkini.xml"),
    "cnn": ("CNN Indonesia", "https://www.cnnindonesia.com/nasional/rss"),
    "bbc": ("BBC Indonesia", "https://www.bbc.com/indonesia/index.xml"),
    "cnbc": ("CNBC Indonesia", "https://www.cnbcindonesia.com/news/rss"),
    "republika": ("Republika", "https://www.republika.co.id/rss"),
}
PER_FEED = 25
MAX_BYTES = 2_000_000
UA = "Mozilla/5.0 (compatible; CatatanNews/1.0; +https://catatan-wt5e.vercel.app/)"


def local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def clean_text(raw, limit=240):
    text = re.sub(r"<[^>]*>", " ", raw or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def safe_url(value):
    value = (value or "").strip()
    return value if re.match(r"^https?://[^\s]+$", value, re.I) and len(value) < 2000 else ""


def published_ms(raw):
    try:
        return int(parsedate_to_datetime(raw).timestamp() * 1000)
    except Exception:
        return 0


def parse_feed(source_id, name, data):
    head = data[:4096].lower()
    if b"<!doctype" in head or b"<!entity" in data[:100000].lower():
        return []
    root = ET.fromstring(data)
    out = []
    for item in root.iter():
        if local(item.tag) != "item":
            continue
        f = {}
        image = ""
        for child in item:
            tag = local(child.tag)
            if tag in ("title", "link", "guid", "pubDate", "description") and tag not in f:
                f[tag] = (child.text or "").strip()
            elif tag in ("content", "thumbnail", "enclosure") and not image:
                if tag != "content" or child.get("medium", "image") == "image":
                    if tag != "enclosure" or (child.get("type") or "").startswith("image/"):
                        image = safe_url(child.get("url"))
        desc = f.get("description", "")
        if not image:
            m = re.search(r'<img[^>]+src=["\']([^"\']+)', desc, re.I)
            image = safe_url(html.unescape(m.group(1))) if m else ""
        link = safe_url(f.get("link")) or safe_url(f.get("guid"))
        title = clean_text(f.get("title"), 200)
        if not link or not title:
            continue
        out.append(
            {
                "title": title,
                "link": link,
                "source": name,
                "sourceId": source_id,
                "published": published_ms(f.get("pubDate", "")),
                "summary": clean_text(desc),
                "image": image,
            }
        )
        if len(out) >= PER_FEED:
            break
    return out


def fetch_feed(source_id):
    name, url = FEEDS[source_id]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml"})
        with urllib.request.urlopen(req, timeout=7) as res:
            data = res.read(MAX_BYTES)
        return parse_feed(source_id, name, data), None
    except Exception as exc:  # satu media gagal tidak boleh menggagalkan yang lain
        return [], f"{name}: {type(exc).__name__}"


def build(source):
    ids = list(FEEDS) if source == "all" else [source]
    with ThreadPoolExecutor(max_workers=len(ids)) as pool:
        results = list(pool.map(fetch_feed, ids))
    items = [it for part, _ in results for it in part]
    items.sort(key=lambda it: it["published"], reverse=True)
    failed = [err for _, err in results if err]
    return {"items": items[: PER_FEED * 3 if source == "all" else PER_FEED], "failed": failed, "sources": {k: v[0] for k, v in FEEDS.items()}}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        source = (parse_qs(urlparse(self.path).query).get("source") or ["all"])[0]
        if source != "all" and source not in FEEDS:
            return self.reply(400, {"error": "Sumber tidak dikenal"}, cache=False)
        body = build(source)
        if not body["items"]:
            return self.reply(502, {"error": "Berita belum bisa diambil. Coba lagi sebentar lagi.", **body}, cache=False)
        self.reply(200, body, cache=True)

    def reply(self, status, payload, cache):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600" if cache else "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass
