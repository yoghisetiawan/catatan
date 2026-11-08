// Chat Room, Pesan Grup, dan Pesan Darurat.
// Semua perubahan data lewat fungsi database (RPC) yang memeriksa aturan; lihat supabase/migrations/004_*.sql.
(() => {
  "use strict";
  const App = window.CatatanApp;
  if (!App) return;
  const esc = App.escapeHtml;
  const VIEWS = ["chat", "groups", "emergency"];

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
    channel: null,
    poll: null,
    loadId: 0,
  };
  const sb = () => App.sb;
  const me = () => (App.user ? App.user.id : null);
  const readKey = () => `catatan.chat.read.${me()}`;
  const emKey = () => `catatan.chat.em.${me()}`;
  const isMine = () => VIEWS.includes(App.view());
  const kindOf = (view) => (view === "chat" ? "room" : "group");

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
    const { data, error } = await sb().from("chat_profiles").select("display_name").maybeSingle();
    if (id !== S.loadId) return;
    if (error) {
      S.avail = /^(42P01|PGRST205)$/.test(error.code || "") ? false : S.avail;
      if (S.avail === false && isMine()) render();
      return;
    }
    S.avail = true;
    S.profile = data;
    await refreshAll();
    if (id !== S.loadId) return;
    subscribe();
    if (isMine()) render();
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
    App.setCount("chat", room);
    App.setCount("groups", group);
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
    if (isMine() && !viewing) renderList();
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
    if (S.avail !== false && App.user && S.avail !== null) refreshAll().then(() => isMine() && renderList()).catch(() => {});
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
    if (S.avail === false) return void (box.innerHTML = migrationHint);
    if (S.avail === null) return void (box.innerHTML = '<div class="mod-note">Memuat…</div>');
    if (view === "emergency") return renderEmergency(box);

    const kind = kindOf(view);
    let html = "";
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
    if (S.avail === false) return void (pane.innerHTML = `<div class="mod-empty">${migrationHint}</div>`);
    if (view === "emergency") {
      pane.innerHTML = `<div class="mod-empty"><h3>🚨 Pesan darurat</h3><p>Kirim pesan berprioritas ke grup keluarga atau timmu. Anggota yang sedang membuka Catatan mendengar alarm dan melihat lokasimu (bila kamu izinkan).</p><p>Untuk keadaan darurat yang mengancam nyawa, hubungi <b>112</b> lebih dulu.</p></div>`;
      return;
    }
    if (!S.active) {
      pane.innerHTML = `<div class="mod-empty"><h3>${view === "chat" ? "Chat room" : "Pesan grup"}</h3><p>${
        view === "chat" ? "Pilih ruang di sebelah kiri, atau buat ruang baru untuk ngobrol dengan pengguna Catatan lainnya." : "Pilih grup di sebelah kiri. Grup bersifat privat: hanya anggota yang bisa membaca pesannya."
      }</p></div>`;
      App.setMainOpen(false);
      return;
    }
    renderConversation();
  }

  // ───────────────────────── percakapan
  function msgHtml(m, prev) {
    const mine = m.user_id === me();
    const owner = S.active && S.roles.get(S.active.id) === "owner";
    const day = !prev || dayKey(prev.created_at) !== dayKey(m.created_at) ? `<div class="chat-day">${esc(dayLabel(m.created_at))}</div>` : "";
    const link = m.kind === "emergency" && m.lat != null ? mapLink(m.lat, m.lng) : "";
    return `${day}<div class="msg${mine ? " me" : ""}${m.kind === "emergency" ? " emergency" : ""}" data-mid="${m.id}">
      ${mine ? "" : `<span class="who">${esc(m.sender_name)}</span>`}
      <div class="bubble">${m.kind === "emergency" ? "🚨 <b>DARURAT</b>\n" : ""}${esc(m.body)}${link ? `\n<a class="loc" href="${esc(link)}" target="_blank" rel="noopener noreferrer">📍 Lihat lokasi di peta</a>` : ""}</div>
      <span class="when">${hm(m.created_at)}${mine || owner ? `<button data-s="del" data-id="${m.id}" title="Hapus pesan">hapus</button>` : ""}</span></div>`;
  }

  function renderConversation() {
    const r = S.active;
    const pane = App.pane;
    const owner = S.roles.get(r.id) === "owner";
    const grp = r.kind === "group";
    pane.innerHTML = `
      <div class="mod-head">
        <button class="icon-btn back-btn" data-s="back" title="Kembali"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="titles"><h3>${esc(r.name)}</h3><small>${S.counts.get(r.id) || 1} anggota${r.description ? " · " + esc(r.description) : ""}</small></div>
        ${grp ? `<button class="mini-btn" data-s="invite" title="Salin kode undangan">Kode: ${esc(r.invite_code || "")}</button>` : ""}
        ${grp ? '<button class="mini-btn danger" data-s="to-sos" title="Kirim pesan darurat ke grup ini">🚨</button>' : ""}
        <button class="mini-btn" data-s="members">Anggota</button>
        <button class="mini-btn danger" data-s="leave">${owner ? "Hapus" : "Keluar"}</button>
      </div>
      <div class="mod-body" style="flex:0;display:${S.members ? "flex" : "none"};padding-top:10px;padding-bottom:10px" id="chatMembers">${membersHtml()}</div>
      <div class="chat-msgs" id="chatMsgs"></div>
      <form class="chat-compose" data-s="send-form">
        <textarea name="body" rows="1" maxlength="1000" placeholder="Tulis pesan…" title="Enter untuk kirim, Shift+Enter untuk baris baru"></textarea>
        <button class="btn-primary" type="submit">Kirim</button>
      </form>`;
    paintMsgs(true);
    App.setMainOpen(true);
  }

  function membersHtml() {
    if (!S.members) return "";
    return `<div class="mod-line">${S.members.map((m) => `<span class="badge${m.role === "owner" ? " ok" : ""}">${esc(m.display_name)}${m.is_me ? " (aku)" : ""}${m.role === "owner" ? " · pemilik" : ""}</span>`).join("")}</div>`;
  }

  function paintMsgs(toBottom) {
    const box = document.getElementById("chatMsgs");
    if (!box) return;
    const prevH = box.scrollHeight;
    const prevTop = box.scrollTop;
    box.innerHTML =
      (S.hasMore ? '<button class="chat-more" data-s="older">Muat pesan lebih lama</button>' : "") +
      (S.msgs.length ? S.msgs.map((m, i) => msgHtml(m, S.msgs[i - 1])).join("") : '<div class="mod-note" style="text-align:center">Belum ada pesan. Mulai percakapan!</div>');
    box.scrollTop = toBottom ? box.scrollHeight : box.scrollHeight - prevH + prevTop;
  }

  function appendMsg(row) {
    if (S.msgs.some((m) => m.id === row.id)) return;
    S.msgs.push(row);
    S.newest = Math.max(S.newest, row.id);
    const box = document.getElementById("chatMsgs");
    if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120 || row.user_id === me();
    const empty = box.querySelector(".mod-note");
    if (empty) empty.remove();
    box.insertAdjacentHTML("beforeend", msgHtml(row, S.msgs[S.msgs.length - 2]));
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
    renderList();
    renderPane();
    const { data, error } = await sb().from("chat_messages").select("*").eq("room_id", id).order("id", { ascending: false }).limit(50);
    if (!S.active || S.active.id !== id) return;
    if (error) return App.toast("Gagal memuat pesan: " + error.message);
    S.msgs = (data || []).reverse();
    S.hasMore = (data || []).length === 50;
    S.oldest = S.msgs.length ? S.msgs[0].id : 0;
    S.newest = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
    paintMsgs(true);
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

  async function sendMsg(form) {
    const ta = form.elements.body;
    const body = ta.value.trim();
    if (!body || !S.active) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const row = one(await rpc("send_chat_message", { p_room: S.active.id, p_body: body }));
      ta.value = "";
      ta.style.height = "";
      if (row) {
        const prev = S.last.get(row.room_id);
        if (!prev || row.id > prev.id) S.last.set(row.room_id, row);
        appendMsg(row);
        markRead(row.room_id, row.id);
      }
    } catch (err) {
      App.toast(err.message);
    } finally {
      btn.disabled = false;
      ta.focus();
    }
  }

  async function deleteMsg(id) {
    try {
      await rpc("delete_chat_message", { p_id: id });
      S.msgs = S.msgs.filter((m) => m.id !== id);
      S.emergencies = S.emergencies.filter((m) => m.id !== id);
      const el = document.querySelector(`[data-mid="${id}"]`);
      if (el) el.remove();
      renderList();
    } catch (err) {
      App.toast(err.message);
    }
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
    const owner = S.roles.get(r.id) === "owner";
    const ok = confirm(owner ? `Kamu pemilik “${r.name}”. Menghapusnya juga menghapus semua pesan dan mengeluarkan semua anggota. Lanjutkan?` : `Keluar dari “${r.name}”?`);
    if (!ok) return;
    try {
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
  function renderEmergency(box) {
    let html = "";
    if (!S.profile || S.form === "name") html += nameForm();
    const groups = S.rooms.filter((r) => r.kind === "group" && S.joined.has(r.id));
    const picked = S.sos.sel || new Set(groups.map((g) => g.id)); // belum diubah pengguna = semua grup
    html += `<div class="mod-actions"><a class="btn-secondary" href="tel:112" style="text-decoration:none;display:inline-flex;align-items:center">📞 Telepon 112</a>${S.profile ? `<button class="mini-btn" data-s="rename">Aku: ${esc(S.profile.display_name)}</button>` : ""}</div>`;
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
      return renderList();
    }
    if (!confirm(`Kirim PESAN DARURAT ke ${rooms.length} grup sekarang?`)) return;
    S.sos.busy = true;
    S.sos.note = S.sos.loc ? "Mengambil lokasi…" : "";
    renderList();
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
    renderList();
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
          App.setView("groups");
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
      App.setView("groups");
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
    } else if (act === "older") olderMsgs();
    else if (act === "del") deleteMsg(Number(el.dataset.id));
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
    if (k === "send-form") sendMsg(form);
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
    const ta = e.target.closest && e.target.closest(".chat-compose textarea");
    if (!ta) return;
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ta.form.requestSubmit();
    }
  }
  function onInput(e) {
    const ta = e.target.closest && e.target.closest(".chat-compose textarea");
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }

  [App.list, App.pane].forEach((box) => {
    box.addEventListener("submit", onSubmit);
    box.addEventListener("change", onChange);
  });
  App.list.addEventListener("click", onListClick);
  App.pane.addEventListener("click", onPaneClick);
  App.pane.addEventListener("keydown", onKeydown);
  App.pane.addEventListener("input", onInput);
  window.addEventListener("online", () => S.avail && App.user && refreshAll().then(() => isMine() && renderList()).catch(() => {}));

  App.register(VIEWS, { enter, leave, onLogin, onLogout });
})();
