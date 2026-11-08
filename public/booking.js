// Reservasi Meja: pelanggan memesan lewat tautan tempat; pemilik tempat mengelola meja dan reservasi.
// Aturan (jam buka, bentrok, kapasitas, batas) ditegakkan di database lewat fungsi book_table; lihat
// supabase/migrations/004_*.sql. Halaman ini hanya antarmukanya.
(() => {
  "use strict";
  const App = window.CatatanApp;
  if (!App) return;
  const esc = App.escapeHtml;
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const DAY = 86_400_000;

  const B = {
    avail: null,
    tab: "mine", // 'mine' (reservasi saya) | 'venues' (tempat saya)
    my: [],
    venues: [],
    sel: null, // id tempat yang sedang dikelola
    tables: [],
    vres: [],
    book: null, // alur pemesanan untuk satu tempat
    form: null, // 'venue' | 'venue-edit'
    pending: 0,
    channel: null,
    loadId: 0,
  };
  const sb = () => App.sb;
  const me = () => (App.user ? App.user.id : null);
  const isMine = () => App.view() === "booking";
  const pad = (n) => String(n).padStart(2, "0");
  const minLabel = (m) => `${pad(Math.floor(m / 60))}.${pad(m % 60)}`;
  const minValue = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const toMin = (v) => {
    const [h, m] = String(v || "").split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const one = (d) => (Array.isArray(d) ? d[0] : d);
  const TZ = { 420: "WIB (UTC+7)", 480: "WITA (UTC+8)", 540: "WIT (UTC+9)" };
  const STATUS = { pending: ["Menunggu", "warn"], confirmed: ["Dikonfirmasi", "ok"], cancelled: ["Dibatalkan", "bad"], done: ["Selesai", ""] };
  const badge = (s) => `<span class="badge ${(STATUS[s] || ["", ""])[1]}">${esc((STATUS[s] || [s])[0])}</span>`;

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw new Error(error.message || "Gagal");
    return data;
  }
  const fmtWhen = (starts, ends) => {
    const d = new Date(starts);
    const e = new Date(ends);
    return `${d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })}, ${pad(d.getHours())}.${pad(d.getMinutes())}–${pad(e.getHours())}.${pad(e.getMinutes())}`;
  };
  const bookingLink = (id) => `${location.origin}${location.pathname}?reservasi=${id}`;

  // Waktu setempat tempat (zona waktu tempat, bukan perangkat).
  const dayStart = (v, date) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d) - v.tz_offset_min * 60_000;
  };
  const venueToday = (v) => new Date(Date.now() + v.tz_offset_min * 60_000).toISOString().slice(0, 10);
  const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

  // ───────────────────────── data
  function reset() {
    B.loadId++;
    if (B.channel && sb()) sb().removeChannel(B.channel);
    Object.assign(B, { avail: null, tab: "mine", my: [], venues: [], sel: null, tables: [], vres: [], book: null, form: null, pending: 0, channel: null });
    App.setCount("booking", 0);
  }

  async function onLogin() {
    reset();
    const id = B.loadId;
    const probe = await sb().from("venues").select("id").limit(1);
    if (id !== B.loadId) return;
    if (probe.error) {
      B.avail = /^(42P01|PGRST205)$/.test(probe.error.code || "") ? false : B.avail;
      if (isMine()) render();
      return;
    }
    B.avail = true;
    await loadMine();
    if (id !== B.loadId) return;
    try {
      B.channel = sb()
        .channel("resv-" + me())
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "reservations" }, onNewReservation)
        .subscribe();
    } catch {
      B.channel = null;
    }
    if (isMine()) render();
  }

  function onLogout() {
    reset();
  }

  async function loadMine() {
    const [venues, mine] = await Promise.all([
      sb().from("venues").select("*").order("created_at", { ascending: false }),
      sb().from("reservations").select("*").eq("user_id", me()).order("starts_at", { ascending: false }).limit(60),
    ]);
    B.venues = venues.data || [];
    B.my = mine.data || [];
    await countPending();
  }

  async function countPending() {
    B.pending = 0;
    if (B.venues.length) {
      const ids = B.venues.map((v) => v.id);
      const { data } = await sb().from("reservations").select("id,venue_id,user_id").in("venue_id", ids).eq("status", "pending").gte("ends_at", Date.now());
      B.pending = (data || []).filter((r) => r.user_id !== me()).length;
    }
    App.setCount("booking", B.pending);
  }

  function onNewReservation(p) {
    const r = p && p.new;
    if (!r || !r.id || r.user_id === me() || !B.venues.some((v) => v.id === r.venue_id)) return;
    App.toast(`Reservasi baru: ${r.guest_name} (${r.party_size} orang)`);
    App.notify("Reservasi baru", `${r.guest_name}, ${r.party_size} orang`, "resv-" + r.venue_id);
    countPending();
    if (isMine() && B.sel === r.venue_id) loadManage(B.sel);
  }

  async function loadManage(id) {
    const [t, r] = await Promise.all([
      sb().from("venue_tables").select("*").eq("venue_id", id).order("name"),
      sb().from("reservations").select("*").eq("venue_id", id).gte("ends_at", Date.now() - DAY).order("starts_at", { ascending: true }).limit(200),
    ]);
    if (B.sel !== id) return;
    B.tables = t.data || [];
    B.vres = r.data || [];
    if (isMine()) renderPane();
  }

  // ───────────────────────── render
  function enter() {
    render();
    if (B.avail && App.user) loadMine().then(() => isMine() && renderList()).catch(() => {});
  }
  function leave() {
    App.setMainOpen(false);
  }
  function render() {
    renderList();
    renderPane();
  }

  const hint = '<div class="mod-note">Fitur ini butuh migrasi database 004. Jalankan <b>supabase/migrations/004_chat_darurat_reservasi.sql</b> di Supabase SQL Editor (lihat README), lalu muat ulang.</div>';

  function venueFormHtml(v) {
    const val = v || { name: "", address: "", phone: "", open_min: 540, close_min: 1260, slot_min: 120, tz_offset_min: 420, auto_confirm: false };
    return `<form class="mod-form" data-b="venue-form">
      <label>Nama tempat<input name="name" required minlength="2" maxlength="60" value="${esc(val.name)}" placeholder="mis. Burjo Maju Jaya" /></label>
      <label>Alamat<input name="address" maxlength="150" value="${esc(val.address)}" /></label>
      <label>Telepon / WhatsApp<input name="phone" maxlength="30" value="${esc(val.phone)}" /></label>
      <div class="row">
        <label>Buka<input name="open" type="time" required value="${minValue(val.open_min)}" /></label>
        <label>Tutup<input name="close" type="time" required value="${minValue(Math.min(val.close_min, 1439))}" /></label>
      </div>
      <div class="row">
        <label>Lama per reservasi<select name="slot">${[60, 90, 120, 150, 180, 240].map((m) => `<option value="${m}" ${m === val.slot_min ? "selected" : ""}>${m / 60} jam${m % 60 ? " " + (m % 60) + " mnt" : ""}</option>`).join("")}</select></label>
        <label>Zona waktu<select name="tz">${Object.entries(TZ).map(([k, n]) => `<option value="${k}" ${Number(k) === val.tz_offset_min ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      </div>
      <label class="check"><input name="auto" type="checkbox" ${val.auto_confirm ? "checked" : ""} /> Konfirmasi otomatis (tanpa menunggu persetujuanku)</label>
      <div class="mod-err" data-b="err"></div>
      <div class="row"><button class="btn-primary" type="submit">${v ? "Simpan" : "Buat tempat"}</button><button class="btn-secondary" type="button" data-b="cancel-form">Batal</button></div>
    </form>`;
  }

  function resCard(r, owner) {
    const active = r.status === "pending" || r.status === "confirmed";
    return `<div class="mod-card"><h4><span class="t">${esc(owner ? r.guest_name : r.venue_name || "Tempat")}</span>${badge(r.status)}</h4>
      <p style="white-space:normal">${esc(fmtWhen(r.starts_at, r.ends_at))} · meja ${esc(r.table_name || "?")} · ${r.party_size} orang${owner && r.guest_phone ? ` · <a href="tel:${esc(r.guest_phone)}">${esc(r.guest_phone)}</a>` : ""}${r.note ? `<br><em>${esc(r.note)}</em>` : ""}</p>
      ${active ? `<div class="mod-line" style="margin-top:6px">${
        owner && r.status === "pending" ? `<button class="mini-btn ok" data-b="status" data-st="confirmed" data-id="${esc(r.id)}">Konfirmasi</button>` : ""
      }${owner && r.status === "confirmed" ? `<button class="mini-btn" data-b="status" data-st="done" data-id="${esc(r.id)}">Tandai selesai</button>` : ""}<button class="mini-btn danger" data-b="cancel" data-id="${esc(r.id)}">Batalkan</button></div>` : ""}
    </div>`;
  }

  function renderList() {
    if (!isMine()) return;
    const box = App.list;
    if (B.avail === false) return void (box.innerHTML = hint);
    if (B.avail === null) return void (box.innerHTML = '<div class="mod-note">Memuat…</div>');
    let html = `<div class="mod-seg"><button data-b="tab" data-tab="mine" class="${B.tab === "mine" ? "active" : ""}">Reservasi saya</button><button data-b="tab" data-tab="venues" class="${B.tab === "venues" ? "active" : ""}">Tempat saya${B.pending ? ` (${B.pending})` : ""}</button></div>`;
    if (B.tab === "mine") {
      html += `<form class="mod-form" data-b="open-form"><label>Punya tautan atau kode tempat?<input name="link" placeholder="Tempel tautan reservasi di sini" required /></label><div class="mod-err" data-b="err"></div><button class="btn-secondary" type="submit">Buka halaman pemesanan</button></form>`;
      const now = Date.now();
      const upcoming = B.my.filter((r) => r.ends_at >= now && r.status !== "cancelled").sort((a, b) => a.starts_at - b.starts_at);
      const past = B.my.filter((r) => !upcoming.includes(r));
      html += '<div class="group-label">Akan datang</div>' + (upcoming.length ? upcoming.map((r) => resCard(r, false)).join("") : '<div class="mod-note">Belum ada reservasi. Buka tautan dari tempat makan favoritmu untuk memesan meja.</div>');
      if (past.length) html += '<div class="group-label">Riwayat</div>' + past.map((r) => resCard(r, false)).join("");
    } else {
      html += `<div class="mod-actions"><button class="btn-primary" data-b="new-venue">+ Tempat baru</button></div>`;
      if (B.form === "venue") html += venueFormHtml(null);
      html += B.venues.length
        ? B.venues
            .map((v) => `<button class="mod-card${B.sel === v.id ? " active" : ""}" data-b="manage" data-id="${esc(v.id)}"><h4><span class="t">${esc(v.name)}</span></h4><p>${esc(v.address || "Tanpa alamat")}</p><div class="meta"><span>Buka ${minLabel(v.open_min)}–${minLabel(v.close_min)}</span></div></button>`)
            .join("")
        : '<div class="mod-note">Kamu belum punya tempat. Buat tempat (warung, kafe, restoran), tambahkan mejanya, lalu bagikan tautan pemesanannya ke pelanggan.</div>';
    }
    box.innerHTML = html;
  }

  function renderPane() {
    if (!isMine()) return;
    const pane = App.pane;
    if (B.avail === false) return void (pane.innerHTML = `<div class="mod-empty">${hint}</div>`);
    if (B.book) return renderBooking(pane);
    if (B.sel) {
      const v = B.venues.find((x) => x.id === B.sel);
      if (v) return renderManage(pane, v);
    }
    App.setMainOpen(false);
    pane.innerHTML = `<div class="mod-empty"><h3>Reservasi meja</h3><p>Pelanggan: buka tautan pemesanan dari tempat makan, pilih tanggal, jam, dan meja.</p><p>Pemilik tempat: buka tab <b>Tempat saya</b> untuk membuat tempat, menambah meja, dan mengelola reservasi.</p></div>`;
  }

  const backBtn = '<button class="icon-btn back-btn" data-b="back" title="Kembali"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>';

  // ── pemilik: kelola tempat
  function renderManage(pane, v) {
    const upcoming = B.vres.filter((r) => r.status === "pending" || r.status === "confirmed");
    const rest = B.vres.filter((r) => !upcoming.includes(r));
    pane.innerHTML = `
      <div class="mod-head">${backBtn}<div class="titles"><h3>${esc(v.name)}</h3><small>${esc(v.address || "")} · buka ${minLabel(v.open_min)}–${minLabel(v.close_min)} · ${v.slot_min / 60} jam per reservasi</small></div>
        <button class="mini-btn" data-b="edit-venue">Ubah</button><button class="mini-btn danger" data-b="del-venue">Hapus</button></div>
      <div class="mod-body">
        ${B.form === "venue-edit" ? venueFormHtml(v) : ""}
        <div class="mod-section"><h4>Tautan pemesanan</h4>
          <div class="copy-field"><input readonly value="${esc(bookingLink(v.id))}" /><button class="btn-secondary" data-b="copy-link">Salin</button></div>
          <div class="mod-note" style="padding:0">Bagikan tautan ini ke pelanggan (WhatsApp, Instagram). Pelanggan perlu masuk dengan Google untuk memesan.</div></div>
        <div class="mod-section"><h4>Meja (${B.tables.length})</h4>
          ${B.tables.map((t) => `<div class="mod-line"><span class="grow"><b>${esc(t.name)}</b> · ${t.capacity} orang ${t.active ? "" : '<span class="badge bad">nonaktif</span>'}</span><button class="mini-btn" data-b="toggle-table" data-id="${esc(t.id)}">${t.active ? "Nonaktifkan" : "Aktifkan"}</button><button class="mini-btn danger" data-b="del-table" data-id="${esc(t.id)}">Hapus</button></div>`).join("") || '<div class="mod-note" style="padding:0">Belum ada meja. Tambahkan di bawah.</div>'}
          <form class="mod-line" data-b="table-form"><input name="name" placeholder="Nama meja (mis. A1)" maxlength="20" required style="height:34px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--panel-2);width:150px" />
            <input name="cap" type="number" min="1" max="50" value="4" required style="height:34px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--panel-2);width:80px" title="Kapasitas" />
            <button class="btn-secondary" type="submit" style="padding:6px 12px">Tambah meja</button><span class="mod-err" data-b="err"></span></form></div>
        <div class="mod-section"><h4>Reservasi</h4>
          ${upcoming.length ? upcoming.map((r) => resCard(r, true)).join("") : '<div class="mod-note" style="padding:0">Belum ada reservasi aktif.</div>'}
          ${rest.length ? `<div class="group-label" style="padding-left:0">Selesai / dibatalkan</div>${rest.slice(-15).reverse().map((r) => resCard(r, true)).join("")}` : ""}
        </div>
      </div>`;
    App.setMainOpen(true);
  }

  // ── pelanggan: alur pemesanan
  async function openVenue(id) {
    if (!UUID_RE.test(id)) return App.toast("Kode tempat tidak valid");
    if (B.avail === false) return;
    let info;
    try {
      info = await rpc("get_venue", { p_id: id.match(UUID_RE)[0] });
    } catch (err) {
      return App.toast(err.message);
    }
    if (!info || !info.venue) return App.toast("Tempat tidak ditemukan. Periksa tautannya.");
    const v = info.venue;
    const meta = (App.user && App.user.user_metadata) || {};
    B.sel = null;
    B.book = {
      v, tables: info.tables || [], date: venueToday(v), party: 2, slot: null, tableId: "", busy: [],
      name: String(meta.full_name || meta.name || "").slice(0, 40), phone: "", note: "", err: "", loading: true, done: null, busyBusy: false,
    };
    App.setView("booking");
    renderPane();
    await loadBusy();
  }

  async function loadBusy() {
    const bk = B.book;
    if (!bk) return;
    const from = dayStart(bk.v, bk.date);
    bk.loading = true;
    try {
      bk.busy = (await rpc("venue_busy", { p_venue: bk.v.id, p_from: from, p_to: from + DAY })) || [];
    } catch (err) {
      bk.err = err.message;
    }
    bk.loading = false;
    if (B.book === bk && isMine()) renderPane();
  }

  function slotsFor(bk) {
    const out = [];
    const base = dayStart(bk.v, bk.date);
    for (let m = bk.v.open_min; m + bk.v.slot_min <= bk.v.close_min; m += bk.v.slot_min) {
      const start = base + m * 60_000;
      const end = start + bk.v.slot_min * 60_000;
      const free = bk.tables
        .filter((t) => t.capacity >= bk.party && !bk.busy.some((x) => x.table_id === t.id && x.starts_at < end && x.ends_at > start))
        .sort((a, b) => a.capacity - b.capacity);
      out.push({ m, start, end, free, ok: start >= Date.now() + 5 * 60_000 && free.length > 0 });
    }
    return out;
  }

  function renderBooking(pane) {
    const bk = B.book;
    const v = bk.v;
    if (bk.done) {
      pane.innerHTML = `<div class="mod-head">${backBtn}<div class="titles"><h3>${esc(v.name)}</h3></div></div>
        <div class="mod-body"><div class="mod-section"><h4>${bk.done.status === "confirmed" ? "✅ Reservasi dikonfirmasi" : "🕓 Reservasi terkirim"}</h4>
          <p style="margin:0;line-height:1.6">${esc(fmtWhen(bk.done.starts_at, bk.done.ends_at))}<br>Meja ${esc(bk.done.table_name)} · ${bk.done.party_size} orang · atas nama ${esc(bk.done.guest_name)}</p>
          <p class="mod-note" style="padding:0">${bk.done.status === "confirmed" ? "Sampai jumpa!" : "Menunggu konfirmasi dari pemilik tempat."} Lihat statusnya di tab <b>Reservasi saya</b>.</p>
          <div class="mod-line"><button class="btn-primary" data-b="done-ok">Selesai</button></div></div></div>`;
      return App.setMainOpen(true);
    }
    const slots = slotsFor(bk);
    const sel = slots.find((s) => s.m === bk.slot);
    const maxCap = Math.max(0, ...bk.tables.map((t) => t.capacity));
    pane.innerHTML = `
      <div class="mod-head">${backBtn}<div class="titles"><h3>Pesan meja: ${esc(v.name)}</h3><small>${esc(v.address || "")}${v.phone ? " · " + esc(v.phone) : ""} · buka ${minLabel(v.open_min)}–${minLabel(v.close_min)} (${esc(TZ[v.tz_offset_min] || "")})</small></div></div>
      <div class="mod-body">
        <div class="mod-section"><h4>1. Pilih tanggal dan jumlah tamu</h4>
          <div class="mod-form" style="border:0;padding:0;margin:0"><div class="row">
            <label>Tanggal<input type="date" data-b="date" value="${esc(bk.date)}" min="${esc(venueToday(v))}" max="${esc(addDays(venueToday(v), 60))}" /></label>
            <label>Jumlah tamu<input type="number" data-b="party" min="1" max="${maxCap || 1}" value="${bk.party}" /></label>
          </div></div>
          ${bk.tables.length ? "" : '<div class="mod-note" style="padding:0">Tempat ini belum punya meja yang bisa dipesan.</div>'}
        </div>
        <div class="mod-section"><h4>2. Pilih jam</h4>
          ${bk.loading ? '<div class="mod-note" style="padding:0">Memuat ketersediaan…</div>' : `<div class="slot-grid">${slots.map((s) => `<button class="slot${s.m === bk.slot ? " sel" : ""}" data-b="slot" data-m="${s.m}" ${s.ok ? "" : "disabled"}>${minLabel(s.m)}</button>`).join("")}</div>
          <div class="mod-note" style="padding:0">Jam yang dicoret sudah penuh, sudah lewat, atau tidak ada meja untuk ${bk.party} orang. Setiap reservasi ${v.slot_min / 60} jam.</div>`}
        </div>
        ${
          sel && sel.ok
            ? `<form class="mod-section" data-b="book-form"><h4>3. Data pemesan</h4>
          <div class="mod-form" style="border:0;padding:0;margin:0">
            <label>Meja<select name="table">${sel.free.map((t) => `<option value="${esc(t.id)}" ${t.id === bk.tableId ? "selected" : ""}>${esc(t.name)} (kapasitas ${t.capacity})</option>`).join("")}</select></label>
            <label>Nama<input name="name" required minlength="2" maxlength="40" value="${esc(bk.name)}" /></label>
            <label>Telepon / WhatsApp<input name="phone" maxlength="30" value="${esc(bk.phone)}" placeholder="opsional" /></label>
            <label>Catatan<textarea name="note" maxlength="200" rows="2" placeholder="mis. dekat jendela, ada kursi bayi">${esc(bk.note)}</textarea></label>
            <div class="mod-err" data-b="err">${esc(bk.err)}</div>
            <button class="btn-primary" type="submit" ${bk.busyBusy ? "disabled" : ""}>${bk.busyBusy ? "Memesan…" : `Pesan meja, ${minLabel(sel.m)} (${esc(bk.date)})`}</button>
          </div></form>`
            : bk.err
            ? `<div class="mod-err" style="display:block">${esc(bk.err)}</div>`
            : ""
        }
      </div>`;
    App.setMainOpen(true);
  }

  // ───────────────────────── aksi
  const stayAfter = async (fn) => {
    try {
      await fn();
    } catch (err) {
      App.toast(err.message);
    }
  };

  async function submitVenue(form, editing) {
    const f = form.elements;
    const err = form.querySelector('[data-b="err"]');
    const open = toMin(f.open.value), close = toMin(f.close.value);
    if (!(close > open)) return void (err.textContent = "Jam tutup harus setelah jam buka.");
    const row = {
      name: f.name.value.trim(), address: f.address.value.trim(), phone: f.phone.value.trim(), open_min: open, close_min: close,
      slot_min: Number(f.slot.value), tz_offset_min: Number(f.tz.value), auto_confirm: f.auto.checked,
    };
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    const res = editing ? await sb().from("venues").update(row).eq("id", B.sel) : await sb().from("venues").insert(row).select().single();
    if (res.error) {
      err.textContent = res.error.message;
      btn.disabled = false;
      return;
    }
    B.form = null;
    await loadMine();
    if (!editing && res.data) {
      B.sel = res.data.id;
      await loadManage(B.sel);
      App.toast("Tempat dibuat. Tambahkan mejanya, lalu bagikan tautannya.");
    }
    render();
  }

  async function submitBook(form) {
    const bk = B.book;
    const f = form.elements;
    const sel = slotsFor(bk).find((s) => s.m === bk.slot);
    if (!sel) return;
    Object.assign(bk, { tableId: f.table.value, name: f.name.value.trim(), phone: f.phone.value.trim(), note: f.note.value.trim(), err: "", busyBusy: true });
    renderPane();
    try {
      const r = one(await rpc("book_table", { p_venue: bk.v.id, p_table: bk.tableId, p_starts: sel.start, p_party: bk.party, p_name: bk.name, p_phone: bk.phone, p_note: bk.note }));
      bk.done = r;
      bk.busyBusy = false;
      await loadMine();
    } catch (err) {
      bk.busyBusy = false;
      bk.err = err.message;
      await loadBusy(); // mungkin bentrok dengan pemesan lain: segarkan ketersediaan
    }
    renderList();
    renderPane();
  }

  function onListClick(e) {
    if (!isMine()) return;
    const el = e.target.closest("[data-b]");
    if (!el) return;
    const act = el.dataset.b;
    if (act === "tab") {
      B.tab = el.dataset.tab;
      B.form = null;
      renderList();
    } else if (act === "new-venue") {
      B.form = "venue";
      renderList();
    } else if (act === "cancel-form") {
      B.form = null;
      render();
    } else if (act === "manage") {
      B.sel = el.dataset.id;
      B.book = null;
      B.form = null;
      B.tables = [];
      B.vres = [];
      render();
      loadManage(B.sel);
    } else if (act === "cancel" || act === "status") {
      resAction(el);
    }
  }

  function resAction(el) {
    const id = el.dataset.id;
    stayAfter(async () => {
      if (el.dataset.b === "cancel") {
        if (!confirm("Batalkan reservasi ini?")) return;
        await rpc("cancel_reservation", { p_id: id });
        App.toast("Reservasi dibatalkan");
      } else {
        await rpc("set_reservation_status", { p_id: id, p_status: el.dataset.st });
      }
      await loadMine();
      if (B.sel) await loadManage(B.sel);
      renderList();
    });
  }

  function onPaneClick(e) {
    if (!isMine()) return;
    const el = e.target.closest("[data-b]");
    if (!el) return;
    const act = el.dataset.b;
    if (act === "back" || act === "done-ok") {
      B.book = null;
      B.sel = null;
      B.form = null;
      if (act === "done-ok") B.tab = "mine";
      App.setMainOpen(false);
      render();
    } else if (act === "slot" && B.book) {
      B.book.slot = Number(el.dataset.m);
      B.book.err = "";
      renderPane();
    } else if (act === "cancel" || act === "status") resAction(el);
    else if (act === "cancel-form") {
      B.form = null;
      renderPane();
    } else if (act === "edit-venue") {
      B.form = "venue-edit";
      renderPane();
    } else if (act === "copy-link") {
      const link = bookingLink(B.sel);
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => App.toast("Tautan disalin"), () => App.toast(link));
    } else if (act === "del-venue") {
      const v = B.venues.find((x) => x.id === B.sel);
      if (!v || !confirm(`Hapus tempat “${v.name}” beserta semua meja dan reservasinya? Tidak bisa dibatalkan.`)) return;
      stayAfter(async () => {
        const { error } = await sb().from("venues").delete().eq("id", v.id);
        if (error) throw new Error(error.message);
        B.sel = null;
        await loadMine();
        App.setMainOpen(false);
        render();
        App.toast("Tempat dihapus");
      });
    } else if (act === "toggle-table") {
      const t = B.tables.find((x) => x.id === el.dataset.id);
      if (t)
        stayAfter(async () => {
          const { error } = await sb().from("venue_tables").update({ active: !t.active }).eq("id", t.id);
          if (error) throw new Error(error.message);
          await loadManage(B.sel);
        });
    } else if (act === "del-table") {
      const t = B.tables.find((x) => x.id === el.dataset.id);
      if (!t || !confirm(`Hapus meja ${t.name}?`)) return;
      stayAfter(async () => {
        const { error } = await sb().from("venue_tables").delete().eq("id", t.id);
        if (error) throw new Error(/foreign key|23503/i.test(error.message + (error.code || "")) ? "Meja ini punya riwayat reservasi. Nonaktifkan saja." : error.message);
        await loadManage(B.sel);
      });
    }
  }

  function onSubmit(e) {
    const form = e.target.closest("[data-b]");
    if (!form || !isMine()) return;
    e.preventDefault();
    const k = form.dataset.b;
    if (k === "venue-form") submitVenue(form, B.form === "venue-edit");
    else if (k === "book-form") submitBook(form);
    else if (k === "open-form") {
      const m = form.elements.link.value.match(UUID_RE);
      if (!m) return void (form.querySelector('[data-b="err"]').textContent = "Tautan atau kode tidak dikenali.");
      form.elements.link.value = "";
      openVenue(m[0]);
    } else if (k === "table-form") {
      const f = form.elements;
      stayAfter(async () => {
        const { error } = await sb().from("venue_tables").insert({ venue_id: B.sel, name: f.name.value.trim(), capacity: Number(f.cap.value) });
        if (error) throw new Error(error.message);
        await loadManage(B.sel);
      });
    }
  }

  function onChange(e) {
    const el = e.target.closest("[data-b]");
    if (!el || !isMine() || !B.book) return;
    if (el.dataset.b === "date" && el.value) {
      B.book.date = el.value;
      B.book.slot = null;
      B.book.err = "";
      renderPane();
      loadBusy();
    } else if (el.dataset.b === "party") {
      const max = Math.max(1, ...B.book.tables.map((t) => t.capacity));
      B.book.party = Math.min(max, Math.max(1, Number(el.value) || 1));
      B.book.slot = null;
      renderPane();
    }
  }

  // Simpan isian saat diketik agar tidak hilang ketika tampilan digambar ulang (ganti jam, dll.).
  App.pane.addEventListener("input", (e) => {
    const form = e.target.closest('[data-b="book-form"]');
    if (!form || !B.book) return;
    const x = form.elements;
    Object.assign(B.book, { name: x.name.value, phone: x.phone.value, note: x.note.value, tableId: x.table.value });
  });
  App.list.addEventListener("click", onListClick);
  App.pane.addEventListener("click", onPaneClick);
  [App.list, App.pane].forEach((box) => {
    box.addEventListener("submit", onSubmit);
    box.addEventListener("change", onChange);
  });

  App.register(["booking"], { enter, leave, onLogin, onLogout, openVenue });
})();
