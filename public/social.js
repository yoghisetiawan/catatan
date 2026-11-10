// Chat Room, Pesan Grup, dan Pesan Darurat.
// Semua perubahan data lewat fungsi database (RPC) yang memeriksa aturan; lihat supabase/migrations/004_*.sql.
(() => {
  "use strict";
  const App = window.CatatanApp;
  if (!App) return;
  const esc = App.escapeHtml;
  const VIEWS = ["chat", "emergency"]; // "groups" (Pesan grup) kini halaman pesan terjadwal WhatsApp (wagroups.js); grup privat Catatan ada di Chat room

  const S = {
    avail: null, // null = belum dicek, false = migrasi 004 belum dijalankan
    profile: null,
    rooms: [],
    joined: new Set(),
    roles: new Map(),
    counts: new Map(),
    last: new Map(), // id ruang -> pesan terakhir
    unread: new Map(),
    read: {},
    active: null,
    msgs: [],
    oldest: 0,
    newest: 0,
    hasMore: false,
    members: null,
    form: null, // 'room' | 'group' | 'join' | 'name'
    emergencies: [],
    seenEm: 0,
    alerts: [],
    sos: { sel: null, msg: "Saya butuh bantuan!", loc: true, busy: false, note: "" },
    sosOpen: false,
    chatKind: "room", // di Chat room: 'room' (ruang terbuka) atau 'group' (grup privat)
    attrs: [],
    attrAvail: null,
    roleByName: new Map(),
    compose: { attr: null, opt: null, file: null },
    filter: { attr: null, q: "" },
    panel: false,
    panelQ: "",
    waInfo: null, // penerusan WhatsApp (Fonnte) untuk ruang ini: {admin, configured, enabled, attrs, target}
    waAvail: null,
    waDraft: null,
    imgUrls: new Map(),
    // Pesan WhatsApp Cepat (halaman Pesan Darurat)
    wa: { to: "", pick: null, msg: "", loc: false, contacts: [], cAvail: null, err: "", cerr: "", sug: false, busy: false },
    channel: null,
    poll: null,
    loadId: 0,
  };
  const sb = () => App.sb;
  const me = () => (App.user ? App.user.id : null);
  const readKey = () => `catatan.chat.read.${me()}`;
  const emKey = () => `catatan.chat.em.${me()}`;
  const isMine = () => VIEWS.includes(App.view());
  const kindOf = (view) => (view === "chat" ? S.chatKind : "group");

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw new Error(error.message || "Gagal");
    return data;
  }
  const one = (d) => (Array.isArray(d) ? d[0] : d);
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}.${pad(d.getMinutes())}`;
  };
  const dayKey = (ts) => new Date(ts).toDateString();
  const dayLabel = (ts) => {
    const d = new Date(ts);
    const t = new Date();
    if (d.toDateString() === t.toDateString()) return "Hari ini";
    t.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return "Kemarin";
    return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  };
  const mapLink = (lat, lng) => {
    const a = Number(lat), b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) ? `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=17/${a}/${b}` : "";
  };
  const roomById = (id) => S.rooms.find((r) => r.id === id) || null;

  // ───────────────────────── data
  function resetState() {
    unsubscribe();
    Object.assign(S, {
      avail: null, profile: null, rooms: [], joined: new Set(), roles: new Map(), counts: new Map(), last: new Map(), unread: new Map(),
      read: {}, active: null, msgs: [], oldest: 0, newest: 0, hasMore: false, members: null, form: null, emergencies: [], seenEm: 0, alerts: [],
    });
    S.sos.sel = null;
    Object.assign(S, { attrs: [], attrAvail: null, roleByName: new Map(), compose: { attr: null, opt: null, file: null }, filter: { attr: null, q: "" }, panel: false, panelQ: "", waInfo: null, waAvail: null, waDraft: null, imgUrls: new Map() });
    Object.assign(S.wa, { to: "", pick: null, msg: "", loc: false, contacts: [], cAvail: null, err: "", cerr: "", sug: false, busy: false });
    closeAlert(true);
    updateBadges();
  }

  async function onLogin() {
    resetState();
    const id = ++S.loadId;
    try {
      S.read = JSON.parse(localStorage.getItem(readKey()) || "{}") || {};
      S.seenEm = Number(localStorage.getItem(emKey())) || 0;
    } catch {
      S.read = {};
    }
    loadWaContacts().then(() => id === S.loadId && App.view() === "emergency" && renderWaRight());
    const { data, error } = await sb().from("chat_profiles").select("display_name").maybeSingle();
    if (id !== S.loadId) return;
    if (error) {
      S.avail = /^(42P01|PGRST205)$/.test(error.code || "") ? false : S.avail;
      if (S.avail === false && isMine()) repaint();
      return;
    }
    S.avail = true;
    S.profile = data;
    await refreshAll();
    if (id !== S.loadId) return;
    subscribe();
    if (isMine()) {
      render();
      autoOpen();
    }
  }

  function onLogout() {
    S.loadId++;
    resetState();
  }

  async function refreshAll() {
    const [rooms, mem, counts, recent, em] = await Promise.all([
      sb().from("chat_rooms").select("*").order("created_at", { ascending: false }).limit(200),
      sb().from("chat_members").select("room_id,role"),
      sb().rpc("chat_room_counts"),
      sb().from("chat_messages").select("id,room_id,user_id,sender_name,body,kind,lat,lng,created_at").order("id", { ascending: false }).limit(300),
      sb().from("chat_messages").select("*").eq("kind", "emergency").order("id", { ascending: false }).limit(30),
    ]);
    S.rooms = rooms.data || [];
    S.joined = new Set((mem.data || []).map((m) => m.room_id));
    S.roles = new Map((mem.data || []).map((m) => [m.room_id, m.role]));
    S.counts = new Map((counts.data || []).map((c) => [c.room_id, Number(c.members)]));
    S.last = new Map();
    S.unread = new Map();
    const rows = recent.data || [];
    for (const m of rows) if (!S.last.has(m.room_id)) S.last.set(m.room_id, m);
    // Ruang yang belum pernah dibuka: anggap pesan lama sudah dibaca (jangan banjiri lencana).
    for (const rid of S.joined) if (S.read[rid] === undefined) S.read[rid] = S.last.has(rid) ? S.last.get(rid).id : 0;
    for (const m of rows) if (m.user_id !== me() && m.id > (S.read[m.room_id] || 0)) S.unread.set(m.room_id, (S.unread.get(m.room_id) || 0) + 1);
    S.emergencies = em.data || [];
    saveRead();
    updateBadges();
  }

  const saveRead = () => {
    try {
      localStorage.setItem(readKey(), JSON.stringify(S.read));
    } catch {
      /* penyimpanan penuh */
    }
  };

  function updateBadges() {
    let room = 0, group = 0;
    for (const [rid, n] of S.unread) {
      const r = roomById(rid);
      if (!r) continue;
      r.kind === "room" ? (room += n) : (group += n);
    }
    App.setCount("chat", room + group);
    App.setCount("emergency", S.emergencies.filter((m) => m.user_id !== me() && m.id > S.seenEm).length);
  }

  function markRead(rid, id) {
    if (id > (S.read[rid] || 0)) S.read[rid] = id;
    S.unread.delete(rid);
    saveRead();
    updateBadges();
  }

  // ───────────────────────── realtime + polling
  function subscribe() {
    unsubscribe();
    try {
      S.channel = sb()
        .channel("chat-" + me())
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p) => p && p.new && p.new.id && incoming(p.new))
        .subscribe();
    } catch {
      S.channel = null; // tanpa realtime: polling di percakapan yang terbuka tetap jalan
    }
  }
  function unsubscribe() {
    if (S.channel && sb()) sb().removeChannel(S.channel);
    S.channel = null;
    stopPoll();
  }
  function startPoll() {
    stopPoll();
    S.poll = setInterval(pollActive, 10_000);
  }
  function stopPoll() {
    clearInterval(S.poll);
    S.poll = null;
  }

  async function pollActive() {
    if (!S.active || !isMine() || document.visibilityState !== "visible") return;
    const rid = S.active.id;
    const { data } = await sb().from("chat_messages").select("*").eq("room_id", rid).gt("id", S.newest).order("id", { ascending: true }).limit(100);
    if (!S.active || S.active.id !== rid) return;
    (data || []).forEach(incoming);
    loadAttrs();
  }

  function incoming(row) {
    const mine = row.user_id === me();
    const prev = S.last.get(row.room_id);
    if (!prev || row.id > prev.id) S.last.set(row.room_id, row);
    if (row.kind === "emergency" && !S.emergencies.some((m) => m.id === row.id)) S.emergencies.unshift(row);
    const viewing = isMine() && S.active && S.active.id === row.room_id;
    if (viewing) {
      appendMsg(row);
      markRead(row.room_id, row.id);
    } else if (!mine && row.id > (S.read[row.room_id] || 0)) {
      S.unread.set(row.room_id, (S.unread.get(row.room_id) || 0) + 1);
    }
    if (row.kind === "emergency" && !mine) alertEmergency(row);
    updateBadges();
    if (isMine() && !viewing) repaint();
  }

  // Di halaman Pesan Darurat hanya bagian alarm-grup yang digambar ulang, agar isian WhatsApp tidak terganggu.
  function repaint() {
    if (App.view() === "emergency") renderSosBox();
    else renderList();
  }

  // ───────────────────────── render: umum
  function enter(view) {
    if (view !== "emergency" && S.active && S.active.kind !== kindOf(view)) S.active = null;
    if (view === "emergency") {
      S.seenEm = Math.max(S.seenEm, ...S.emergencies.map((m) => m.id), 0);
      localStorage.setItem(emKey(), String(S.seenEm));
      updateBadges();
    }
    render();
    if (view === "emergency") loadWaContacts().then(() => isMine() && renderWaRight());
    if (S.avail !== false && App.user && S.avail !== null) refreshAll().then(() => isMine() && (repaint(), autoOpen())).catch(() => {});
    else autoOpen();
  }
  // Di layar lebar, langsung buka ruang terakhir yang aktif (seperti aplikasi koordinasi satu-grup).
  function autoOpen() {
    const view = App.view();
    if (!isMine() || view === "emergency" || S.active || S.avail !== true || window.innerWidth <= 760) return;
    const mine = S.rooms
      .filter((r) => r.kind === kindOf(view) && S.joined.has(r.id))
      .sort((a, b) => ((S.last.get(b.id) || {}).id || 0) - ((S.last.get(a.id) || {}).id || 0) || b.created_at - a.created_at);
    if (mine[0]) openRoom(mine[0].id);
  }
  function leave() {
    S.active = null;
    S.members = null;
    S.form = null;
    stopPoll();
    App.setMainOpen(false);
  }
  function render() {
    renderList();
    renderPane();
  }

  const migrationHint = '<div class="mod-note">Fitur ini butuh migrasi database 004. Jalankan <b>supabase/migrations/004_chat_darurat_reservasi.sql</b> di Supabase SQL Editor (lihat README), lalu muat ulang.</div>';

  function nameForm() {
    const meta = (App.user && App.user.user_metadata) || {};
    const guess = String(meta.full_name || meta.name || (App.user && App.user.email ? App.user.email.split("@")[0] : "") || "").trim().slice(0, 30);
    return `<form class="mod-form" data-s="name-form">
      <label>${S.profile ? "Ganti nama tampilan" : "Pilih nama tampilan untuk chat"}
        <input name="name" maxlength="30" minlength="2" required value="${esc(S.profile ? S.profile.display_name : guess)}" placeholder="mis. Andi" />
      </label>
      <div class="mod-note" style="padding:0">Nama ini terlihat oleh anggota ruang dan grup tempatmu ikut. Email dan akun Google-mu tidak ditampilkan.</div>
      <div class="mod-err" data-s="err"></div>
      <div class="row"><button class="btn-primary" type="submit">Simpan nama</button>${S.profile ? '<button class="btn-secondary" type="button" data-s="cancel-form">Batal</button>' : ""}</div>
    </form>`;
  }

  function lastPreview(r) {
    const m = S.last.get(r.id);
    if (!m) return "<em>Belum ada pesan</em>";
    return `${m.kind === "emergency" ? "🚨 " : ""}${esc(m.sender_name)}: ${esc(m.body)}`;
  }

  function roomCard(r, joined) {
    const n = S.unread.get(r.id) || 0;
    const m = S.last.get(r.id);
    return `<button class="mod-card${S.active && S.active.id === r.id ? " active" : ""}" data-s="open" data-id="${esc(r.id)}">
      <h4><span class="t">${esc(r.name)}</span>${n ? `<span class="unread">${n > 99 ? "99+" : n}</span>` : ""}</h4>
      <p>${joined ? lastPreview(r) : esc(r.description || "Ruang terbuka")}</p>
      <div class="meta"><span>${S.counts.get(r.id) || 1} anggota</span>${m ? `<span>${App.relativeTime(m.created_at)}</span>` : ""}${
      joined ? "" : '<span class="badge">Belum bergabung</span>'
    }</div></button>`;
  }

  function renderList() {
    const view = App.view();
    if (!VIEWS.includes(view)) return;
    const box = App.list;
    if (view === "emergency") return renderEmergencyPage(box);
    if (S.avail === false) return void (box.innerHTML = migrationHint);
    if (S.avail === null) return void (box.innerHTML = '<div class="mod-note">Memuat…</div>');

    const kind = kindOf(view);
    let html = "";
    const unreadOf = (k) => [...S.unread].reduce((n, [rid, c]) => n + ((roomById(rid) || {}).kind === k ? c : 0), 0);
    html += `<div class="mod-seg"><button data-s="kind" data-kind="room" class="${kind === "room" ? "active" : ""}">Ruang terbuka${unreadOf("room") ? ` (${unreadOf("room")})` : ""}</button><button data-s="kind" data-kind="group" class="${kind === "group" ? "active" : ""}">Grup privat${unreadOf("group") ? ` (${unreadOf("group")})` : ""}</button></div>`;
    if (!S.profile || S.form === "name") html += nameForm();
    if (S.profile) {
      html += `<div class="mod-actions">
        <button class="btn-primary" data-s="new">${kind === "room" ? "+ Buat ruang" : "+ Buat grup"}</button>
        ${kind === "group" ? '<button class="btn-secondary" data-s="join-form">Gabung dengan kode</button>' : ""}
        <button class="mini-btn" data-s="rename" title="Ganti nama tampilan">Aku: ${esc(S.profile.display_name)}</button>
      </div>`;
      if (S.form === "room" || S.form === "group") {
        html += `<form class="mod-form" data-s="create-form">
          <label>${kind === "room" ? "Nama ruang" : "Nama grup"}<input name="name" maxlength="50" minlength="2" required placeholder="${kind === "room" ? "mis. Kuliner Semarang" : "mis. Keluarga"}" /></label>
          <label>Deskripsi (opsional)<input name="desc" maxlength="200" /></label>
          <div class="mod-err" data-s="err"></div>
          <div class="row"><button class="btn-primary" type="submit">Buat</button><button class="btn-secondary" type="button" data-s="cancel-form">Batal</button></div>
        </form>`;
      } else if (S.form === "join") {
        html += `<form class="mod-form" data-s="join-code-form">
          <label>Kode undangan<input name="code" maxlength="8" minlength="8" required placeholder="8 huruf/angka" autocapitalize="characters" style="text-transform:uppercase" /></label>
          <div class="mod-err" data-s="err"></div>
          <div class="row"><button class="btn-primary" type="submit">Gabung</button><button class="btn-secondary" type="button" data-s="cancel-form">Batal</button></div>
        </form>`;
      }
      const mine = S.rooms.filter((r) => r.kind === kind && S.joined.has(r.id)).sort((a, b) => ((S.last.get(b.id) || {}).id || 0) - ((S.last.get(a.id) || {}).id || 0));
      html += `<div class="group-label">${kind === "room" ? "Ruang saya" : "Grup saya"}</div>`;
      html += mine.length ? mine.map((r) => roomCard(r, true)).join("") : `<div class="mod-note">${kind === "room" ? "Kamu belum bergabung ke ruang mana pun." : "Belum ada grup. Buat grup baru, atau gabung dengan kode undangan dari temanmu."}</div>`;
      if (kind === "room") {
        const others = S.rooms.filter((r) => r.kind === "room" && !S.joined.has(r.id));
        html += `<div class="group-label">Jelajahi ruang</div>`;
        html += others.length ? others.map((r) => roomCard(r, false)).join("") : '<div class="mod-note">Belum ada ruang lain. Buat yang pertama!</div>';
      }
    }
    box.innerHTML = html;
  }

  function renderPane() {
    const view = App.view();
    if (!VIEWS.includes(view)) return;
    const pane = App.pane;
    if (view === "emergency") return void (pane.innerHTML = ""); // halaman penuh: semuanya ada di daftar
    if (S.avail === false) return void (pane.innerHTML = `<div class="mod-empty">${migrationHint}</div>`);
    if (!S.active) {
      const kind = kindOf(view);
      const mineCount = S.rooms.filter((r) => r.kind === kind && S.joined.has(r.id)).length;
      pane.innerHTML = `<div class="cr-hero">
        <span class="cr-hero-ico">${I.group}</span>
        <h2>${kind === "room" ? "Ruang koordinasi tim" : "Grup koordinasi"}</h2>
        <p>${mineCount ? "Pilih ruang di sebelah kiri untuk membuka percakapan." : kind === "room" ? "Buat ruang untuk berkoordinasi dengan timmu: laporan harian, absen, belanja, dan lainnya, semuanya terkumpul rapi dalam satu percakapan." : "Buat grup privat lalu undang anggotanya dengan kode. Hanya anggota yang bisa membaca pesannya."}</p>
        <ul class="cr-hero-list">
          <li>${I.tag}<span><b>Atribut klasifikasi</b> pada setiap pesan (mis. Absen, Pengeluaran, Belanja Pasar), bisa pilihan ganda</span></li>
          <li>${I.funnel}<span><b>Filter dan pencarian</b> pesan menurut atribut atau kata</span></li>
          <li>${I.img}<span><b>Kirim gambar</b> seperti bukti transfer atau foto laporan</span></li>
          <li>${I.copy}<span><b>Salin dan hapus</b> pesan, serta tombol cepat ke Reservasi Meja</span></li>
        </ul>
        ${S.profile ? `<button class="cr-hero-btn" data-s="hero-new">＋ ${kind === "room" ? "Buat ruang koordinasi" : "Buat grup baru"}</button>` : '<p class="mod-note">Pilih nama tampilan dulu di kolom kiri.</p>'}
      </div>`;
      App.setMainOpen(false);
      return;
    }
    renderConversation();
  }

  // ───────────────────────── percakapan (tampilan koordinasi: atribut, filter, gambar)
  const IMG_BUCKET = "chat-images";
  const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
  const MAX_IMG = 5 * 1024 * 1024;
  const I = {
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    funnel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  };
  const isOwnerHere = () => !!S.active && S.roles.get(S.active.id) === "owner";
  const passes = (m) => {
    if (S.filter.attr && m.attr !== S.filter.attr) return false;
    const q = S.filter.q.trim().toLowerCase();
    return !q || `${m.body} ${m.sender_name} ${m.attr || ""} ${m.attr_option || ""}`.toLowerCase().includes(q);
  };
  const attrOf = (name) => S.attrs.find((a) => a.name === name) || null;

  async function loadAttrs() {
    if (!S.active) return;
    const id = S.active.id;
    const { data, error } = await sb().from("chat_attributes").select("*").eq("room_id", id).order("created_at", { ascending: true });
    if (!S.active || S.active.id !== id) return;
    if (error) {
      if (/^(42P01|PGRST205)$/.test(error.code || "")) S.attrAvail = false;
      return;
    }
    S.attrAvail = true;
    const same = JSON.stringify(S.attrs) === JSON.stringify(data || []);
    S.attrs = data || [];
    if (S.filter.attr && !attrOf(S.filter.attr)) S.filter.attr = null;
    if (S.compose.attr && !attrOf(S.compose.attr)) S.compose.attr = S.compose.opt = null;
    if (!same) {
      renderFilter();
      renderAttrChips();
      renderPanel();
    }
  }

  // ── penerusan ke WhatsApp lewat Fonnte (migrasi 011 + api/wa.py)
  async function loadWa() {
    if (!S.active) return;
    const id = S.active.id;
    const { data, error } = await sb().rpc("wa_room_info", { p_room: id });
    if (!S.active || S.active.id !== id) return;
    if (error) {
      if (/^(42883|PGRST202)$/.test(error.code || "")) S.waAvail = false;
      return;
    }
    S.waAvail = true;
    S.waInfo = data;
    renderAttrChips();
    renderPanel();
  }
  const waApplies = (name) => !!(S.waInfo && S.waInfo.enabled && name && (!S.waInfo.attrs.length || S.waInfo.attrs.includes(name)));
  const waBadge = (m) =>
    m.wa_state === "sent"
      ? '<span class="cr-wa-badge ok" title="Sudah diteruskan ke WhatsApp">📲 WA ✓</span>'
      : m.wa_state === "failed"
        ? '<span class="cr-wa-badge bad" title="Gagal diteruskan ke WhatsApp">📲 WA gagal</span>'
        : "";

  // Memanggil api/wa.py (server memeriksa izin di database lalu memakai token Fonnte milik pemilik aplikasi).
  async function waFetch(payload) {
    const { data } = await sb().auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) throw Object.assign(new Error("Sesi habis. Masuk ulang."), { status: 401 });
    if (!navigator.onLine) throw new Error("Butuh koneksi internet.");
    const res = await fetch(`${location.origin}/api/wa`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-supabase-key": String((window.CATATAN_CONFIG || {}).supabaseAnonKey || "") },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error("Penerusan WhatsApp hanya jalan di situs yang sudah di-deploy.");
    if (!res.ok) throw Object.assign(new Error(j.error || "Gagal meneruskan ke WhatsApp."), { status: res.status });
    return j;
  }

  function setWaState(id, state) {
    const m = S.msgs.find((x) => x.id === id);
    if (!m) return;
    m.wa_state = state;
    const t = document.querySelector(`[data-mid="${id}"] .cr-time`);
    if (t) t.innerHTML = waBadge(m) + hm(m.created_at);
  }

  async function forwardWa(row) {
    try {
      await waFetch({ message: row.id });
      setWaState(row.id, "sent");
      App.toast("Terkirim ke WhatsApp ✓");
    } catch (err) {
      if (err.status !== 409) setWaState(row.id, "failed"); // 409 = database menolak (mis. sudah terkirim): status tidak diubah
      App.toast("WhatsApp: " + err.message);
    }
  }

  const readWaForm = (form) => ({
    target: form.elements.target.value,
    enabled: form.elements.enabled.checked,
    all: form.elements.all.checked,
    attrs: [...form.querySelectorAll('input[name="a"]:checked')].map((i) => i.value),
  });

  function waCardHtml() {
    const w = S.waInfo;
    if (!S.waAvail || !w) return "";
    if (!w.admin) {
      return `<div class="cr-wa-card"><h4>📲 Teruskan ke WhatsApp</h4><p>Hanya admin aplikasi yang bisa mengaktifkan ini (lihat README, migrasi 011).</p></div>`;
    }
    const d = S.waDraft || { target: w.target || "", enabled: w.configured ? w.enabled : true, all: !w.attrs.length, attrs: w.attrs };
    return `<form data-s="wa-cfg-form" class="cr-wa-card">
      <h4>📲 Teruskan ke WhatsApp (Fonnte)</h4>
      <p>Pesan yang diberi atribut terpilih otomatis dikirim ke satu tujuan ini. Anggota bisa membatalkannya per pesan.</p>
      <input name="target" data-w="1" placeholder="Nomor (0812…) atau ID grup (…@g.us)" value="${esc(d.target)}" maxlength="60" required autocomplete="off" />
      <label class="cr-check"><input type="checkbox" name="enabled" data-w="1" ${d.enabled ? "checked" : ""} /> Aktif</label>
      <label class="cr-check"><input type="checkbox" name="all" data-s="wa-all" data-w="1" ${d.all ? "checked" : ""} /> Semua atribut (termasuk yang baru)</label>
      <div class="cr-wa-attrs">${S.attrs.map((a) => `<label class="cr-check"><input type="checkbox" name="a" value="${esc(a.name)}" data-w="1" ${d.attrs.includes(a.name) ? "checked" : ""} ${d.all ? "disabled" : ""} /> ${esc(a.name)}</label>`).join("") || '<small>Belum ada atribut.</small>'}</div>
      <div class="mod-err" data-s="err"></div>
      <div class="cr-wa-btns"><button class="cr-add" type="submit">Simpan</button>${
        w.configured ? '<button type="button" class="cr-mini kelola" data-s="wa-test">Kirim tes</button><button type="button" class="cr-mini rename" data-s="wa-clear">Hapus</button>' : ""
      }</div>
    </form>`;
  }

  async function waAction(act, form) {
    const err = form && form.querySelector('[data-s="err"]');
    try {
      if (act === "save") {
        const d = readWaForm(form);
        if (!d.all && !d.attrs.length) throw new Error("Pilih minimal satu atribut, atau centang “Semua atribut”.");
        await rpc("set_wa_config", { p_room: S.active.id, p_target: d.target, p_enabled: d.enabled, p_attrs: d.all ? [] : d.attrs });
        S.waDraft = null;
        await loadWa();
        App.toast("Pengaturan WhatsApp disimpan.");
      } else if (act === "test") {
        await waFetch({ test: S.active.id });
        App.toast("Pesan tes terkirim ke WhatsApp ✓");
      } else if (act === "clear") {
        if (!confirm("Hapus pengaturan WhatsApp untuk ruang ini? Pesan tidak akan diteruskan lagi.")) return;
        await rpc("clear_wa_config", { p_room: S.active.id });
        S.waDraft = null;
        await loadWa();
      }
    } catch (e) {
      if (err) err.textContent = e.message;
      else App.toast(e.message);
    }
  }

  function msgHtml(m, prev) {
    const mine = m.user_id === me();
    const canDel = mine || isOwnerHere();
    const day = !prev || dayKey(prev.created_at) !== dayKey(m.created_at) ? `<div class="chat-day">${esc(dayLabel(m.created_at))}</div>` : "";
    const link = m.kind === "emergency" && m.lat != null ? mapLink(m.lat, m.lng) : "";
    const role = S.roleByName.get(m.sender_name) === "owner" ? '<span class="cr-role owner">PEMILIK</span>' : '<span class="cr-role">ANGGOTA</span>';
    const tag = m.attr ? `<span class="cr-tag">${I.tag}${esc(m.attr)}${m.attr_option ? " · " + esc(m.attr_option) : ""}</span>` : "";
    return `${day}<div class="cr-msg${mine ? " me" : ""}${m.kind === "emergency" ? " emergency" : ""}" data-mid="${m.id}">
      <div class="cr-top"><b>${esc(m.sender_name)}</b>${role}<span class="grow"></span>
        <button class="icon-btn mini" data-s="copy" data-id="${m.id}" title="Salin pesan" aria-label="Salin pesan">${I.copy}</button>
        ${canDel ? `<button class="icon-btn mini del" data-s="del" data-id="${m.id}" title="Hapus pesan" aria-label="Hapus pesan">${I.trash}</button>` : ""}</div>
      ${tag}${m.kind === "emergency" ? '<span class="cr-tag sos">🚨 DARURAT</span>' : ""}
      ${m.image_path ? `<img class="cr-img" data-img="${esc(m.image_path)}" alt="Gambar dari ${esc(m.sender_name)}" />` : ""}
      ${m.body ? `<div class="cr-text">${esc(m.body)}</div>` : ""}
      ${link ? `<a class="loc" href="${esc(link)}" target="_blank" rel="noopener noreferrer">📍 Lihat lokasi di peta</a>` : ""}
      <div class="cr-time">${waBadge(m)}${hm(m.created_at)}</div></div>`;
  }

  function renderConversation() {
    const r = S.active;
    const pane = App.pane;
    const owner = isOwnerHere();
    const grp = r.kind === "group";
    pane.innerHTML = `
      <div class="cr-wrap${S.panel ? " panel-open" : ""}" id="crWrap">
        <section class="cr-main">
          <header class="cr-head">
            <button class="icon-btn back-btn" data-s="back" title="Kembali"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
            <span class="cr-ico">${I.group}</span>
            <div class="cr-titles"><h3>${esc(r.name)}</h3><small id="crCount"></small></div>
            <div class="cr-actions">
              <button class="cr-btn indigo" data-s="reserv" title="Buka Reservasi Meja">📅 Reservasi</button>
              ${owner && S.attrAvail ? `<button class="cr-btn pink" data-s="attr-panel">${I.tag}Kelola Atribut</button>` : ""}
              <button class="cr-btn" data-s="members">Anggota</button>
              ${grp ? `<button class="cr-btn" data-s="invite" title="Salin kode undangan">Kode: ${esc(r.invite_code || "")}</button><button class="cr-btn danger" data-s="to-sos" title="Kirim pesan darurat ke grup ini">🚨</button>` : ""}
              <button class="cr-btn outline" data-s="leave">${owner ? "Hapus ruang" : "Keluar"}</button>
            </div>
          </header>
          <div class="cr-members" id="chatMembers" style="display:${S.members ? "flex" : "none"}">${membersHtml()}</div>
          <div class="cr-filter" id="crFilter"></div>
          <div class="cr-msgs" id="chatMsgs"></div>
          <button class="cr-down hidden" id="crDown" data-s="down" title="Ke pesan terbaru" aria-label="Ke pesan terbaru">${I.down}</button>
          <form class="cr-compose" data-s="send-form">
            <div class="cr-attrs" id="crAttrs"></div>
            <div class="cr-row">
              <button class="icon-btn lg ${S.attrAvail ? "" : "hidden"}" type="button" data-s="pick-img" title="Lampirkan gambar" aria-label="Lampirkan gambar">${I.img}</button>
              <input type="file" id="crFile" accept="image/png,image/jpeg,image/gif,image/webp" hidden />
              <textarea name="body" rows="1" maxlength="1000" placeholder="Tulis balasan…" title="Enter untuk kirim, Shift+Enter untuk baris baru"></textarea>
              <button class="cr-send" type="submit" title="Kirim" aria-label="Kirim">${I.send}</button>
            </div>
            <div class="cr-file" id="crFileInfo"></div>
          </form>
        </section>
        <aside class="cr-panel" id="crPanel"></aside>
      </div>`;
    renderFilter();
    renderAttrChips();
    renderFileInfo();
    renderPanel();
    paintMsgs(true);
    const box = document.getElementById("chatMsgs");
    box.addEventListener("scroll", () => document.getElementById("crDown").classList.toggle("hidden", box.scrollHeight - box.scrollTop - box.clientHeight < 300));
    App.setMainOpen(true);
  }

  function renderCount() {
    const el = document.getElementById("crCount");
    if (el) el.textContent = `Pesan: ${S.msgs.length}${S.hasMore ? "+" : ""} · ${S.counts.get(S.active.id) || 1} anggota`;
  }

  function membersHtml() {
    if (!S.members) return "";
    return `<div class="mod-line">${S.members.map((m) => `<span class="badge${m.role === "owner" ? " ok" : ""}">${esc(m.display_name)}${m.is_me ? " (aku)" : ""}${m.role === "owner" ? " · pemilik" : ""}</span>`).join("")}</div>`;
  }

  function renderFilter() {
    const box = document.getElementById("crFilter");
    if (!box) return;
    box.innerHTML = `<label class="cr-search${S.filter.q ? " open" : ""}">${I.search}<input data-s="fsearch" placeholder="Cari pesan…" value="${esc(S.filter.q)}" /></label>
      ${S.attrs.length ? `<span class="cr-flabel">${I.funnel} FILTER:</span>
      <button class="cr-chip${S.filter.attr ? "" : " on"}" data-s="fchip" data-name="">Semua</button>
      ${S.attrs.map((a) => `<button class="cr-chip${S.filter.attr === a.name ? " on" : ""}" data-s="fchip" data-name="${esc(a.name)}">${esc(a.name)}</button>`).join("")}` : ""}`;
  }

  function renderAttrChips() {
    const box = document.getElementById("crAttrs");
    if (!box) return;
    if (!S.attrAvail || !S.attrs.length) return void (box.innerHTML = "");
    const sel = attrOf(S.compose.attr);
    box.innerHTML =
      `<div class="cr-chips">${S.attrs.map((a) => `<button type="button" class="cr-chip${S.compose.attr === a.name ? " on" : ""}" data-s="cattr" data-name="${esc(a.name)}">${I.tag}${esc(a.name)}</button>`).join("")}</div>` +
      (sel && sel.options.length
        ? `<div class="cr-chips opts"><small>Pilih opsi:</small>${sel.options.map((o) => `<button type="button" class="cr-chip${S.compose.opt === o ? " on" : ""}" data-s="copt" data-opt="${esc(o)}">${esc(o)}</button>`).join("")}</div>`
        : "") +
      (sel && waApplies(sel.name) ? `<label class="cr-wa"><input type="checkbox" data-s="wa-send" ${S.compose.noWa ? "" : "checked"} /> 📲 Ikut dikirim ke WhatsApp</label>` : "");
  }

  function renderFileInfo() {
    const box = document.getElementById("crFileInfo");
    if (!box) return;
    const f = S.compose.file;
    box.innerHTML = f ? `<span class="cr-fchip">${I.img}<span>${esc(f.name)} (${Math.max(1, Math.round(f.size / 1024))} KB)</span><button type="button" data-s="rm-img" aria-label="Batalkan gambar">✕</button></span>` : "";
  }

  // Panel "Kelola Atribut Klasifikasi" (hanya pemilik ruang)
  function renderPanel() {
    const panel = document.getElementById("crPanel");
    const wrap = document.getElementById("crWrap");
    if (!panel || !wrap) return;
    const show = S.panel && isOwnerHere() && S.attrAvail;
    wrap.classList.toggle("panel-open", !!show);
    if (!show) return void (panel.innerHTML = "");
    const q = S.panelQ.trim().toLowerCase();
    const list = S.attrs.filter((a) => !q || a.name.toLowerCase().includes(q));
    panel.innerHTML = `
      <div class="cr-panel-head"><h3>${I.tag} Kelola Atribut Klasifikasi</h3><button class="icon-btn" data-s="panel-close" aria-label="Tutup panel">✕</button></div>
      <p>Atribut klasifikasi pesan di ruang ini (mis. Absen, Belanja Pasar, Progres). Anggota memilihnya saat mengirim pesan, dan bisa menyaring pesan menurut atribut.</p>
      ${waCardHtml()}
      <form data-s="attr-form" class="cr-attr-form">
        <div class="cr-addrow"><input name="name" placeholder="Nama atribut baru…" maxlength="40" required /><button class="cr-add" type="submit">+ Tambah</button></div>
        <input name="opts" placeholder="Pilihan ganda (opsional): pisahkan dengan koma" maxlength="300" />
        <div class="mod-err" data-s="err"></div>
      </form>
      <label class="cr-search open wide">${I.search}<input data-s="psearch" placeholder="Cari atribut…" value="${esc(S.panelQ)}" /></label>
      <div class="cr-attr-list">${
        list.length
          ? list.map((a) => `<div class="cr-attr" data-id="${esc(a.id)}"><div class="cr-attr-top"><b>${I.tag}${esc(a.name)}</b>
              <span class="cr-attr-btns"><button class="cr-mini kelola" data-s="attr-opts">Kelola</button><button class="cr-mini rename" data-s="attr-rename">Ubah Nama</button><button class="icon-btn mini" data-s="attr-del" title="Hapus atribut" aria-label="Hapus atribut">${I.trash}</button></span></div>
              <small>${a.options.length ? `Pilihan Ganda: <b>${a.options.length} opsi</b> (${esc(a.options.slice(0, 4).join(", "))}${a.options.length > 4 ? "…" : ""})` : "Teks bebas (tanpa pilihan)"}</small></div>`).join("")
          : '<div class="mod-note">Belum ada atribut.</div>'
      }</div>`;
  }

  async function resolveImgs() {
    const box = document.getElementById("chatMsgs");
    if (!box) return;
    const imgs = [...box.querySelectorAll("img[data-img]:not([src])")];
    const need = [...new Set(imgs.map((i) => i.dataset.img))].filter((p) => !S.imgUrls.has(p));
    if (need.length) {
      const { data } = await sb().storage.from(IMG_BUCKET).createSignedUrls(need, 3600);
      (data || []).forEach((d) => d.signedUrl && S.imgUrls.set(d.path, d.signedUrl));
    }
    imgs.forEach((img) => {
      const u = S.imgUrls.get(img.dataset.img);
      if (u) {
        img.src = u;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
      } else img.replaceWith(Object.assign(document.createElement("span"), { className: "cr-time", textContent: "(gambar tidak tersedia)" }));
    });
  }

  function paintMsgs(toBottom) {
    const box = document.getElementById("chatMsgs");
    if (!box) return;
    const prevH = box.scrollHeight;
    const prevTop = box.scrollTop;
    const vis = S.msgs.filter(passes);
    box.innerHTML =
      (S.hasMore && !S.filter.attr && !S.filter.q ? '<button class="chat-more" data-s="older">Muat pesan lebih lama</button>' : "") +
      (vis.length ? vis.map((m, i) => msgHtml(m, vis[i - 1])).join("") : `<div class="mod-note" style="text-align:center">${S.msgs.length ? "Tidak ada pesan yang cocok dengan filter." : "Belum ada pesan. Mulai percakapan!"}</div>`);
    box.scrollTop = toBottom ? box.scrollHeight : box.scrollHeight - prevH + prevTop;
    renderCount();
    resolveImgs().then(() => toBottom && (box.scrollTop = box.scrollHeight));
  }

  function appendMsg(row) {
    if (S.msgs.some((m) => m.id === row.id)) return;
    S.msgs.push(row);
    S.newest = Math.max(S.newest, row.id);
    renderCount();
    const box = document.getElementById("chatMsgs");
    if (!box || !passes(row)) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160 || row.user_id === me();
    const empty = box.querySelector(".mod-note");
    if (empty) empty.remove();
    const vis = S.msgs.filter(passes);
    box.insertAdjacentHTML("beforeend", msgHtml(row, vis[vis.length - 2]));
    resolveImgs().then(() => near && (box.scrollTop = box.scrollHeight));
    if (near) box.scrollTop = box.scrollHeight;
  }

  async function openRoom(id) {
    const r = roomById(id);
    if (!r) return;
    S.active = r;
    S.members = null;
    S.msgs = [];
    S.hasMore = false;
    S.newest = S.oldest = 0;
    S.attrs = [];
    S.roleByName = new Map();
    S.compose = { attr: null, opt: null, file: null };
    S.filter = { attr: null, q: "" };
    S.panel = false;
    S.panelQ = "";
    S.waInfo = null;
    S.waDraft = null;
    renderList();
    renderPane();
    const [msgs, attrs, members] = await Promise.all([
      sb().from("chat_messages").select("*").eq("room_id", id).order("id", { ascending: false }).limit(50),
      loadAttrs(),
      sb().rpc("chat_room_members", { p_room: id }),
      loadWa(),
    ]);
    if (!S.active || S.active.id !== id) return;
    void attrs;
    (members.data || []).forEach((m) => S.roleByName.set(m.display_name, m.role));
    const { data, error } = msgs;
    if (error) return App.toast("Gagal memuat pesan: " + error.message);
    S.msgs = (data || []).reverse();
    S.hasMore = (data || []).length === 50;
    S.oldest = S.msgs.length ? S.msgs[0].id : 0;
    S.newest = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
    renderConversation(); // gambar ulang: sekarang atribut, peran, dan pesan sudah ada
    if (S.newest) markRead(id, S.newest);
    else S.unread.delete(id);
    updateBadges();
    renderList();
    startPoll();
  }

  async function olderMsgs() {
    if (!S.active || !S.oldest) return;
    const id = S.active.id;
    const { data } = await sb().from("chat_messages").select("*").eq("room_id", id).lt("id", S.oldest).order("id", { ascending: false }).limit(50);
    if (!S.active || S.active.id !== id) return;
    const more = (data || []).reverse();
    S.msgs = more.concat(S.msgs);
    S.hasMore = (data || []).length === 50;
    if (more.length) S.oldest = more[0].id;
    paintMsgs(false);
  }

  // Perkecil foto besar sebelum diunggah (maks. 1800px).
  async function shrink(file) {
    if (file.type === "image/gif" || file.size < 1_200_000 || !window.createImageBitmap) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
      const blob = await new Promise((res) => c.toBlob(res, type, 0.85));
      return blob && blob.size < file.size ? new File([blob], file.name, { type: blob.type }) : file;
    } catch {
      return file;
    }
  }

  async function sendMsg(form) {
    const ta = form.elements.body;
    const body = ta.value.trim();
    const cp = S.compose;
    if ((!body && !cp.file) || !S.active) return;
    const attr = S.attrAvail ? attrOf(cp.attr) : null;
    if (attr && attr.options.length && !cp.opt) return App.toast(`Pilih opsi untuk atribut “${attr.name}” (atau batalkan atributnya).`);
    const btn = form.querySelector(".cr-send");
    btn.disabled = true;
    const roomId = S.active.id;
    let path = null;
    try {
      if (cp.file) {
        if (!App.online) throw new Error("Sambungkan ke internet untuk mengirim gambar.");
        const img = await shrink(cp.file);
        if (img.size > MAX_IMG) throw new Error("Gambar terlalu besar (maksimal 5 MB).");
        path = `${roomId}/${me()}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.${IMG_TYPES[img.type] || "jpg"}`;
        const up = await sb().storage.from(IMG_BUCKET).upload(path, img, { contentType: img.type, upsert: false });
        if (up.error) throw new Error("Gagal mengunggah gambar: " + up.error.message);
      }
      const args = { p_room: roomId, p_body: body };
      if (S.attrAvail) Object.assign(args, { p_attr: attr ? attr.name : null, p_attr_option: attr && cp.opt ? cp.opt : null, p_image: path });
      let row;
      try {
        row = one(await rpc("send_chat_message", args));
      } catch (err) {
        if (path) sb().storage.from(IMG_BUCKET).remove([path]).catch(() => {});
        throw err;
      }
      ta.value = "";
      ta.style.height = "";
      S.compose = { attr: cp.attr, opt: cp.opt, file: null }; // atribut dibiarkan terpilih untuk pesan berikutnya; pembatalan WA berlaku per pesan
      renderFileInfo();
      if (row) {
        const prev = S.last.get(row.room_id);
        if (!prev || row.id > prev.id) S.last.set(row.room_id, row);
        appendMsg(row);
        markRead(row.room_id, row.id);
        if (row.kind === "text" && row.attr && waApplies(row.attr) && !cp.noWa) forwardWa(row);
        renderAttrChips();
      }
    } catch (err) {
      App.toast(err.message);
    } finally {
      btn.disabled = false;
      ta.focus();
    }
  }

  async function deleteMsg(id) {
    const m = S.msgs.find((x) => x.id === id);
    if (!confirm("Hapus pesan ini?")) return;
    try {
      await rpc("delete_chat_message", { p_id: id });
      if (m && m.image_path) sb().storage.from(IMG_BUCKET).remove([m.image_path]).catch(() => {});
      S.msgs = S.msgs.filter((x) => x.id !== id);
      S.emergencies = S.emergencies.filter((x) => x.id !== id);
      const el = document.querySelector(`[data-mid="${id}"]`);
      if (el) el.remove();
      renderCount();
      renderList();
    } catch (err) {
      App.toast(err.message);
    }
  }

  async function copyMsg(id) {
    const m = S.msgs.find((x) => x.id === id);
    if (!m) return;
    const text = `${m.sender_name}: ${m.body}`.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    App.toast("Pesan disalin");
  }

  async function toggleMembers() {
    if (S.members) {
      S.members = null;
    } else {
      try {
        S.members = (await rpc("chat_room_members", { p_room: S.active.id })) || [];
      } catch (err) {
        return App.toast(err.message);
      }
    }
    const box = document.getElementById("chatMembers");
    if (box) {
      box.style.display = S.members ? "flex" : "none";
      box.innerHTML = membersHtml();
    }
  }

  async function leaveRoom() {
    const r = S.active;
    if (!r) return;
    const owner = isOwnerHere();
    const ok = confirm(owner ? `Kamu pemilik “${r.name}”. Menghapusnya juga menghapus semua pesan, gambar, dan mengeluarkan semua anggota. Lanjutkan?` : `Keluar dari “${r.name}”?`);
    if (!ok) return;
    try {
      if (owner && S.attrAvail) await removeRoomImages(r.id); // sebelum jadi bukan anggota, selagi masih berhak menghapus berkas
      await rpc("leave_chat_room", { p_room: r.id });
      S.active = null;
      S.members = null;
      stopPoll();
      await refreshAll();
      render();
      App.setMainOpen(false);
      App.toast(owner ? "Ruang dihapus" : "Kamu sudah keluar");
    } catch (err) {
      App.toast(err.message);
    }
  }

  // Hapus semua gambar ruang (folder <ruang>/<pengirim>/<berkas>), sebisanya.
  async function removeRoomImages(roomId) {
    try {
      const st = sb().storage.from(IMG_BUCKET);
      const users = (await st.list(roomId, { limit: 1000 })).data || [];
      for (const u of users) {
        const files = (await st.list(`${roomId}/${u.name}`, { limit: 1000 })).data || [];
        if (files.length) await st.remove(files.map((f) => `${roomId}/${u.name}/${f.name}`));
      }
    } catch {
      /* gagal menghapus berkas tidak boleh menghalangi penghapusan ruang */
    }
  }

  // ── kelola atribut
  async function attrAction(act, id, form) {
    const a = S.attrs.find((x) => x.id === id);
    try {
      if (act === "add") {
        const f = form.elements;
        const opts = f.opts.value.split(",").map((x) => x.trim()).filter(Boolean);
        await rpc("add_chat_attribute", { p_room: S.active.id, p_name: f.name.value, p_options: opts });
        f.name.value = f.opts.value = "";
      } else if (a && act === "rename") {
        const name = (prompt("Nama baru untuk atribut ini:", a.name) || "").trim();
        if (!name || name === a.name) return;
        await rpc("update_chat_attribute", { p_id: a.id, p_name: name, p_options: a.options });
        S.msgs.forEach((m) => m.attr === a.name && (m.attr = name));
        if (S.filter.attr === a.name) S.filter.attr = name;
        if (S.compose.attr === a.name) S.compose.attr = name;
      } else if (a && act === "opts") {
        const raw = prompt(`Pilihan ganda untuk “${a.name}” (pisahkan dengan koma; kosongkan = teks bebas):`, a.options.join(", "));
        if (raw === null) return;
        const opts = raw.split(",").map((x) => x.trim()).filter(Boolean);
        await rpc("update_chat_attribute", { p_id: a.id, p_name: a.name, p_options: opts });
        if (S.compose.attr === a.name) S.compose.opt = null;
      } else if (a && act === "del") {
        if (!confirm(`Hapus atribut “${a.name}”? Pesan lama tetap ada, hanya tanpa atribut.`)) return;
        await rpc("delete_chat_attribute", { p_id: a.id });
        S.msgs.forEach((m) => m.attr === a.name && ((m.attr = null), (m.attr_option = null)));
        if (S.filter.attr === a.name) S.filter.attr = null;
        if (S.compose.attr === a.name) S.compose.attr = S.compose.opt = null;
      }
      await loadAttrs();
      renderFilter();
      renderAttrChips();
      renderPanel();
      paintMsgs(false);
    } catch (err) {
      const e = form && form.querySelector('[data-s="err"]');
      if (e) e.textContent = err.message;
      else App.toast(err.message);
    }
  }

  // ───────────────────────── pembuatan / bergabung
  async function afterJoin(room) {
    await refreshAll();
    S.form = null;
    if (room && room.id) await openRoom(room.id);
    else render();
  }

  async function submitForm(form) {
    const kind = form.dataset.s;
    const err = form.querySelector('[data-s="err"]');
    const btn = form.querySelector("button[type=submit]");
    const f = form.elements;
    err.textContent = "";
    btn.disabled = true;
    try {
      if (kind === "name-form") {
        await rpc("set_chat_name", { p_name: f.name.value });
        S.profile = { display_name: f.name.value.trim() };
        S.form = null;
        render();
        App.toast("Nama tampilan disimpan");
      } else if (kind === "create-form") {
        const room = one(await rpc("create_chat_room", { p_kind: kindOf(App.view()), p_name: f.name.value, p_description: f.desc.value }));
        await afterJoin(room);
        App.toast(room.kind === "group" ? "Grup dibuat. Bagikan kode undangannya ke anggota." : "Ruang dibuat");
      } else if (kind === "join-code-form") {
        const room = one(await rpc("join_chat_group", { p_code: f.code.value }));
        await afterJoin(room);
        App.toast("Berhasil bergabung");
      }
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  }

  async function joinPublic(id) {
    try {
      await rpc("join_chat_room", { p_room: id });
      await afterJoin({ id });
    } catch (err) {
      App.toast(err.message);
    }
  }

  // ───────────────────────── pesan darurat
  function renderSosBox() {
    const box = document.getElementById("sosBox");
    if (!box) return;
    if (S.avail === false) return void (box.innerHTML = migrationHint);
    if (S.avail === null) return void (box.innerHTML = '<div class="mod-note">Memuat…</div>');
    renderEmergency(box);
  }

  function renderEmergency(box) {
    let html = "";
    if (!S.profile || S.form === "name") html += nameForm();
    const groups = S.rooms.filter((r) => r.kind === "group" && S.joined.has(r.id));
    const picked = S.sos.sel || new Set(groups.map((g) => g.id)); // belum diubah pengguna = semua grup
    html += S.profile ? `<div class="mod-actions"><button class="mini-btn" data-s="rename">Aku: ${esc(S.profile.display_name)}</button></div>` : "";
    if (S.profile) {
      if (!groups.length) {
        html += `<div class="mod-form"><div class="mod-note" style="padding:0">Pesan darurat dikirim ke grupmu. Kamu belum punya grup: buat grup keluarga atau tim, lalu undang anggotanya dengan kode.</div><button class="btn-primary" data-s="goto-groups">Buka Pesan grup</button></div>`;
      } else {
        html += `<form class="mod-form" data-s="sos-form">
          <strong>Kirim ke grup</strong>
          ${groups.map((g) => `<label class="check"><input type="checkbox" data-s="sos-group" value="${esc(g.id)}" ${picked.has(g.id) ? "checked" : ""} /> ${esc(g.name)} <span class="badge">${S.counts.get(g.id) || 1} anggota</span></label>`).join("")}
          <label>Pesan<textarea name="msg" maxlength="500" rows="2">${esc(S.sos.msg)}</textarea></label>
          <label class="check"><input type="checkbox" name="loc" ${S.sos.loc ? "checked" : ""} /> Sertakan lokasiku (browser akan meminta izin)</label>
          <div class="mod-err" data-s="err">${esc(S.sos.note)}</div>
          <button class="sos-btn" type="submit" ${S.sos.busy ? "disabled" : ""}>${S.sos.busy ? "MENGIRIM…" : "🚨 KIRIM PESAN DARURAT"}</button>
        </form>`;
      }
    }
    html += `<div class="group-label">Riwayat pesan darurat</div>`;
    html += S.emergencies.length
      ? S.emergencies
          .slice(0, 30)
          .map((m) => {
            const r = roomById(m.room_id);
            const link = m.lat != null ? mapLink(m.lat, m.lng) : "";
            return `<div class="mod-card danger"><h4><span class="t">${m.user_id === me() ? "Kamu" : esc(m.sender_name)} → ${esc(r ? r.name : "grup")}</span></h4>
              <p style="white-space:normal">${esc(m.body)}</p>
              <div class="meta"><span>${esc(App.fullDate(m.created_at))}</span>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">📍 Lokasi</a>` : ""}</div></div>`;
          })
          .join("")
      : '<div class="mod-note">Belum ada pesan darurat.</div>';
    box.innerHTML = html;
  }

  // ───────────────────────── Pesan WhatsApp Cepat (halaman Pesan Darurat)
  // WhatsApp tidak dikirim oleh server: tombol membuka WhatsApp dengan pesan siap kirim (wa.me).
  const TEMPLATES = ["Saya butuh bantuan, tolong hubungi saya sekarang!", "Saya dalam keadaan darurat. Ini lokasi saya.", "Saya baik-baik saja, terima kasih."];

  function normalizePhone(raw) {
    let d = String(raw || "").replace(/[^0-9+]/g, "");
    if (d.startsWith("+")) d = d.slice(1);
    else if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0")) d = "62" + d.slice(1);
    return /^[0-9]{6,16}$/.test(d) ? d : "";
  }
  const showPhone = (p) => (p && p.startsWith("62") ? "0" + p.slice(2) : p || "");
  const waContact = (id) => S.wa.contacts.find((c) => c.id === id) || null;

  async function loadWaContacts() {
    if (!App.user) return;
    const { data, error } = await sb().from("contacts").select("*").order("name", { ascending: true }).limit(250);
    if (error) {
      if (/^(42P01|PGRST205)$/.test(error.code || "")) S.wa.cAvail = false;
      return;
    }
    S.wa.cAvail = true;
    S.wa.contacts = data || [];
    if (S.wa.pick && !waContact(S.wa.pick)) S.wa.pick = null;
  }

  function renderEmergencyPage(box) {
    const w = S.wa;
    box.innerHTML = `
      <div class="rem-head">
        <div><h1><span style="color:#3cb371">💬</span> Pesan WhatsApp Cepat</h1>
          <p>Kirim pesan darurat atau obrolan cepat secara langsung menggunakan daftar kontak tersimpan.</p></div>
        <div class="rem-notif"><a class="btn-secondary" href="tel:112" style="text-decoration:none;display:inline-flex;align-items:center;padding:8px 16px">📞 Telepon 112</a></div>
      </div>
      <div class="rem-grid wa-grid">
        <form class="wa-form" data-s="wa-form" autocomplete="off">
          <div class="wa-field"><label class="wa-label" for="waTo">Nomor WhatsApp penerima</label>
            <div class="wa-combo"><input id="waTo" name="to" placeholder="Cari nama kontak atau ketik nomor telepon…" value="${esc(w.to)}" /><div class="wa-sug hidden" id="waSug"></div></div></div>
          <div class="wa-field"><label class="wa-label" for="waMsg">Isi pesan WhatsApp</label>
            <textarea id="waMsg" name="msg" rows="7" maxlength="1000" placeholder="Tulis pesan kustom atau pesan darurat Anda di sini…">${esc(w.msg)}</textarea>
            <div class="wa-tpl">${TEMPLATES.map((t, i) => `<button type="button" class="mini-btn" data-s="wa-tpl" data-i="${i}">${esc(t.length > 34 ? t.slice(0, 34) + "…" : t)}</button>`).join("")}</div>
            <label class="check wa-loc"><input type="checkbox" name="loc" data-s="wa-loc" ${w.loc ? "checked" : ""} /> Sertakan lokasiku (tautan peta; browser akan meminta izin)</label></div>
          <div class="rem-err" id="waErr">${esc(w.err)}</div>
          <button class="wa-send" type="submit" ${w.busy ? "disabled" : ""}>${w.busy ? "Menyiapkan…" : "➤ Kirim Pesan Sekarang"}</button>
          <p class="mod-note" style="padding:0">Tombol ini membuka WhatsApp dengan pesan yang sudah terisi; kamu tinggal menekan kirim di sana. Catatan tidak mengirim pesan sendiri.</p>
        </form>
        <div class="rem-card-form wa-right" id="waRight"></div>
      </div>
      <details class="sos-details" id="sosDetails" ${S.sosOpen ? "open" : ""}>
        <summary>🚨 Alarm darurat ke grup Catatan <small>(berbunyi di aplikasi anggota grup)</small></summary>
        <div id="sosBox"></div>
      </details>`;
    renderWaRight();
    renderSosBox();
  }

  function renderWaRight() {
    const box = document.getElementById("waRight");
    if (!box) return;
    const w = S.wa;
    if (w.cAvail === false) {
      box.innerHTML = `<h2 class="wa-h">👤 Kontak tersimpan</h2><div class="mod-note" style="padding:0">Menyimpan kontak butuh migrasi database 005 (<b>supabase/migrations/005_pengingat_kontak.sql</b>). Sementara itu kamu tetap bisa mengetik nomor langsung di sebelah kiri.</div>`;
      return;
    }
    box.innerHTML = `
      <h2 class="wa-h">👤＋ Tambah Kontak Baru</h2>
      <form data-s="wa-contact-form" class="wa-addform">
        <input name="name" placeholder="Nama Kontak" maxlength="60" required />
        <div class="wa-addrow"><input name="phone" placeholder="Nomor WA (contoh: 0812…)" maxlength="20" inputmode="tel" required /><button class="wa-add" type="submit">Tambah</button></div>
        <div class="rem-err">${esc(w.cerr)}</div>
      </form>
      <hr class="wa-hr" />
      <h2 class="wa-h">👥 Daftar Kontak Tersimpan (${w.contacts.length})</h2>
      <div class="wa-contacts">${
        w.contacts.length
          ? w.contacts
              .map(
                (c) => `<div class="wa-contact${w.pick === c.id ? " picked" : ""}" data-s="wa-pick" data-id="${esc(c.id)}" tabindex="0" role="button" title="Pilih sebagai penerima">
                  <span class="wa-ava">${esc((c.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2) || "?").toUpperCase())}</span>
                  <span class="wa-cinfo"><b>${esc(c.name)}</b><small>${c.phone ? esc(showPhone(c.phone)) : "Tanpa nomor"}</small></span>
                  <button type="button" class="icon-btn" data-s="wa-del" data-id="${esc(c.id)}" title="Hapus kontak" aria-label="Hapus kontak"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`
              )
              .join("")
          : '<div class="mod-note">Belum ada kontak tersimpan.</div>'
      }</div>`;
  }

  function renderSug() {
    const box = document.getElementById("waSug");
    if (!box) return;
    const q = S.wa.to.trim().toLowerCase();
    const hits = S.wa.contacts.filter((c) => !S.wa.pick && c.phone && (!q || c.name.toLowerCase().includes(q) || showPhone(c.phone).includes(q.replace(/\D/g, "") || "\u0000"))).slice(0, 6);
    box.classList.toggle("hidden", !(S.wa.sug && hits.length));
    box.innerHTML = hits.map((c) => `<button type="button" data-s="wa-sug-pick" data-id="${esc(c.id)}"><b>${esc(c.name)}</b><small>${esc(showPhone(c.phone))}</small></button>`).join("");
  }

  function pickContact(id) {
    const c = waContact(id);
    if (!c) return;
    S.wa.pick = id;
    S.wa.to = c.phone ? `${c.name} · ${showPhone(c.phone)}` : c.name;
    S.wa.sug = false;
    const inp = document.getElementById("waTo");
    if (inp) inp.value = S.wa.to;
    renderSug();
    renderWaRight();
  }

  async function sendWa() {
    const w = S.wa;
    const err = (t) => {
      w.err = t;
      const e = document.getElementById("waErr");
      if (e) e.textContent = t;
    };
    err("");
    let phone = "";
    if (w.pick) {
      phone = (waContact(w.pick) || {}).phone || "";
      if (!phone) return err("Kontak ini belum punya nomor WhatsApp.");
    } else phone = normalizePhone(w.to);
    if (!phone) return err("Isi nomor WhatsApp yang valid (mis. 08123456789) atau pilih dari daftar kontak.");
    const msg = w.msg.trim();
    if (!msg) return err("Isi pesan dulu.");
    let win = null;
    if (w.loc) {
      win = window.open("", "_blank"); // dibuka sekarang (saat klik) agar tidak diblokir pop-up, diarahkan setelah lokasi didapat
      if (win) win.opener = null;
      w.busy = true;
      document.querySelector(".wa-send") && (document.querySelector(".wa-send").disabled = true);
    }
    let text = msg;
    if (w.loc) {
      const pos = await getPosition();
      if (pos) text += `\n📍 ${mapLink(pos.lat, pos.lng)}`;
      else App.toast("Lokasi tidak tersedia. Pesan disiapkan tanpa lokasi.");
      w.busy = false;
      const b = document.querySelector(".wa-send");
      if (b) b.disabled = false;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    if (win) win.location.href = url;
    else if (!window.open(url, "_blank", "noopener,noreferrer")) err("Browser memblokir pop-up. Izinkan pop-up untuk situs ini lalu coba lagi.");
  }

  async function addWaContact(form) {
    const f = form.elements;
    const w = S.wa;
    w.cerr = "";
    const phone = normalizePhone(f.phone.value);
    if (!phone) {
      w.cerr = "Nomor tidak valid. Contoh: 08123456789 atau +628123456789.";
      return renderWaRight();
    }
    const { data, error } = await sb().from("contacts").insert({ name: f.name.value.trim(), phone }).select().single();
    if (error) {
      w.cerr = !navigator.onLine ? "Sambungkan ke internet untuk menyimpan." : error.message;
      return renderWaRight();
    }
    w.contacts.push(data);
    w.contacts.sort((a, b) => a.name.localeCompare(b.name, "id"));
    renderWaRight();
    App.toast("Kontak disimpan");
  }

  async function deleteWaContact(id) {
    const c = waContact(id);
    if (!c || !confirm(`Hapus kontak “${c.name}”?`)) return;
    const { error } = await sb().from("contacts").delete().eq("id", id);
    if (error) return App.toast(error.message);
    S.wa.contacts = S.wa.contacts.filter((x) => x.id !== id);
    if (S.wa.pick === id) {
      S.wa.pick = null;
      S.wa.to = "";
      const inp = document.getElementById("waTo");
      if (inp) inp.value = "";
    }
    renderWaRight();
  }

  function getPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 30_000 }
      );
    });
  }

  async function sendSos(form) {
    const rooms = [...(S.sos.sel || S.rooms.filter((r) => r.kind === "group").map((r) => r.id))].filter((id) => S.joined.has(id));
    const msg = form.elements.msg.value.trim() || "Saya butuh bantuan!";
    S.sos.msg = msg;
    S.sos.loc = form.elements.loc.checked;
    if (!rooms.length) {
      S.sos.note = "Pilih minimal satu grup.";
      return renderSosBox();
    }
    if (!confirm(`Kirim PESAN DARURAT ke ${rooms.length} grup sekarang?`)) return;
    S.sos.busy = true;
    S.sos.note = S.sos.loc ? "Mengambil lokasi…" : "";
    renderSosBox();
    let pos = null;
    if (S.sos.loc) {
      pos = await getPosition();
      if (!pos) App.toast("Lokasi tidak tersedia. Pesan dikirim tanpa lokasi.");
    }
    let sent = 0;
    const failed = [];
    for (const id of rooms) {
      try {
        const row = one(await rpc("send_chat_message", { p_room: id, p_body: msg, p_kind: "emergency", p_lat: pos ? pos.lat : null, p_lng: pos ? pos.lng : null }));
        if (row && !S.emergencies.some((m) => m.id === row.id)) S.emergencies.unshift(row);
        if (row) S.last.set(id, row);
        sent++;
      } catch (err) {
        failed.push(`${(roomById(id) || {}).name || "grup"}: ${err.message}`);
      }
    }
    S.sos.busy = false;
    S.sos.note = failed.length ? "Gagal: " + failed.join("; ") : "";
    App.toast(sent ? `Pesan darurat terkirim ke ${sent} grup` : "Pesan darurat gagal terkirim");
    renderSosBox();
  }

  // Dialog alarm untuk penerima pesan darurat (realtime).
  let dlg = null;
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "dialog dialog-sm alarm-dialog";
    dlg.innerHTML = `<div class="dialog-head"><h2>🚨 Pesan darurat</h2></div><div class="dialog-body"><div class="alarm-list" id="sosAlerts"></div><div class="set-row"><button class="btn-secondary" data-sos="close" type="button">Tutup</button></div></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sos]");
      if (!b) return;
      if (b.dataset.sos === "open") {
        const m = S.alerts.find((a) => String(a.id) === b.dataset.id);
        closeAlert();
        if (m) {
          const r = roomById(m.room_id);
          S.chatKind = "group";
          App.setView("chat");
          if (r) openRoom(r.id);
        }
      } else closeAlert();
    });
    dlg.addEventListener("close", () => App.sound.stop());
    return dlg;
  }

  function alertEmergency(row) {
    if (S.alerts.some((a) => a.id === row.id)) return;
    S.alerts.unshift(row);
    const d = ensureDialog();
    d.querySelector("#sosAlerts").innerHTML = S.alerts
      .map((m) => {
        const room = roomById(m.room_id);
        const link = m.lat != null ? mapLink(m.lat, m.lng) : "";
        return `<div class="alarm-item"><h4>${esc(m.sender_name)} butuh bantuan</h4>
          <small>${esc(room ? room.name : "grup")} · ${esc(hm(m.created_at))}</small>
          <p style="margin:8px 0 0;white-space:pre-wrap">${esc(m.body)}</p>
          <div class="alarm-acts"><button class="btn-primary" data-sos="open" data-id="${m.id}" type="button">Buka grup</button>${link ? `<a class="btn-secondary" href="${esc(link)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;padding:6px 12px;font-size:13px">📍 Lihat lokasi</a>` : ""}</div></div>`;
      })
      .join("");
    if (!d.open) d.showModal();
    App.sound.start();
    App.notify(`🚨 ${row.sender_name} butuh bantuan`, row.body.slice(0, 120), "sos-" + row.room_id);
  }

  function closeAlert(silent) {
    S.alerts = [];
    if (dlg && dlg.open) dlg.close();
    if (!silent) App.sound.stop();
  }

  // ───────────────────────── event
  function onListClick(e) {
    if (!isMine()) return;
    const el = e.target.closest("[data-s]");
    if (!el) return;
    const act = el.dataset.s;
    if (act === "wa-del") return void deleteWaContact(el.dataset.id);
    if (act === "wa-pick") return void pickContact(el.dataset.id);
    if (act === "wa-tpl") {
      S.wa.msg = TEMPLATES[Number(el.dataset.i)] || "";
      const ta = document.getElementById("waMsg");
      if (ta) ta.value = S.wa.msg;
      return;
    }
    if (act === "open") {
      const r = roomById(el.dataset.id);
      if (!r) return;
      if (!S.joined.has(r.id)) return void joinPublic(r.id);
      openRoom(r.id);
    } else if (act === "new") {
      S.form = kindOf(App.view());
      renderList();
    } else if (act === "join-form") {
      S.form = "join";
      renderList();
    } else if (act === "rename") {
      S.form = "name";
      renderList();
    } else if (act === "cancel-form") {
      S.form = null;
      renderList();
    } else if (act === "goto-groups") {
      S.chatKind = "group";
      App.setView("chat");
    } else if (act === "kind") {
      S.chatKind = el.dataset.kind === "group" ? "group" : "room";
      S.active = null;
      S.form = null;
      stopPoll();
      App.setMainOpen(false);
      render();
      autoOpen();
    }
  }

  function onPaneClick(e) {
    if (!isMine()) return;
    const el = e.target.closest("[data-s]");
    if (!el) return;
    const act = el.dataset.s;
    if (act === "back") {
      S.active = null;
      stopPoll();
      App.setMainOpen(false);
      render();
    } else if (act === "hero-new") {
      S.form = kindOf(App.view());
      renderList();
      const i = App.list.querySelector('[data-s="create-form"] input[name="name"]');
      if (i) i.focus();
    } else if (act === "older") olderMsgs();
    else if (act === "del") deleteMsg(Number(el.dataset.id));
    else if (act === "copy") copyMsg(Number(el.dataset.id));
    else if (act === "reserv") App.setView("booking");
    else if (act === "down") {
      const box = document.getElementById("chatMsgs");
      if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    } else if (act === "attr-panel") {
      S.panel = !S.panel;
      renderPanel();
    } else if (act === "panel-close") {
      S.panel = false;
      renderPanel();
    } else if (act === "fchip") {
      S.filter.attr = el.dataset.name || null;
      renderFilter();
      paintMsgs(true);
    } else if (act === "cattr") {
      const same = S.compose.attr === el.dataset.name;
      S.compose.attr = same ? null : el.dataset.name;
      S.compose.opt = null;
      renderAttrChips();
    } else if (act === "copt") {
      S.compose.opt = S.compose.opt === el.dataset.opt ? null : el.dataset.opt;
      renderAttrChips();
    } else if (act === "wa-send") {
      S.compose.noWa = !el.checked;
    } else if (act === "wa-all") {
      el.closest("form").querySelectorAll('input[name="a"]').forEach((i) => (i.disabled = el.checked));
    } else if (act === "wa-test" || act === "wa-clear") {
      waAction(act.slice(3), el.closest("form"));
    } else if (act === "pick-img") {
      const f = document.getElementById("crFile");
      if (f) f.click();
    } else if (act === "rm-img") {
      S.compose.file = null;
      renderFileInfo();
    } else if (/^attr-(opts|rename|del)$/.test(act)) {
      const row = el.closest("[data-id]");
      if (row) attrAction(act.slice(5), row.dataset.id);
    }
    else if (act === "members") toggleMembers();
    else if (act === "leave") leaveRoom();
    else if (act === "invite") {
      const code = S.active && S.active.invite_code;
      if (code) {
        (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(
          () => App.toast("Kode undangan disalin: " + code),
          () => App.toast("Kode undangan: " + code)
        );
      }
    } else if (act === "to-sos") {
      if (S.active) S.sos.sel = new Set([S.active.id]);
      App.setView("emergency");
    }
  }

  function onSubmit(e) {
    const form = e.target.closest("[data-s]");
    if (!form || !isMine()) return;
    e.preventDefault();
    const k = form.dataset.s;
    if (k === "wa-form") sendWa();
    else if (k === "wa-cfg-form") waAction("save", form);
    else if (k === "attr-form") attrAction("add", null, form);
    else if (k === "wa-contact-form") addWaContact(form);
    else if (k === "send-form") sendMsg(form);
    else if (k === "sos-form") sendSos(form);
    else if (/-form$/.test(k)) submitForm(form);
  }

  function onChange(e) {
    const cb = e.target.closest('[data-s="sos-group"]');
    if (!cb || !isMine()) return;
    if (!S.sos.sel) S.sos.sel = new Set(S.rooms.filter((r) => r.kind === "group" && S.joined.has(r.id)).map((r) => r.id));
    cb.checked ? S.sos.sel.add(cb.value) : S.sos.sel.delete(cb.value);
  }

  function onKeydown(e) {
    const ta = e.target.closest && e.target.closest(".cr-compose textarea");
    if (!ta) return;
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ta.form.requestSubmit();
    }
  }
  function onInput(e) {
    const ta = e.target.closest && e.target.closest(".cr-compose textarea");
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }

  [App.list, App.pane].forEach((box) => {
    box.addEventListener("submit", onSubmit);
    box.addEventListener("change", onChange);
  });
  App.list.addEventListener("click", onListClick);
  // pilihan kontak di kolom penerima: mousedown agar terpilih sebelum kolom kehilangan fokus
  App.list.addEventListener("mousedown", (e) => {
    const b = e.target.closest('[data-s="wa-sug-pick"]');
    if (!b || !isMine()) return;
    e.preventDefault();
    pickContact(b.dataset.id);
  });
  App.list.addEventListener("input", (e) => {
    if (!isMine()) return;
    if (e.target.id === "waTo") {
      S.wa.to = e.target.value;
      S.wa.pick = null;
      S.wa.sug = true;
      renderSug();
    } else if (e.target.id === "waMsg") S.wa.msg = e.target.value;
    else if (e.target.dataset.s === "wa-loc") S.wa.loc = e.target.checked;
  });
  App.list.addEventListener("focusin", (e) => {
    if (isMine() && e.target.id === "waTo") {
      S.wa.sug = true;
      renderSug();
    }
  });
  App.list.addEventListener("focusout", (e) => {
    if (isMine() && e.target.id === "waTo")
      setTimeout(() => {
        S.wa.sug = false;
        renderSug();
      }, 120);
  });
  App.list.addEventListener("toggle", (e) => {
    if (e.target.id === "sosDetails") S.sosOpen = e.target.open;
  }, true);
  App.pane.addEventListener("click", onPaneClick);
  App.pane.addEventListener("keydown", onKeydown);
  App.pane.addEventListener("input", (e) => {
    if (!isMine()) return;
    if (e.target.dataset.s === "fsearch") {
      S.filter.q = e.target.value;
      paintMsgs(true);
    } else if (e.target.dataset.s === "psearch") {
      S.panelQ = e.target.value;
      const pos = e.target.selectionStart;
      renderPanel();
      const i = document.querySelector('[data-s="psearch"]');
      if (i) (i.focus(), i.setSelectionRange(pos, pos));
    }
  });
  const keepWaDraft = (e) => {
    if (isMine() && e.target.dataset && e.target.dataset.w) S.waDraft = readWaForm(e.target.closest("form"));
  };
  App.pane.addEventListener("input", keepWaDraft);
  App.pane.addEventListener("change", keepWaDraft);
  App.pane.addEventListener("change", (e) => {
    if (!isMine() || e.target.id !== "crFile") return;
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!IMG_TYPES[f.type]) return App.toast("Format tidak didukung. Gunakan PNG, JPG, GIF, atau WebP.");
    S.compose.file = f;
    renderFileInfo();
  });
  App.pane.addEventListener("input", onInput);
  window.addEventListener("online", () => S.avail && App.user && refreshAll().then(() => isMine() && repaint()).catch(() => {}));

  App.register(VIEWS, { enter, leave, onLogin, onLogout });
})();
