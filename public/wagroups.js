// Pesan Grup: pesan terjadwal ke grup WhatsApp, kirim cepat, dan impor chat WhatsApp jadi catatan.
// Catatan TIDAK mengirim pesan WhatsApp sendiri (itu butuh WhatsApp Business API dan server). Saat jadwal tiba
// selama Catatan terbuka, pengguna mendapat alarm dan tombol yang membuka WhatsApp dengan pesan siap kirim.
(() => {
  "use strict";
  const App = window.CatatanApp;
  if (!App) return;
  const esc = App.escapeHtml;
  const DAY = 86_400_000;
  const SNOOZE = 10 * 60_000;
  const REPEAT = { none: "Sekali", daily: "Setiap hari", weekly: "Setiap minggu", monthly: "Setiap bulan" };

  const G = {
    avail: null,
    items: [],
    tab: "jadwal", // 'jadwal' | 'cepat' | 'impor'
    form: null, // null | { id }  (id kosong = pesan baru)
    draft: {},
    quick: "",
    parsed: null,
    alerts: new Set(),
    snooze: {},
    loadId: 0,
    timer: null,
  };
  const sb = () => App.sb;
  const me = () => (App.user ? App.user.id : null);
  const isMine = () => App.view() === "groups";
  const pad = (n) => String(n).padStart(2, "0");
  const cacheKey = () => `catatan.wagrp.${me()}`;
  const isNetErr = (err) => !navigator.onLine || /failed to fetch|network|load failed/i.test((err && err.message) || "");

  function tzLabel() {
    const off = -new Date().getTimezoneOffset();
    return { 420: "WIB", 480: "WITA", 540: "WIT" }[off] || `UTC${off >= 0 ? "+" : "-"}${Math.abs(off / 60)}`;
  }
  const timeText = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${tzLabel()}`;
  };
  const shortDate = (ts) => new Date(ts).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
  const stampText = (ts) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}, ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  };
  const toInputs = (ts) => {
    const d = new Date(ts);
    return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`];
  };

  // Jadwal berikutnya setelah `from` menurut pola pengulangan (null bila tidak berulang).
  function nextAfter(it, from = Date.now()) {
    if (it.repeat === "none") return null;
    const d = new Date(it.send_at);
    for (let i = 0; i < 4000 && d.getTime() <= from; i++) {
      if (it.repeat === "daily") d.setDate(d.getDate() + 1);
      else if (it.repeat === "weekly") d.setDate(d.getDate() + 7);
      else {
        const day = new Date(it.send_at).getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); // 31 Jan → 28/29 Feb
      }
    }
    return d.getTime();
  }

  // ───────────────────────── data
  function reset() {
    G.loadId++;
    clearInterval(G.timer);
    G.timer = null;
    Object.assign(G, { avail: null, items: [], tab: "jadwal", form: null, draft: {}, quick: "", parsed: null, alerts: new Set(), snooze: {} });
    closeDialog(true);
  }

  async function onLogin() {
    reset();
    const id = G.loadId;
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey()) || "null");
      if (c && Array.isArray(c.items)) G.items = c.items;
    } catch {
      /* abaikan */
    }
    const { data, error } = await sb().from("wa_scheduled").select("*").order("send_at", { ascending: true }).limit(250);
    if (id !== G.loadId) return;
    if (error) {
      if (/^(42P01|PGRST205)$/.test(error.code || "")) G.avail = false;
      else if (G.items.length) G.avail = true;
      if (isMine()) render();
      if (G.avail) startTimer();
      return;
    }
    G.avail = true;
    G.items = data || [];
    saveCache();
    startTimer();
    if (isMine()) render();
  }
  const onLogout = reset;

  function saveCache() {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({ items: G.items }));
    } catch {
      /* penyimpanan penuh */
    }
  }

  async function reload() {
    const { data, error } = await sb().from("wa_scheduled").select("*").order("send_at", { ascending: true }).limit(250);
    if (error) return App.toast(isNetErr(error) ? "Sambungkan ke internet untuk memuat ulang." : error.message);
    G.items = data || [];
    saveCache();
    if (isMine()) renderBody();
  }

  // ───────────────────────── alarm jadwal
  function startTimer() {
    clearInterval(G.timer);
    G.timer = setInterval(tick, 15_000);
    tick();
  }

  function tick() {
    if (!G.avail || !App.user) return;
    const now = Date.now();
    let fresh = false;
    for (const it of G.items) {
      if (!it.active || G.alerts.has(it.id)) continue;
      const sn = G.snooze[it.id];
      if (sn ? sn <= now : it.send_at <= now) {
        delete G.snooze[it.id];
        G.alerts.add(it.id);
        fresh = true;
        App.notify(`💬 Waktunya kirim: ${it.title}`, `${it.group_name ? "Ke grup " + it.group_name + ". " : ""}Buka Catatan lalu tekan Buka WhatsApp.`, "wa-" + it.id);
      }
    }
    if (fresh) {
      renderAlerts();
      App.sound.start();
    }
  }

  let dlg = null;
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "dialog dialog-sm alarm-dialog";
    dlg.innerHTML = `<div class="dialog-head"><h2>💬 Waktunya kirim pesan grup</h2></div><div class="dialog-body"><div class="alarm-list" id="wgAlerts"></div><div class="set-row"><button class="btn-secondary" data-ga="close" type="button">Tutup</button></div></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", onAlertClick);
    dlg.addEventListener("close", () => App.sound.stop());
    return dlg;
  }

  function renderAlerts() {
    const d = ensureDialog();
    const rows = [...G.alerts].map((id) => G.items.find((x) => x.id === id)).filter(Boolean);
    if (!rows.length) return closeDialog();
    d.querySelector("#wgAlerts").innerHTML = rows
      .map(
        (it) => `<div class="alarm-item" data-id="${esc(it.id)}"><h4>${esc(it.title)}</h4>
        <small>${it.group_name ? "Grup: " + esc(it.group_name) + " · " : ""}dijadwalkan ${esc(shortDate(it.send_at))}, ${esc(timeText(it.send_at))}</small>
        <p style="margin:8px 0 0;white-space:pre-wrap">${esc(it.body.length > 240 ? it.body.slice(0, 240) + "…" : it.body)}</p>
        <div class="alarm-acts">
          <button class="btn-primary" data-ga="send" type="button">Buka WhatsApp</button>
          <button class="btn-secondary" data-ga="snooze" type="button">Tunda 10 menit</button>
          <button class="btn-secondary" data-ga="skip" type="button">Lewati</button>
        </div></div>`
      )
      .join("");
    if (!d.open) d.showModal();
  }

  function closeDialog(silent) {
    G.alerts = new Set();
    if (dlg && dlg.open) dlg.close();
    if (!silent) App.sound.stop();
  }

  function onAlertClick(e) {
    const b = e.target.closest("[data-ga]");
    if (!b) return;
    if (b.dataset.ga === "close") return closeDialog();
    const row = e.target.closest("[data-id]");
    const it = row && G.items.find((x) => x.id === row.dataset.id);
    if (!it) return;
    G.alerts.delete(it.id);
    if (b.dataset.ga === "send") openWhatsApp(it);
    else if (b.dataset.ga === "snooze") {
      G.snooze[it.id] = Date.now() + SNOOZE;
      App.toast("Ditunda 10 menit");
    } else advance(it, false);
    renderAlerts();
  }

  // ───────────────────────── aksi data
  async function patch(it, fields) {
    const { error } = await sb().from("wa_scheduled").update(fields).eq("id", it.id);
    if (error) {
      App.toast(isNetErr(error) ? "Sambungkan ke internet untuk menyimpan." : error.message);
      return false;
    }
    Object.assign(it, fields);
    saveCache();
    return true;
  }

  // Majukan jadwal: berulang → jadwal berikutnya; sekali → jeda. `sent` = dihitung sebagai terkirim.
  async function advance(it, sent) {
    const now = Date.now();
    const next = nextAfter(it, now);
    const fields = { send_at: next || it.send_at, active: next ? it.active : false };
    if (sent) Object.assign(fields, { last_sent_at: now, send_count: it.send_count + 1 });
    await patch(it, fields);
    if (isMine()) render();
  }

  // Membuka WhatsApp dengan pesan terisi; pengguna memilih grup tujuan di WhatsApp.
  function openWhatsApp(it) {
    const url = `https://wa.me/?text=${encodeURIComponent(it.body)}`;
    if (!window.open(url, "_blank", "noopener,noreferrer")) App.toast("Browser memblokir pop-up. Izinkan pop-up untuk situs ini lalu coba lagi.");
    advance(it, true);
  }

  async function toggleActive(it, on) {
    if (on && it.send_at <= Date.now()) {
      const next = nextAfter(it);
      if (!next) {
        // pesan sekali yang waktunya sudah lewat: minta jadwal baru
        openForm(it.id);
        return App.toast("Atur tanggal dan jam baru untuk mengaktifkan lagi.");
      }
      await patch(it, { active: true, send_at: next });
    } else await patch(it, { active: on });
    render();
  }

  async function removeItem(it) {
    if (!confirm(`Hapus pesan terjadwal “${it.title}”?`)) return;
    const { error } = await sb().from("wa_scheduled").delete().eq("id", it.id);
    if (error) return App.toast(error.message);
    G.items = G.items.filter((x) => x.id !== it.id);
    G.alerts.delete(it.id);
    saveCache();
    render();
    renderAlerts();
  }

  async function saveForm(form) {
    const f = form.elements;
    const err = form.querySelector('[data-g="err"]');
    err.textContent = "";
    const at = new Date(`${f.date.value}T${f.time.value}`).getTime();
    if (!Number.isFinite(at)) return void (err.textContent = "Isi tanggal dan jam kirim.");
    const active = f.active.checked;
    if (active && at <= Date.now()) return void (err.textContent = "Waktunya sudah lewat. Pilih waktu yang akan datang, atau nonaktifkan pesan ini.");
    const row = {
      title: f.title.value.trim(), group_name: f.group.value.trim(), body: f.body.value.trim(),
      send_at: at, repeat: f.repeat.value, active,
    };
    if (!row.body) return void (err.textContent = "Isi pesan tidak boleh kosong.");
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    App.unlockAudio();
    const id = G.form && G.form.id;
    const res = id ? await sb().from("wa_scheduled").update(row).eq("id", id) : await sb().from("wa_scheduled").insert(row).select().single();
    btn.disabled = false;
    if (res.error) return void (err.textContent = isNetErr(res.error) ? "Sambungkan ke internet untuk menyimpan." : res.error.message);
    if (id) Object.assign(G.items.find((x) => x.id === id) || {}, row);
    else G.items.push(res.data);
    G.items.sort((a, b) => a.send_at - b.send_at);
    G.form = null;
    G.draft = {};
    saveCache();
    G.alerts.delete(id);
    render();
    App.toast(id ? "Perubahan disimpan" : "Pesan terjadwal disimpan");
  }

  // ───────────────────────── tampilan
  const I = {
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  };

  const hint = '<div class="mod-note">Halaman ini butuh migrasi database 007. Jalankan <b>supabase/migrations/007_pesan_terjadwal.sql</b> di Supabase SQL Editor (lihat README), lalu muat ulang. Tab Kirim cepat dan Impor chat tetap bisa dipakai.</div>';

  function enter() {
    App.setMainOpen(false);
    render();
  }
  function leave() {}

  function render() {
    if (!isMine()) return;
    const box = App.list;
    const active = G.items.filter((x) => x.active).length;
    const paused = G.items.length - active;
    const sent = G.items.reduce((n, x) => n + x.send_count, 0);
    box.innerHTML = `
      <div class="rem-head">
        <div><h1>Pesan Grup</h1><p>Pesan terjadwal ke grup WhatsApp. Saat jadwal tiba, Catatan membunyikan alarm dan membuka WhatsApp dengan pesan siap kirim.</p></div>
        <div class="wg-head-actions"><button class="icon-btn lg" data-g="refresh" title="Muat ulang" aria-label="Muat ulang">${I.refresh}</button>
          <button class="btn-primary" data-g="new" ${G.avail === false ? "disabled" : ""}>＋ Pesan baru</button></div>
      </div>
      <div class="wg-stats">
        <div class="wg-stat"><b>${active}</b><span>Aktif</span></div>
        <div class="wg-stat"><b>${paused}</b><span>Dijeda</span></div>
        <div class="wg-stat"><b>${sent}</b><span>Total terkirim</span></div>
      </div>
      <div class="wg-tabs" role="tablist">
        <button class="wg-tab${G.tab === "jadwal" ? " on" : ""}" role="tab" data-g="tab" data-tab="jadwal">Terjadwal <span class="wg-count">${G.items.length}</span></button>
        <button class="wg-tab${G.tab === "cepat" ? " on" : ""}" role="tab" data-g="tab" data-tab="cepat">${I.send} Kirim cepat</button>
        <button class="wg-tab${G.tab === "impor" ? " on" : ""}" role="tab" data-g="tab" data-tab="impor">${I.upload} Impor chat</button>
      </div>
      <div id="wgBody"></div>`;
    renderBody();
  }

  function formHtml() {
    const it = G.form.id ? G.items.find((x) => x.id === G.form.id) : null;
    const [d0, t0] = toInputs(it ? it.send_at : Math.ceil((Date.now() + 3600_000) / 300_000) * 300_000);
    const v = Object.assign({ title: it ? it.title : "", group: it ? it.group_name : "", body: it ? it.body : "", date: d0, time: t0, repeat: it ? it.repeat : "none", active: it ? it.active : true }, G.draft);
    return `<form class="rem-card-form wg-form" data-g="form">
      <h2>${it ? "Ubah pesan terjadwal" : "Pesan terjadwal baru"}</h2>
      <div class="rem-row2"><label>Judul<input name="title" maxlength="100" required placeholder="mis. Info stok harian" value="${esc(v.title)}" /></label>
        <label>Nama grup WhatsApp<input name="group" maxlength="80" placeholder="mis. Informasi Perusahaan" value="${esc(v.group)}" /></label></div>
      <label>Isi pesan<textarea name="body" maxlength="1500" required rows="4" placeholder="Tulis pesan yang akan dikirim ke grup…">${esc(v.body)}</textarea></label>
      <div class="rem-row2"><label>Tanggal<input type="date" name="date" required value="${esc(v.date)}" /></label><label>Jam (${tzLabel()})<input type="time" name="time" required value="${esc(v.time)}" /></label></div>
      <div class="rem-row2"><label>Ulangi<select name="repeat">${Object.entries(REPEAT).map(([k, n]) => `<option value="${k}" ${k === v.repeat ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <div class="wg-actwrap"><span class="wg-actlabel">Status</span><div class="rem-switches"><label class="sw"><span>Aktif</span><input type="checkbox" name="active" ${v.active ? "checked" : ""} /><i></i></label></div></div></div>
      <div class="rem-err" data-g="err"></div>
      <div class="rem-row2"><button class="btn-primary rem-submit" type="submit">Simpan</button><button class="btn-secondary rem-submit" type="button" data-g="cancel-form">Batal</button></div>
    </form>`;
  }

  function cardHtml(it) {
    const sentOnce = it.repeat === "none" && it.send_count > 0;
    const when =
      it.repeat === "none"
        ? `Sekali · ${shortDate(it.send_at)}`
        : it.repeat === "daily"
        ? "Setiap hari"
        : it.repeat === "weekly"
        ? `Setiap minggu · ${new Date(it.send_at).toLocaleDateString("id-ID", { weekday: "long" })}`
        : `Setiap bulan · tgl ${new Date(it.send_at).getDate()}`;
    const upcoming = it.active && !sentOnce;
    const late = upcoming && it.send_at < Date.now();
    return `<div class="wg-card${it.active ? "" : " paused"}" data-id="${esc(it.id)}">
      <div class="wg-top"><b>${esc(it.title)}</b>
        <label class="wg-toggle" title="${it.active ? "Jeda" : "Aktifkan"}"><input type="checkbox" data-g="toggle" ${it.active ? "checked" : ""} aria-label="Aktif"><i></i></label></div>
      ${it.group_name ? `<div class="wg-group">${I.users}${esc(it.group_name)}</div>` : ""}
      <div class="wg-chips"><span class="wg-chip">${I.clock}${esc(timeText(it.send_at))}</span><span class="wg-chip">${I.cal}${esc(when)}</span>
        ${sentOnce ? '<span class="wg-chip ok">terkirim</span>' : ""}${late ? '<span class="wg-chip bad">menunggu dikirim</span>' : ""}${it.active ? "" : '<span class="wg-chip">Dijeda</span>'}</div>
      <div class="wg-body">${esc(it.body)}</div>
      <div class="wg-meta"><div>Berikutnya<b>${upcoming ? esc(stampText(it.send_at)) : "–"}</b></div><div>Terakhir terkirim<b>${it.last_sent_at ? esc(stampText(it.last_sent_at)) : "–"}</b></div><div>Total<b>${it.send_count}×</b></div></div>
      <div class="wg-actions"><button class="wg-send" data-g="send">${I.send} Kirim sekarang</button>
        <button class="icon-btn lg" data-g="edit" title="Ubah" aria-label="Ubah">${I.edit}</button>
        <button class="icon-btn lg del" data-g="del" title="Hapus" aria-label="Hapus">${I.trash}</button></div>
    </div>`;
  }

  function renderBody() {
    const box = document.getElementById("wgBody");
    if (!box) return;
    if (G.tab === "cepat") {
      box.innerHTML = `<div class="rem-card-form wg-quick"><h2>Kirim cepat ke grup</h2>
        <p class="mod-note" style="padding:0">Tulis pesan, lalu WhatsApp terbuka dan kamu memilih grup tujuannya di sana.</p>
        <textarea id="wgQuick" rows="7" maxlength="1500" placeholder="Tulis pesan untuk grup…">${esc(G.quick)}</textarea>
        <div class="rem-err" id="wgQuickErr"></div>
        <button class="wa-send" data-g="quick-send">➤ Buka WhatsApp &amp; pilih grup</button></div>`;
      return;
    }
    if (G.tab === "impor") return renderImport(box);
    if (G.avail === false) return void (box.innerHTML = hint);
    let html = G.form ? formHtml() : "";
    html += G.items.length ? `<div class="wg-grid">${G.items.map(cardHtml).join("")}</div>` : G.form ? "" : '<div class="rem-empty">Belum ada pesan terjadwal.<br>Tekan <b>＋ Pesan baru</b> untuk membuat yang pertama.</div>';
    box.innerHTML = html;
  }

  function openForm(id) {
    G.tab = "jadwal";
    G.form = { id: id || null };
    G.draft = {};
    render();
    const i = document.querySelector('.wg-form input[name="title"]');
    if (i) i.focus();
  }

  // ───────────────────────── impor chat WhatsApp
  function renderImport(box) {
    const p = G.parsed;
    box.innerHTML = `<div class="rem-card-form wg-quick"><h2>Impor chat WhatsApp</h2>
      <p class="mod-note" style="padding:0">Di WhatsApp: buka grup → <b>⋮ → Lainnya → Ekspor chat → Tanpa media</b>, lalu pilih berkas <b>.txt</b> hasilnya di sini. Berkas dibaca di browsermu dan tidak diunggah ke mana pun; hasilnya disimpan sebagai satu catatan.</p>
      <label class="wg-file"><input type="file" id="wgFile" accept=".txt,text/plain" />${I.upload}<span>Pilih berkas chat (.txt)</span></label>
      <div class="rem-err" id="wgImpErr"></div>
      ${
        p
          ? `<div class="wg-imp"><b>${esc(p.name)}</b><span>${p.messages.length} pesan · ${p.people.length} peserta · ${esc(p.range)}</span>
        <div class="wg-people">${p.people.slice(0, 6).map(([n, c]) => `<span class="wg-chip">${esc(n)} · ${c}</span>`).join("")}</div>
        <pre class="wg-prev">${esc(p.preview)}</pre>
        ${p.truncated ? '<div class="mod-note" style="padding:0">Chat sangat panjang: hanya bagian terbaru yang dimuat agar muat dalam satu catatan.</div>' : ""}
        <button class="btn-primary" data-g="imp-save">Simpan sebagai catatan</button></div>`
          : ""
      }</div>`;
  }

  // Format Android "12/03/24 14.05 - Nama: pesan" dan iOS "[12/03/24, 14.05.33] Nama: pesan".
  const LINE = /^[‎‏]?\[?(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),?\s+(\d{1,2}[.:]\d{2})(?:[.:]\d{2})?\s*(?:[APap]\.?[Mm]\.?)?\]?\s*(?:-\s*)?(.*)$/;
  function parseChat(text, fileName) {
    const msgs = [];
    for (const raw of text.replace(/\r/g, "").split("\n")) {
      const line = raw.replace(/^[‎‏]+/, "");
      const m = line.match(LINE);
      if (m) {
        const rest = m[3];
        const c = rest.indexOf(": ");
        if (c > 0 && c <= 60) msgs.push({ date: m[1], time: m[2].replace(":", "."), name: rest.slice(0, c), text: rest.slice(c + 2) });
        // baris tanpa "Nama: " = pesan sistem (mis. "X menambahkan Y"): dilewati
      } else if (msgs.length && line) msgs[msgs.length - 1].text += "\n" + line; // lanjutan pesan multibaris
    }
    return msgs;
  }

  function buildNote(msgs) {
    const out = [];
    let bytes = 0;
    let day = "";
    let truncated = false;
    const enc = new TextEncoder();
    const LIMIT = 900_000;
    const lines = [];
    for (const m of msgs) {
      const parts = [];
      if (m.date !== day) {
        day = m.date;
        parts.push(`\n## ${m.date}\n`);
      }
      parts.push(`**${m.time} ${m.name}:** ${m.text.replace(/\n/g, "  \n")}\n`);
      lines.push(parts.join("\n"));
    }
    // jaga ukuran: ambil dari yang terbaru bila terlalu besar
    for (let i = lines.length - 1; i >= 0; i--) {
      const n = enc.encode(lines[i]).length;
      if (bytes + n > LIMIT) {
        truncated = true;
        break;
      }
      bytes += n;
      out.unshift(lines[i]);
    }
    return { content: out.join("\n"), truncated };
  }

  function onFile(file) {
    const err = document.getElementById("wgImpErr");
    if (err) err.textContent = "";
    if (file.size > 20 * 1024 * 1024) return void (err.textContent = "Berkas terlalu besar (maksimal 20 MB).");
    const reader = new FileReader();
    reader.onerror = () => err && (err.textContent = "Berkas tidak bisa dibaca.");
    reader.onload = () => {
      const msgs = parseChat(String(reader.result || ""), file.name);
      if (!msgs.length) {
        G.parsed = null;
        renderBody();
        return void (document.getElementById("wgImpErr").textContent = "Tidak ada pesan yang dikenali. Pastikan ini berkas .txt hasil Ekspor chat WhatsApp.");
      }
      const counts = new Map();
      msgs.forEach((m) => counts.set(m.name, (counts.get(m.name) || 0) + 1));
      const built = buildNote(msgs);
      G.parsed = {
        name: file.name.replace(/\.txt$/i, "").replace(/^WhatsApp Chat (with|-) /i, ""),
        messages: msgs,
        people: [...counts.entries()].sort((a, b) => b[1] - a[1]),
        range: `${msgs[0].date} – ${msgs[msgs.length - 1].date}`,
        preview: msgs.slice(0, 4).map((m) => `[${m.time}] ${m.name}: ${m.text.split("\n")[0].slice(0, 80)}`).join("\n"),
        content: built.content,
        truncated: built.truncated,
      };
      renderBody();
    };
    reader.readAsText(file);
  }

  function saveImport() {
    const p = G.parsed;
    if (!p) return;
    const id = App.addNote({
      title: `Chat WhatsApp: ${p.name}`.slice(0, 140),
      content: `Diimpor dari ekspor chat WhatsApp · ${p.messages.length} pesan · ${p.range}\n${p.content}`,
      tags: ["chat-wa"],
    });
    G.parsed = null;
    renderBody();
    App.toast("Chat disimpan sebagai catatan", "Buka", () => App.openNote(id));
  }

  // ───────────────────────── event
  function onClick(e) {
    if (!isMine()) return;
    const el = e.target.closest("[data-g]");
    if (!el) return;
    const act = el.dataset.g;
    const id = (e.target.closest("[data-id]") || {}).dataset && e.target.closest("[data-id]").dataset.id;
    const it = id && G.items.find((x) => x.id === id);
    if (act === "tab") {
      G.tab = el.dataset.tab;
      render();
    } else if (act === "refresh") reload();
    else if (act === "new") openForm(null);
    else if (act === "cancel-form") {
      G.form = null;
      G.draft = {};
      renderBody();
    } else if (act === "edit" && it) openForm(it.id);
    else if (act === "del" && it) removeItem(it);
    else if (act === "send" && it) openWhatsApp(it);
    else if (act === "quick-send") {
      const text = (document.getElementById("wgQuick") || {}).value.trim();
      if (!text) return void (document.getElementById("wgQuickErr").textContent = "Tulis pesannya dulu.");
      if (!window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")) document.getElementById("wgQuickErr").textContent = "Browser memblokir pop-up. Izinkan pop-up untuk situs ini.";
    } else if (act === "imp-save") saveImport();
  }

  function onChange(e) {
    if (!isMine()) return;
    if (e.target.dataset.g === "toggle") {
      const it = G.items.find((x) => x.id === e.target.closest("[data-id]").dataset.id);
      if (it) toggleActive(it, e.target.checked);
    } else if (e.target.id === "wgFile" && e.target.files[0]) {
      const f = e.target.files[0];
      e.target.value = "";
      onFile(f);
    }
  }

  function onInput(e) {
    if (!isMine()) return;
    if (e.target.id === "wgQuick") G.quick = e.target.value;
    else if (e.target.closest && e.target.closest('[data-g="form"]') && e.target.name) {
      const map = { title: "title", group: "group", body: "body", date: "date", time: "time", repeat: "repeat" };
      if (map[e.target.name]) G.draft[map[e.target.name]] = e.target.value;
      else if (e.target.name === "active") G.draft.active = e.target.checked;
    }
  }

  function onSubmit(e) {
    const form = e.target.closest('[data-g="form"]');
    if (!form || !isMine()) return;
    e.preventDefault();
    saveForm(form);
  }

  App.list.addEventListener("click", onClick);
  App.list.addEventListener("change", onChange);
  App.list.addEventListener("input", onInput);
  App.list.addEventListener("submit", onSubmit);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && tick());

  App.register(["groups"], { enter, leave, onLogin, onLogout });
})();
