// Service worker Catatan: membuat aplikasi bisa dibuka saat offline dan dipasang di HP.
// Naikkan VERSION setiap kali daftar SHELL berubah.
const VERSION = "catatan-v5";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "markdown.js",
  "export.js",
  "config.js",
  "legal.js",
  "privasi.html",
  "ketentuan.html",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      await cache.addAll(SHELL);
      // Pustaka dari CDN diambil dengan mode CORS agar lolos pemeriksaan integrity (SRI).
      await cache.add(new Request(SUPABASE_JS, { mode: "cors" })).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Data Supabase (API, realtime, storage) tidak di-cache di sini — aplikasi punya cache sendiri.
  if (url.hostname.endsWith(".supabase.co")) return;

  // Pustaka versi tetap & font: ambil dari cache dulu.
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req));
    return;
  }

  // File aplikasi sendiri: coba jaringan dulu (agar selalu versi terbaru), cache bila offline.
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    const cache = await caches.open(VERSION);
    cache.put(req, res.clone());
  }
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (cached) return cached;
    if (req.mode === "navigate") {
      const shell = await cache.match("index.html");
      if (shell) return shell;
    }
    throw err;
  }
}

// Klik notifikasi pengingat: fokuskan jendela Catatan yang sudah terbuka, atau buka yang baru.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./");
    })
  );
});
