// Reservasi Meja: pelanggan memesan lewat tautan tempat; pemilik tempat mengelola reservasi lewat halaman manajemen
// (kalender, tabel reservasi, checklist admin: konfirmasi, DP, catatan jam). Aturan (jam buka, bentrok, kapasitas, batas)
// ditegakkan di database lewat fungsi book_table; lihat supabase/migrations/004_* dan 008_*. Halaman ini hanya antarmukanya.
(() => {
  "use strict";
  const App = window.CatatanApp;
  if (!App) return;
  const esc = App.escapeHtml;
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const DAY = 86_400_000;

  const B = {
    avail: null,
    tab: "mine", // 'mine' (reservasi saya) | 'kelola' (manajemen untuk pemilik)
    my: [],
    venues: [],
    sel: null, // id tempat yang dikelola
    tables: [],
    vres: [],
    adm: new Map(), // id reservasi -> data admin (DP, catatan)
    admAvail: true, // false bila migrasi 008 belum dijalankan
    book: null, // alur pemesanan untuk satu tempat
    form: null, // 'venue' | 'venue-edit'
    settings: false,
    fStatus: "all",
    fDay: null,
    calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
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
  const STATUS = { pending: ["Menunggu", "warn"], confirmed: ["Dikonfirmasi", "info"], cancelled: ["Dibatalkan", "bad"], done: ["Selesai", "done"] };
  const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
  const isNetErr = (err) => !navigator.onLine || /failed to fetch|network|load failed/i.test((err && err.message) || "");

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) {
      const e = new Error(error.message || "Gagal");
      e.code = error.code || "";
      throw e;
    }
    return data;
  }

  // Waktu dalam zona waktu tempat (bukan perangkat).
  const venueOf = (id) => B.venues.find((v) => v.id === id) || null;
  const tzOf = () => (venueOf(B.sel) || { tz_offset_min: 420 }).tz_offset_min;
  const shifted = (ts, tz) => new Date(ts + tz * 60_000); // gunakan getter UTC*
  const hmAt = (ts, tz) => {
    const d = shifted(ts, tz);
    return `${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())}`;
  };
  const dayKeyAt = (ts, tz) => shifted(ts, tz).toISOString().slice(0, 10);
  const longDateAt = (ts, tz) => shifted(ts, tz).toLocaleDateString("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtWhen = (starts, ends, tz) => `${shifted(starts, tz).toLocaleDateString("id-ID", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })}, ${hmAt(starts, tz)}–${hmAt(ends, tz)}`;
  const dayStart = (v, date) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d) - v.tz_offset_min * 60_000;
  };
  const venueToday = (v) => new Date(Date.now() + v.tz_offset_min * 60_000).toISOString().slice(0, 10);
  const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
  const bookingLink = (id) => `${location.origin}${location.pathname}?reservasi=${id}`;
  const waLink = (phone) => {
    let d = String(phone || "").replace(/[^0-9+]/g, "");
    if (d.startsWith("+")) d = d.slice(1);
    else if (d.startsWith("0")) d = "62" + d.slice(1);
    return /^[0-9]{6,16}$/.test(d) ? `https://wa.me/${d}` : "";
  };

  // ───────────────────────── data
  function reset() {
    B.loadId++;
    if (B.channel && sb()) sb().removeChannel(B.channel);
    Object.assign(B, {
      avail: null, tab: "mine", my: [], venues: [], sel: null, tables: [], vres: [], adm: new Map(), admAvail: true, book: null, form: null,
      settings: false, fStatus: "all", fDay: null, pending: 0, channel: null,
    });
    closeEdit(true);
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
  const onLogout = reset;

  async function loadMine() {
    const [venues, mine] = await Promise.all([
      sb().from("venues").select("*").order("created_at", { ascending: false }),
      sb().from("reservations").select("*").eq("user_id", me()).order("starts_at", { ascending: false }).limit(60),
    ]);
    B.venues = venues.data || [];
    B.my = mine.data || [];
    if (B.sel && !venueOf(B.sel)) B.sel = null;
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
    const [t, r, a] = await Promise.all([
      sb().from("venue_tables").select("*").eq("venue_id", id).order("name"),
      sb().from("reservations").select("*").eq("venue_id", id).order("starts_at", { ascending: true }).limit(500),
      sb().from("reservation_admin").select("*").limit(2000),
    ]);
    if (B.sel !== id) return;
    B.tables = t.data || [];
    B.vres = r.data || [];
    B.admAvail = !(a.error && /^(42P01|PGRST205)$/.test(a.error.code || ""));
    B.adm = new Map((a.data || []).map((x) => [x.reservation_id, x]));
    if (isMine() && B.tab === "kelola") renderBody();
  }

  // ───────────────────────── kerangka halaman
  function enter() {
    App.setMainOpen(false);
    App.pane.innerHTML = "";
    render();
    if (B.avail && App.user) {
      loadMine().then(() => {
        if (!isMine()) return;
        if (B.tab === "kelola" && B.sel) loadManage(B.sel);
        else renderBody();
      }).catch(() => {});
    }
  }
  function leave() {}

  const hint = '<div class="mod-note">Halaman ini butuh migrasi database 004. Jalankan <b>supabase/migrations/004_chat_darurat_reservasi.sql</b> di Supabase SQL Editor (lihat README), lalu muat ulang.</div>';

  function render() {
    if (!isMine()) return;
    const box = App.list;
    if (B.avail === false) return void (box.innerHTML = `<div class="rem-head"><div><h1>📅 Reservasi Meja</h1></div></div>${hint}`);
    if (B.avail === null) return void (box.innerHTML = '<div class="mod-note">Memuat…</div>');
    box.innerHTML = `
      <div class="rem-head"><div><h1>📅 Reservasi Meja</h1>
        <p>${B.tab === "mine" ? "Pesan meja lewat tautan tempat makan, lalu pantau status reservasimu." : "Konfirmasi booking, pantau pembayaran DP, dan kelola meja reservasi pelanggan menggunakan kalender dan filter."}</p></div></div>
      <div class="rem-tabs" role="tablist">
        <button class="rem-tab${B.tab === "mine" ? " active" : ""}" role="tab" data-b="tab" data-tab="mine">🧾 Reservasi saya</button>
        <button class="rem-tab${B.tab === "kelola" ? " active" : ""}" role="tab" data-b="tab" data-tab="kelola">🏪 Manajemen tempat${B.pending ? ` <span class="wg-count" style="background:var(--danger);color:#fff">${B.pending}</span>` : ""}</button>
      </div>
      <div id="bkBody"></div>`;
    renderBody();
  }

  function renderBody() {
    const box = document.getElementById("bkBody");
    if (!box || !isMine()) return;
    if (B.book) return renderBooking(box);
    if (B.tab === "mine") return renderMine(box);
    renderKelola(box);
  }

  const backBtn = '<button class="btn-secondary" data-b="back" style="margin-bottom:14px">← Kembali</button>';

  // ── Reservasi saya
  function myCard(r) {
    const active = r.status === "pending" || r.status === "confirmed";
    const tz = r.tz_offset_min == null ? (venueOf(r.venue_id) || { tz_offset_min: 420 }).tz_offset_min : r.tz_offset_min;
    return `<div class="rem-card" data-id="${esc(r.id)}"><div class="rem-top"><div class="rem-text"><h4>${esc(r.venue_name || "Tempat")}</h4>
      <p>${esc(fmtWhen(r.starts_at, r.ends_at, tz))} · meja ${esc(r.table_name || "?")} · ${r.party_size} orang${r.menu ? `<br>Menu: ${esc(r.menu)}` : ""}${r.note ? `<br><em>${esc(r.note)}</em>` : ""}</p></div>
      <div class="rem-side"><span class="st-pill st-${esc(STATUS[r.status] ? STATUS[r.status][1] : "")}">${esc((STATUS[r.status] || [r.status])[0])}</span></div></div>
      ${active ? `<div class="rem-actions"><button class="mini-btn danger" data-b="cancel" data-id="${esc(r.id)}">Batalkan</button></div>` : ""}</div>`;
  }

  function renderMine(box) {
    const now = Date.now();
    const upcoming = B.my.filter((r) => r.ends_at >= now && r.status !== "cancelled").sort((a, b) => a.starts_at - b.starts_at);
    const past = B.my.filter((r) => !upcoming.includes(r));
    box.innerHTML = `
      <form class="rem-card-form" data-b="open-form" style="max-width:640px;margin:20px 0">
        <h2 style="font-size:17px">Punya tautan tempat?</h2>
        <div class="wa-addrow"><input name="link" placeholder="Tempel tautan reservasi di sini" required style="flex:1;min-width:0" /><button class="btn-primary" type="submit" style="height:44px;padding:0 18px">Buka</button></div>
        <div class="rem-err" data-b="err"></div></form>
      <div class="rem-sub">Akan datang</div><div class="rem-list" style="max-width:760px">${upcoming.length ? upcoming.map(myCard).join("") : '<div class="rem-empty">Belum ada reservasi.<br>Buka tautan dari tempat makan favoritmu untuk memesan meja.</div>'}</div>
      ${past.length ? `<div class="rem-sub">Riwayat</div><div class="rem-list" style="max-width:760px">${past.map(myCard).join("")}</div>` : ""}`;
  }

  // ── Manajemen tempat (pemilik)
  function venueFormHtml(v) {
    const val = v || { name: "", address: "", phone: "", open_min: 540, close_min: 1260, slot_min: 120, tz_offset_min: 420, auto_confirm: false };
    return `<form class="rem-card-form" data-b="venue-form" style="max-width:640px;margin:16px 0">
      <h2>${v ? "Ubah pengaturan tempat" : "Tempat baru"}</h2>
      <label>Nama tempat<input name="name" required minlength="2" maxlength="60" value="${esc(val.name)}" placeholder="mis. Burjo Maju Jaya" /></label>
      <label>Alamat<input name="address" maxlength="150" value="${esc(val.address)}" /></label>
      <label>Telepon / WhatsApp<input name="phone" maxlength="30" value="${esc(val.phone)}" /></label>
      <div class="rem-row2"><label>Buka<input name="open" type="time" required value="${minValue(val.open_min)}" /></label>
        <label>Tutup<input name="close" type="time" required value="${minValue(Math.min(val.close_min, 1439))}" /></label></div>
      <div class="rem-row2"><label>Lama per reservasi<select name="slot">${[60, 90, 120, 150, 180, 240].map((m) => `<option value="${m}" ${m === val.slot_min ? "selected" : ""}>${m / 60} jam${m % 60 ? " " + (m % 60) + " mnt" : ""}</option>`).join("")}</select></label>
        <label>Zona waktu<select name="tz">${Object.entries(TZ).map(([k, n]) => `<option value="${k}" ${Number(k) === val.tz_offset_min ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
      <div class="rem-switches"><label class="sw"><span>Konfirmasi otomatis (tanpa menunggu persetujuanku)</span><input name="auto" type="checkbox" ${val.auto_confirm ? "checked" : ""} /><i></i></label></div>
      <div class="rem-err" data-b="err"></div>
      <div class="rem-row2"><button class="btn-primary rem-submit" type="submit">${v ? "Simpan" : "Buat tempat"}</button><button class="btn-secondary rem-submit" type="button" data-b="cancel-form">Batal</button></div>
    </form>`;
  }

  function renderKelola(box) {
    if (!B.venues.length) {
      box.innerHTML = `<div class="rem-card-form" style="max-width:640px;margin:20px 0"><h2>Kelola tempat makanmu</h2>
        <p class="mod-note" style="padding:0">Buat tempat (warung, kafe, restoran), tambahkan mejanya, lalu bagikan tautan pemesanannya ke pelanggan. Reservasi yang masuk muncul di halaman ini lengkap dengan kalender dan checklist admin.</p>
        <button class="btn-primary rem-submit" data-b="new-venue">＋ Buat tempat pertama</button></div>${B.form === "venue" ? venueFormHtml(null) : ""}`;
      return;
    }
    if (!B.sel) {
      B.sel = B.venues[0].id;
      loadManage(B.sel);
    }
    const v = venueOf(B.sel);
    const tz = v.tz_offset_min;
    box.innerHTML = `
      <div class="bk-bar">
        <label class="bk-venue">${B.venues.length > 1 ? `<select data-b="venue-pick" aria-label="Pilih tempat">${B.venues.map((x) => `<option value="${esc(x.id)}" ${x.id === B.sel ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : `<b>${esc(v.name)}</b>`}</label>
        <span class="grow"></span>
        <button class="btn-primary" data-b="manual">＋ Reservasi</button>
        <button class="btn-secondary" data-b="settings">⚙ Meja &amp; tautan</button>
        <button class="btn-secondary" data-b="new-venue">＋ Tempat baru</button>
      </div>
      ${B.form === "venue" ? venueFormHtml(null) : ""}
      ${B.form === "venue-edit" ? venueFormHtml(v) : ""}
      ${B.settings ? settingsHtml(v) : ""}
      <h2 class="bk-title">Manajemen Reservasi Meja Pelanggan</h2>
      <div class="bk-layout">
        <div class="bk-cal" id="bkCal">${calHtml(tz)}</div>
        <div class="bk-main">
          <div class="bk-chips">${[["all", "Semua"], ["pending", "Menunggu"], ["confirmed", "Dikonfirmasi"], ["cancelled", "Dibatalkan"], ["done", "Selesai"]]
            .map(([k, n]) => `<button class="bk-chip${B.fStatus === k ? " on" : ""}" data-b="fstatus" data-st="${k}">${n}</button>`).join("")}
            ${B.fDay ? `<button class="bk-chip on" data-b="fday-clear" title="Hapus filter tanggal">📅 ${esc(B.fDay)} ✕</button>` : ""}</div>
          <div class="bk-tablewrap" id="bkTable">${tableHtml(tz)}</div>
        </div>
      </div>`;
  }

  function settingsHtml(v) {
    return `<div class="rem-card-form bk-settings">
      <div class="mod-line"><h2 class="grow">Meja &amp; tautan: ${esc(v.name)}</h2><button class="mini-btn" data-b="edit-venue">Ubah info tempat</button><button class="mini-btn danger" data-b="del-venue">Hapus tempat</button></div>
      <div><b style="font-size:13px">Tautan pemesanan</b><div class="copy-field" style="margin-top:6px"><input readonly value="${esc(bookingLink(v.id))}" /><button class="btn-secondary" data-b="copy-link">Salin</button></div>
        <div class="mod-note" style="padding:6px 0 0">Bagikan tautan ini ke pelanggan (WhatsApp, Instagram). Pelanggan perlu masuk dengan Google untuk memesan. Buka ${minLabel(v.open_min)}–${minLabel(v.close_min)} · ${v.slot_min / 60} jam per reservasi · ${esc(TZ[v.tz_offset_min] || "")}.</div></div>
      <div><b style="font-size:13px">Meja (${B.tables.length})</b>
        ${B.tables.map((t) => `<div class="mod-line" style="margin-top:8px" data-id="${esc(t.id)}"><span class="grow"><b>${esc(t.name)}</b> · ${t.capacity} orang ${t.active ? "" : '<span class="badge bad">nonaktif</span>'}</span><button class="mini-btn" data-b="toggle-table">${t.active ? "Nonaktifkan" : "Aktifkan"}</button><button class="mini-btn danger" data-b="del-table">Hapus</button></div>`).join("") || '<div class="mod-note" style="padding:6px 0">Belum ada meja. Tambahkan di bawah.</div>'}
        <form class="mod-line" data-b="table-form" style="margin-top:10px"><input name="name" placeholder="Nama meja (mis. A1)" maxlength="20" required style="height:38px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--panel-2);width:170px" />
          <input name="cap" type="number" min="1" max="50" value="4" required style="height:38px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--panel-2);width:84px" title="Kapasitas" />
          <button class="btn-secondary" type="submit" style="padding:7px 14px">Tambah meja</button><span class="mod-err" data-b="err"></span></form></div>
    </div>`;
  }

  // Kalender bulanan dengan lencana jumlah reservasi per hari (biru = ada yang menunggu, hijau = sudah dikonfirmasi/selesai).
  const DOW = ["SN", "SL", "RB", "KM", "JM", "SB", "MG"];
  function calHtml(tz) {
    const m = B.calMonth;
    const first = new Date(Date.UTC(m.getFullYear(), m.getMonth(), 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(m.getFullYear(), m.getMonth() + 1, 0)).getUTCDate();
    const info = new Map();
    for (const r of B.vres) {
      if (r.status === "cancelled") continue;
      const k = dayKeyAt(r.starts_at, tz);
      const x = info.get(k) || { n: 0, pending: 0 };
      x.n++;
      if (r.status === "pending") x.pending++;
      info.set(k, x);
    }
    const today = new Date(Date.now() + tz * 60_000).toISOString().slice(0, 10);
    let cells = "";
    for (let i = 0; i < lead; i++) cells += "<span></span>";
    for (let d = 1; d <= days; d++) {
      const key = `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(d)}`;
      const x = info.get(key);
      cells += `<button class="bk-day${key === today ? " today" : ""}${key === B.fDay ? " sel" : ""}" data-b="fday" data-day="${key}" aria-label="${d} ${m.toLocaleDateString("id-ID", { month: "long" })}">${d}${x ? `<i class="bk-badge ${x.pending ? "blue" : "green"}">${x.n}</i>` : ""}</button>`;
    }
    return `<div class="bk-cal-head"><button class="icon-btn" data-b="cal-prev" aria-label="Bulan sebelumnya">←</button><b>${m.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</b><button class="icon-btn" data-b="cal-next" aria-label="Bulan berikutnya">→</button></div>
      <div class="bk-cal-grid">${DOW.map((d) => `<span class="bk-dow">${d}</span>`).join("")}${cells}</div>`;
  }

  function tableHtml(tz) {
    let rows = B.vres.filter((r) => (B.fStatus === "all" || r.status === B.fStatus) && (!B.fDay || dayKeyAt(r.starts_at, tz) === B.fDay));
    if (!rows.length) return '<div class="rem-empty">Tidak ada reservasi yang cocok dengan filter ini.</div>';
    const head = ["Nama pelanggan", "Tanggal & jam", "Meja / tempat", "Orang", "DP (down payment)", "Daftar menu", "Status", "Checklist admin", "Aksi"];
    return `<table class="bk-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => rowHtml(r, tz)).join("")}</tbody></table>`;
  }

  function rowHtml(r, tz) {
    const a = B.adm.get(r.id) || { dp_amount: 0, dp_received: false, admin_note: "" };
    const st = STATUS[r.status] || [r.status, ""];
    const wa = waLink(r.guest_phone);
    const locked = r.status === "cancelled" || r.status === "done";
    return `<tr data-id="${esc(r.id)}">
      <td class="bk-name"><b>${esc(r.guest_name)}</b></td>
      <td>${esc(longDateAt(r.starts_at, tz))}<br>${esc(hmAt(r.starts_at, tz))}</td>
      <td><span class="bk-tbl">${esc(r.table_name || "?")}</span></td>
      <td>${r.party_size} orang</td>
      <td>${a.dp_amount ? esc(rupiah(a.dp_amount)) : "Rp 0"}</td>
      <td class="bk-menu" title="${esc(r.menu)}">${r.menu ? esc(r.menu) : '<span style="color:var(--faint)">–</span>'}${r.note ? `<br><small>📝 ${esc(r.note)}</small>` : ""}</td>
      <td><span class="st-pill st-${esc(st[1])}">${esc(st[0])}</span></td>
      <td class="bk-chk">
        <label class="bk-tg"><input type="checkbox" data-b="adm-conf" ${r.status === "confirmed" || r.status === "done" ? "checked" : ""} ${locked ? "disabled" : ""} /><i></i><span>Dikonfirmasi</span></label>
        <label class="bk-tg"><input type="checkbox" data-b="adm-dp" ${a.dp_received ? "checked" : ""} ${B.admAvail ? "" : "disabled"} /><i></i><span>DP diterima</span></label>
        <input class="bk-note" data-b="adm-note" maxlength="200" placeholder="Catatan jam (cth: 19.00 - 21.00)" value="${esc(a.admin_note)}" ${B.admAvail ? "" : "disabled"} />
        <small>${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener noreferrer">📲 WhatsApp: ${esc(r.guest_phone)}</a>` : "Tanpa no. WA"}</small></td>
      <td><button class="icon-btn bk-edit" data-b="edit-res" title="Rincian dan aksi" aria-label="Rincian dan aksi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button></td>
    </tr>`;
  }

  // ───────────────────────── dialog rincian reservasi
  let dlg = null;
  function ensureEdit() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "dialog dialog-sm";
    dlg.innerHTML = `<form method="dialog" class="dialog-head"><h2>Rincian reservasi</h2><button class="icon-btn" value="close" title="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></form><div class="dialog-body" id="bkEdit"></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", onEditClick);
    dlg.addEventListener("submit", onEditSubmit);
    return dlg;
  }
  let editId = null;
  function openEdit(id) {
    const r = B.vres.find((x) => x.id === id);
    if (!r) return;
    editId = id;
    const a = B.adm.get(id) || { dp_amount: 0, dp_received: false, admin_note: "" };
    const tz = tzOf();
    const active = r.status === "pending" || r.status === "confirmed";
    ensureEdit().querySelector("#bkEdit").innerHTML = `
      <p class="set-sub"><b>${esc(r.guest_name)}</b> · ${esc(longDateAt(r.starts_at, tz))}, ${esc(hmAt(r.starts_at, tz))}–${esc(hmAt(r.ends_at, tz))} · meja ${esc(r.table_name)} · ${r.party_size} orang${r.guest_phone ? " · " + esc(r.guest_phone) : ""}</p>
      ${r.menu ? `<p class="set-sub">Menu: ${esc(r.menu)}</p>` : ""}${r.note ? `<p class="set-sub">Catatan pemesan: ${esc(r.note)}</p>` : ""}
      <form class="set-form" data-b="edit-form" style="flex-direction:column;align-items:stretch">
        <label class="field"><span>Nominal DP (Rp)</span><input name="dp" type="number" min="0" max="1000000000" step="1000" value="${a.dp_amount || 0}" ${B.admAvail ? "" : "disabled"} /></label>
        <label class="field"><span>Catatan admin / jam</span><input name="note" maxlength="200" value="${esc(a.admin_note)}" ${B.admAvail ? "" : "disabled"} /></label>
        ${B.admAvail ? "" : '<p class="set-sub">DP dan catatan admin butuh migrasi database 008 (lihat README).</p>'}
        <div class="set-msg" id="bkEditMsg"></div>
        <div class="set-row">${B.admAvail ? '<button class="btn-primary" type="submit">Simpan</button>' : ""}
          ${active ? '<button class="btn-secondary" type="button" data-b="e-done">Tandai selesai</button><button class="btn-danger" type="button" data-b="e-cancel">Batalkan reservasi</button>' : ""}</div>
      </form>`;
    dlg.showModal();
  }
  function closeEdit(silent) {
    editId = null;
    if (dlg && dlg.open && !silent) dlg.close();
    else if (dlg && dlg.open) dlg.close();
  }
  async function onEditSubmit(e) {
    e.preventDefault();
    const f = e.target.elements;
    const ok = await upsertAdmin(editId, { dp_amount: Math.max(0, Math.round(Number(f.dp.value) || 0)), admin_note: f.note.value.trim() }, document.getElementById("bkEditMsg"));
    if (ok) {
      closeEdit();
      if (isMine()) renderKelola(document.getElementById("bkBody"));
      App.toast("Perubahan disimpan");
    }
  }
  function onEditClick(e) {
    const b = e.target.closest("[data-b]");
    if (!b || !editId) return;
    const id = editId;
    if (b.dataset.b === "e-done") setStatus(id, "done").then(() => closeEdit());
    else if (b.dataset.b === "e-cancel" && confirm("Batalkan reservasi ini?")) setStatus(id, "cancelled").then(() => closeEdit());
  }

  // ───────────────────────── aksi admin
  async function upsertAdmin(id, fields, msgEl) {
    const row = Object.assign({ reservation_id: id, dp_amount: 0, dp_received: false, admin_note: "" }, B.adm.get(id), fields, { updated_at: Date.now() });
    const { error } = await sb().from("reservation_admin").upsert(row, { onConflict: "reservation_id" });
    if (error) {
      const t = isNetErr(error) ? "Sambungkan ke internet untuk menyimpan." : error.message;
      if (msgEl) {
        msgEl.textContent = t;
        msgEl.className = "set-msg err";
      } else App.toast(t);
      return false;
    }
    B.adm.set(id, row);
    return true;
  }

  async function setStatus(id, status) {
    try {
      await rpc("set_reservation_status", { p_id: id, p_status: status });
      const r = B.vres.find((x) => x.id === id);
      if (r) r.status = status;
      countPending();
      if (isMine() && B.tab === "kelola") renderKelola(document.getElementById("bkBody"));
    } catch (err) {
      App.toast(isNetErr(err) ? "Sambungkan ke internet untuk menyimpan." : err.message);
      if (isMine() && B.tab === "kelola") renderKelola(document.getElementById("bkBody")); // kembalikan saklar
    }
  }

  // ───────────────────────── alur pemesanan (pelanggan, atau pemilik untuk reservasi manual)
  async function openVenue(id, opts = {}) {
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
    B.book = {
      v, tables: info.tables || [], date: venueToday(v), party: 2, slot: null, tableId: "", busy: [], manual: !!opts.manual,
      name: opts.manual ? "" : String(meta.full_name || meta.name || "").slice(0, 40), phone: "", note: "", menu: "", err: "", loading: true, done: null, busyBusy: false,
    };
    if (!opts.manual) B.tab = "mine";
    App.setView("booking");
    render();
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
    if (B.book === bk && isMine()) renderBody();
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

  function renderBooking(box) {
    const bk = B.book;
    const v = bk.v;
    if (bk.done) {
      const tz = v.tz_offset_min;
      box.innerHTML = `<div class="rem-card-form" style="max-width:560px;margin:20px 0"><h2>${bk.done.status === "confirmed" ? "✅ Reservasi dikonfirmasi" : "🕓 Reservasi terkirim"}</h2>
        <p style="margin:0;line-height:1.6">${esc(fmtWhen(bk.done.starts_at, bk.done.ends_at, tz))}<br>Meja ${esc(bk.done.table_name)} · ${bk.done.party_size} orang · atas nama ${esc(bk.done.guest_name)}</p>
        <p class="mod-note" style="padding:0">${bk.done.status === "confirmed" ? "Sampai jumpa!" : "Menunggu konfirmasi dari pemilik tempat."} ${bk.manual ? "" : "Lihat statusnya di tab Reservasi saya."}</p>
        <button class="btn-primary rem-submit" data-b="done-ok">Selesai</button></div>`;
      return;
    }
    const slots = slotsFor(bk);
    const sel = slots.find((s) => s.m === bk.slot);
    const maxCap = Math.max(0, ...bk.tables.map((t) => t.capacity));
    box.innerHTML = `${backBtn}
      <div class="rem-card-form" style="max-width:760px"><h2>${bk.manual ? "Reservasi manual: " : "Pesan meja: "}${esc(v.name)}</h2>
        <p class="mod-note" style="padding:0">${esc(v.address || "")}${v.phone ? " · " + esc(v.phone) : ""} · buka ${minLabel(v.open_min)}–${minLabel(v.close_min)} (${esc(TZ[v.tz_offset_min] || "")})</p>
        <div class="rem-row2"><label>Tanggal<input type="date" data-b="date" value="${esc(bk.date)}" min="${esc(venueToday(v))}" max="${esc(addDays(venueToday(v), 60))}" /></label>
          <label>Jumlah tamu<input type="number" data-b="party" min="1" max="${maxCap || 1}" value="${bk.party}" /></label></div>
        ${bk.tables.length ? "" : '<div class="mod-note" style="padding:0">Tempat ini belum punya meja yang bisa dipesan.</div>'}
        <div><div style="font-size:13px;font-weight:600;margin-bottom:8px">Pilih jam</div>
          ${bk.loading ? '<div class="mod-note" style="padding:0">Memuat ketersediaan…</div>' : `<div class="slot-grid">${slots.map((s) => `<button class="slot${s.m === bk.slot ? " sel" : ""}" data-b="slot" data-m="${s.m}" ${s.ok ? "" : "disabled"}>${minLabel(s.m)}</button>`).join("")}</div>
          <div class="mod-note" style="padding:6px 0 0">Jam yang dicoret sudah penuh, sudah lewat, atau tidak ada meja untuk ${bk.party} orang. Setiap reservasi ${v.slot_min / 60} jam.</div>`}</div>
        ${
          sel && sel.ok
            ? `<form data-b="book-form" class="bk-bookform"><div style="font-size:13px;font-weight:600">Data pemesan</div>
            <label>Meja<select name="table">${sel.free.map((t) => `<option value="${esc(t.id)}" ${t.id === bk.tableId ? "selected" : ""}>${esc(t.name)} (kapasitas ${t.capacity})</option>`).join("")}</select></label>
            <label>Nama pelanggan<input name="name" required minlength="2" maxlength="40" value="${esc(bk.name)}" /></label>
            <label>Telepon / WhatsApp<input name="phone" maxlength="30" value="${esc(bk.phone)}" placeholder="opsional" /></label>
            <label>Daftar menu / pesanan<textarea name="menu" maxlength="500" rows="2" placeholder="opsional, mis. Nasi goreng x5, es teh x5">${esc(bk.menu)}</textarea></label>
            <label>Catatan<textarea name="note" maxlength="200" rows="2" placeholder="mis. dekat jendela, ada kursi bayi">${esc(bk.note)}</textarea></label>
            <div class="rem-err" data-b="err">${esc(bk.err)}</div>
            <button class="btn-primary rem-submit" type="submit" ${bk.busyBusy ? "disabled" : ""}>${bk.busyBusy ? "Memesan…" : `Pesan meja, ${minLabel(sel.m)} (${esc(bk.date)})`}</button></form>`
            : bk.err
            ? `<div class="rem-err" style="display:block">${esc(bk.err)}</div>`
            : ""
        }</div>`;
  }

  async function submitBook(form) {
    const bk = B.book;
    const f = form.elements;
    const sel = slotsFor(bk).find((s) => s.m === bk.slot);
    if (!sel) return;
    Object.assign(bk, { tableId: f.table.value, name: f.name.value.trim(), phone: f.phone.value.trim(), note: f.note.value.trim(), menu: f.menu.value.trim(), err: "", busyBusy: true });
    renderBody();
    try {
      const args = { p_venue: bk.v.id, p_table: bk.tableId, p_starts: sel.start, p_party: bk.party, p_name: bk.name, p_phone: bk.phone, p_note: bk.note };
      let r;
      try {
        r = one(await rpc("book_table", { ...args, p_menu: bk.menu }));
      } catch (err) {
        if (err.code !== "PGRST202") throw err; // migrasi 008 belum dijalankan: fungsi lama belum punya p_menu
        r = one(await rpc("book_table", args));
      }
      bk.done = r;
      bk.busyBusy = false;
      await loadMine();
    } catch (err) {
      bk.busyBusy = false;
      bk.err = err.message;
      await loadBusy(); // mungkin bentrok dengan pemesan lain: segarkan ketersediaan
    }
    renderBody();
  }

  // ───────────────────────── aksi pemilik
  const stayAfter = async (fn) => {
    try {
      await fn();
    } catch (err) {
      App.toast(isNetErr(err) ? "Sambungkan ke internet untuk menyimpan." : err.message);
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
      B.settings = true; // langsung ke pengaturan agar bisa menambah meja
      B.vres = [];
      B.tables = [];
      await loadManage(B.sel);
      App.toast("Tempat dibuat. Tambahkan mejanya, lalu bagikan tautannya.");
    }
    render();
  }

  function resAction(el) {
    const id = (el.closest("[data-id]") || {}).dataset && el.closest("[data-id]").dataset.id;
    if (!id) return;
    stayAfter(async () => {
      if (!confirm("Batalkan reservasi ini?")) return;
      await rpc("cancel_reservation", { p_id: id });
      App.toast("Reservasi dibatalkan");
      await loadMine();
      renderBody();
    });
  }

  function onClick(e) {
    if (!isMine()) return;
    const el = e.target.closest("[data-b]");
    if (!el) return;
    const act = el.dataset.b;
    const row = el.closest("[data-id]");
    const id = row && row.dataset.id;
    if (act === "tab") {
      B.tab = el.dataset.tab;
      B.book = null;
      B.form = null;
      render();
      if (B.tab === "kelola" && B.sel) loadManage(B.sel);
    } else if (act === "back" || act === "done-ok") {
      const manual = B.book && B.book.manual;
      B.book = null;
      if (manual) {
        B.tab = "kelola";
        render();
        if (B.sel) loadManage(B.sel);
      } else {
        if (act === "done-ok") B.tab = "mine";
        render();
      }
    } else if (act === "slot" && B.book) {
      B.book.slot = Number(el.dataset.m);
      B.book.err = "";
      renderBody();
    } else if (act === "cancel") resAction(el);
    else if (act === "new-venue") {
      B.form = "venue";
      B.tab = "kelola";
      renderBody();
    } else if (act === "cancel-form") {
      B.form = null;
      renderBody();
    } else if (act === "manual" && B.sel) openVenue(B.sel, { manual: true });
    else if (act === "settings") {
      B.settings = !B.settings;
      renderBody();
    } else if (act === "edit-venue") {
      B.form = "venue-edit";
      renderBody();
    } else if (act === "copy-link") {
      const link = bookingLink(B.sel);
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => App.toast("Tautan disalin"), () => App.toast(link));
    } else if (act === "del-venue") {
      const v = venueOf(B.sel);
      if (!v || !confirm(`Hapus tempat “${v.name}” beserta semua meja dan reservasinya? Tidak bisa dibatalkan.`)) return;
      stayAfter(async () => {
        const { error } = await sb().from("venues").delete().eq("id", v.id);
        if (error) throw new Error(error.message);
        B.sel = null;
        B.settings = false;
        await loadMine();
        render();
        App.toast("Tempat dihapus");
      });
    } else if (act === "toggle-table") {
      const t = B.tables.find((x) => x.id === id);
      if (t)
        stayAfter(async () => {
          const { error } = await sb().from("venue_tables").update({ active: !t.active }).eq("id", t.id);
          if (error) throw new Error(error.message);
          await loadManage(B.sel);
        });
    } else if (act === "del-table") {
      const t = B.tables.find((x) => x.id === id);
      if (!t || !confirm(`Hapus meja ${t.name}?`)) return;
      stayAfter(async () => {
        const { error } = await sb().from("venue_tables").delete().eq("id", t.id);
        if (error) throw new Error(/foreign key|23503/i.test(error.message + (error.code || "")) ? "Meja ini punya riwayat reservasi. Nonaktifkan saja." : error.message);
        await loadManage(B.sel);
      });
    } else if (act === "fstatus") {
      B.fStatus = el.dataset.st;
      renderKelola(document.getElementById("bkBody"));
    } else if (act === "fday") {
      B.fDay = B.fDay === el.dataset.day ? null : el.dataset.day;
      renderKelola(document.getElementById("bkBody"));
    } else if (act === "fday-clear") {
      B.fDay = null;
      renderKelola(document.getElementById("bkBody"));
    } else if (act === "cal-prev" || act === "cal-next") {
      const m = B.calMonth;
      B.calMonth = new Date(m.getFullYear(), m.getMonth() + (act === "cal-next" ? 1 : -1), 1);
      document.getElementById("bkCal").innerHTML = calHtml(tzOf());
    } else if (act === "edit-res") openEdit(id);
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
    if (!isMine()) return;
    const el = e.target.closest("[data-b]");
    if (!el) return;
    const act = el.dataset.b;
    if (act === "venue-pick") {
      B.sel = el.value;
      B.vres = [];
      B.tables = [];
      B.fDay = null;
      renderKelola(document.getElementById("bkBody"));
      loadManage(B.sel);
    } else if (act === "adm-conf") {
      const id = el.closest("[data-id]").dataset.id;
      setStatus(id, el.checked ? "confirmed" : "pending");
    } else if (act === "adm-dp") {
      const id = el.closest("[data-id]").dataset.id;
      upsertAdmin(id, { dp_received: el.checked }).then((ok) => ok || (el.checked = !el.checked));
    } else if (act === "adm-note") {
      const id = el.closest("[data-id]").dataset.id;
      upsertAdmin(id, { admin_note: el.value.trim() });
    } else if (B.book && act === "date" && el.value) {
      B.book.date = el.value;
      B.book.slot = null;
      B.book.err = "";
      renderBody();
      loadBusy();
    } else if (B.book && act === "party") {
      const max = Math.max(1, ...B.book.tables.map((t) => t.capacity));
      B.book.party = Math.min(max, Math.max(1, Number(el.value) || 1));
      B.book.slot = null;
      renderBody();
    }
  }

  // Simpan isian saat diketik agar tidak hilang ketika tampilan digambar ulang (ganti jam, dll.).
  function onInput(e) {
    const form = e.target.closest('[data-b="book-form"]');
    if (!form || !B.book || !isMine()) return;
    const x = form.elements;
    Object.assign(B.book, { name: x.name.value, phone: x.phone.value, note: x.note.value, menu: x.menu.value, tableId: x.table.value });
  }

  App.list.addEventListener("click", onClick);
  App.list.addEventListener("submit", onSubmit);
  App.list.addEventListener("change", onChange);
  App.list.addEventListener("input", onInput);

  App.register(["booking"], { enter, leave, onLogin, onLogout, openVenue });
})();
