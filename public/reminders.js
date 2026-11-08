// Halaman "Pengingat & Alarm": pengingat umum, jobdesk (tugas untuk kontak, bisa berulang), dan daftar kontak.
// Alarm dicek di browser setiap 15 detik, jadi berbunyi selama Catatan terbuka. Tidak ada server push, dan
// WhatsApp tidak dikirim otomatis: saat alarm berbunyi tersedia tombol yang membuka WhatsApp dengan pesan siap kirim.
(() => {
  "use strict";
  const App = window.CatatanApp;
  if (!App) return;
  const esc = App.escapeHtml;
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  const GRACE = 3 * DAY; // pengingat yang terlewat lebih dari ini tidak lagi membunyikan alarm
  const STAGE_WINDOW = 15 * 60_000;
  const LATE_AFTER = 5 * 60_000;
  const SNOOZE = 10 * 60_000;
  const STEP = { daily: DAY, weekly: 7 * DAY };
  const REPEAT_LABEL = { none: "Sekali", daily: "Setiap hari", weekly: "Setiap minggu" };

  const R = {
    avail: null,
    tab: "umum", // 'umum' | 'jobdesk' | 'kontak'
    items: [],
    contacts: [],
    form: {},
    fired: {},
    snooze: {},
    alerts: [], // [{ id, stage }]
    loadId: 0,
    timer: null,
    busy: false,
  };
  const sb = () => App.sb;
  const me = () => (App.user ? App.user.id : null);
  const isMine = () => App.view() === "reminders";
  const firedKey = () => `catatan.rem.fired.${me()}`;
  const cacheKey = () => `catatan.rem.cache.${me()}`;
  const pad = (n) => String(n).padStart(2, "0");
  const isNetErr = (err) => !navigator.onLine || /failed to fetch|network|load failed/i.test((err && err.message) || "");

  const dateText = (ts) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} pukul ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  };
  const contactOf = (id) => R.contacts.find((c) => c.id === id) || null;

  // "0812-3456 789" / "+62 812…" -> "628123456789" (format wa.me); kosong bila tidak valid.
  function normalizePhone(raw) {
    let d = String(raw || "").replace(/[^0-9+]/g, "");
    if (d.startsWith("+")) d = d.slice(1);
    else if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0")) d = "62" + d.slice(1);
    return /^[0-9]{6,16}$/.test(d) ? d : "";
  }
  const waLink = (phone, r) => {
    const text = `⏰ ${r.title}${r.detail ? "\n" + r.detail : ""}\n🕒 ${dateText(r.due_at)}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  };
  const showPhone = (p) => (p && p.startsWith("62") ? "0" + p.slice(2) : p || "");

  // ───────────────────────── data
  function reset() {
    R.loadId++;
    clearInterval(R.timer);
    R.timer = null;
    Object.assign(R, { avail: null, items: [], contacts: [], form: {}, fired: {}, snooze: {}, alerts: [], tab: "umum" });
    App.setReminderExtra(0);
    closeDialog(true);
  }

  async function onLogin() {
    reset();
    const id = R.loadId;
    try {
      R.fired = JSON.parse(localStorage.getItem(firedKey()) || "{}") || {};
      const cache = JSON.parse(localStorage.getItem(cacheKey()) || "null");
      if (cache) {
        R.items = cache.items || [];
        R.contacts = cache.contacts || [];
      }
    } catch {
      R.fired = {};
    }
    const probe = await sb().from("reminders").select("id").limit(1);
    if (id !== R.loadId) return;
    if (probe.error) {
      if (/^(42P01|PGRST205)$/.test(probe.error.code || "")) R.avail = false;
      else if (R.items.length) R.avail = true; // offline: pakai salinan terakhir
      if (isMine()) render();
      if (R.avail) startTimer();
      return;
    }
    R.avail = true;
    await loadAll();
    if (id !== R.loadId) return;
    startTimer();
    if (isMine()) render();
  }
  const onLogout = reset;

  async function loadAll() {
    const [rem, con] = await Promise.all([
      sb().from("reminders").select("*").order("due_at", { ascending: true }).limit(600),
      sb().from("contacts").select("*").order("name", { ascending: true }).limit(250),
    ]);
    if (!rem.error) R.items = rem.data || [];
    if (!con.error) R.contacts = con.data || [];
    saveCache();
    updateBadge();
  }

  function saveCache() {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({ items: R.items, contacts: R.contacts }));
      const cutoff = Date.now() - 14 * DAY; // buang catatan pemicu yang sudah lama
      for (const k of Object.keys(R.fired)) if (R.fired[k] < cutoff) delete R.fired[k];
      localStorage.setItem(firedKey(), JSON.stringify(R.fired));
    } catch {
      /* penyimpanan penuh */
    }
  }

  function updateBadge() {
    const now = Date.now();
    App.setReminderExtra(R.items.filter((r) => !r.done && r.due_at >= now - DAY).length);
  }

  // ───────────────────────── alarm
  function startTimer() {
    clearInterval(R.timer);
    R.timer = setInterval(tick, 15_000);
    tick();
  }

  const STAGES = (r) => [
    ["day", r.due_at - DAY, r.alert_day],
    ["hour", r.due_at - HOUR, r.alert_hour],
    ["ontime", r.due_at, r.alert_ontime],
  ];

  // Tandai tahap yang waktunya sudah lewat sebagai "sudah dibunyikan" (mis. pengingat dibuat 30 menit sebelum acara).
  function markPast(r) {
    const now = Date.now();
    for (const [st, at] of STAGES(r)) if (at <= now) R.fired[`${r.id}:${r.due_at}:${st}`] = now;
    saveCache();
  }

  function tick() {
    if (!R.avail || !App.user) return;
    const now = Date.now();
    let changed = false;
    for (const r of R.items) {
      if (r.done) continue;
      let latest = null;
      for (const [st, at, on] of STAGES(r)) {
        const key = `${r.id}:${r.due_at}:${st}`;
        if (at > now || R.fired[key]) continue;
        R.fired[key] = now;
        changed = true;
        // Tahap "besok" dan "1 jam lagi" hanya berguna sesaat; yang waktunya sudah lama lewat (mis. di perangkat lain) dilewati.
        if (on && now - at < (st === "ontime" ? GRACE : STAGE_WINDOW)) latest = st;
      }
      if (latest === "ontime" && now - r.due_at > LATE_AFTER) latest = "late";
      const sn = R.snooze[r.id];
      if (sn && sn <= now) {
        delete R.snooze[r.id];
        latest = "snooze";
      }
      if (latest) pushAlert(r, latest);
    }
    if (changed) saveCache();
    updateBadge();
  }

  let dlg = null;
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "dialog dialog-sm alarm-dialog";
    dlg.innerHTML = `<div class="dialog-head"><h2>⏰ Pengingat</h2></div><div class="dialog-body"><div class="alarm-list" id="remAlerts"></div><div class="set-row"><button class="btn-secondary" data-ra="close" type="button">Tutup</button></div></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", onAlertClick);
    dlg.addEventListener("close", () => App.sound.stop());
    return dlg;
  }

  const STAGE_TEXT = { day: "Besok", hour: "1 jam lagi", ontime: "Sekarang", snooze: "Sekarang (ditunda)", late: "Terlewat" };

  function pushAlert(r, stage) {
    const a = R.alerts.find((x) => x.id === r.id);
    if (a) a.stage = stage;
    else R.alerts.push({ id: r.id, stage });
    renderAlerts();
    App.notify(`⏰ ${r.title}`, `${STAGE_TEXT[stage]} · ${dateText(r.due_at)}`, "rem-" + r.id);
    App.sound.start();
  }

  function renderAlerts() {
    const d = ensureDialog();
    const rows = R.alerts
      .map((a) => ({ a, r: R.items.find((x) => x.id === a.id) }))
      .filter((x) => x.r && !x.r.done);
    if (!rows.length) return closeDialog();
    d.querySelector("#remAlerts").innerHTML = rows
      .map(({ a, r }) => {
        const c = r.wa_notify ? contactOf(r.contact_id) : null;
        const phone = c && c.phone;
        return `<div class="alarm-item" data-id="${esc(r.id)}"><h4>${esc(r.title)}</h4>
          <small>${esc(STAGE_TEXT[a.stage])} · ${esc(dateText(r.due_at))}${c ? " · untuk " + esc(c.name) : ""}</small>
          ${r.detail ? `<p style="margin:8px 0 0;white-space:pre-wrap">${esc(r.detail)}</p>` : ""}
          <div class="alarm-acts">
            ${phone ? `<a class="btn-primary" href="${esc(waLink(phone, r))}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;padding:6px 12px;font-size:13px">Kirim ke WhatsApp</a>` : ""}
            <button class="btn-secondary" data-ra="snooze" type="button">Tunda 10 menit</button>
            <button class="btn-secondary" data-ra="done" type="button">Selesai</button>
          </div></div>`;
      })
      .join("");
    if (!d.open) d.showModal();
  }

  function closeDialog(silent) {
    R.alerts = [];
    if (dlg && dlg.open) dlg.close();
    if (!silent) App.sound.stop();
  }

  function onAlertClick(e) {
    const b = e.target.closest("[data-ra]");
    if (!b) return;
    if (b.dataset.ra === "close") return closeDialog();
    const item = e.target.closest("[data-id]");
    const r = item && R.items.find((x) => x.id === item.dataset.id);
    if (!r) return;
    R.alerts = R.alerts.filter((a) => a.id !== r.id);
    if (b.dataset.ra === "snooze") {
      R.snooze[r.id] = Date.now() + SNOOZE;
      App.toast("Ditunda 10 menit");
    } else complete(r);
    renderAlerts();
  }

  // Selesai: pengingat sekali jadi "selesai"; yang berulang maju ke jadwal berikutnya.
  async function complete(r) {
    const now = Date.now();
    let patch;
    if (STEP[r.repeat]) {
      let next = r.due_at;
      while (next <= now) next += STEP[r.repeat];
      patch = { due_at: next };
    } else patch = { done: true, done_at: now };
    const { error } = await sb().from("reminders").update(patch).eq("id", r.id);
    if (error) return App.toast(isNetErr(error) ? "Sambungkan ke internet untuk menyimpan." : error.message);
    Object.assign(r, patch);
    if (patch.due_at) markPast(r);
    saveCache();
    updateBadge();
    if (isMine()) renderBody();
    if (patch.due_at) App.toast("Dijadwalkan lagi: " + dateText(r.due_at));
  }

  // ───────────────────────── tampilan
  const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  const migrationHint = '<div class="mod-note">Halaman ini butuh migrasi database 005. Jalankan <b>supabase/migrations/005_pengingat_kontak.sql</b> di Supabase SQL Editor (lihat README), lalu muat ulang. Pengingat pada catatan (ikon lonceng di editor) tetap berfungsi.</div>';

  function notifChip() {
    const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
    return {
      granted: '<span class="pill ok">🔔 Notifikasi Aktif</span>',
      default: '<span class="pill warn">🔕 Notifikasi Belum Aktif</span><button class="btn-primary" data-r="notif" style="padding:8px 16px">Aktifkan Notifikasi</button>',
      denied: '<span class="pill warn">🚫 Notifikasi diblokir browser</span>',
      unsupported: '<span class="pill">Notifikasi tidak didukung</span>',
    }[perm];
  }

  function render() {
    const box = App.list;
    if (R.avail === false) return void (box.innerHTML = `<div class="rem-head"><div><h1>⏰ Pengingat &amp; Alarm</h1></div></div>${migrationHint}`);
    box.innerHTML = `
      <div class="rem-head">
        <div><h1>⏰ Pengingat &amp; Alarm</h1>
          <p>Atur pengingat, kelola jobdesk karyawan, dan simpan kontak. Alarm berbunyi dan notifikasi muncul selama Catatan terbuka di browser (tab boleh di latar belakang).</p></div>
        <div class="rem-notif" id="remNotif">${notifChip()}</div>
      </div>
      <div class="rem-tabs" role="tablist">
        ${[["umum", "⏰ Pengingat Umum"], ["jobdesk", "📋 Jobdesk Karyawan"], ["kontak", "👤 Daftar Kontak"]]
          .map(([k, label]) => `<button class="rem-tab${R.tab === k ? " active" : ""}" role="tab" data-r="tab" data-tab="${k}">${label}</button>`)
          .join("")}
      </div>
      <div class="rem-grid"><div id="remForm"></div><div class="rem-listwrap" id="remBody"></div></div>`;
    renderForm();
    renderBody();
  }

  function refresh() {
    const n = document.getElementById("remNotif");
    if (n && isMine()) n.innerHTML = notifChip();
  }

  const switchRow = (name, label, on) => `<label class="sw"><span>${label}</span><input type="checkbox" name="${name}" ${on ? "checked" : ""} /><i></i></label>`;
  const contactOptions = (sel, blank) =>
    `<option value="">${blank}</option>` + R.contacts.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}${c.phone ? " · " + esc(showPhone(c.phone)) : ""}</option>`).join("");

  function renderForm() {
    const box = document.getElementById("remForm");
    if (!box) return;
    const f = R.form;
    if (R.tab === "kontak") {
      box.innerHTML = `<form class="rem-card-form" data-r="contact-form">
        <h2>Tambah Kontak</h2>
        <label>Nama<input name="name" maxlength="60" required placeholder="Contoh: Sari (Kasir)" value="${esc(f.cname || "")}" /></label>
        <label>Nomor WhatsApp (opsional)<input name="phone" maxlength="20" inputmode="tel" placeholder="08123456789 atau +628123456789" value="${esc(f.cphone || "")}" /></label>
        <div class="rem-err" data-r="err"></div>
        <button class="btn-primary rem-submit" type="submit">Simpan Kontak</button>
      </form>`;
      return;
    }
    const job = R.tab === "jobdesk";
    box.innerHTML = `<form class="rem-card-form" data-r="rem-form">
      <h2>${job ? "Buat Jobdesk Baru" : "Buat Pengingat Baru"}</h2>
      <label>${job ? "Judul Tugas" : "Judul Pengingat"}<input name="title" maxlength="100" required placeholder="${job ? "Contoh: Bersihkan area dapur" : "Contoh: Rapat Evaluasi Proyek"}" value="${esc(f.title || "")}" /></label>
      <label>Keterangan (Opsional)<textarea name="detail" maxlength="500" placeholder="Tambahkan detail ${job ? "tugas" : "pengingat"} di sini…">${esc(f.detail || "")}</textarea></label>
      ${job ? `<div class="rem-row2"><label>Ditugaskan ke<select name="contact">${contactOptions(f.contact, "— Pilih kontak —")}</select></label>
        <label>Ulangi<select name="repeat">${Object.entries(REPEAT_LABEL).map(([k, n]) => `<option value="${k}" ${k === (f.repeat || "none") ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>` : ""}
      <div class="rem-row2">
        <label>📅 Tanggal Pelaksanaan<input type="date" name="date" required value="${esc(f.date || "")}" /></label>
        <label>⏰ Jam Pelaksanaan<input type="time" name="time" required value="${esc(f.time || "")}" /></label>
      </div>
      <div><div style="font-size:13px;font-weight:600;margin-bottom:8px">Pemberitahuan Alarm</div>
        <div class="rem-switches">
          ${switchRow("alert_day", "H-1 Hari Sebelum Acara", f.alert_day !== false)}
          ${switchRow("alert_hour", "H-60 Menit Sebelum Acara", f.alert_hour !== false)}
          ${switchRow("alert_ontime", "Tepat Waktu (D-Day)", f.alert_ontime !== false)}
          ${switchRow("wa_notify", "Siapkan Pesan WhatsApp", !!f.wa_notify)}
        </div></div>
      ${!job && f.wa_notify ? `<label>Kirim ke kontak<select name="contact">${contactOptions(f.contact, "— Pilih kontak —")}</select></label>` : ""}
      ${f.wa_notify ? '<div class="mod-note" style="padding:0">WhatsApp tidak dikirim otomatis. Saat alarm berbunyi, muncul tombol yang membuka WhatsApp dengan pesan siap kirim.</div>' : ""}
      ${!R.contacts.length && (job || f.wa_notify) ? '<div class="mod-note" style="padding:0">Belum ada kontak. Tambahkan dulu di tab <b>Daftar Kontak</b>.</div>' : ""}
      <div class="rem-err" data-r="err"></div>
      <button class="btn-primary rem-submit" type="submit">🔔 Simpan ${job ? "Jobdesk" : "Pengingat"}</button>
    </form>`;
  }

  function chips(r) {
    const c = r.wa_notify ? contactOf(r.contact_id) : null;
    const one = (on, label) => `<span class="rem-chip${on ? "" : " off"}">${on ? "✓" : "✖"} ${label}${on ? "" : " (Nonaktif)"}</span>`;
    return (
      (c && c.phone ? `<span class="rem-chip wa">📲 WhatsApp: <b>${esc(showPhone(c.phone))}</b></span>` : "") +
      (STEP[r.repeat] ? `<span class="rem-chip rep">↻ ${esc(REPEAT_LABEL[r.repeat])}</span>` : "") +
      `<span class="rem-chips" style="display:contents">${one(r.alert_day, "1 Hari")}${one(r.alert_hour, "1 Jam")}${one(r.alert_ontime, "Tepat Waktu")}</span>`
    );
  }

  function card(r) {
    const late = !r.done && r.due_at < Date.now();
    const c = r.kind === "jobdesk" ? contactOf(r.contact_id) : null;
    return `<div class="rem-card${r.done ? " done" : ""}${late ? " late" : ""}" data-id="${esc(r.id)}">
      <div class="rem-top">
        <div class="rem-text"><h4>${esc(r.title)}</h4>${r.detail ? `<p>${esc(r.detail)}</p>` : ""}
          ${r.kind === "jobdesk" ? `<p>👤 ${c ? esc(c.name) : "Belum ditugaskan"}</p>` : ""}
          <span class="rem-when">${ICON_CLOCK}${esc(dateText(r.due_at))}</span></div>
        <div class="rem-side"><button class="icon-btn" data-r="del" title="Hapus" aria-label="Hapus">${ICON_TRASH}</button>
          ${r.done ? '<span class="rem-state">Selesai</span>' : late ? '<span class="rem-state late">Terlambat</span>' : ""}</div>
      </div>
      <div class="rem-chips">${chips(r)}</div>
      ${r.done ? "" : `<div class="rem-actions"><button class="mini-btn ok" data-r="done">${STEP[r.repeat] ? "Selesai, jadwalkan berikutnya" : "Tandai selesai"}</button></div>`}
    </div>`;
  }

  function renderBody() {
    const box = document.getElementById("remBody");
    if (!box) return;
    if (R.tab === "kontak") {
      box.innerHTML = `<h2>Daftar Kontak</h2><div class="rem-list">${
        R.contacts.length
          ? R.contacts
              .map((c) => `<div class="rem-card" data-id="${esc(c.id)}"><div class="rem-top"><div class="rem-text"><h4>${esc(c.name)}</h4>${c.phone ? `<span class="rem-chip wa">📲 <b>${esc(showPhone(c.phone))}</b></span>` : "<p>Tanpa nomor WhatsApp</p>"}</div>
                <div class="rem-side"><button class="icon-btn" data-r="del-contact" title="Hapus kontak" aria-label="Hapus kontak">${ICON_TRASH}</button></div></div></div>`)
              .join("")
          : '<div class="rem-empty">Belum ada kontak.<br>Kontak dipakai untuk menugaskan jobdesk dan menyiapkan pesan WhatsApp.</div>'
      }</div>`;
      return;
    }
    const kind = R.tab;
    const all = R.items.filter((r) => r.kind === kind);
    const active = all.filter((r) => !r.done).sort((a, b) => a.due_at - b.due_at);
    const done = all.filter((r) => r.done).sort((a, b) => b.due_at - a.due_at);
    let html = `<h2>${kind === "jobdesk" ? "Daftar Jobdesk" : "Daftar Pengingat Terjadwal"}</h2><div class="rem-list">`;
    html += active.length || done.length ? active.concat(done).map(card).join("") : `<div class="rem-empty">${kind === "jobdesk" ? "Belum ada jobdesk." : "Belum ada pengingat."}<br>Isi formulir di sebelah kiri lalu tekan Simpan.</div>`;
    html += "</div>";
    if (kind === "umum") {
      const fromNotes = App.noteReminders();
      if (fromNotes.length) {
        html += `<div class="rem-sub">Pengingat dari catatan</div><div class="rem-list">${fromNotes
          .map(
            (n) => `<div class="rem-card${n.remindAt < Date.now() ? " late" : ""}" data-note="${esc(n.id)}"><div class="rem-top"><div class="rem-text"><h4>${esc(n.title || "Tanpa judul")}</h4>
              <span class="rem-when">${ICON_CLOCK}${esc(dateText(n.remindAt))}</span></div>
              <div class="rem-side"><button class="icon-btn" data-r="note-clear" title="Hapus pengingat" aria-label="Hapus pengingat">${ICON_TRASH}</button></div></div>
              <div class="rem-actions"><button class="mini-btn" data-r="note-open">Buka catatan</button></div></div>`
          )
          .join("")}</div>`;
      }
    }
    box.innerHTML = html;
  }

  // ───────────────────────── aksi
  function toast(err) {
    App.toast(isNetErr(err) ? "Sambungkan ke internet untuk menyimpan." : err.message || "Gagal");
  }

  async function submitReminder(form) {
    const f = form.elements;
    const err = form.querySelector('[data-r="err"]');
    const job = R.tab === "jobdesk";
    err.textContent = "";
    const due = new Date(`${f.date.value}T${f.time.value}`).getTime();
    if (!Number.isFinite(due)) return void (err.textContent = "Isi tanggal dan jam pelaksanaan.");
    if (due <= Date.now()) return void (err.textContent = "Waktunya sudah lewat. Pilih waktu yang akan datang.");
    const wa = f.wa_notify.checked;
    const contact = f.contact ? f.contact.value || null : null;
    if (wa && !contact) return void (err.textContent = "Pilih kontak untuk pesan WhatsApp.");
    if (wa && !(contactOf(contact) || {}).phone) return void (err.textContent = "Kontak itu belum punya nomor WhatsApp.");
    const row = {
      kind: R.tab,
      title: f.title.value.trim(),
      detail: f.detail.value.trim(),
      due_at: due,
      alert_day: f.alert_day.checked,
      alert_hour: f.alert_hour.checked,
      alert_ontime: f.alert_ontime.checked,
      wa_notify: wa,
      contact_id: contact,
      repeat: job && f.repeat ? f.repeat.value : "none",
    };
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    App.unlockAudio();
    const { data, error } = await sb().from("reminders").insert(row).select().single();
    btn.disabled = false;
    if (error) return void (err.textContent = isNetErr(error) ? "Sambungkan ke internet untuk menyimpan." : error.message);
    markPast(data);
    R.items.push(data);
    R.form = {};
    saveCache();
    updateBadge();
    renderForm();
    renderBody();
    App.toast(job ? "Jobdesk disimpan" : "Pengingat disimpan");
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().then(refresh).catch(() => {});
  }

  async function submitContact(form) {
    const f = form.elements;
    const err = form.querySelector('[data-r="err"]');
    err.textContent = "";
    const raw = f.phone.value.trim();
    const phone = raw ? normalizePhone(raw) : "";
    if (raw && !phone) return void (err.textContent = "Nomor tidak valid. Contoh: 08123456789 atau +628123456789.");
    const { data, error } = await sb().from("contacts").insert({ name: f.name.value.trim(), phone }).select().single();
    if (error) return void (err.textContent = isNetErr(error) ? "Sambungkan ke internet untuk menyimpan." : error.message);
    R.contacts.push(data);
    R.contacts.sort((a, b) => a.name.localeCompare(b.name, "id"));
    R.form = {};
    saveCache();
    renderForm();
    renderBody();
    App.toast("Kontak disimpan");
  }

  async function deleteReminder(id) {
    const r = R.items.find((x) => x.id === id);
    if (!r || !confirm(`Hapus “${r.title}”?`)) return;
    const { error } = await sb().from("reminders").delete().eq("id", id);
    if (error) return toast(error);
    R.items = R.items.filter((x) => x.id !== id);
    R.alerts = R.alerts.filter((a) => a.id !== id);
    saveCache();
    updateBadge();
    renderBody();
    renderAlerts();
  }

  async function deleteContact(id) {
    const c = contactOf(id);
    if (!c || !confirm(`Hapus kontak “${c.name}”? Pengingat yang memakainya tetap ada, tanpa penerima.`)) return;
    const { error } = await sb().from("contacts").delete().eq("id", id);
    if (error) return toast(error);
    R.contacts = R.contacts.filter((x) => x.id !== id);
    R.items.forEach((r) => {
      if (r.contact_id === id) r.contact_id = null;
    });
    saveCache();
    renderBody();
  }

  function onClick(e) {
    if (!isMine()) return;
    const el = e.target.closest("[data-r]");
    if (!el) return;
    const act = el.dataset.r;
    const id = (e.target.closest("[data-id]") || {}).dataset && e.target.closest("[data-id]").dataset.id;
    if (act === "tab") {
      R.tab = el.dataset.tab;
      R.form = {};
      render();
    } else if (act === "notif") {
      if (typeof Notification === "undefined") return;
      App.unlockAudio();
      Notification.requestPermission().then(refresh).catch(() => {});
    } else if (act === "del") deleteReminder(id);
    else if (act === "done") {
      const r = R.items.find((x) => x.id === id);
      if (r) complete(r);
    } else if (act === "del-contact") deleteContact(id);
    else if (act === "note-open") App.openNote(e.target.closest("[data-note]").dataset.note);
    else if (act === "note-clear") {
      App.clearNoteReminder(e.target.closest("[data-note]").dataset.note);
      renderBody();
    }
  }

  function onSubmit(e) {
    const form = e.target.closest("[data-r]");
    if (!form || !isMine()) return;
    e.preventDefault();
    if (form.dataset.r === "rem-form") submitReminder(form);
    else if (form.dataset.r === "contact-form") submitContact(form);
  }

  // Simpan isian saat diketik; tombol WhatsApp menambah/menghapus pilihan kontak, jadi formulir digambar ulang.
  function onInput(e) {
    const form = e.target.closest('[data-r="rem-form"], [data-r="contact-form"]');
    if (!form || !isMine()) return;
    const x = form.elements;
    if (form.dataset.r === "contact-form") {
      R.form.cname = x.name.value;
      R.form.cphone = x.phone.value;
      return;
    }
    Object.assign(R.form, {
      title: x.title.value, detail: x.detail.value, date: x.date.value, time: x.time.value,
      alert_day: x.alert_day.checked, alert_hour: x.alert_hour.checked, alert_ontime: x.alert_ontime.checked, wa_notify: x.wa_notify.checked,
      contact: x.contact ? x.contact.value : R.form.contact, repeat: x.repeat ? x.repeat.value : R.form.repeat,
    });
    if (e.target.name === "wa_notify") renderForm();
  }

  App.list.addEventListener("click", onClick);
  App.list.addEventListener("submit", onSubmit);
  App.list.addEventListener("input", onInput);
  App.list.addEventListener("change", onInput);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && tick());

  function enter() {
    App.setMainOpen(false);
    render();
    if (R.avail && App.user) loadAll().then(() => isMine() && renderBody()).catch(() => {});
  }
  function leave() {}

  App.register(["reminders"], { enter, leave, onLogin, onLogout, refresh });
})();
