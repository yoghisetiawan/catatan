(() => {
  "use strict";

  const LEGACY_KEY = "catatan.notes.v1"; // catatan lama dari versi tanpa login
  const PREFS_KEY = "catatan.prefs.v1";
  const COLORS = ["", "#f2a541", "#e5604d", "#e06aa8", "#8b6cf0", "#4a9ff5", "#3cb88a"];

  const $ = (sel) => document.querySelector(sel);
  const el = {
    app: $("#app"),
    newNoteBtn: $("#newNoteBtn"),
    emptyNewBtn: $("#emptyNewBtn"),
    nav: document.querySelectorAll(".nav-item"),
    tagList: $("#tagList"),
    themeBtn: $("#themeBtn"),
    exportBtn: $("#exportBtn"),
    importBtn: $("#importBtn"),
    importInput: $("#importInput"),
    searchInput: $("#searchInput"),
    sortSelect: $("#sortSelect"),
    listTitle: $("#listTitle"),
    noteList: $("#noteList"),
    emptyState: $("#emptyState"),
    editor: $("#editor"),
    backBtn: $("#backBtn"),
    saveStatus: $("#saveStatus"),
    modeSeg: $("#modeSeg"),
    colorPicker: $("#colorPicker"),
    pinBtn: $("#pinBtn"),
    restoreBtn: $("#restoreBtn"),
    deleteBtn: $("#deleteBtn"),
    titleInput: $("#titleInput"),
    tagChips: $("#tagChips"),
    tagInput: $("#tagInput"),
    contentInput: $("#contentInput"),
    preview: $("#preview"),
    wordCount: $("#wordCount"),
    dateInfo: $("#dateInfo"),
    toast: $("#toast"),
    auth: $("#auth"),
    authTitle: $("#authTitle"),
    authSub: $("#authSub"),
    authSeg: $("#authSeg"),
    authForm: $("#authForm"),
    authEmail: $("#authEmail"),
    authPassword: $("#authPassword"),
    authError: $("#authError"),
    authInfo: $("#authInfo"),
    authSetup: $("#authSetup"),
    emailField: $("#emailField"),
    pwField: $("#pwField"),
    forgotBtn: $("#forgotBtn"),
    emailToggle: $("#emailToggle"),
    backToLoginBtn: $("#backToLoginBtn"),
    authSubmit: $("#authSubmit"),
    pwToggle: $("#pwToggle"),
    pwHint: $("#pwHint"),
    userAvatar: $("#userAvatar"),
    userEmail: $("#userEmail"),
    logoutBtn: $("#logoutBtn"),
    oauthBox: $("#oauthBox"),
    settingsBtn: $("#settingsBtn"),
    trashBar: $("#trashBar"),
    emptyTrashBtn: $("#emptyTrashBtn"),
    moreBtn: $("#moreBtn"),
    moreMenu: $("#moreMenu"),
    formatBar: $("#formatBar"),
    imageInput: $("#imageInput"),
    sharedView: $("#sharedView"),
    sharedMeta: $("#sharedMeta"),
    sharedTitle: $("#sharedTitle"),
    sharedContent: $("#sharedContent"),
    settingsDialog: $("#settingsDialog"),
    setAvatar: $("#setAvatar"),
    setEmail: $("#setEmail"),
    setProvider: $("#setProvider"),
    pwForm: $("#pwForm"),
    newPassword: $("#newPassword"),
    emailForm: $("#emailForm"),
    newEmail: $("#newEmail"),
    setExportBtn: $("#setExportBtn"),
    setImportBtn: $("#setImportBtn"),
    deleteAccountForm: $("#deleteAccountForm"),
    deleteConfirm: $("#deleteConfirm"),
    settingsMsg: $("#settingsMsg"),
    setLogoutBtn: $("#setLogoutBtn"),
    shareDialog: $("#shareDialog"),
    shareDesc: $("#shareDesc"),
    shareLinkBox: $("#shareLinkBox"),
    shareLink: $("#shareLink"),
    copyShareBtn: $("#copyShareBtn"),
    shareToggleBtn: $("#shareToggleBtn"),
    historyDialog: $("#historyDialog"),
    historyList: $("#historyList"),
    historyInfo: $("#historyInfo"),
    restoreVersionBtn: $("#restoreVersionBtn"),
    historyTitle: $("#historyTitle"),
    historyContent: $("#historyContent"),
    printArea: $("#printArea"),
    exportDialog: $("#exportDialog"),
    exportGrid: $("#exportGrid"),
    exportImages: $("#exportImages"),
    exportMsg: $("#exportMsg"),
    setExportXlsxBtn: $("#setExportXlsxBtn"),
    recNoteBtn: $("#recNoteBtn"),
    folderTree: $("#folderTree"),
    addFolderBtn: $("#addFolderBtn"),
    folderFilter: $("#folderFilter"),
    folderPick: $("#folderPick"),
    folderSelect: $("#folderSelect"),
    calendar: $("#calendar"),
    remindBtn: $("#remindBtn"),
    remindDialog: $("#remindDialog"),
    remindNoteTitle: $("#remindNoteTitle"),
    remindInput: $("#remindInput"),
    remindQuick: $("#remindQuick"),
    remindMsg: $("#remindMsg"),
    remindSaveBtn: $("#remindSaveBtn"),
    remindClearBtn: $("#remindClearBtn"),
    alarmDialog: $("#alarmDialog"),
    alarmList: $("#alarmList"),
    alarmMuteBtn: $("#alarmMuteBtn"),
    recBar: $("#recBar"),
    recText: $("#recText"),
    recStopBtn: $("#recStopBtn"),
    installBar: $("#installBar"),
    installText: $("#installText"),
    installBtn: $("#installBtn"),
    installLater: $("#installLater"),
    installSection: $("#installSection"),
    setInstallBtn: $("#setInstallBtn"),
    newsBar: $("#newsBar"),
    newsSource: $("#newsSource"),
    newsStatus: $("#newsStatus"),
    newsRefresh: $("#newsRefresh"),
    fabMic: $("#fabMic"),
    recAi: $("#recAi"),
    aiVoiceSet: $("#aiVoiceSet"),
    aiDialog: $("#aiDialog"),
    aiScope: $("#aiScope"),
    aiOrig: $("#aiOrig"),
    aiResult: $("#aiResult"),
    aiMsg: $("#aiMsg"),
    aiReplace: $("#aiReplace"),
    aiInsert: $("#aiInsert"),
    aiCopy: $("#aiCopy"),
    aiRetry: $("#aiRetry"),
    editToggleBtn: $("#editToggleBtn"),
    voiceNoteBtn: $("#voiceNoteBtn"),
    origAcc: $("#origAcc"),
    origText: $("#origText"),
    taskAcc: $("#taskAcc"),
    taskBody: $("#taskBody"),
    taskSummary: $("#taskSummary"),
    folderAll: $("#folderAll"),
    fabSection: $("#fabSection"),
    fabShow: $("#fabShow"),
    fabReset: $("#fabReset"),
    emptyRecBtn: $("#emptyRecBtn"),
    copyBtn: $("#copyBtn"),
    moveBtn: $("#moveBtn"),
    focusBtn: $("#focusBtn"),
    moveDialog: $("#moveDialog"),
    moveList: $("#moveList"),
    moveNoteTitle: $("#moveNoteTitle"),
    mergeToggle: $("#mergeToggle"),
    mergeBar: $("#mergeBar"),
    mergeCount: $("#mergeCount"),
    mergeDoBtn: $("#mergeDoBtn"),
    mergeCancelBtn: $("#mergeCancelBtn"),
    folderHead: $("#folderHead"),
    modList: $("#modList"),
    modPane: $("#modPane"),
  };

  // Tampilan yang dikelola modul terpisah (social.js, booking.js): chat, grup, darurat, reservasi.
  const MOD_VIEWS = { reminders: "Pengingat & alarm", emergency: "Pesan darurat", groups: "Pesan grup", chat: "Chat room", booking: "Reservasi meja" };
  let remExtra = 0; // jumlah pengingat mandiri aktif (dari reminders.js), ditambahkan ke lencana menu
  const isModView = () => Object.prototype.hasOwnProperty.call(MOD_VIEWS, state.view);

  // ---------- Tanggal & folder (fungsi kecil, dipakai di banyak tempat) ----------
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function ymd(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function parseYmd(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const FOLDER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const FOLDER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PENDING_VENUE_KEY = "catatan.pendingVenue";
  const MAX_FOLDER_DEPTH = 5;

  // ---------- State ----------
  let notes = [];
  const prefs = Object.assign({ theme: null, sort: "updated", collapsed: [], installDismissed: 0, foldersHidden: false, fab: null, fabHidden: false, aiOk: false, aiVoice: false }, load(PREFS_KEY, {}));
  if (!Array.isArray(prefs.collapsed)) prefs.collapsed = [];
  const state = {
    view: "all", activeId: null, query: "", mode: "edit",
    user: null, session: null, authMode: "login", recovering: false,
    emailOpen: false, // form email dibuka lewat tautan (mode Google saja)
    features: { v2: false, v3: false, v10: false }, // v2 = migrasi 002 (gambar, berbagi, riwayat); v3 = migrasi 003 (folder, pengingat)
    calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    calDay: ymd(Date.now()),
    offline: !navigator.onLine,
    oauthAvailable: false,
    shownId: null, // catatan yang terakhir digambar di editor (untuk memilih mode baca/tulis)
    forceEdit: null, // id catatan baru: dibuka langsung dalam mode tulis
  };
  const dirty = new Set(); // catatan yang berubah dan belum terkirim
  const inflight = new Set(); // sedang dikirim
  const pendingDeletes = new Set(); // dihapus permanen, menunggu dikirim
  let folders = []; // pohon folder: [{ id, name, parent }]
  let foldersDirty = false; // perubahan folder belum terkirim
  let foldersAt = 0;
  let saveTimer = null;
  let flushing = null;
  let realtimeChannel = null;
  let realtimeReady = false;
  let refreshing = false;
  let lastFetchAt = 0;

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  // ---------- Supabase ----------
  const cfg = window.CATATAN_CONFIG || {};
  const SUPABASE_URL = String(cfg.supabaseUrl || "").trim().replace(/\/+$/, "");
  const SUPABASE_KEY = String(cfg.supabaseAnonKey || "").trim();
  let sb = null;

  function jwtRole(key) {
    try {
      return JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || null;
    } catch {
      return null;
    }
  }

  function configProblem() {
    if (!SUPABASE_URL || !SUPABASE_KEY)
      return "Supabase belum dikonfigurasi. Isi supabaseUrl dan supabaseAnonKey di public/config.js, lalu muat ulang halaman.";
    if (!/^https:\/\/[^\s/]+$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SUPABASE_URL))
      return "supabaseUrl di config.js tidak valid. Contoh: https://abcdefghijkl.supabase.co";
    if (SUPABASE_KEY.startsWith("sb_secret_") || jwtRole(SUPABASE_KEY) === "service_role")
      return "Kunci di config.js adalah kunci RAHASIA (service_role/secret). Ganti dengan kunci anon/publishable, lalu segera rotasi kunci rahasia itu di dashboard Supabase.";
    if (!window.supabase || !window.supabase.createClient)
      return "Pustaka Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang.";
    return null;
  }

  function dbError(error) {
    const err = new Error(error.message || "Kesalahan database");
    err.status = error.status;
    err.code = error.code || "";
    return err;
  }
  // Kesalahan data (mis. melanggar batasan tabel) tidak akan berhasil walau diulang.
  const isPermanentError = (err) => /^(22|23|42)/.test(err.code || "");

  const toRow = (n) => {
    const row = {
      user_id: state.user.id,
      id: n.id,
      title: String(n.title || "").slice(0, 140),
      content: String(n.content || ""),
      tags: (n.tags || []).slice(0, 20),
      color: COLORS.includes(n.color) ? n.color : "",
      pinned: !!n.pinned,
      trashed: !!n.trashed,
      created_at: Math.round(n.createdAt) || Date.now(),
      updated_at: Math.round(n.updatedAt) || Date.now(),
    };
    if (state.features.v2) {
      row.trashed_at = n.trashed ? Math.round(n.trashedAt || Date.now()) : null;
      row.share_id = n.shareId || null;
    }
    if (state.features.v10) row.voice_original = n.voiceOriginal ? String(n.voiceOriginal).slice(0, 20000) : null;
    if (state.features.v3) {
      row.folder_id = n.folderId && FOLDER_ID_RE.test(n.folderId) ? n.folderId : null;
      row.remind_at = n.remindAt && !n.trashed ? Math.round(n.remindAt) : null;
    }
    return row;
  };

  const fromRow = (r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    tags: r.tags || [],
    color: r.color || "",
    pinned: !!r.pinned,
    trashed: !!r.trashed,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    trashedAt: r.trashed_at == null ? null : Number(r.trashed_at),
    shareId: r.share_id || null,
    folderId: r.folder_id || null,
    remindAt: r.remind_at == null ? null : Number(r.remind_at),
    voiceOriginal: r.voice_original || null,
  });

  const isNetworkError = (err) =>
    !navigator.onLine || /failed to fetch|network|load failed|fetch failed/i.test((err && err.message) || "");

  // Cek apakah migrasi 002 sudah dijalankan (kolom baru ada).
  async function detectFeatures() {
    const { error } = await sb.from("notes").select("share_id,trashed_at").limit(1);
    if (!error) state.features.v2 = true;
    else if (/^(42703|PGRST204)$/.test(error.code || "")) state.features.v2 = false;
    // kesalahan lain (mis. offline): pakai nilai terakhir dari cache

    // Migrasi 003 (folder & pengingat): kolom baru di notes + tabel user_folders.
    const cols = await sb.from("notes").select("folder_id,remind_at").limit(1);
    if (cols.error) {
      if (/^(42703|PGRST204)$/.test(cols.error.code || "")) state.features.v3 = false;
      return;
    }
    const tbl = await sb.from("user_folders").select("user_id").limit(1);
    if (!tbl.error) state.features.v3 = true;
    else if (/^(42P01|PGRST205)$/.test(tbl.error.code || "")) state.features.v3 = false;
  }

  // Migrasi 010: kolom voice_original (teks asli rekaman) — dicek terpisah agar fitur lain tetap jalan tanpa migrasi itu.
  async function detectVoiceColumn() {
    const { error } = await sb.from("notes").select("voice_original").limit(1);
    if (!error) state.features.v10 = true;
    else if (/^(42703|PGRST204)$/.test(error.code || "")) state.features.v10 = false;
  }

  // Rapikan data folder dari server/cache: id valid, nama wajar, tanpa induk hilang atau lingkaran.
  function cleanFolders(tree) {
    if (!Array.isArray(tree)) return [];
    const seen = new Set();
    let list = [];
    for (const f of tree) {
      if (!f || typeof f !== "object" || !FOLDER_ID_RE.test(String(f.id || "")) || seen.has(f.id)) continue;
      const name = String(f.name || "").trim().slice(0, 60);
      if (!name) continue;
      seen.add(f.id);
      list.push({ id: String(f.id), name, parent: f.parent ? String(f.parent) : null });
    }
    list.forEach((f) => {
      if (f.parent && !seen.has(f.parent)) f.parent = null;
    });
    for (const f of list) {
      let cur = f;
      for (let i = 0; cur && i <= list.length; i++) cur = cur.parent ? list.find((x) => x.id === cur.parent) : null;
      if (cur) f.parent = null; // lingkaran: putus
    }
    return list.slice(0, 500);
  }

  async function fetchFolders() {
    if (!state.features.v3) return null;
    const { data, error } = await sb.from("user_folders").select("tree,updated_at").maybeSingle();
    if (error) throw dbError(error);
    return data ? { tree: data.tree, updatedAt: Number(data.updated_at) } : { tree: [], updatedAt: 0 };
  }

  async function saveFolders(snap) {
    const { error } = await sb
      .from("user_folders")
      .upsert({ user_id: state.user.id, tree: snap.tree, updated_at: snap.at }, { onConflict: "user_id" });
    if (error) throw dbError(error);
  }

  function mergeFolders(server) {
    if (!server || foldersDirty) return; // perubahan lokal yang belum terkirim menang
    folders = cleanFolders(server.tree);
    foldersAt = server.updatedAt;
  }

  async function fetchNotes() {
    const PAGE = 1000; // batas baris per permintaan di Supabase
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("notes")
        .select("*")
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw dbError(error);
      all.push(...data.map(fromRow));
      if (data.length < PAGE) return all;
    }
  }

  async function saveNotes(batch) {
    if (!batch.length) return;
    const { error } = await sb.from("notes").upsert(batch.map(toRow), { onConflict: "user_id,id" });
    if (error) throw dbError(error);
  }

  async function deleteNote(id) {
    const { error } = await sb.from("notes").delete().eq("user_id", state.user.id).eq("id", id);
    if (error) throw dbError(error);
  }

  function setStatus(kind) {
    const text = {
      saving: "Menyimpan…",
      saved: "Tersimpan otomatis",
      error: "Gagal menyimpan — mencoba lagi…",
      offline: "Offline — tersimpan di perangkat",
    }[kind];
    el.saveStatus.textContent = text;
    el.saveStatus.classList.toggle("saving", kind !== "saved");
  }

  // ---------- Cache lokal (mode offline) ----------
  const cacheKeyFor = (user) => `catatan.cache.${user.id}`;
  let cacheTimer = null;
  function saveCache(immediate = false) {
    if (!state.user) return;
    const user = state.user;
    clearTimeout(cacheTimer);
    const write = () => {
      if (state.user !== user) return;
      try {
        localStorage.setItem(
          cacheKeyFor(user),
          JSON.stringify({
            notes,
            dirty: [...dirty, ...inflight],
            deletes: [...pendingDeletes],
            folders,
            foldersDirty,
            foldersAt,
            features: state.features,
            savedAt: Date.now(),
          })
        );
      } catch {
        /* penyimpanan penuh: abaikan, data tetap ada di server */
      }
    };
    immediate ? write() : (cacheTimer = setTimeout(write, 400));
  }

  // Tandai catatan sebagai berubah; dikirim ke server secara berkelompok.
  function persist(note, immediate = false) {
    if (note) dirty.add(note.id);
    saveCache();
    clearTimeout(saveTimer);
    if (state.offline && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("saving");
    saveTimer = setTimeout(flush, immediate ? 0 : 600);
  }

  function flush() {
    if (flushing) return flushing.then(flush);
    if (!state.user) return Promise.resolve();
    if (!dirty.size && !pendingDeletes.size && !foldersDirty) {
      setStatus(state.offline ? "offline" : "saved");
      return Promise.resolve();
    }
    const sendFolders = foldersDirty && state.features.v3;
    const folderSnap = sendFolders ? { tree: folders.map((f) => ({ ...f })), at: foldersAt } : null;
    if (sendFolders) foldersDirty = false;
    const ids = [...dirty].slice(0, 500);
    ids.forEach((id) => {
      dirty.delete(id);
      inflight.add(id);
    });
    const dels = [...pendingDeletes];
    const batch = ids.map((id) => notes.find((n) => n.id === id)).filter(Boolean);
    flushing = (async () => {
      for (const id of dels) {
        await removeAttachments(id).catch(() => {});
        await deleteNote(id);
        pendingDeletes.delete(id);
      }
      await saveNotes(batch);
      if (folderSnap) await saveFolders(folderSnap);
    })()
      .then(() => {
        ids.forEach((id) => inflight.delete(id));
        state.offline = false;
        saveCache();
        setStatus(dirty.size || foldersDirty ? "saving" : "saved");
        if (dirty.size || foldersDirty) saveTimer = setTimeout(flush, 0);
      })
      .catch((err) => {
        ids.forEach((id) => inflight.delete(id));
        if (!state.user) return;
        if (isPermanentError(err)) {
          saveCache();
          setStatus("saved");
          toast("Gagal menyimpan: " + err.message);
          return;
        }
        ids.forEach((id) => dirty.add(id));
        if (sendFolders) foldersDirty = true;
        saveCache();
        state.offline = isNetworkError(err);
        setStatus(state.offline ? "offline" : "error");
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, state.offline ? 15000 : 5000);
      })
      .finally(() => {
        flushing = null;
      });
    return flushing;
  }

  // Gabungkan data server dengan perubahan lokal yang belum terkirim.
  function mergeServer(serverNotes) {
    const pending = new Set([...dirty, ...inflight]);
    const local = new Map(notes.map((n) => [n.id, n]));
    const merged = [];
    for (const s of serverNotes) {
      if (pendingDeletes.has(s.id)) continue;
      const l = local.get(s.id);
      if (l && pending.has(s.id) && l.updatedAt >= s.updatedAt) merged.push(l);
      else if (l) merged.push(Object.assign(l, s));
      else merged.push(s);
    }
    const ids = new Set(merged.map((n) => n.id));
    for (const l of notes) if (pending.has(l.id) && !ids.has(l.id)) merged.push(l);
    notes = merged;
    if (state.activeId && !notes.some((n) => n.id === state.activeId)) state.activeId = null;
  }

  async function refreshFromServer() {
    if (!state.user || refreshing) return;
    refreshing = true;
    const user = state.user;
    try {
      const server = await fetchNotes();
      const serverFolders = await fetchFolders();
      if (state.user !== user) return;
      lastFetchAt = Date.now();
      mergeServer(server);
      mergeFolders(serverFolders);
      state.offline = false;
      saveCache();
      render();
      if (!realtimeChannel) subscribeRealtime(); // mis. aplikasi dibuka saat offline
      purgeOldTrash();
      checkReminders();
      if (dirty.size || pendingDeletes.size || foldersDirty) persist(null, true);
      else setStatus("saved");
    } catch (err) {
      if (isNetworkError(err)) {
        state.offline = true;
        setStatus("offline");
      }
    } finally {
      refreshing = false;
    }
  }

  // ---------- Sinkron realtime ----------
  const sameNote = (a, b) =>
    a.title === b.title && a.content === b.content && a.color === b.color && a.pinned === b.pinned &&
    a.trashed === b.trashed && (a.shareId || null) === (b.shareId || null) &&
    (a.folderId || null) === (b.folderId || null) && (a.remindAt || null) === (b.remindAt || null) && (a.voiceOriginal || null) === (b.voiceOriginal || null) && a.tags.join("\u0000") === b.tags.join("\u0000");

  let remoteRenderTimer = null;
  function scheduleRemoteRender() {
    clearTimeout(remoteRenderTimer);
    remoteRenderTimer = setTimeout(() => {
      if (!state.user) return;
      if (state.activeId && !notes.some((n) => n.id === state.activeId)) state.activeId = null;
      renderList();
      renderEditor();
      saveCache();
      checkReminders();
    }, 120);
  }

  function onRemoteUpsert(payload) {
    if (!state.user || !payload.new || !payload.new.id) return;
    const r = fromRow(payload.new);
    if (dirty.has(r.id) || inflight.has(r.id) || pendingDeletes.has(r.id)) return; // perubahan lokal lebih baru
    const l = notes.find((n) => n.id === r.id);
    if (l) {
      if (r.updatedAt < l.updatedAt || (r.updatedAt === l.updatedAt && sameNote(l, r))) return;
      Object.assign(l, r);
    } else {
      notes.push(r);
    }
    scheduleRemoteRender();
  }

  // Catatan: peristiwa DELETE sengaja tidak dilangganan. Supabase tidak bisa menyaringnya per pengguna
  // dan tidak menerapkan RLS padanya, sehingga klien akan menerima ID catatan milik pengguna lain.
  // Penghapusan permanen dari perangkat lain terbawa lewat penyegaran berkala (refreshFromServer).
  function subscribeRealtime() {
    unsubscribeRealtime();
    const id = state.user.id;
    realtimeChannel = sb
      .channel(`notes-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes", filter: `user_id=eq.${id}` }, onRemoteUpsert)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notes", filter: `user_id=eq.${id}` }, onRemoteUpsert)
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // Tersambung ulang setelah terputus: ambil perubahan yang mungkin terlewat.
        if (realtimeReady) refreshFromServer();
        realtimeReady = true;
      });
  }

  function unsubscribeRealtime() {
    if (realtimeChannel && sb) sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
    realtimeReady = false;
  }

  const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function welcomeNote() {
    const now = Date.now();
    return {
      id: uid(),
      title: "Selamat datang di Catatan 👋",
      content: [
        "Aplikasi catatan yang ringan dan cepat. Semua catatan **tersimpan otomatis** di akunmu dan tersinkron ke semua perangkat — bahkan tetap bisa dipakai saat offline.",
        "",
        "## Yang bisa kamu lakukan",
        "- [x] Menulis catatan dengan *Markdown*",
        "- [ ] Menyematkan catatan penting",
        "- [ ] Memberi tag dan warna",
        "- [ ] Mencari catatan dengan cepat",
        "- [ ] Menempel gambar langsung ke catatan",
        "- [ ] Membagikan catatan lewat link (menu ⋯)",
        "- [ ] Mengekspor ke Word, PDF, Excel, atau PowerPoint (menu ⋯)",
        "",
        "## Pintasan keyboard",
        "- `N` — catatan baru",
        "- `⌘/Ctrl + K` — cari",
        "- `⌘/Ctrl + E` — ganti Tulis / Pratinjau",
        "- `⌘/Ctrl + B` / `⌘/Ctrl + I` — tebal / miring",
        "",
        "> Tip: buka **Pratinjau** dan klik kotak centang untuk menandai tugas selesai. Di HP, pasang aplikasi ini ke layar utama lewat menu browser → *Tambahkan ke Layar Utama*.",
      ].join("\n"),
      tags: ["mulai"],
      color: "#8b6cf0",
      pinned: true,
      trashed: false,
      createdAt: now,
      updatedAt: now,
      folderId: null,
      remindAt: null,
    };
  }

  const activeNote = () => notes.find((n) => n.id === state.activeId) || null;

  // ---------- Helpers ----------
  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function highlight(text, query) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const re = new RegExp(`(${escapeRegex(escapeHtml(query))})`, "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  function plainText(md) {
    return md
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
      .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
      .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/gm, " ")
      .replace(/\|/g, " ")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[gambar] ")
      .replace(/[*_~`]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function snippet(note, query) {
    const text = plainText(note.content);
    if (!text) return "<em>Tidak ada isi</em>";
    if (query) {
      const idx = text.toLowerCase().indexOf(query.toLowerCase());
      if (idx > 40) return "…" + highlight(text.slice(idx - 30, idx + 140), query);
    }
    return highlight(text.slice(0, 160), query);
  }

  const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
  function relativeTime(ts) {
    const diff = (ts - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 45) return "baru saja";
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
    return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }
  const fullDate = (ts) =>
    new Date(ts).toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // ---------- Markdown ----------
  // Parser ada di markdown.js (dipakai bersama oleh pratinjau dan ekspor).
  const renderMarkdown = (md) => CatatanMarkdown.render(md);

  // ---------- Filtering ----------
  function visibleNotes() {
    const q = state.query.trim().toLowerCase();
    const folderIds = state.view.startsWith("folder:") ? descendantIds(state.view.slice(7)) : null;
    let list = notes.filter((n) => {
      if (state.view === "trash") return n.trashed;
      if (n.trashed) return false;
      if (state.view === "pinned") return n.pinned;
      if (state.view === "news" || isModView()) return false;
      if (state.view === "calendar") return noteOnDay(n, state.calDay);
      if (folderIds) return !!n.folderId && folderIds.has(n.folderId);
      if (state.view.startsWith("tag:")) return n.tags.includes(state.view.slice(4));
      return true;
    });
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.includes(q))
      );
    }
    const sorters = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => (a.title || "").localeCompare(b.title || "", "id"),
    };
    return list.sort(sorters[prefs.sort] || sorters.updated);
  }

  const noteOnDay = (n, day) =>
    ymd(n.createdAt) === day || ymd(n.updatedAt) === day || (!!n.remindAt && ymd(n.remindAt) === day);

  function allTags() {
    const counts = {};
    notes.forEach((n) => !n.trashed && n.tags.forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], "id"));
  }

  // ---------- Rendering ----------
  const PIN_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

  const SHARE_BADGE =
    '<span class="share-badge" title="Dibagikan lewat link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>';

  const BELL_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  function formatRemind(ts) {
    const d = new Date(ts);
    const t = `${pad2(d.getHours())}.${pad2(d.getMinutes())}`;
    if (ymd(d) === ymd(Date.now())) return `Hari ini ${t}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (ymd(d) === ymd(tomorrow)) return `Besok ${t}`;
    return `${d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })} ${t}`;
  }

  const DOC_ICON =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>';
  const MIC_ICON =
    '<svg class="ico mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';
  const VOICE_TAG = "suara"; // ditambahkan otomatis ke catatan yang diisi lewat rekam suara
  const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';

  function cardDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  }

  // Judul kelompok daftar menurut tanggal (Hari ini, Kemarin, Minggu ini, Bulan ini, lalu per bulan).
  function dateGroup(ts) {
    const now = new Date();
    const d = new Date(ts);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 86_400_000;
    if (ts >= today) return "Hari ini";
    if (ts >= today - day) return "Kemarin";
    if (ts >= today - 6 * day) return "Minggu ini";
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return "Bulan ini";
    return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }

  function groupedCards(list, q) {
    if (q || prefs.sort === "title") return list.map((n) => cardHtml(n, q)).join("");
    const field = prefs.sort === "created" ? "createdAt" : "updatedAt";
    let last = "";
    return list
      .map((n) => {
        const g = dateGroup(n[field]);
        const head = g !== last ? `<div class="group-label">${escapeHtml(g)}</div>` : "";
        last = g;
        return head + cardHtml(n, q);
      })
      .join("");
  }

  function cardHtml(n, q) {
    const remind =
      n.remindAt && !n.trashed
        ? `<span class="remind-chip${n.remindAt <= Date.now() ? " late" : ""}" title="Pengingat">${BELL_SVG}${formatRemind(n.remindAt)}</span>`
        : "";
    const tags = n.tags.filter((t) => t !== VOICE_TAG).slice(0, 2).map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join("");
    const extra = remind + (n.shareId && !n.trashed ? SHARE_BADGE : "") + tags;
    return `
      <button class="note-card${n.id === state.activeId && !merge.on ? " active" : ""}${merge.on && merge.sel.has(n.id) ? " picked" : ""}" data-id="${n.id}" style="--note-color:${n.color || "transparent"}">
        ${merge.on ? `<span class="pick">${CHECK_ICON}</span>` : ""}
        <h4>${n.pinned && !n.trashed ? PIN_SVG : n.tags.includes(VOICE_TAG) ? MIC_ICON : DOC_ICON}<span class="t">${n.title ? highlight(n.title, q) : '<span style="color:var(--faint)">Tanpa judul</span>'}</span><span class="card-date">${cardDate(prefs.sort === "created" ? n.createdAt : n.updatedAt)}</span></h4>
        ${q ? `<p>${snippet(n, q)}</p>` : ""}
        ${extra ? `<div class="meta">${extra}</div>` : ""}
      </button>`;
  }


  function viewTitle() {
    const v = state.view;
    if (v.startsWith("tag:")) return "#" + v.slice(4);
    if (v.startsWith("folder:")) {
      const f = folderById(v.slice(7));
      return f ? f.name : "Folder";
    }
    if (v === "calendar")
      return parseYmd(state.calDay).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
    return { all: "Semua catatan", pinned: "Disematkan", trash: "Sampah", reminders: "Pengingat & alarm", news: "Berita terkini", ...MOD_VIEWS }[v] || "Catatan";
  }

  function emptyMessage(q) {
    if (q) return `Tidak ada catatan yang cocok dengan “${escapeHtml(q)}”.`;
    const v = state.view;
    if (v === "trash") return "Sampah kosong.";
    if (v === "pinned") return "Belum ada catatan yang disematkan.";
    if (v === "calendar") return "Tidak ada catatan di tanggal ini.<br>Tekan <b>+ Catatan</b> di atas untuk membuatnya.";
    if (v.startsWith("folder:")) return "Folder ini masih kosong.<br>Pindahkan catatan ke sini lewat pilihan folder di editor.";
    return "Belum ada catatan.<br>Tekan <b>N</b> untuk membuat yang pertama.";
  }

  function renderList() {
    const list = visibleNotes();
    const q = state.query.trim();
    el.listTitle.textContent = viewTitle();
    document.body.classList.toggle("view-news", state.view === "news");
    document.body.classList.toggle("view-mod", isModView());
    document.body.classList.toggle("view-plain", state.view === "all");
    document.body.classList.toggle("view-page", ["reminders", "emergency", "groups", "booking"].includes(state.view)); // halaman penuh tanpa panel editor

    if (isModView()) {
      /* modul mengelola isi daftarnya sendiri */
    } else if (state.view === "news") {
      el.noteList.innerHTML = newsHtml(q);
    } else if (!list.length) {
      el.noteList.innerHTML = `<div class="list-empty">${emptyMessage(q)}</div>`;
    } else if (state.view === "all" && !q) {
      const pinned = list.filter((n) => n.pinned);
      const others = list.filter((n) => !n.pinned);
      let html = "";
      if (pinned.length) html += `<div class="group-label">Disematkan</div>` + pinned.map((n) => cardHtml(n, q)).join("");
      if (others.length) html += groupedCards(others, q);
      el.noteList.innerHTML = html;
    } else {
      el.noteList.innerHTML = groupedCards(list, q);
    }
    el.noteList.classList.toggle("merging", merge.on);

    // counts
    const live = notes.filter((n) => !n.trashed);
    document.querySelector('[data-count="all"]').textContent = live.length;
    document.querySelector('[data-count="pinned"]').textContent = live.filter((n) => n.pinned).length;
    document.querySelector('[data-count="trash"]').textContent = notes.length - live.length;
    document.querySelector('[data-count="reminders"]').textContent = live.filter((n) => n.remindAt).length + remExtra || "";

    // bar sampah
    const trashCount = notes.length - live.length;
    el.trashBar.classList.toggle("hidden", state.view !== "trash" || !trashCount);
    el.trashBar.querySelector("span").textContent = state.features.v2
      ? "Catatan di sampah terhapus otomatis setelah 30 hari."
      : `${trashCount} catatan di sampah.`;

    // nav state
    el.nav.forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
    renderTags();
    renderFolders(live);
    renderCalendar();
    renderRemindBar();
    renderNewsBar();
  }

  function renderTags() {
    const tags = allTags();
    el.tagList.innerHTML = tags.length
      ? tags
          .map(
            ([t, c]) =>
              `<button class="tag-item${state.view === "tag:" + t ? " active" : ""}" data-tag="${escapeHtml(t)}"><b class="hash">#</b><span>${escapeHtml(t)}</span><em class="count">${c}</em></button>`
          )
          .join("")
      : '<div class="tag-empty">Belum ada tag</div>';
  }

  // ---------- Folder bertingkat ----------
  const byName = (a, b) => a.name.localeCompare(b.name, "id");
  const folderById = (id) => folders.find((f) => f.id === id) || null;
  const childrenOf = (pid) => folders.filter((f) => (f.parent || null) === (pid || null)).sort(byName);

  // Id folder ini beserta semua subfoldernya.
  function descendantIds(id) {
    const out = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const f of folders) if (f.parent && out.has(f.parent) && !out.has(f.id)) (out.add(f.id), (grew = true));
    }
    return out;
  }

  function folderDepth(id) {
    let d = 0;
    for (let f = folderById(id); f && f.parent && d < 20; f = folderById(f.parent)) d++;
    return d;
  }

  // Daftar datar berurutan pohon (untuk pilihan <select>): [{ folder, depth }]
  function flatFolders(pid = null, depth = 0, out = []) {
    for (const f of childrenOf(pid)) {
      out.push({ folder: f, depth });
      flatFolders(f.id, depth + 1, out);
    }
    return out;
  }

  const FOLDER_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  const CARET_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  const act = (kind, id, title, path) =>
    `<button class="icon-btn" data-act="${kind}" data-id="${id}" title="${title}" aria-label="${title}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></button>`;

  function renderFolders(live) {
    const on = state.features.v3;
    el.addFolderBtn.classList.toggle("hidden", !on || prefs.foldersHidden);
    el.folderTree.classList.toggle("hidden", prefs.foldersHidden);
    el.folderAll.classList.toggle("hidden", prefs.foldersHidden);
    el.folderHead.setAttribute("aria-expanded", String(!prefs.foldersHidden));
    if (!on) {
      el.folderTree.innerHTML =
        '<div class="folder-hint">Folder aktif setelah migrasi database 003 dijalankan (lihat README).</div>';
    } else if (!folders.length) {
      el.folderTree.innerHTML = '<div class="folder-hint">Belum ada folder. Tekan + untuk membuat.</div>';
    } else {
      const counts = {};
      for (const n of live) if (n.folderId) counts[n.folderId] = (counts[n.folderId] || 0) + 1;
      const total = (id) => [...descendantIds(id)].reduce((sum, x) => sum + (counts[x] || 0), 0);
      const collapsed = new Set(prefs.collapsed);
      const rows = [];
      const walk = (pid, depth) => {
        for (const f of childrenOf(pid)) {
          const kids = childrenOf(f.id).length > 0;
          const open = !collapsed.has(f.id);
          const name = escapeHtml(f.name);
          rows.push(
            `<div class="folder-row${state.view === "folder:" + f.id ? " active" : ""}">` +
              `<button class="folder-caret${kids ? (open ? " open" : "") : " none"}" data-toggle="${f.id}" tabindex="${kids ? 0 : -1}" aria-label="${open ? "Ciutkan" : "Buka"} ${name}">${CARET_SVG}</button>` +
              `<button class="folder-main" data-open="${f.id}" title="${name}">${FOLDER_SVG}<span class="f-name">${name}</span></button>` +
              `<em class="count">${total(f.id) || ""}</em>` +
              `<span class="folder-acts">` +
              (folderDepth(f.id) + 1 < MAX_FOLDER_DEPTH ? act("sub", f.id, "Subfolder baru", '<path d="M12 5v14M5 12h14"/>') : "") +
              act("rename", f.id, "Ganti nama", '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>') +
              act("delete", f.id, "Hapus folder", '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>') +
              `</span></div>`
          );
          if (kids && open) {
            rows.push('<div class="folder-children">'); // garis penuntun di sisi kiri anak folder
            walk(f.id, depth + 1);
            rows.push("</div>");
          }
        }
      };
      walk(null, 0);
      el.folderTree.innerHTML = rows.join("");
    }

    // Pilihan folder untuk layar sempit (pohon di sidebar disembunyikan di sana).
    const flat = on ? flatFolders() : [];
    el.folderFilter.classList.toggle("hidden", !flat.length);
    if (flat.length) {
      const cur = state.view.startsWith("folder:") ? state.view.slice(7) : "";
      el.folderFilter.innerHTML =
        '<option value="">Semua folder</option>' +
        flat.map(({ folder, depth }) => `<option value="${folder.id}">${"\u2003".repeat(depth)}${escapeHtml(folder.name)}</option>`).join("");
      el.folderFilter.value = cur;
    }
  }

  function askFolderName(title, initial = "") {
    const name = (prompt(title, initial) || "").trim().replace(/\s+/g, " ").slice(0, 60);
    return name;
  }

  function folderNameTaken(name, parent, exceptId) {
    return folders.some((f) => f.id !== exceptId && (f.parent || null) === (parent || null) && f.name.toLowerCase() === name.toLowerCase());
  }

  function persistFolders() {
    foldersAt = Math.max(Date.now(), foldersAt + 1);
    foldersDirty = true;
    persist(null, true);
  }

  function addFolder(parentId = null) {
    if (!state.features.v3) return toast("Jalankan migrasi database 003 dulu (lihat README).");
    if (parentId && folderDepth(parentId) + 1 >= MAX_FOLDER_DEPTH) return toast(`Folder hanya bisa sampai ${MAX_FOLDER_DEPTH} tingkat`);
    const name = askFolderName(parentId ? `Nama subfolder di “${folderById(parentId).name}”:` : "Nama folder baru:");
    if (!name) return;
    if (folderNameTaken(name, parentId)) return toast("Sudah ada folder dengan nama itu di sini");
    const f = { id: uid(), name, parent: parentId };
    folders.push(f);
    if (parentId) prefs.collapsed = prefs.collapsed.filter((x) => x !== parentId), savePrefs();
    persistFolders();
    setView("folder:" + f.id);
  }

  function renameFolder(id) {
    const f = folderById(id);
    if (!f) return;
    const name = askFolderName("Ganti nama folder:", f.name);
    if (!name || name === f.name) return;
    if (folderNameTaken(name, f.parent, id)) return toast("Sudah ada folder dengan nama itu di sini");
    f.name = name;
    persistFolders();
    renderList();
    renderEditor();
  }

  function deleteFolder(id) {
    const f = folderById(id);
    if (!f) return;
    const gone = descendantIds(id);
    const inside = notes.filter((n) => n.folderId && gone.has(n.folderId));
    const parent = f.parent ? folderById(f.parent) : null;
    const msg =
      `Hapus folder “${f.name}”${gone.size > 1 ? ` beserta ${gone.size - 1} subfolder` : ""}?\n` +
      (inside.length ? `${inside.length} catatan di dalamnya TIDAK dihapus, dipindahkan ke ${parent ? `“${parent.name}”` : "tanpa folder"}.` : "Folder ini kosong.");
    if (!confirm(msg)) return;
    inside.forEach((n) => {
      n.folderId = parent ? parent.id : null;
      stamp(n);
      dirty.add(n.id);
    });
    folders = folders.filter((x) => !gone.has(x.id));
    if (state.view.startsWith("folder:") && gone.has(state.view.slice(7))) state.view = "all";
    persistFolders();
    persist(null, true);
    render();
    toast("Folder dihapus");
  }

  function toggleFolder(id) {
    const set = new Set(prefs.collapsed);
    set.has(id) ? set.delete(id) : set.add(id);
    prefs.collapsed = [...set];
    savePrefs();
    renderList();
  }

  // ---------- Kalender harian ----------
  const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  function renderCalendar() {
    const show = state.view === "calendar";
    el.calendar.classList.toggle("hidden", !show);
    if (!show) return;
    const m = state.calMonth;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // pekan mulai Senin
    const cells = Math.ceil((lead + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7) * 7;

    const noted = new Set();
    const belled = new Set();
    for (const n of notes) {
      if (n.trashed) continue;
      noted.add(ymd(n.createdAt));
      noted.add(ymd(n.updatedAt));
      if (n.remindAt) belled.add(ymd(n.remindAt));
    }
    const today = ymd(Date.now());
    let html = `<div class="cal-head">
      <b>${first.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</b>
      <button class="cal-today" data-cal="today">Hari ini</button>
      <button class="icon-btn" data-cal="prev" title="Bulan sebelumnya" aria-label="Bulan sebelumnya"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
      <button class="icon-btn" data-cal="next" title="Bulan berikutnya" aria-label="Bulan berikutnya"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
    </div><div class="cal-grid">` + DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");
    for (let i = 0; i < cells; i++) {
      const d = new Date(m.getFullYear(), m.getMonth(), 1 - lead + i);
      const key = ymd(d);
      const cls = ["cal-day", d.getMonth() !== m.getMonth() ? "out" : "", key === today ? "today" : "", key === state.calDay ? "sel" : ""].join(" ");
      html +=
        `<button class="${cls}" data-day="${key}" aria-label="${d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}">${d.getDate()}` +
        (noted.has(key) ? '<i class="dot has"></i>' : "") +
        (belled.has(key) ? '<i class="dot bell"></i>' : "") +
        `</button>`;
    }
    html += `</div><button class="btn-secondary cal-add" data-cal="add">+ Catatan di ${parseYmd(state.calDay).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}</button>`;
    el.calendar.innerHTML = html;
  }

  function calendarNav(kind) {
    const m = state.calMonth;
    if (kind === "prev") state.calMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1);
    else if (kind === "next") state.calMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    else if (kind === "today") {
      const now = new Date();
      state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      state.calDay = ymd(now);
    } else if (kind === "add") return createNote();
    renderList();
  }

  function pickDay(day) {
    state.calDay = day;
    const d = parseYmd(day);
    if (d.getMonth() !== state.calMonth.getMonth() || d.getFullYear() !== state.calMonth.getFullYear())
      state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const list = visibleNotes();
    if (!list.some((n) => n.id === state.activeId)) state.activeId = window.innerWidth > 760 && list[0] ? list[0].id : null;
    render();
  }

  // ---------- Bar pengingat ----------
  // Status izin notifikasi ditampilkan oleh halaman Pengingat (reminders.js); panggil ulang setelah izin berubah.
  function renderRemindBar() {
    const m = typeof modules !== "undefined" && modules.reminders;
    if (m && m.refresh) m.refresh();
  }

  function renderEditor() {
    if (isModView()) return; // panel kanan dikelola modul
    if (voice.active && voice.noteId !== state.activeId) stopDictation();
    const n = activeNote();
    el.emptyState.classList.toggle("hidden", !!n);
    el.editor.classList.toggle("hidden", !n);
    el.app.classList.toggle("editing", !!n);
    if (!n) {
      state.shownId = null;
      return;
    }
    if (state.activeId !== state.shownId) {
      // Catatan lama dibuka dalam mode baca (seperti tampilan referensi); catatan baru langsung mode tulis.
      state.shownId = state.activeId;
      if (state.forceEdit === state.activeId) state.forceEdit = null;
      else state.mode = "preview";
    }

    if (el.titleInput.value !== n.title) el.titleInput.value = n.title;
    if (el.contentInput.value !== n.content) el.contentInput.value = n.content;

    const readOnly = n.trashed;
    el.titleInput.readOnly = readOnly;
    el.contentInput.readOnly = readOnly || voice.active;
    el.tagInput.classList.toggle("hidden", readOnly);
    el.pinBtn.classList.toggle("hidden", readOnly);
    el.colorPicker.classList.toggle("hidden", readOnly);
    el.restoreBtn.classList.toggle("hidden", !readOnly);
    el.deleteBtn.title = readOnly ? "Hapus permanen" : "Pindahkan ke sampah";
    el.pinBtn.classList.toggle("active", n.pinned);
    el.pinBtn.title = n.pinned ? "Lepas sematan" : "Sematkan";
    el.formatBar.querySelector('[data-fmt="image"]').classList.toggle("hidden", !state.features.v2);
    el.moreMenu.querySelector('[data-action="share"]').classList.toggle("hidden", !state.features.v2 || readOnly);
    el.moreMenu.querySelector('[data-action="history"]').classList.toggle("hidden", !state.features.v2);
    el.moreMenu.querySelector("hr").classList.toggle("hidden", !state.features.v2);

    // folder & pengingat (butuh migrasi 003)
    const v3 = state.features.v3;
    const flat = v3 ? flatFolders() : [];
    el.folderPick.classList.toggle("hidden", !flat.length || readOnly);
    if (flat.length) {
      el.folderSelect.innerHTML =
        '<option value="">Tanpa folder</option>' +
        flat.map(({ folder, depth }) => `<option value="${folder.id}">${"\u2003".repeat(depth)}${escapeHtml(folder.name)}</option>`).join("");
      el.folderSelect.value = n.folderId && folderById(n.folderId) ? n.folderId : "";
    }
    el.moveBtn.classList.toggle("hidden", !v3 || readOnly);
    el.remindBtn.classList.toggle("hidden", !v3 || readOnly);
    el.remindBtn.classList.toggle("set", !!n.remindAt);
    el.remindBtn.title = n.remindAt ? `Pengingat: ${formatRemind(n.remindAt)}` : "Atur pengingat";

    el.voiceNoteBtn.classList.toggle("hidden", !SpeechRec || readOnly);
    renderChips(n);
    renderColors(n);
    renderMode();
    renderAccordions(n);
    updateFooter(n);
    autosizeTitle();
  }

  function renderChips(n) {
    el.tagChips.innerHTML = n.tags
      .map(
        (t) =>
          `<span class="chip">#${escapeHtml(t)}${
            n.trashed ? "" : `<button data-remove-tag="${escapeHtml(t)}" title="Hapus tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`
          }</span>`
      )
      .join("");
  }

  function renderColors(n) {
    el.colorPicker.innerHTML = COLORS.map(
      (c) =>
        `<button class="swatch${c ? "" : " none"}${(n.color || "") === c ? " active" : ""}" data-color="${c}" style="${c ? `background:${c}` : ""}" title="${c ? "Warna" : "Tanpa warna"}"></button>`
    ).join("");
  }

  function renderMode() {
    const n = activeNote();
    const preview = state.mode === "preview";
    el.modeSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));
    el.contentInput.classList.toggle("hidden", preview);
    el.preview.classList.toggle("hidden", !preview);
    el.formatBar.classList.toggle("hidden", preview || !n || n.trashed);
    el.editToggleBtn.classList.toggle("hidden", !n || n.trashed);
    el.editToggleBtn.classList.toggle("on", !preview);
    el.editToggleBtn.querySelector("span").textContent = preview ? "Edit" : "Selesai";
    el.editToggleBtn.title = preview ? "Edit catatan (⌘E)" : "Selesai mengedit (⌘E)";
    if (preview && n) {
      el.preview.innerHTML = renderMarkdown(n.content);
      resolveImages(el.preview);
    }
    if (n) renderAccordions(n);
  }

  function updateFooter(n) {
    const words = plainText(n.content).split(/\s+/).filter(Boolean).length;
    el.wordCount.textContent = `${words} kata · ${n.content.length} karakter`;
    el.dateInfo.textContent = new Date(n.updatedAt).toLocaleString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // Judul memakai textarea agar judul panjang turun ke baris berikutnya.
  function autosizeTitle() {
    const t = el.titleInput;
    t.style.height = "auto";
    t.style.height = t.scrollHeight + "px";
  }

  // Bagian lipat: teks asli rekaman (hasil sebelum dirapikan AI) dan daftar tugas dari checklist di catatan.
  const accOpen = { orig: false, task: false };
  function renderAccordions(n) {
    const hasOrig = !!n.voiceOriginal;
    el.origAcc.classList.toggle("hidden", !hasOrig);
    if (hasOrig) {
      el.origText.textContent = n.voiceOriginal;
      el.origAcc.open = accOpen.orig;
    }
    const tasks = [];
    n.content.split("\n").forEach((line, i) => {
      const m = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
      if (m) tasks.push({ i, done: m[1] !== " ", text: m[2] });
    });
    el.taskAcc.classList.toggle("hidden", !tasks.length);
    if (tasks.length) {
      el.taskSummary.textContent = `Daftar Tugas (${tasks.filter((t) => t.done).length}/${tasks.length} Selesai)`;
      el.taskBody.innerHTML = tasks
        .map((t) => `<label class="ed-task${t.done ? " done" : ""}"><input type="checkbox" data-line="${t.i}" ${t.done ? "checked" : ""} ${n.trashed ? "disabled" : ""} /><span>${escapeHtml(t.text.replace(/\*\*|__|`/g, ""))}</span></label>`)
        .join("");
      el.taskAcc.open = accOpen.task;
    }
  }

  function render() {
    renderList();
    renderEditor();
  }

  // ---------- Actions ----------
  function createNote() {
    const now = Date.now();
    const tag = state.view.startsWith("tag:") ? [state.view.slice(4)] : [];
    const inFolder = state.view.startsWith("folder:") && folderById(state.view.slice(7));
    let createdAt = now;
    if (state.view === "calendar" && state.calDay !== ymd(now)) {
      // catatan untuk hari lain: tanggal dibuatnya jatuh di hari yang dipilih (jam sekarang, atau tengah hari)
      const d = parseYmd(state.calDay);
      d.setHours(12, 0, 0, 0);
      createdAt = d.getTime();
    }
    const n = {
      id: uid(), title: "", content: "", tags: tag, color: "", pinned: state.view === "pinned", trashed: false,
      createdAt, updatedAt: now, folderId: inFolder ? inFolder.id : null, remindAt: null,
    };
    notes.unshift(n);
    if (state.view === "trash" || state.view === "news") state.view = "all";
    state.query = "";
    el.searchInput.value = "";
    state.activeId = n.id;
    state.mode = "edit";
    state.forceEdit = n.id;
    persist(n);
    render();
    el.titleInput.focus();
  }

  function selectNote(id) {
    state.activeId = id;
    render();
  }

  // Cap waktu perubahan: tidak pernah mundur dari versi yang pernah terlihat perangkat ini.
  // Trigger database menolak pembaruan yang "lebih lama", jadi jam perangkat yang tertinggal
  // tidak boleh membuat suntingan terbuang diam-diam.
  function stamp(n) {
    n.updatedAt = Math.max(Date.now(), (n.updatedAt || 0) + 1);
    return n.updatedAt;
  }

  function touch(n) {
    stamp(n);
    persist(n);
    renderList();
    updateFooter(n);
  }

  // Hapus permanen: dikirim lewat antrean, jadi tetap jalan walau sedang offline.
  function permanentlyDelete(n) {
    notes = notes.filter((x) => x.id !== n.id);
    dirty.delete(n.id);
    pendingDeletes.add(n.id);
    if (state.activeId === n.id) state.activeId = null;
    persist(null, true);
  }

  function deleteActive() {
    const n = activeNote();
    if (!n) return;
    if (n.trashed) {
      if (!confirm("Hapus catatan ini secara permanen? Tindakan ini tidak bisa dibatalkan.")) return;
      permanentlyDelete(n);
      render();
      toast("Catatan dihapus permanen");
      return;
    }
    n.trashed = true;
    n.trashedAt = Date.now();
    n.pinned = false;
    n.remindAt = null; // catatan di sampah tidak berbunyi
    stamp(n);
    state.activeId = null;
    persist(n, true);
    render();
    toast("Dipindahkan ke sampah", "Urungkan", () => {
      n.trashed = false;
      n.trashedAt = null;
      stamp(n);
      state.activeId = n.id;
      persist(n, true);
      render();
    });
  }

  function restoreActive() {
    const n = activeNote();
    if (!n) return;
    n.trashed = false;
    n.trashedAt = null;
    stamp(n);
    state.view = "all";
    persist(n, true);
    render();
    toast("Catatan dipulihkan");
  }

  function emptyTrash() {
    const trashed = notes.filter((n) => n.trashed);
    if (!trashed.length) return;
    if (!confirm(`Hapus permanen ${trashed.length} catatan di sampah? Tindakan ini tidak bisa dibatalkan.`)) return;
    trashed.forEach(permanentlyDelete);
    render();
    toast(`${trashed.length} catatan dihapus permanen`);
  }

  // Catatan yang sudah >30 hari di sampah dihapus otomatis.
  function purgeOldTrash() {
    if (!state.features.v2) return;
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const old = notes.filter((n) => n.trashed && (n.trashedAt || n.updatedAt) < cutoff);
    if (!old.length) return;
    old.forEach(permanentlyDelete);
    render();
  }

  function addTag(raw) {
    const n = activeNote();
    const t = raw.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
    if (!n || !t || n.tags.includes(t)) return;
    if (n.tags.length >= 20) return toast("Maksimal 20 tag per catatan");
    n.tags.push(t);
    renderChips(n);
    touch(n);
  }

  function setView(view) {
    const prev = state.view;
    state.view = view;
    if (merge.on) {
      merge.on = false;
      merge.sel.clear();
      el.mergeToggle.classList.remove("on");
      el.mergeToggle.querySelector("span").textContent = "Gabung";
      renderMergeBar();
    }
    if (prev !== view && Object.prototype.hasOwnProperty.call(MOD_VIEWS, prev) && modules[prev] && modules[prev].leave) modules[prev].leave(prev);
    if (Object.prototype.hasOwnProperty.call(MOD_VIEWS, view)) {
      state.activeId = null;
      el.app.classList.remove("editing");
      render();
      if (modules[view]) modules[view].enter(view);
      else el.modList.innerHTML = '<div class="mod-note">Modul ini gagal dimuat. Muat ulang halaman.</div>';
      return;
    }
    if (view === "news") loadNews();
    const list = visibleNotes();
    if (!list.some((n) => n.id === state.activeId)) state.activeId = window.innerWidth > 760 && list[0] ? list[0].id : null;
    render();
  }

  let toastTimer;
  function toast(msg, actionLabel, action) {
    el.toast.innerHTML = `<span>${escapeHtml(msg)}</span>${actionLabel ? `<button>${escapeHtml(actionLabel)}</button>` : ""}`;
    if (action) el.toast.querySelector("button").onclick = () => { action(); el.toast.classList.remove("show"); };
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 4500);
  }

  function applyTheme() {
    const theme = prefs.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  }

  // ---------- Lampiran gambar ----------
  const ATTACH_BUCKET = "attachments";
  const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const signedUrls = new Map(); // path -> { url, exp }

  async function resolveImages(container) {
    const imgs = [...container.querySelectorAll("img[data-attachment]")];
    if (!imgs.length || !sb) return;
    const now = Date.now();
    const need = [...new Set(imgs.map((i) => i.dataset.attachment))].filter((p) => {
      const c = signedUrls.get(p);
      return !c || c.exp < now + 60_000;
    });
    if (need.length) {
      try {
        const { data } = await sb.storage.from(ATTACH_BUCKET).createSignedUrls(need, 3600);
        (data || []).forEach((d) => d.signedUrl && signedUrls.set(d.path, { url: d.signedUrl, exp: now + 3600_000 }));
      } catch {
        /* offline */
      }
    }
    imgs.forEach((img) => {
      const c = signedUrls.get(img.dataset.attachment);
      if (c) {
        img.src = c.url;
        img.classList.remove("img-loading");
      } else {
        markImageMissing(img);
      }
    });
  }

  function markImageMissing(img) {
    const span = document.createElement("span");
    span.className = "img-missing";
    span.textContent = `🖼 ${img.alt || "gambar"} (tidak dapat dimuat)`;
    img.replaceWith(span);
  }
  document.addEventListener(
    "error",
    (e) => {
      if (e.target.tagName === "IMG" && e.target.closest(".preview, .print-area")) markImageMissing(e.target);
    },
    true
  );

  async function removeAttachments(noteId) {
    if (!state.features.v2 || !state.user) return;
    const prefix = `${state.user.id}/${noteId}`;
    const { data, error } = await sb.storage.from(ATTACH_BUCKET).list(prefix, { limit: 1000 });
    if (error || !data || !data.length) return;
    await sb.storage.from(ATTACH_BUCKET).remove(data.map((f) => `${prefix}/${f.name}`));
  }

  // Perkecil foto besar sebelum diunggah (maks. 2000px) agar hemat kuota dan cepat dimuat.
  async function prepareImage(file) {
    if (file.type === "image/gif" || file.size < 1_500_000 || !window.createImageBitmap) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
      const blob = await new Promise((r) => canvas.toBlob(r, type, 0.85));
      return blob && blob.size < file.size ? new File([blob], file.name, { type: blob.type }) : file;
    } catch {
      return file;
    }
  }

  function insertBlock(text) {
    const ta = el.contentInput;
    if (state.mode === "preview") {
      state.mode = "edit";
      renderMode();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    const pos = ta.selectionEnd;
    const before = pos > 0 && ta.value[pos - 1] !== "\n" ? "\n" : "";
    ta.setRangeText(`${before}${text}\n`, ta.selectionStart, pos, "end");
    ta.dispatchEvent(new Event("input"));
  }

  async function uploadImages(fileList) {
    const n = activeNote();
    const files = [...fileList].filter((f) => f.type.startsWith("image/"));
    if (!n || n.trashed || !files.length) return;
    if (!state.features.v2) return toast("Fitur gambar butuh migrasi database 002 (lihat README).");
    if (state.offline || !navigator.onLine) return toast("Tidak bisa mengunggah gambar saat offline.");
    for (const file of files) {
      if (!IMG_TYPES[file.type]) {
        toast("Format tidak didukung. Gunakan PNG, JPG, GIF, atau WebP.");
        continue;
      }
      toast("Mengunggah gambar…");
      const img = await prepareImage(file);
      if (img.size > MAX_IMAGE_BYTES) {
        toast("Gambar terlalu besar (maksimal 5 MB).");
        continue;
      }
      const path = `${state.user.id}/${n.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${IMG_TYPES[img.type]}`;
      const { error } = await sb.storage.from(ATTACH_BUCKET).upload(path, img, { contentType: img.type, upsert: false });
      if (error) {
        toast("Gagal mengunggah: " + error.message);
        continue;
      }
      const alt = (file.name || "gambar").replace(/\.[^.]+$/, "").replace(/[[\]()\n]/g, " ").trim().slice(0, 60) || "gambar";
      if (state.activeId === n.id) insertBlock(`![${alt}](attachment:${path})`);
      toast("Gambar ditambahkan");
    }
  }

  // ---------- Toolbar format ----------
  const LIST_PREFIX = /^(\s*)([-*+] \[[ xX]\] |[-*+] |\d+\. |> |#{1,6} )/;
  function applyFormat(kind) {
    const n = activeNote();
    if (!n || n.trashed) return;
    if (kind === "image") return el.imageInput.click();
    const ta = el.contentInput;
    if (state.mode === "preview") {
      state.mode = "edit";
      renderMode();
    }
    ta.focus();
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const sel = v.slice(s, e);

    const wrap = (before, after = before, placeholder = "teks") => {
      if (sel && v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
        ta.setRangeText(sel, s - before.length, e + after.length, "select"); // sudah diformat → lepas
        return;
      }
      const inner = sel || placeholder;
      ta.setRangeText(before + inner + after, s, e, "end");
      ta.setSelectionRange(s + before.length, s + before.length + inner.length);
    };

    const prefixLines = (makePrefix, pattern) => {
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      const endPos = e > s && v[e - 1] === "\n" ? e - 1 : e;
      let le = v.indexOf("\n", endPos);
      if (le < 0) le = v.length;
      const lines = v.slice(ls, le).split("\n");
      const all = lines.every((l) => pattern.test(l));
      const out = lines.map((l, i) => (all ? l.replace(pattern, "") : l.replace(LIST_PREFIX, "$1").replace(/^(\s*)/, `$1${makePrefix(i)}`)));
      ta.setRangeText(out.join("\n"), ls, le, "end");
    };

    switch (kind) {
      case "bold": wrap("**"); break;
      case "italic": wrap("*"); break;
      case "strike": wrap("~~"); break;
      case "code": sel.includes("\n") ? wrap("```\n", "\n```", "kode") : wrap("`", "`", "kode"); break;
      case "heading": prefixLines(() => "## ", /^\s*#{1,6} /); break;
      case "ul": prefixLines(() => "- ", /^\s*[-*+] (?!\[[ xX]\] )/); break;
      case "ol": prefixLines((i) => `${i + 1}. `, /^\s*\d+\. /); break;
      case "task": prefixLines(() => "- [ ] ", /^\s*[-*+] \[[ xX]\] /); break;
      case "quote": prefixLines(() => "> ", /^\s*> /); break;
      case "table": {
        const tpl = "| Kolom 1 | Kolom 2 |\n| --- | --- |\n|  |  |";
        const lead = s > 0 && v[s - 1] !== "\n" ? "\n\n" : s > 0 && v[s - 2] !== "\n" ? "\n" : "";
        ta.setRangeText(lead + tpl + "\n", s, e, "end");
        const at = s + lead.length + 2;
        ta.setSelectionRange(at, at + "Kolom 1".length);
        break;
      }
      case "link": {
        const text = sel || "teks tautan";
        const url = "https://";
        ta.setRangeText(`[${text}](${url})`, s, e, "end");
        const at = s + text.length + 3;
        ta.setSelectionRange(at, at + url.length);
        break;
      }
      default: return;
    }
    ta.dispatchEvent(new Event("input"));
  }

  // ---------- Menu ⋯, ekspor & cetak ----------
  function toggleMenu(open) {
    const show = open === undefined ? el.moreMenu.classList.contains("hidden") : open;
    el.moreMenu.classList.toggle("hidden", !show);
    el.moreBtn.setAttribute("aria-expanded", String(show));
  }

  const safeFileName = (t) => (t || "catatan").replace(/[\\/:*?"<>|#]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "catatan";

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportMarkdown() {
    const n = activeNote();
    if (!n) return;
    const parts = [];
    if (n.title) parts.push(`# ${n.title}`, "");
    if (n.tags.length) parts.push(n.tags.map((t) => `#${t}`).join(" "), "");
    parts.push(n.content);
    downloadBlob(new Blob([parts.join("\n")], { type: "text/markdown;charset=utf-8" }), `${safeFileName(n.title)}.md`);
    toast("Catatan diunduh sebagai Markdown");
  }

  async function printNote() {
    const n = activeNote();
    if (!n) return;
    el.printArea.innerHTML = `<h1 class="print-title">${escapeHtml(n.title || "Tanpa judul")}</h1><div class="preview">${renderMarkdown(n.content)}</div>`;
    await resolveImages(el.printArea);
    await Promise.race([
      Promise.all([...el.printArea.querySelectorAll("img")].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    const oldTitle = document.title;
    document.title = safeFileName(n.title); // dipakai sebagai nama file PDF
    window.print();
    document.title = oldTitle;
  }

  // ---------- Ekspor (Word, PDF, Excel, PowerPoint) ----------
  const EXPORT_FORMATS = {
    docx: { label: "Word", ext: "docx" },
    pdf: { label: "PDF", ext: "pdf" },
    xlsx: { label: "Excel", ext: "xlsx" },
    pptx: { label: "PowerPoint", ext: "pptx" },
  };
  let exporting = false;

  async function fetchAttachment(path) {
    const { data, error } = await sb.storage.from(ATTACH_BUCKET).download(path);
    return error ? null : data;
  }

  function setExportMsg(text, kind = "") {
    el.exportMsg.textContent = text;
    el.exportMsg.className = `set-msg ${kind}`;
  }
  const setExportBusy = (busy) => el.exportGrid.querySelectorAll("button").forEach((b) => (b.disabled = busy));

  function openExport() {
    if (!activeNote()) return;
    setExportMsg("");
    setExportBusy(false);
    el.exportImages.closest("label").classList.toggle("hidden", !state.features.v2);
    el.exportDialog.showModal();
  }

  async function runExport(format) {
    const n = activeNote();
    if (!n || exporting) return;
    if (format === "md") {
      el.exportDialog.close();
      return exportMarkdown();
    }
    const f = EXPORT_FORMATS[format];
    exporting = true;
    setExportBusy(true);
    setExportMsg(`Menyiapkan ${f.label}…`);
    try {
      const blob = await CatatanExport.exportNote(format, n, {
        fetchAttachment,
        includeImages: el.exportImages.checked && state.features.v2 && navigator.onLine,
      });
      downloadBlob(blob, `${safeFileName(n.title)}.${f.ext}`);
      el.exportDialog.close();
      toast(`Catatan diunduh sebagai ${f.label} (.${f.ext})`);
    } catch (err) {
      console.error("Ekspor gagal:", err);
      setExportMsg(err.message || "Gagal membuat file.", "err");
    } finally {
      exporting = false;
      setExportBusy(false);
    }
  }

  async function exportAllExcel() {
    const list = notes.filter((n) => !n.trashed);
    if (!list.length) return setSettingsMsg("Belum ada catatan untuk diekspor.", "err");
    setSettingsMsg("Menyiapkan Excel…");
    try {
      const blob = await CatatanExport.exportAllNotes(list);
      downloadBlob(blob, `catatan-semua-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setSettingsMsg(`${list.length} catatan diekspor ke Excel.`, "ok");
    } catch (err) {
      console.error("Ekspor gagal:", err);
      setSettingsMsg(err.message || "Gagal membuat file.", "err");
    }
  }

  // ---------- Berbagi lewat link ----------
  const shareUrl = (n) => `${location.origin}${location.pathname}?share=${n.shareId}`;

  function renderShareDialog(n) {
    const on = !!n.shareId;
    el.shareDesc.textContent = on
      ? "Siapa pun yang punya link ini bisa membaca catatan ini (termasuk gambarnya), tapi tidak bisa mengubahnya."
      : "Buat link agar orang lain bisa membaca catatan ini tanpa login. Mereka tidak bisa mengubahnya.";
    el.shareLinkBox.classList.toggle("hidden", !on);
    if (on) el.shareLink.value = shareUrl(n);
    el.shareToggleBtn.textContent = on ? "Hentikan berbagi" : "Buat link";
    el.shareToggleBtn.className = on ? "btn-secondary" : "btn-primary";
  }

  function openShare() {
    const n = activeNote();
    if (!n) return;
    if (!state.features.v2) return toast("Fitur berbagi butuh migrasi database 002 (lihat README).");
    renderShareDialog(n);
    el.shareDialog.showModal();
  }

  async function toggleShare() {
    const n = activeNote();
    if (!n) return;
    if (state.offline || !navigator.onLine) return toast("Sambungkan ke internet untuk mengubah status berbagi.");
    n.shareId = n.shareId ? null : crypto.randomUUID();
    stamp(n);
    el.shareToggleBtn.disabled = true;
    persist(n, true);
    await flush();
    el.shareToggleBtn.disabled = false;
    if (dirty.has(n.id)) toast("Gagal menyimpan status berbagi. Coba lagi.");
    renderShareDialog(n);
    renderList();
    if (n.shareId) el.shareLink.select();
  }

  // ---------- Riwayat versi ----------
  let historyVersions = [];
  let selectedVersion = null;

  async function openHistory() {
    const n = activeNote();
    if (!n) return;
    if (!state.features.v2) return toast("Riwayat versi butuh migrasi database 002 (lihat README).");
    if (state.offline || !navigator.onLine) return toast("Riwayat versi tidak tersedia saat offline.");
    el.historyList.innerHTML = '<div class="history-empty">Memuat…</div>';
    el.historyTitle.textContent = "";
    el.historyContent.innerHTML = "";
    el.historyInfo.textContent = "";
    el.restoreVersionBtn.classList.add("hidden");
    el.historyDialog.showModal();
    await flush();
    const { data, error } = await sb
      .from("note_versions")
      .select("version_id,title,content,created_at")
      .eq("user_id", state.user.id)
      .eq("note_id", n.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      el.historyList.innerHTML = `<div class="history-empty">Gagal memuat riwayat: ${escapeHtml(error.message)}</div>`;
      return;
    }
    historyVersions = [{ current: true, title: n.title, content: n.content, created_at: n.updatedAt }, ...(data || [])];
    el.historyList.innerHTML =
      historyVersions
        .map(
          (v, i) =>
            `<button class="history-item" data-i="${i}"><b>${v.current ? "Versi sekarang" : escapeHtml(fullDate(Number(v.created_at)))}</b><span>${escapeHtml(v.title || "Tanpa judul")}</span></button>`
        )
        .join("") +
      (historyVersions.length === 1
        ? '<div class="history-empty">Belum ada versi lama. Versi disimpan otomatis saat catatan diubah (paling sering tiap 10 menit).</div>'
        : "");
    selectVersion(historyVersions.length > 1 ? 1 : 0);
  }

  function selectVersion(i) {
    const n = activeNote();
    selectedVersion = historyVersions[i];
    if (!selectedVersion || !n) return;
    el.historyList.querySelectorAll(".history-item").forEach((b) => b.classList.toggle("active", Number(b.dataset.i) === i));
    el.historyTitle.textContent = selectedVersion.title || "Tanpa judul";
    el.historyContent.innerHTML = renderMarkdown(selectedVersion.content);
    resolveImages(el.historyContent);
    el.historyInfo.textContent = selectedVersion.current ? "Versi yang sedang dipakai" : `Disimpan ${relativeTime(Number(selectedVersion.created_at))}`;
    el.restoreVersionBtn.classList.toggle("hidden", !!selectedVersion.current || n.trashed);
  }

  async function restoreSelectedVersion() {
    const n = activeNote();
    const v = selectedVersion;
    if (!n || !v || v.current) return;
    // Simpan keadaan sekarang dulu, supaya pemulihan ini juga bisa dibatalkan lewat riwayat.
    await sb.from("note_versions").insert({ user_id: state.user.id, note_id: n.id, title: n.title, content: n.content });
    n.title = v.title;
    n.content = v.content;
    touch(n);
    renderEditor();
    el.historyDialog.close();
    toast("Versi lama dipulihkan");
  }

  // ---------- Pengaturan akun ----------
  function setSettingsMsg(text, kind = "") {
    el.settingsMsg.textContent = text;
    el.settingsMsg.className = `set-msg ${kind}`;
  }

  function openSettings() {
    const u = state.user;
    if (!u) return;
    const providers = (u.app_metadata && u.app_metadata.providers) || ["email"];
    const names = { email: "email & kata sandi", google: "Google", github: "GitHub" };
    el.setAvatar.textContent = (u.email || "?").charAt(0);
    el.setEmail.textContent = u.email;
    el.setProvider.textContent =
      `Masuk dengan ${providers.map((p) => names[p] || p).join(", ")}` +
      (u.created_at ? ` · bergabung ${new Date(u.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}` : "");
    el.deleteAccountForm.closest(".set-section").classList.toggle("hidden", !state.features.v2);
    el.newPassword.value = el.newEmail.value = el.deleteConfirm.value = "";
    setSettingsMsg(state.features.v2 ? "" : "Beberapa fitur (gambar, berbagi, riwayat versi, hapus akun) aktif setelah migrasi database 002 dijalankan — lihat README.");
    el.settingsDialog.showModal();
  }

  async function deleteAccount() {
    if (el.deleteConfirm.value.trim() !== "HAPUS") return setSettingsMsg('Ketik "HAPUS" (huruf besar) untuk mengonfirmasi.', "err");
    if (state.offline || !navigator.onLine) return setSettingsMsg("Sambungkan ke internet untuk menghapus akun.", "err");
    if (!confirm("Yakin? Akun dan SEMUA catatanmu akan dihapus permanen.")) return;
    const user = state.user;
    setSettingsMsg("Menghapus akun…");
    try {
      // Hapus semua file gambar milik pengguna dulu.
      const storage = sb.storage.from(ATTACH_BUCKET);
      const { data: folders } = await storage.list(user.id, { limit: 1000 });
      for (const f of folders || []) {
        const prefix = `${user.id}/${f.name}`;
        const { data: files } = await storage.list(prefix, { limit: 1000 });
        if (files && files.length) await storage.remove(files.map((x) => `${prefix}/${x.name}`));
      }
      const { error } = await sb.rpc("delete_my_account");
      if (error) throw error;
    } catch (err) {
      return setSettingsMsg("Gagal menghapus akun: " + authErrorText(err), "err");
    }
    localStorage.removeItem(cacheKeyFor(user));
    el.settingsDialog.close();
    unsubscribeRealtime();
    resetSession();
    render();
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
    showAuth("Akunmu dan semua catatannya sudah dihapus.", "info");
  }

  // ---------- Login Google / GitHub ----------
  async function setupOAuthButtons() {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
      const ext = ((await res.json()) || {}).external || {};
      let any = false;
      el.oauthBox.querySelectorAll("[data-provider]").forEach((b) => {
        const on = !!ext[b.dataset.provider];
        b.classList.toggle("hidden", !on);
        any = any || on;
      });
      state.oauthAvailable = any;
      // Google aktif → pengguna baru masuk lewat Google saja; bila tidak, tampilan email + daftar yang lama dipakai.
      el.auth.classList.toggle("auth--google-only", !!ext.google);
      setAuthMode(state.authMode, true); // jangan hapus pesan galat yang sedang tampil
    } catch {
      /* offline: tombol tetap tersembunyi */
    }
  }

  // ---------- Halaman catatan yang dibagikan ----------
  async function bootShared(shareId) {
    const robots = document.createElement("meta"); // jangan biarkan mesin pencari mengindeks catatan yang dibagikan
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    document.body.classList.remove("booting");
    document.body.classList.add("sharing");
    el.sharedView.classList.remove("hidden");
    const notFound = (msg) => {
      el.sharedTitle.textContent = "Catatan tidak ditemukan";
      el.sharedContent.innerHTML = `<p>${escapeHtml(msg)}</p>`;
    };
    const problem = configProblem();
    if (problem) return notFound(problem);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shareId))
      return notFound("Link ini tidak valid.");
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: false } });
    el.sharedTitle.textContent = "Memuat…";
    const { data, error } = await sb.rpc("get_shared_note", { p_share_id: shareId });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return notFound("Link ini mungkin salah, atau pemiliknya sudah berhenti membagikan catatan ini.");
    document.title = `${row.title || "Tanpa judul"} · Catatan`;
    el.sharedTitle.textContent = row.title || "Tanpa judul";
    el.sharedMeta.textContent = `Diperbarui ${fullDate(Number(row.updated_at))}`;
    el.sharedContent.innerHTML = renderMarkdown(row.content);
    el.sharedContent.querySelectorAll('input[type="checkbox"]').forEach((c) => (c.disabled = true));
    resolveImages(el.sharedContent);
  }

  // ---------- Salin, pindahkan, mode fokus ----------
  async function copyActive() {
    const n = activeNote();
    if (!n) return;
    const text = (n.title ? n.title + "\n\n" : "") + n.content.replace(/\(attachment:[^)]+\)/g, "(gambar)");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("Isi catatan disalin");
  }

  function openMove() {
    const n = activeNote();
    if (!n || n.trashed) return;
    if (!state.features.v3) return toast("Folder butuh migrasi database 003 (lihat README).");
    const cur = n.folderId && folderById(n.folderId) ? n.folderId : "";
    el.moveNoteTitle.textContent = n.title || "Tanpa judul";
    const item = (id, name, depth) =>
      `<button class="move-item${id === cur ? " current" : ""}" data-folder="${id}" style="padding-left:${10 + depth * 18}px">${FOLDER_SVG}<span>${escapeHtml(name)}</span></button>`;
    el.moveList.innerHTML =
      item("", "Tanpa folder", 0) + flatFolders().map(({ folder, depth }) => item(folder.id, folder.name, depth)).join("") +
      (folders.length ? "" : '<p class="set-sub">Belum ada folder. Buat dulu lewat tombol + di bagian Folder.</p>');
    el.moveDialog.showModal();
  }

  function moveActive(folderId) {
    const n = activeNote();
    if (!n) return;
    n.folderId = folderId || null;
    el.moveDialog.close();
    touch(n);
    renderEditor();
    toast(n.folderId ? `Dipindahkan ke “${folderById(n.folderId).name}”` : "Dikeluarkan dari folder");
  }

  function toggleFocus(force) {
    const on = force === undefined ? !el.app.classList.contains("focus") : force;
    el.app.classList.toggle("focus", on);
    el.focusBtn.title = on ? "Keluar dari mode fokus (Esc)" : "Mode fokus (layar penuh)";
  }

  // ---------- Gabung catatan ----------
  const merge = { on: false, sel: new Set() };

  function setMerge(on) {
    merge.on = on;
    merge.sel.clear();
    el.mergeToggle.classList.toggle("on", on);
    el.mergeToggle.querySelector("span").textContent = on ? "Selesai" : "Gabung";
    renderMergeBar();
    renderList();
  }

  function renderMergeBar() {
    el.mergeBar.classList.toggle("hidden", !merge.on);
    el.mergeCount.textContent = merge.sel.size ? `${merge.sel.size} catatan dipilih` : "Pilih 2 catatan atau lebih";
    el.mergeDoBtn.disabled = merge.sel.size < 2;
  }

  function toggleMergePick(id) {
    merge.sel.has(id) ? merge.sel.delete(id) : merge.sel.add(id);
    renderMergeBar();
    renderList();
  }

  async function mergeSelected() {
    const sel = notes.filter((n) => merge.sel.has(n.id) && !n.trashed).sort((a, b) => a.createdAt - b.createdAt);
    if (sel.length < 2) return toast("Pilih minimal 2 catatan");
    const id = uid();
    const refRe = /attachment:([^\s)]+)/g;

    // Gambar tersimpan per catatan (folder <user>/<id catatan>), jadi salin dulu ke folder catatan baru.
    const paths = new Set();
    sel.forEach((n) => [...n.content.matchAll(refRe)].forEach((m) => paths.add(m[1])));
    const map = new Map();
    if (paths.size) {
      if (!state.features.v2 || state.offline || !navigator.onLine) return toast("Catatan yang berisi gambar hanya bisa digabung saat online.");
      el.mergeDoBtn.disabled = true;
      toast("Menyalin gambar…");
      try {
        for (const p of paths) {
          if (!p.startsWith(state.user.id + "/")) continue;
          const to = `${state.user.id}/${id}/${p.split("/").pop()}`;
          const { error } = await sb.storage.from(ATTACH_BUCKET).copy(p, to);
          if (error) throw error;
          map.set(p, to);
        }
      } catch (err) {
        await removeAttachments(id).catch(() => {});
        renderMergeBar();
        return toast("Gagal menyalin gambar: " + ((err && err.message) || "coba lagi"));
      }
    }

    const body = sel
      .map((n) => (n.title ? `## ${n.title}\n\n` : "") + n.content.replace(refRe, (m, p) => "attachment:" + (map.get(p) || p)).trim())
      .join("\n\n---\n\n");
    if (body.length > 900_000) return toast("Hasil gabungan terlalu besar");
    const titles = sel.map((n) => n.title).filter(Boolean);
    const now = Date.now();
    const merged = {
      id,
      title: (titles.length ? "Gabungan: " + titles.join(", ") : `Gabungan ${sel.length} catatan`).slice(0, 140),
      content: body,
      tags: [...new Set(sel.flatMap((n) => n.tags))].slice(0, 20),
      color: "", pinned: false, trashed: false, createdAt: now, updatedAt: now,
      folderId: (sel.find((n) => n.folderId && folderById(n.folderId)) || {}).folderId || null,
      remindAt: null,
    };
    notes.unshift(merged);
    dirty.add(id);
    sel.forEach((n) => {
      n.trashed = true;
      n.trashedAt = now;
      n.pinned = false;
      n.remindAt = null;
      stamp(n);
      dirty.add(n.id);
    });
    merge.on = false;
    merge.sel.clear();
    el.mergeToggle.classList.remove("on");
    el.mergeToggle.querySelector("span").textContent = "Gabung";
    renderMergeBar();
    state.view = "all";
    state.activeId = merged.id;
    state.query = "";
    el.searchInput.value = "";
    persist(null, true);
    render();
    toast(`${sel.length} catatan digabung. Aslinya ada di Sampah.`, "Urungkan", () => {
      sel.forEach((n) => {
        n.trashed = false;
        n.trashedAt = null;
        stamp(n);
        dirty.add(n.id);
      });
      permanentlyDelete(merged);
      state.activeId = sel[0].id;
      persist(null, true);
      render();
    });
  }

  // ---------- Berita terkini ----------
  // Berita diambil oleh fungsi server kecil (api/news.py) dari RSS publik media Indonesia, karena
  // browser tidak boleh mengambil RSS situs lain langsung (CORS). Yang dikirim ke server hanya nama sumber.
  const NEWS_SOURCES = { all: "Semua sumber", antara: "Antara", cnn: "CNN Indonesia", bbc: "BBC Indonesia", cnbc: "CNBC Indonesia", republika: "Republika" };
  const news = { items: [], source: NEWS_SOURCES[prefs.newsSource] ? prefs.newsSource : "all", key: "", loadedAt: 0, loading: false, error: "", failed: [] };

  async function loadNews(force = false) {
    if (news.loading) return;
    const fresh = news.items.length && news.key === news.source && Date.now() - news.loadedAt < 10 * 60_000;
    if (fresh && !force) return;
    const wanted = news.source;
    news.loading = true;
    news.error = "";
    renderList();
    try {
      const res = await fetch(`${location.origin}/api/news?source=${encodeURIComponent(wanted)}`, { headers: { Accept: "application/json" } });
      if (res.status === 404) throw new Error("local");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal memuat berita.");
      const ok = (u, re) => typeof u === "string" && re.test(u);
      news.items = (Array.isArray(data.items) ? data.items : [])
        .filter((it) => it && typeof it.title === "string" && ok(it.link, /^https?:\/\//i))
        .map((it) => ({
          title: String(it.title).slice(0, 200),
          link: it.link,
          source: String(it.source || "").slice(0, 40),
          summary: String(it.summary || "").slice(0, 300),
          image: ok(it.image, /^https:\/\//i) ? it.image : "",
          published: Number(it.published) || 0,
        }));
      news.failed = Array.isArray(data.failed) ? data.failed.map(String) : [];
      news.key = wanted;
      news.loadedAt = Date.now();
    } catch (err) {
      news.error = !navigator.onLine
        ? "Kamu sedang offline. Berita butuh internet."
        : err.message === "local"
        ? "Berita hanya tersedia di situs yang sudah di-deploy, bukan di server lokal biasa."
        : err.message || "Gagal memuat berita.";
    } finally {
      news.loading = false;
      if (state.view === "news") renderList();
    }
  }

  function newsHtml(q) {
    if (news.loading && !news.items.length) return '<div class="list-empty">Memuat berita…</div>';
    if (news.error && (!news.items.length || news.key !== news.source))
      return `<div class="list-empty">${escapeHtml(news.error)}<br><button class="link-btn" data-news="retry">Coba lagi</button></div>`;
    const needle = q.toLowerCase();
    const cards = [];
    news.items.forEach((it, i) => {
      if (needle && !`${it.title} ${it.summary} ${it.source}`.toLowerCase().includes(needle)) return;
      cards.push(`<article class="news-card">
        <a class="news-main" href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer">
          ${it.image ? `<img src="${escapeHtml(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
          <span class="news-text"><h4>${highlight(it.title, q)}</h4>${it.summary ? `<p>${highlight(it.summary, q)}</p>` : ""}
          <span class="meta"><b>${escapeHtml(it.source)}</b>${it.published ? `<span>${relativeTime(it.published)}</span>` : ""}</span></span>
        </a>
        <button class="icon-btn" data-save-news="${i}" title="Simpan ke catatan" aria-label="Simpan ke catatan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M12 11v6M9 14h6"/></svg></button>
      </article>`);
    });
    if (!cards.length) return `<div class="list-empty">${q ? `Tidak ada berita yang cocok dengan “${escapeHtml(q)}”.` : "Belum ada berita."}</div>`;
    return cards.join("") + '<div class="news-note">Berita dari RSS publik; klik judul untuk membaca di situs aslinya.</div>';
  }

  function renderNewsBar() {
    const show = state.view === "news";
    el.newsBar.classList.toggle("hidden", !show);
    if (!show) return;
    if (!el.newsSource.options.length)
      el.newsSource.innerHTML = Object.entries(NEWS_SOURCES).map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
    el.newsSource.value = news.source;
    el.newsRefresh.classList.toggle("spin", news.loading);
    el.newsStatus.textContent = news.loading
      ? "Memuat…"
      : news.error && news.items.length
      ? "Gagal memperbarui. Menampilkan berita sebelumnya."
      : news.loadedAt
      ? `Diperbarui ${relativeTime(news.loadedAt)}` + (news.failed.length ? ` · ${news.failed.length} sumber gagal` : "")
      : "";
  }

  function saveNewsItem(i) {
    const it = news.items[i];
    if (!it) return;
    const now = Date.now();
    const url = it.link.replace(/\(/g, "%28").replace(/\)/g, "%29");
    const n = {
      id: uid(), title: it.title.slice(0, 140),
      content: `${it.summary ? it.summary + "\n\n" : ""}[Baca selengkapnya di ${it.source}](${url})`,
      tags: ["berita"], color: "", pinned: false, trashed: false, createdAt: now, updatedAt: now, folderId: null, remindAt: null,
    };
    notes.unshift(n);
    persist(n);
    renderList();
    toast("Disimpan ke catatan", "Buka", () => {
      state.view = "all";
      state.activeId = n.id;
      render();
    });
  }

  // ---------- Pengingat & alarm ----------
  // Pengingat disimpan di database (kolom remind_at) dan berbunyi selama aplikasi terbuka di browser.
  // Tidak ada server push: bila aplikasi tertutup, alarm berbunyi saat dibuka lagi.
  const ringing = new Set(); // id catatan yang alarmnya sedang berbunyi
  let alarmMuted = false;
  let audioCtx = null;
  let beepTimer = null;
  let beepStopTimer = null;
  const SNOOZE_MIN = 10;

  const toLocalInput = (ts) => {
    const d = new Date(ts);
    return `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch {
      /* tanpa suara: dialog dan notifikasi tetap muncul */
    }
  }

  function beep() {
    if (!audioCtx) return;
    [0, 0.28].forEach((delay) => {
      const t = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  function startSound(force = false) {
    if ((alarmMuted && !force) || beepTimer) return;
    unlockAudio();
    // Getar hanya jika pengguna pernah berinteraksi dengan halaman (kalau tidak, browser menolaknya).
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate([300, 150, 300]);
    beep();
    beepTimer = setInterval(beep, 1500);
    beepStopTimer = setTimeout(stopSound, 90_000); // jangan berbunyi tanpa henti
  }

  function stopSound() {
    clearInterval(beepTimer);
    clearTimeout(beepStopTimer);
    beepTimer = beepStopTimer = null;
  }

  function showNotification(n) {
    notifyRaw(n.title || "Pengingat catatan", plainText(n.content).slice(0, 120) || "Waktunya melihat catatan ini.", "remind-" + n.id);
  }

  function notifyRaw(title, body, tag) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const opts = { body, tag, icon: "icons/icon-192.png", requireInteraction: true, data: { tag } };
    const fallback = () => {
      try {
        const x = new Notification(title, opts);
        x.onclick = () => (window.focus(), x.close());
      } catch {
        /* beberapa browser HP hanya mengizinkan lewat service worker */
      }
    };
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then((reg) => (reg ? reg.showNotification(title, opts) : fallback())).catch(fallback);
    } else fallback();
  }

  function checkReminders() {
    if (!state.user || !state.features.v3) return;
    const now = Date.now();
    const due = notes.filter((n) => !n.trashed && n.remindAt && n.remindAt <= now);
    const dueIds = new Set(due.map((n) => n.id));
    let changed = false;
    for (const id of [...ringing]) {
      if (!dueIds.has(id)) (ringing.delete(id), (changed = true)); // sudah ditunda/selesai (mis. di perangkat lain)
    }
    for (const n of due) {
      if (ringing.has(n.id)) continue;
      ringing.add(n.id);
      changed = true;
      showNotification(n);
    }
    if (changed) renderAlarm();
  }

  function renderAlarm() {
    if (!ringing.size) {
      alarmMuted = false;
      stopSound();
      if (el.alarmDialog.open) el.alarmDialog.close();
      return;
    }
    el.alarmList.innerHTML = [...ringing]
      .map((id) => notes.find((n) => n.id === id))
      .filter(Boolean)
      .sort((a, b) => a.remindAt - b.remindAt)
      .map(
        (n) => `<div class="alarm-item" data-id="${n.id}">
          <h4>${escapeHtml(n.title || "Tanpa judul")}</h4>
          <small>Dijadwalkan ${formatRemind(n.remindAt)}</small>
          <div class="alarm-acts">
            <button class="btn-primary" data-alarm="open">Buka</button>
            <button class="btn-secondary" data-alarm="snooze">Tunda ${SNOOZE_MIN} menit</button>
            <button class="btn-secondary" data-alarm="done">Selesai</button>
          </div></div>`
      )
      .join("");
    el.alarmMuteBtn.classList.toggle("hidden", alarmMuted);
    if (!el.alarmDialog.open) el.alarmDialog.showModal(); // tampil di atas dialog lain yang terbuka
    startSound();
  }

  function setRemind(n, ts) {
    n.remindAt = ts;
    stamp(n);
    persist(n, true);
    ringing.delete(n.id);
    renderList();
    renderEditor();
    renderAlarm();
  }

  function onAlarmClick(e) {
    const b = e.target.closest("[data-alarm]");
    const item = e.target.closest("[data-id]");
    const n = item && notes.find((x) => x.id === item.dataset.id);
    if (!b || !n) return;
    const kind = b.dataset.alarm;
    if (kind === "snooze") {
      setRemind(n, Date.now() + SNOOZE_MIN * 60_000);
      toast(`Ditunda ${SNOOZE_MIN} menit`);
    } else if (kind === "done") {
      setRemind(n, null);
    } else {
      el.alarmDialog.close();
      if (state.view !== "all") state.view = "all";
      state.query = "";
      el.searchInput.value = "";
      selectNote(n.id);
    }
  }

  function openRemind() {
    const n = activeNote();
    if (!n || n.trashed) return;
    if (!state.features.v3) return toast("Jalankan migrasi database 003 dulu (lihat README).");
    unlockAudio();
    el.remindNoteTitle.textContent = n.title || "Tanpa judul";
    let t = n.remindAt;
    if (!t) {
      t = Date.now() + 3600_000;
      t = Math.ceil(t / 300_000) * 300_000; // bulatkan ke 5 menit berikutnya
    }
    el.remindInput.value = toLocalInput(t);
    el.remindClearBtn.classList.toggle("hidden", !n.remindAt);
    el.remindMsg.textContent = "";
    el.remindMsg.className = "set-msg";
    el.remindDialog.showModal();
  }

  function saveRemind() {
    const n = activeNote();
    if (!n) return;
    const ts = new Date(el.remindInput.value).getTime();
    const fail = (text) => {
      el.remindMsg.textContent = text;
      el.remindMsg.className = "set-msg err";
    };
    if (!Number.isFinite(ts)) return fail("Pilih tanggal dan jam pengingat.");
    if (ts <= Date.now()) return fail("Waktunya sudah lewat. Pilih waktu yang akan datang.");
    unlockAudio();
    setRemind(n, ts);
    el.remindDialog.close();
    toast(`Pengingat diatur: ${formatRemind(ts)}`);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then(renderRemindBar).catch(() => {});
    }
  }

  function quickRemind(kind) {
    let t;
    if (kind === "tomorrow") {
      t = new Date();
      t.setDate(t.getDate() + 1);
      t.setHours(8, 0, 0, 0);
      t = t.getTime();
    } else t = Date.now() + Number(kind) * 60_000;
    el.remindInput.value = toLocalInput(t);
  }

  // ---------- Rekam suara (dikte) ----------
  // Memakai Web Speech API bawaan browser (Chrome, Edge, Safari). Di Chrome/Edge audio diproses
  // oleh layanan pengenalan suara milik Google/Microsoft; Catatan sendiri tidak menyimpan audionya.
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voice = { rec: null, active: false, noteId: null, before: "", after: "", committed: "", interim: "", quiet: 0, heard: false };

  function applyDictation() {
    const n = notes.find((x) => x.id === voice.noteId);
    if (!n) return;
    const text = [voice.committed, voice.interim].filter(Boolean).join(" ");
    const lead = voice.before && text && !/\s$/.test(voice.before) ? " " : "";
    const value = voice.before + lead + text + voice.after;
    if (value === n.content) return;
    n.content = value;
    if (text && !n.tags.includes(VOICE_TAG) && n.tags.length < 20) {
      n.tags.push(VOICE_TAG); // penanda catatan suara (ikon mikrofon di daftar)
      if (state.activeId === n.id) renderChips(n);
    }
    if (state.activeId === n.id) {
      el.contentInput.value = value;
      const caret = (voice.before + lead + text).length;
      el.contentInput.setSelectionRange(caret, caret);
    }
    touch(n);
  }

  function setRecUi(on) {
    el.recBar.classList.toggle("hidden", !on);
    el.contentInput.classList.toggle("dictating", on);
    const mic = el.formatBar.querySelector('[data-fmt="mic"]');
    if (mic) mic.classList.toggle("rec-on", on);
    el.fabMic.classList.toggle("rec-on", on);
    el.fabMic.title = on ? "Berhenti merekam" : "Rekam suara jadi catatan";
    if (on) el.recText.textContent = "Mendengarkan… bicaralah";
  }

  function startDictation(opts = {}) {
    const n = activeNote();
    if (!SpeechRec || !n || n.trashed || voice.active) return;
    if (state.mode !== "edit") {
      state.mode = "edit";
      renderMode();
    }
    const ta = el.contentInput;
    const start = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
    const end = ta.selectionEnd == null ? start : ta.selectionEnd;
    Object.assign(voice, {
      active: true, noteId: n.id, before: ta.value.slice(0, start), after: ta.value.slice(end),
      committed: "", interim: "", quiet: 0, heard: false, ai: !!opts.ai,
    });
    const rec = new SpeechRec();
    voice.rec = rec;
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = !/android/i.test(navigator.userAgent); // di Android hasil "continuous" sering terduplikasi
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) {
          const piece = t.trim();
          if (piece) voice.committed += (voice.committed ? " " : "") + piece;
        } else interim += t;
      }
      voice.interim = interim.trim();
      voice.heard = true;
      voice.quiet = 0;
      el.recText.textContent = voice.interim ? "…" + voice.interim.slice(-60) : "Mendengarkan… bicaralah";
      applyDictation();
    };
    rec.onerror = (e) => {
      const msg = {
        "not-allowed": "Izin mikrofon ditolak. Izinkan mikrofon untuk situs ini di pengaturan browser.",
        "service-not-allowed": "Browser tidak mengizinkan rekam suara di sini.",
        "audio-capture": "Mikrofon tidak ditemukan.",
        network: "Rekam suara butuh koneksi internet.",
        "language-not-supported": "Bahasa Indonesia belum didukung browser ini untuk rekam suara.",
      }[e.error];
      if (msg) {
        toast(msg);
        voice.active = false;
      }
    };
    rec.onend = () => {
      if (voice.active && voice.rec === rec) {
        // Browser menutup sesi setelah hening; sambung lagi kecuali sudah terlalu lama diam.
        voice.quiet = voice.heard ? 0 : voice.quiet + 1;
        voice.heard = false;
        if (voice.quiet >= 3) {
          toast("Rekaman berhenti karena tidak ada suara");
          voice.active = false;
        } else {
          try {
            return void rec.start(); // hasil sesi baru mulai dari nol; yang lama sudah tersimpan di voice.committed
          } catch {
            voice.active = false;
          }
        }
      }
      if (voice.rec === rec) {
        const seg = { noteId: voice.noteId, before: voice.before, after: voice.after, text: [voice.committed, voice.interim].filter(Boolean).join(" "), ai: voice.ai };
        voice.rec = null;
        voice.interim = "";
        voice.noteId = null;
        setRecUi(false);
        const cur = activeNote();
        el.contentInput.readOnly = !!(cur && cur.trashed);
        if (seg.noteId && seg.text) polishVoice(seg); // AI merapikan hasil dikte bila diaktifkan
      }
    };
    try {
      setRecUi(true);
      el.contentInput.readOnly = true;
      rec.start();
    } catch {
      voice.active = false;
      voice.rec = null;
      setRecUi(false);
      el.contentInput.readOnly = false;
      toast("Tidak bisa memulai rekam suara");
    }
  }

  function stopDictation() {
    if (!voice.rec) return (voice.active = false);
    voice.active = false;
    el.recText.textContent = "Menyelesaikan…";
    try {
      voice.rec.stop(); // hasil terakhir masih bisa datang sebelum onend
    } catch {
      voice.rec = null;
      setRecUi(false);
    }
    el.contentInput.readOnly = false;
  }

  function recordNewNote() {
    if (voice.active) return stopDictation();
    createNote();
    startDictation();
  }

  // ---------- AI: parafrase singkat dan merapikan hasil rekam suara ----------
  // Dipanggil lewat server (api/ai.py): memeriksa sesi, kuota harian, lalu memakai kunci AI milik pemilik aplikasi.
  async function aiCall(mode, text) {
    if (!prefs.aiOk) {
      const ok = confirm(
        "Teks yang diproses akan dikirim lewat server Catatan ke layanan AI (Google Gemini), lalu hasilnya dikembalikan ke sini. " +
          "Catatan tidak menyimpan teks itu di luar catatanmu. Lanjutkan?"
      );
      if (!ok) throw new Error("Dibatalkan.");
      prefs.aiOk = true;
      savePrefs();
    }
    if (!state.session) throw new Error("Masuk dulu untuk memakai AI.");
    if (!navigator.onLine) throw new Error("AI butuh koneksi internet.");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 40_000);
    try {
      const res = await fetch(`${location.origin}/api/ai`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.session.access_token}`, "x-supabase-key": SUPABASE_KEY },
        body: JSON.stringify({ mode, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) throw new Error("Fitur AI hanya tersedia di situs yang sudah di-deploy (bukan server lokal biasa).");
      if (!res.ok) throw new Error(data.error || "AI gagal. Coba lagi.");
      return data;
    } catch (err) {
      if (err.name === "AbortError") throw new Error("AI terlalu lama menjawab. Coba lagi.");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const ai = { noteId: null, range: [0, 0], original: "", whole: false, token: 0 };

  function setAiMsg(text, kind = "") {
    el.aiMsg.textContent = text;
    el.aiMsg.className = `set-msg ${kind}`;
  }
  function setAiBusy(busy) {
    [el.aiReplace, el.aiInsert, el.aiCopy, el.aiRetry].forEach((b) => (b.disabled = busy));
    el.aiResult.readOnly = busy;
    if (busy) {
      el.aiResult.value = "";
      el.aiResult.placeholder = "AI sedang menulis ulang…";
      setAiMsg("Memproses…");
    } else el.aiResult.placeholder = "Menunggu AI…";
  }

  // Parafrase teks terpilih; tanpa pilihan, seluruh catatan.
  function openAi() {
    const n = activeNote();
    if (!n || n.trashed) return;
    if (state.mode !== "edit") {
      state.mode = "edit";
      renderMode();
    }
    const ta = el.contentInput;
    const a = ta.selectionStart, b = ta.selectionEnd;
    const hasSel = b > a;
    const text = hasSel ? ta.value.slice(a, b) : ta.value;
    if (text.trim().length < 15) return toast(hasSel ? "Pilih teks yang lebih panjang untuk diparafrase." : "Catatan masih terlalu pendek untuk diparafrase.");
    if (text.length > 6000) return toast("Teks terlalu panjang (maksimal 6.000 karakter). Pilih sebagian saja.");
    Object.assign(ai, { noteId: n.id, range: hasSel ? [a, b] : [0, ta.value.length], original: text, whole: !hasSel });
    el.aiScope.textContent = hasSel ? "Teks terpilih" : "Seluruh catatan";
    el.aiOrig.textContent = text.length > 1500 ? text.slice(0, 1500) + "…" : text;
    // Mengganti seluruh catatan yang berisi gambar akan merusak tautan gambarnya: hanya boleh disisipkan.
    const risky = ai.whole && /\]\(attachment:/.test(text);
    el.aiReplace.title = risky ? "Catatan berisi gambar: pilih bagian teks saja untuk menggantinya" : "";
    el.aiReplace.dataset.blocked = risky ? "1" : "";
    el.aiDialog.showModal();
    runAi();
  }

  async function runAi() {
    const token = ++ai.token;
    setAiBusy(true);
    try {
      const d = await aiCall("paraphrase", ai.original);
      if (token !== ai.token) return;
      setAiBusy(false);
      el.aiResult.value = d.text;
      setAiMsg(d.remaining != null ? `Sisa kuota AI hari ini: ${d.remaining}` : "");
    } catch (err) {
      if (token !== ai.token) return;
      setAiBusy(false);
      setAiMsg(err.message, "err");
    }
  }

  function aiApply(kind) {
    const out = el.aiResult.value.trim();
    const n = notes.find((x) => x.id === ai.noteId);
    if (!out || !n) return;
    const [a, b] = ai.range;
    const prev = n.content;
    if (kind === "replace") {
      if (el.aiReplace.dataset.blocked) return setAiMsg("Catatan ini berisi gambar. Pilih bagian teks saja untuk menggantinya, atau pakai Sisipkan.", "err");
      if (prev.slice(a, b) !== ai.original) return setAiMsg("Teks asli sudah berubah. Pakai Sisipkan atau Salin.", "err");
      n.content = prev.slice(0, a) + out + prev.slice(b);
    } else {
      n.content = prev.slice(0, b) + (prev.slice(0, b).endsWith("\n\n") || !b ? "" : "\n\n") + out + prev.slice(b);
    }
    ai.token++;
    el.aiDialog.close();
    if (state.activeId === n.id) el.contentInput.value = n.content;
    touch(n);
    toast(kind === "replace" ? "Teks diganti dengan hasil AI" : "Hasil AI disisipkan", "Urungkan", () => {
      n.content = prev;
      if (state.activeId === n.id) el.contentInput.value = prev;
      touch(n);
    });
  }

  // Setelah rekam suara selesai: AI merapikan teks dikte (bila diaktifkan), dengan tombol Urungkan.
  async function polishVoice(seg) {
    if (!(prefs.aiVoice || seg.ai) || seg.text.trim().length < 20) return;
    const n = notes.find((x) => x.id === seg.noteId);
    if (!n || n.trashed) return;
    const lead = seg.before && !/\s$/.test(seg.before) ? " " : "";
    const dictated = seg.before + lead + seg.text + seg.after;
    if (n.content !== dictated) return toast("Catatan sudah berubah. Tekan ✨ di toolbar untuk merapikan manual.");
    toast("✨ AI sedang merapikan hasil rekaman…");
    let d;
    try {
      d = await aiCall("voice", seg.text);
    } catch (err) {
      return toast("AI: " + err.message);
    }
    const m = d.text.match(/^\s*Judul:\s*(.{1,100}?)\s*\r?\n+([\s\S]*)$/);
    const title = m ? m[1].trim() : "";
    const body = (m ? m[2] : d.text).trim();
    if (!body) return;
    if (n.content !== dictated) return toast("Catatan berubah saat AI bekerja; hasil AI tidak dipasang.");
    const prev = { content: n.content, title: n.title, original: n.voiceOriginal || null };
    n.content = seg.before + lead + body + seg.after;
    if (!n.title && title) n.title = title.slice(0, 140);
    if (state.features.v10) n.voiceOriginal = seg.text.slice(0, 20000); // simpan ucapan asli untuk bagian "Teks Asli Rekaman"
    touch(n);
    if (state.activeId === n.id) {
      el.contentInput.value = n.content;
      el.titleInput.value = n.title;
      renderEditor();
    }
    renderList();
    toast("✨ Rekaman dirapikan oleh AI", "Urungkan", () => {
      n.content = prev.content;
      n.title = prev.title;
      n.voiceOriginal = prev.original;
      touch(n);
      if (state.activeId === n.id) {
        el.contentInput.value = n.content;
        el.titleInput.value = n.title;
      }
    });
  }

  // ---------- Pasang aplikasi (PWA) ----------
  let installEvent = null;
  const INSTALL_SNOOZE_MS = 14 * 24 * 3600 * 1000;
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function updateInstallUi() {
    const canPrompt = !!installEvent && !isStandalone();
    const ios = !canPrompt && isIOS() && !isStandalone();
    el.installSection.classList.toggle("hidden", !canPrompt);
    const snoozed = prefs.installDismissed && Date.now() - prefs.installDismissed < INSTALL_SNOOZE_MS;
    el.installBar.classList.toggle("hidden", !state.user || snoozed || !(canPrompt || ios));
    if (ios) {
      el.installText.innerHTML = "💡 Pasang <b>Catatan</b> di iPhone/iPad: ketuk tombol <b>Bagikan</b>, lalu pilih <b>Tambahkan ke Layar Utama</b>.";
      el.installBtn.textContent = "Mengerti";
    } else {
      el.installText.innerHTML = "💡 Pasang <b>Catatan</b> di perangkatmu agar lebih cepat dibuka dan bisa dipakai offline.";
      el.installBtn.textContent = "Instal sekarang";
    }
  }

  async function installApp() {
    if (!installEvent) {
      prefs.installDismissed = Date.now(); // petunjuk iOS: cukup dibaca
      savePrefs();
      return updateInstallUi();
    }
    const ev = installEvent;
    installEvent = null;
    try {
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome !== "accepted") (prefs.installDismissed = Date.now()), savePrefs();
    } catch {
      /* dibatalkan */
    }
    updateInstallUi();
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
    updateInstallUi();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    updateInstallUi();
    toast("Catatan sudah terpasang ✓");
  });

  // ---------- API untuk modul (social.js, booking.js) ----------
  const modules = {};
  const mods = new Set();
  window.CatatanApp = {
    register(views, mod) {
      views.forEach((v) => (modules[v] = mod));
      mods.add(mod);
      if (state.user && mod.onLogin) mod.onLogin(state.user, sb);
      if (isModView() && modules[state.view] === mod) mod.enter(state.view);
    },
    get sb() { return sb; },
    get user() { return state.user; },
    get online() { return navigator.onLine && !state.offline; },
    list: el.modList,
    pane: el.modPane,
    view: () => state.view,
    setView,
    toast, escapeHtml, relativeTime, fullDate, uid,
    setCount(name, n) {
      const e = document.querySelector(`[data-count="${name}"]`);
      if (e) e.textContent = n ? (n > 99 ? "99+" : String(n)) : "";
    },
    setMainOpen(open) { el.app.classList.toggle("editing", !!open); },
    sound: { start: () => startSound(true), stop: stopSound },
    notify: notifyRaw,
    unlockAudio,
    renderRemindBar,
    setReminderExtra(n) {
      remExtra = n || 0;
      const e = document.querySelector('[data-count="reminders"]');
      if (e) e.textContent = notes.filter((x) => !x.trashed && x.remindAt).length + remExtra || "";
    },
    // Pengingat yang dipasang pada catatan (ikon lonceng di editor).
    noteReminders: () => notes.filter((n) => !n.trashed && n.remindAt).map((n) => ({ id: n.id, title: n.title, remindAt: n.remindAt })).sort((a, b) => a.remindAt - b.remindAt),
    openNote(id) {
      setView("all");
      state.query = "";
      el.searchInput.value = "";
      selectNote(id);
    },
    clearNoteReminder(id) {
      const n = notes.find((x) => x.id === id);
      if (n) setRemind(n, null);
    },
    formatRemind,
    // Buat catatan baru dari modul lain (mis. impor chat); mengembalikan id catatan.
    addNote({ title, content, tags }) {
      const now = Date.now();
      const n = {
        id: uid(), title: String(title || "").slice(0, 140), content: String(content || ""), tags: (tags || []).slice(0, 20), color: "",
        pinned: false, trashed: false, createdAt: now, updatedAt: now, folderId: null, remindAt: null,
      };
      notes.unshift(n);
      persist(n);
      renderList();
      return n.id;
    },
  };
  const modsLogin = () => mods.forEach((m) => m.onLogin && m.onLogin(state.user, sb));
  const modsLogout = () => mods.forEach((m) => m.onLogout && m.onLogout());

  // ---------- Tombol mikrofon melayang: bisa diseret, posisinya diingat ----------
  let fabMoved = false; // true sesaat setelah seretan, supaya klik berikutnya diabaikan

  function updateFab() {
    const supported = !!SpeechRec;
    el.fabMic.classList.toggle("hidden", !supported || prefs.fabHidden);
    el.fabShow.checked = !prefs.fabHidden;
    applyFab();
  }

  // Posisi disimpan sebagai pecahan (0..1) dari ruang gerak, sehingga tetap masuk akal di layar berbeda ukuran.
  function applyFab() {
    const b = el.fabMic;
    if (!prefs.fab || b.classList.contains("hidden")) {
      b.style.left = b.style.top = b.style.right = b.style.bottom = "";
      return;
    }
    const w = b.offsetWidth || 54;
    const h = b.offsetHeight || 54;
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - w - margin);
    const maxY = Math.max(margin, window.innerHeight - h - margin);
    b.style.left = Math.round(margin + prefs.fab.x * (maxX - margin)) + "px";
    b.style.top = Math.round(margin + prefs.fab.y * (maxY - margin)) + "px";
    b.style.right = b.style.bottom = "auto";
  }

  function saveFabFromPixels(left, top) {
    const b = el.fabMic;
    const margin = 8;
    const maxX = Math.max(margin + 1, window.innerWidth - b.offsetWidth - margin);
    const maxY = Math.max(margin + 1, window.innerHeight - b.offsetHeight - margin);
    prefs.fab = {
      x: Math.min(1, Math.max(0, (left - margin) / (maxX - margin))),
      y: Math.min(1, Math.max(0, (top - margin) / (maxY - margin))),
    };
    savePrefs();
    applyFab();
  }

  function setupFab() {
    const b = el.fabMic;
    let drag = null;
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const r = b.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false, id: e.pointerId };
    });
    b.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        b.setPointerCapture(e.pointerId);
        b.classList.add("dragging");
      }
      const w = b.offsetWidth, h = b.offsetHeight;
      b.style.left = Math.min(window.innerWidth - w - 4, Math.max(4, drag.ox + dx)) + "px";
      b.style.top = Math.min(window.innerHeight - h - 4, Math.max(4, drag.oy + dy)) + "px";
      b.style.right = b.style.bottom = "auto";
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      b.classList.remove("dragging");
      if (moved) {
        fabMoved = true;
        setTimeout(() => (fabMoved = false), 350); // batas waktu jaga-jaga bila klik tidak datang
        saveFabFromPixels(parseFloat(b.style.left), parseFloat(b.style.top));
      }
    };
    b.addEventListener("pointerup", end);
    b.addEventListener("pointercancel", end);
    // keyboard: tombol panah menggeser 24px
    b.addEventListener("keydown", (e) => {
      const d = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key];
      if (!d) return;
      e.preventDefault();
      const r = b.getBoundingClientRect();
      saveFabFromPixels(r.left + d[0], r.top + d[1]);
    });
    window.addEventListener("resize", applyFab);
    el.fabShow.addEventListener("change", () => {
      prefs.fabHidden = !el.fabShow.checked;
      savePrefs();
      updateFab();
    });
    el.fabReset.addEventListener("click", () => {
      prefs.fab = null;
      prefs.fabHidden = false;
      savePrefs();
      updateFab();
      toast("Tombol mikrofon dikembalikan ke pojok kanan bawah");
    });
  }

  // ---------- Events ----------
  el.newNoteBtn.addEventListener("click", () => createNote());
  el.emptyNewBtn.addEventListener("click", () => createNote());
  el.recNoteBtn.addEventListener("click", recordNewNote);
  el.recStopBtn.addEventListener("click", stopDictation);
  el.fabMic.addEventListener("click", (e) => {
    if (fabMoved) return void (fabMoved = false, e.preventDefault()); // klik setelah menyeret bukan perintah rekam
    recordNewNote();
  });
  setupFab();
  el.emptyRecBtn.addEventListener("click", recordNewNote);

  // Berita
  el.newsSource.addEventListener("change", () => {
    news.source = el.newsSource.value;
    prefs.newsSource = news.source;
    savePrefs();
    news.items = [];
    news.error = "";
    loadNews(true);
  });
  el.newsRefresh.addEventListener("click", () => loadNews(true));
  el.noteList.addEventListener("click", (e) => {
    const save = e.target.closest("[data-save-news]");
    if (save) return saveNewsItem(Number(save.dataset.saveNews));
    if (e.target.closest('[data-news="retry"]')) loadNews(true);
  });
  el.noteList.addEventListener("error", (e) => e.target.tagName === "IMG" && e.target.remove(), true); // gambar berita gagal dimuat
  if (SpeechRec) {
    el.fabSection.classList.remove("hidden");
    updateFab();
    el.emptyRecBtn.classList.remove("hidden");
    el.recNoteBtn.classList.remove("hidden");
    el.formatBar.querySelector('[data-fmt="mic"]').classList.remove("hidden");
  }

  // AI
  el.aiRetry.addEventListener("click", runAi);
  el.aiReplace.addEventListener("click", () => aiApply("replace"));
  el.aiInsert.addEventListener("click", () => aiApply("insert"));
  el.aiCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el.aiResult.value);
      setAiMsg("Hasil disalin.", "ok");
    } catch {
      el.aiResult.select();
      document.execCommand("copy");
    }
  });
  el.aiDialog.addEventListener("close", () => ai.token++);
  const syncAiVoice = () => {
    el.recAi.checked = el.aiVoiceSet.checked = !!prefs.aiVoice;
  };
  syncAiVoice();
  [el.recAi, el.aiVoiceSet].forEach((c) =>
    c.addEventListener("change", () => {
      prefs.aiVoice = c.checked;
      savePrefs();
      syncAiVoice();
    })
  );

  // Aksi catatan
  el.copyBtn.addEventListener("click", copyActive);
  el.moveBtn.addEventListener("click", openMove);
  el.focusBtn.addEventListener("click", () => toggleFocus());
  el.moveList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-folder]");
    if (b) moveActive(b.dataset.folder);
  });
  el.mergeToggle.addEventListener("click", () => setMerge(!merge.on));
  el.mergeCancelBtn.addEventListener("click", () => setMerge(false));
  el.mergeDoBtn.addEventListener("click", mergeSelected);
  el.folderHead.addEventListener("click", () => {
    prefs.foldersHidden = !prefs.foldersHidden;
    savePrefs();
    renderList();
  });

  // Folder
  el.addFolderBtn.addEventListener("click", () => addFolder(null));
  el.folderTree.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (a) {
      const id = a.dataset.id;
      if (a.dataset.act === "sub") addFolder(id);
      else if (a.dataset.act === "rename") renameFolder(id);
      else deleteFolder(id);
      return;
    }
    const t = e.target.closest("[data-toggle]");
    if (t) return toggleFolder(t.dataset.toggle);
    const o = e.target.closest("[data-open]");
    if (o) setView(state.view === "folder:" + o.dataset.open ? "all" : "folder:" + o.dataset.open);
  });
  el.folderFilter.addEventListener("change", () => setView(el.folderFilter.value ? "folder:" + el.folderFilter.value : "all"));
  el.folderSelect.addEventListener("change", () => {
    const n = activeNote();
    if (!n) return;
    n.folderId = el.folderSelect.value || null;
    touch(n);
    toast(n.folderId ? `Dipindahkan ke “${folderById(n.folderId).name}”` : "Dikeluarkan dari folder");
  });

  // Kalender
  el.calendar.addEventListener("click", (e) => {
    const c = e.target.closest("[data-cal]");
    if (c) return calendarNav(c.dataset.cal);
    const d = e.target.closest("[data-day]");
    if (d) pickDay(d.dataset.day);
  });

  // Pengingat & alarm
  el.remindBtn.addEventListener("click", openRemind);
  el.remindSaveBtn.addEventListener("click", saveRemind);
  el.remindClearBtn.addEventListener("click", () => {
    const n = activeNote();
    if (n) setRemind(n, null);
    el.remindDialog.close();
    toast("Pengingat dihapus");
  });
  el.remindQuick.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b) quickRemind(b.dataset.add);
  });
  el.remindInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRemind();
    }
  });
  el.alarmList.addEventListener("click", onAlarmClick);
  el.alarmMuteBtn.addEventListener("click", () => {
    alarmMuted = true;
    stopSound();
    el.alarmMuteBtn.classList.add("hidden");
  });
  el.alarmDialog.addEventListener("close", stopSound);
  setInterval(checkReminders, 15_000);

  // Pasang aplikasi
  el.installBtn.addEventListener("click", installApp);
  el.setInstallBtn.addEventListener("click", () => {
    el.settingsDialog.close();
    installApp();
  });
  el.installLater.addEventListener("click", () => {
    prefs.installDismissed = Date.now();
    savePrefs();
    updateInstallUi();
  });

  el.nav.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  el.tagList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tag]");
    if (b) setView(state.view === "tag:" + b.dataset.tag ? "all" : "tag:" + b.dataset.tag);
  });

  el.noteList.addEventListener("click", (e) => {
    const card = e.target.closest(".note-card");
    if (!card) return;
    if (merge.on) toggleMergePick(card.dataset.id);
    else selectNote(card.dataset.id);
  });

  el.searchInput.addEventListener("input", () => {
    state.query = el.searchInput.value;
    renderList();
  });

  el.sortSelect.value = prefs.sort;
  el.sortSelect.addEventListener("change", () => {
    prefs.sort = el.sortSelect.value;
    savePrefs();
    renderList();
  });

  el.titleInput.addEventListener("input", () => {
    const n = activeNote();
    if (!n) return;
    n.title = el.titleInput.value;
    touch(n);
  });
  el.titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (state.mode === "preview") { state.mode = "edit"; renderMode(); }
      el.contentInput.focus();
    }
  });

  el.contentInput.addEventListener("input", () => {
    const n = activeNote();
    if (!n) return;
    n.content = el.contentInput.value;
    touch(n);
  });

  // Smart list continuation in the textarea
  el.contentInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    const ta = el.contentInput;
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", start - 1) + 1;
    const line = ta.value.slice(lineStart, start);
    const m = line.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)\. )(.*)$/);
    if (!m) return;
    e.preventDefault();
    if (!m[4].trim()) {
      // empty item -> end list
      ta.setRangeText("", lineStart, start, "end");
    } else {
      let bullet = m[2];
      if (m[3]) bullet = `${Number(m[3]) + 1}. `;
      else if (/\[[xX]\]/.test(bullet)) bullet = bullet.replace(/\[[xX]\]/, "[ ]");
      ta.setRangeText("\n" + m[1] + bullet, start, ta.selectionEnd, "end");
    }
    ta.dispatchEvent(new Event("input"));
  });

  el.preview.addEventListener("change", (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-line]');
    const n = activeNote();
    if (!cb || !n || n.trashed) return;
    const lines = n.content.split("\n");
    const i = Number(cb.dataset.line);
    lines[i] = lines[i].replace(/\[([ xX])\]/, cb.checked ? "[x]" : "[ ]");
    n.content = lines.join("\n");
    el.contentInput.value = n.content;
    cb.closest("li").classList.toggle("done", cb.checked);
    touch(n);
    renderAccordions(n);
  });

  el.tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(el.tagInput.value);
      el.tagInput.value = "";
    } else if (e.key === "Backspace" && !el.tagInput.value) {
      const n = activeNote();
      if (n && n.tags.length) {
        n.tags.pop();
        renderChips(n);
        touch(n);
      }
    }
  });
  el.tagInput.addEventListener("blur", () => {
    if (el.tagInput.value.trim()) addTag(el.tagInput.value);
    el.tagInput.value = "";
  });

  el.tagChips.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove-tag]");
    const n = activeNote();
    if (!b || !n) return;
    n.tags = n.tags.filter((t) => t !== b.dataset.removeTag);
    renderChips(n);
    touch(n);
  });

  el.colorPicker.addEventListener("click", (e) => {
    const b = e.target.closest("[data-color]");
    const n = activeNote();
    if (!b || !n) return;
    n.color = b.dataset.color;
    renderColors(n);
    touch(n);
  });

  el.pinBtn.addEventListener("click", () => {
    const n = activeNote();
    if (!n) return;
    n.pinned = !n.pinned;
    stamp(n);
    persist(n);
    render();
  });

  el.editToggleBtn.addEventListener("click", () => {
    const n = activeNote();
    if (!n || n.trashed) return;
    state.mode = state.mode === "edit" ? "preview" : "edit";
    renderMode();
    if (state.mode === "edit") el.contentInput.focus();
  });
  el.voiceNoteBtn.addEventListener("click", () => (voice.active ? stopDictation() : startDictation({ ai: true })));
  el.origAcc.addEventListener("toggle", () => (accOpen.orig = el.origAcc.open));
  el.taskAcc.addEventListener("toggle", () => (accOpen.task = el.taskAcc.open));
  el.taskBody.addEventListener("change", (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-line]');
    const n = activeNote();
    if (!cb || !n || n.trashed) return;
    const lines = n.content.split("\n");
    const i = Number(cb.dataset.line);
    lines[i] = lines[i].replace(/\[([ xX])\]/, cb.checked ? "[x]" : "[ ]");
    n.content = lines.join("\n");
    el.contentInput.value = n.content;
    touch(n);
    renderMode();
    renderAccordions(n);
  });
  el.titleInput.addEventListener("input", autosizeTitle);
  el.titleInput.addEventListener("paste", (e) => {
    const t = (e.clipboardData && e.clipboardData.getData("text")) || "";
    if (!/\n/.test(t)) return;
    e.preventDefault();
    el.titleInput.setRangeText(t.replace(/\s*\n+\s*/g, " "), el.titleInput.selectionStart, el.titleInput.selectionEnd, "end");
    el.titleInput.dispatchEvent(new Event("input"));
  });

  el.modeSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b) return;
    state.mode = b.dataset.mode;
    renderMode();
  });

  el.deleteBtn.addEventListener("click", deleteActive);
  el.restoreBtn.addEventListener("click", restoreActive);
  el.backBtn.addEventListener("click", () => {
    state.activeId = null;
    render();
  });

  el.themeBtn.addEventListener("click", () => {
    prefs.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    savePrefs();
    applyTheme();
  });

  el.exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `catatan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${notes.length} catatan diekspor`);
  });

  el.importBtn.addEventListener("click", () => el.importInput.click());
  el.importInput.addEventListener("change", async () => {
    const file = el.importInput.files[0];
    el.importInput.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error();
      const existing = new Set(notes.map((n) => n.id));
      let added = 0;
      data.forEach((d) => {
        if (!d || typeof d !== "object") return;
        const now = Date.now();
        const n = {
          id: /^[A-Za-z0-9_-]{1,64}$/.test(String(d.id || "")) && !existing.has(String(d.id)) ? String(d.id) : uid(),
          title: String(d.title || ""),
          content: String(d.content || ""),
          tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
          color: COLORS.includes(d.color) ? d.color : "",
          pinned: !!d.pinned,
          trashed: !!d.trashed,
          createdAt: Number(d.createdAt) || now,
          updatedAt: Number(d.updatedAt) || now,
        };
        existing.add(n.id);
        notes.push(n);
        dirty.add(n.id);
        added++;
      });
      persist(null, true);
      render();
      toast(`${added} catatan diimpor`);
    } catch {
      toast("Berkas tidak valid");
    }
  });

  // Toolbar format & pintasan di editor
  el.formatBar.addEventListener("mousedown", (e) => e.preventDefault()); // jangan hilangkan seleksi teks
  el.formatBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fmt]");
    if (!b) return;
    if (b.dataset.fmt === "mic") return voice.active ? stopDictation() : startDictation();
    if (b.dataset.fmt === "ai") return openAi();
    applyFormat(b.dataset.fmt);
  });
  el.contentInput.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b" || k === "i") {
      e.preventDefault();
      applyFormat(k === "b" ? "bold" : "italic");
    }
  });

  // Gambar: tombol, tempel, dan seret-lepas
  el.imageInput.addEventListener("change", () => {
    const files = el.imageInput.files;
    if (files && files.length) uploadImages([...files]);
    el.imageInput.value = "";
  });
  el.contentInput.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    uploadImages(files);
  });
  el.contentInput.addEventListener("dragover", (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    el.contentInput.classList.add("dragover");
  });
  el.contentInput.addEventListener("dragleave", () => el.contentInput.classList.remove("dragover"));
  el.contentInput.addEventListener("drop", (e) => {
    el.contentInput.classList.remove("dragover");
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    uploadImages(files);
  });

  // Menu ⋯
  el.moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener("click", (e) => {
    if (!el.moreMenu.classList.contains("hidden") && !e.target.closest(".menu-wrap")) toggleMenu(false);
  });
  el.moreMenu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    toggleMenu(false);
    ({ share: openShare, history: openHistory, export: openExport, print: printNote, copy: copyActive, move: openMove, ai: openAi })[b.dataset.action]();
  });

  // Ekspor
  el.exportGrid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-format]");
    if (b) runExport(b.dataset.format);
  });
  el.setExportXlsxBtn.addEventListener("click", exportAllExcel);

  // Berbagi
  el.shareToggleBtn.addEventListener("click", toggleShare);
  el.copyShareBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el.shareLink.value);
    } catch {
      el.shareLink.select();
      document.execCommand("copy");
    }
    el.copyShareBtn.textContent = "Tersalin ✓";
    setTimeout(() => (el.copyShareBtn.textContent = "Salin"), 1500);
  });

  // Riwayat versi
  el.historyList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (b) selectVersion(Number(b.dataset.i));
  });
  el.restoreVersionBtn.addEventListener("click", restoreSelectedVersion);

  // Sampah
  el.emptyTrashBtn.addEventListener("click", emptyTrash);

  // Pengaturan akun
  el.settingsBtn.addEventListener("click", openSettings);
  el.pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = el.newPassword.value;
    if (password.length < 8) return setSettingsMsg("Kata sandi minimal 8 karakter.", "err");
    setSettingsMsg("Menyimpan…");
    const { error } = await sb.auth.updateUser({ password });
    if (error) return setSettingsMsg(authErrorText(error), "err");
    el.newPassword.value = "";
    setSettingsMsg("Kata sandi berhasil diganti.", "ok");
  });
  el.emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = el.newEmail.value.trim();
    if (!EMAIL_RE.test(email)) return setSettingsMsg("Alamat email tidak valid.", "err");
    setSettingsMsg("Mengirim…");
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + location.pathname });
    if (error) return setSettingsMsg(authErrorText(error), "err");
    el.newEmail.value = "";
    setSettingsMsg(`Tautan konfirmasi dikirim ke ${email} dan ke email lamamu. Email berganti setelah dikonfirmasi.`, "ok");
  });
  el.setExportBtn.addEventListener("click", () => el.exportBtn.click());
  el.setImportBtn.addEventListener("click", () => el.importInput.click());
  el.deleteAccountForm.addEventListener("submit", (e) => {
    e.preventDefault();
    deleteAccount();
  });
  el.setLogoutBtn.addEventListener("click", () => {
    el.settingsDialog.close();
    logout();
  });

  // Login Google / GitHub
  el.oauthBox.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-provider]");
    if (!b || !sb) return;
    b.disabled = true;
    const { error } = await sb.auth.signInWithOAuth({
      provider: b.dataset.provider,
      options: { redirectTo: location.origin + location.pathname },
    });
    b.disabled = false;
    if (error) setAuthMessage(authErrorText(error));
  });

  // Online / offline & kembali ke tab
  window.addEventListener("online", () => {
    if (!state.user) return;
    state.offline = false;
    toast("Kembali online — menyinkronkan…");
    refreshFromServer();
  });
  window.addEventListener("offline", () => {
    state.offline = true;
    if (state.user) setStatus("offline");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.user && Date.now() - lastFetchAt > 30_000) refreshFromServer();
    if (document.visibilityState === "visible") checkReminders();
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!state.user || document.querySelector("dialog[open]")) return;
    if (e.key === "Escape" && !el.moreMenu.classList.contains("hidden")) return toggleMenu(false);
    if (e.key === "Escape" && el.app.classList.contains("focus")) return toggleFocus(false);
    if (e.key === "Escape" && merge.on) return setMerge(false);
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
    } else if (mod && e.key.toLowerCase() === "e" && activeNote()) {
      e.preventDefault();
      state.mode = state.mode === "edit" ? "preview" : "edit";
      renderMode();
      if (state.mode === "edit") el.contentInput.focus();
    } else if (!mod && !typing && e.key.toLowerCase() === "n") {
      e.preventDefault();
      createNote();
    } else if (e.key === "Escape") {
      if (document.activeElement === el.searchInput && el.searchInput.value) {
        el.searchInput.value = "";
        state.query = "";
        renderList();
      } else {
        document.activeElement.blur();
      }
    }
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => !prefs.theme && applyTheme());
  // Kirim perubahan terakhir sebelum tab ditutup (fetch keepalive tetap jalan setelah halaman ditutup).
  window.addEventListener("pagehide", () => {
    if (!dirty.size || !state.user || !state.session) return;
    const rows = [...dirty].map((id) => notes.find((n) => n.id === id)).filter(Boolean).map(toRow);
    fetch(`${SUPABASE_URL}/rest/v1/notes?on_conflict=user_id,id`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${state.session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    }).catch(() => {});
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty.size || flushing) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  setInterval(() => state.user && renderList(), 60_000); // refresh relative times
  // Penyegaran berkala (menangkap penghapusan permanen dari perangkat lain, yang tidak dikirim lewat realtime).
  setInterval(() => {
    if (state.user && document.visibilityState === "visible" && navigator.onLine && Date.now() - lastFetchAt > 4 * 60_000) refreshFromServer();
  }, 60_000);

  // ---------- Auth ----------
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const AUTH_TEXT = {
    login: { title: "Selamat datang kembali", sub: "Masuk untuk membuka catatanmu di perangkat mana pun.", submit: "Masuk", busy: "Masuk…" },
    register: { title: "Buat akun baru", sub: "Gratis. Catatanmu tersimpan aman di cloud dan bisa dibuka dari mana saja.", submit: "Buat akun", busy: "Membuat akun…" },
    reset: { title: "Lupa kata sandi?", sub: "Masukkan emailmu. Kami akan mengirim tautan untuk membuat kata sandi baru.", submit: "Kirim tautan", busy: "Mengirim…" },
    newpass: { title: "Buat kata sandi baru", sub: "Masukkan kata sandi baru untuk akunmu.", submit: "Simpan kata sandi", busy: "Menyimpan…" },
  };

  function setAuthMessage(text, kind = "error") {
    el.authError.textContent = kind === "error" ? text : "";
    el.authInfo.textContent = kind === "info" ? text : "";
  }

  function setAuthMode(mode, keepMessage = false) {
    state.authMode = mode;
    const t = AUTH_TEXT[mode];
    el.authSeg.classList.toggle("hidden", mode === "reset" || mode === "newpass");
    el.authSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.auth === mode));
    const googleOnly = el.auth.classList.contains("auth--google-only");
    el.auth.classList.toggle("auth--email-open", state.emailOpen || mode === "reset" || mode === "newpass");
    el.authTitle.textContent = t.title;
    el.authSub.textContent =
      mode === "login" && googleOnly && !state.emailOpen ? "Masuk dengan Google untuk membuka catatanmu di perangkat mana pun." : t.sub;
    el.authSubmit.textContent = t.submit;
    el.emailField.classList.toggle("hidden", mode === "newpass");
    el.pwField.classList.toggle("hidden", mode === "reset");
    el.pwHint.classList.toggle("hidden", mode !== "register" && mode !== "newpass");
    el.authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
    el.forgotBtn.classList.toggle("hidden", mode !== "login");
    el.backToLoginBtn.classList.toggle("hidden", mode !== "reset");
    el.oauthBox.classList.toggle("hidden", !state.oauthAvailable || mode === "reset" || mode === "newpass");
    if (!keepMessage) setAuthMessage("");
  }

  function authErrorText(error) {
    const messages = {
      invalid_credentials: "Email atau kata sandi salah.",
      user_already_exists: "Email ini sudah terdaftar. Silakan masuk.",
      email_exists: "Email ini sudah terdaftar. Silakan masuk.",
      email_not_confirmed: "Email belum dikonfirmasi. Cek kotak masuk (atau folder spam) untuk tautan konfirmasi.",
      weak_password: "Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan kombinasi huruf dan angka.",
      same_password: "Kata sandi baru harus berbeda dari yang lama.",
      over_request_rate_limit: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.",
      over_email_send_rate_limit: "Terlalu banyak email dikirim. Tunggu beberapa menit lalu coba lagi.",
      signup_disabled: "Pendaftaran akun baru sedang dinonaktifkan.",
    };
    const msg = (error && error.message) || "";
    if (error && messages[error.code]) return messages[error.code];
    if (/invalid login credentials/i.test(msg)) return messages.invalid_credentials;
    if (/already registered/i.test(msg)) return messages.user_already_exists;
    if (/email not confirmed/i.test(msg)) return messages.email_not_confirmed;
    if (/failed to fetch|network|load failed/i.test(msg)) return "Tidak dapat terhubung ke Supabase. Periksa koneksi internet.";
    return msg || "Terjadi kesalahan. Coba lagi.";
  }

  // Galat yang dibawa Supabase di URL setelah login/tautan email (mis. Google menolak kredensial).
  function describeRedirectError(code, desc) {
    const d = desc || "";
    if (code === "otp_expired" || /(link|otp|token).*(expired|invalid)|(expired|invalid).*(link|otp|token)/i.test(d))
      return "Tautan dari email sudah kedaluwarsa atau tidak valid. Silakan minta tautan baru.";
    if (/access_denied/i.test(code) || /access.denied/i.test(d)) return "Login dibatalkan atau ditolak oleh penyedia (Google/GitHub).";
    if (/exchange external code|invalid_client|unauthorized_client/i.test(d))
      return `Login gagal: Google menolak kredensial yang tersimpan di Supabase (Client Secret kemungkinan salah atau sudah dinonaktifkan). Rincian: ${d}`;
    if (/user email from external provider|email.*external provider/i.test(d))
      return `Login gagal: penyedia tidak memberikan alamat email akun. Rincian: ${d}`;
    return `Login gagal: ${d || code}${d && code ? ` (${code})` : ""}`;
  }

  function showAuth(message = "", kind = "error") {
    state.user = null;
    document.body.classList.remove("booting", "authed");
    setAuthMessage(message, kind);
    el.authPassword.value = "";
    setTimeout(() => {
      const target = el.emailField.classList.contains("hidden") || el.authEmail.value ? el.authPassword : el.authEmail;
      if (!el.authForm.classList.contains("hidden")) target.focus();
    }, 0);
  }

  function resetSession() {
    clearTimeout(saveTimer);
    clearTimeout(cacheTimer);
    unsubscribeRealtime();
    dirty.clear();
    inflight.clear();
    pendingDeletes.clear();
    signedUrls.clear();
    stopDictation();
    modsLogout();
    folders = [];
    foldersDirty = false;
    foldersAt = 0;
    ringing.clear();
    renderAlarm();
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    notes = [];
    Object.assign(state, { view: "all", activeId: null, query: "", mode: "edit", user: null });
    updateInstallUi();
    el.searchInput.value = "";
  }

  async function migrateLocalNotes() {
    const local = load(LEGACY_KEY, null);
    if (!Array.isArray(local) || !local.length) return 0;
    const valid = local.filter((n) => n && /^[A-Za-z0-9_-]{1,64}$/.test(String(n.id || "")));
    for (let i = 0; i < valid.length; i += 500) await saveNotes(valid.slice(i, i + 500));
    localStorage.removeItem(LEGACY_KEY);
    return valid.length;
  }

  function showApp() {
    document.body.classList.remove("booting");
    document.body.classList.add("authed");
    updateInstallUi();
    if (!state.activeId) {
      const first = visibleNotes()[0];
      state.activeId = first && window.innerWidth > 760 ? first.id : null;
    }
    render();
  }

  async function enterApp(user) {
    state.user = user;
    el.userEmail.textContent = user.email;
    el.userEmail.title = user.email;
    el.userAvatar.textContent = (user.email || "?").charAt(0);

    // 1. Tampilkan dulu salinan lokal (cepat, dan tetap jalan saat offline).
    const cache = load(cacheKeyFor(user), null);
    if (cache && Array.isArray(cache.notes)) {
      notes = cache.notes;
      (cache.dirty || []).forEach((id) => dirty.add(id));
      (cache.deletes || []).forEach((id) => pendingDeletes.add(id));
      Object.assign(state.features, cache.features || {});
      folders = cleanFolders(cache.folders);
      foldersDirty = !!cache.foldersDirty;
      foldersAt = Number(cache.foldersAt) || 0;
      showApp();
      setStatus(dirty.size || pendingDeletes.size ? "saving" : "saved");
    }

    // 2. Ambil versi terbaru dari server.
    let migrated = 0;
    try {
      try {
        migrated = await migrateLocalNotes();
      } catch {
        /* biarkan catatan lokal tetap ada untuk dicoba lagi nanti */
      }
      await detectFeatures();
      await detectVoiceColumn();
      const server = await fetchNotes();
      const serverFolders = await fetchFolders();
      if (state.user !== user) return; // keluar saat sedang memuat
      lastFetchAt = Date.now();
      state.offline = false;
      if (cache) mergeServer(server);
      else notes = server;
      mergeFolders(serverFolders);
    } catch (err) {
      if (state.user !== user) return;
      if (cache && isNetworkError(err)) {
        state.offline = true;
        setStatus("offline");
        toast("Offline — menampilkan catatan yang tersimpan di perangkat ini");
        return;
      }
      throw err;
    }

    // Catatan sambutan sekali per akun (ditandai di metadata pengguna, berlaku lintas perangkat).
    if (!notes.length && !migrated && !(user.user_metadata && user.user_metadata.welcomed)) {
      const w = welcomeNote();
      notes.push(w);
      dirty.add(w.id);
      sb.auth.updateUser({ data: { welcomed: true } }).catch(() => {});
    }

    showApp();
    saveCache(true);
    if (dirty.size || pendingDeletes.size || foldersDirty) persist(null, true);
    else setStatus("saved");
    purgeOldTrash();
    subscribeRealtime();
    checkReminders();
    modsLogin();
    // Tautan reservasi (?reservasi=<id>) yang dibuka sebelum masuk: lanjutkan setelah login.
    const pending = localStorage.getItem(PENDING_VENUE_KEY);
    if (pending && FOLDER_UUID_RE.test(pending) && modules.booking) {
      localStorage.removeItem(PENDING_VENUE_KEY);
      setView("booking");
      modules.booking.openVenue(pending);
    }
    if (migrated) toast(`${migrated} catatan lokal dipindahkan ke akunmu`);
  }

  function enterAppSafely(user) {
    enterApp(user).catch((err) => {
      state.user = null;
      showAuth("Gagal memuat catatan: " + authErrorText(err));
    });
  }

  function handleAuthEvent(event, session) {
    state.session = session;
    if (event === "PASSWORD_RECOVERY") {
      state.recovering = true;
      if (state.user) {
        resetSession();
        render();
      }
      showAuth();
      setAuthMode("newpass");
    } else if (event === "INITIAL_SESSION") {
      if (session && state.recovering) {
        showAuth();
        setAuthMode("newpass");
      } else if (session) {
        enterAppSafely(session.user);
      } else {
        showAuth(state.urlError || "");
      }
    } else if (event === "SIGNED_IN") {
      if (session && !state.recovering && (!state.user || state.user.id !== session.user.id)) enterAppSafely(session.user);
    } else if (event === "SIGNED_OUT") {
      if (state.user) {
        resetSession();
        render();
        showAuth("Sesi berakhir. Silakan masuk lagi.");
      }
    }
  }

  el.authSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-auth]");
    if (b) setAuthMode(b.dataset.auth);
  });
  el.forgotBtn.addEventListener("click", () => setAuthMode("reset"));
  el.emailToggle.addEventListener("click", () => {
    state.emailOpen = true;
    setAuthMode("login", true);
    el.authEmail.focus();
  });
  el.backToLoginBtn.addEventListener("click", () => setAuthMode("login"));

  el.pwToggle.addEventListener("click", () => {
    const show = el.authPassword.type === "password";
    el.authPassword.type = show ? "text" : "password";
    el.pwToggle.classList.toggle("on", show);
    el.pwToggle.title = show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi";
  });

  el.authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) return;
    const mode = state.authMode;
    const email = el.authEmail.value.trim();
    const password = el.authPassword.value;
    if (mode !== "newpass" && !EMAIL_RE.test(email)) return setAuthMessage("Alamat email tidak valid.");
    if (mode !== "reset" && !password) return setAuthMessage("Kata sandi wajib diisi.");
    if ((mode === "register" || mode === "newpass") && password.length < 8) return setAuthMessage("Kata sandi minimal 8 karakter.");

    setAuthMessage("");
    el.authSubmit.disabled = true;
    el.authSubmit.textContent = AUTH_TEXT[mode].busy;
    const redirectTo = location.origin + location.pathname;
    try {
      let res;
      if (mode === "login") res = await sb.auth.signInWithPassword({ email, password });
      else if (mode === "register") res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      else if (mode === "reset") res = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      else res = await sb.auth.updateUser({ password });
      if (res.error) throw res.error;
      el.authPassword.value = "";

      if (mode === "register" && !res.data.session) {
        setAuthMode("login");
        setAuthMessage(`Akun dibuat! Kami mengirim tautan konfirmasi ke ${email}. Klik tautannya, lalu masuk.`, "info");
      } else if (mode === "reset") {
        setAuthMessage("Jika email itu terdaftar, tautan untuk membuat kata sandi baru sudah dikirim. Cek kotak masukmu.", "info");
      } else if (mode === "newpass") {
        state.recovering = false;
        setAuthMode("login");
        enterAppSafely(res.data.user);
        toast("Kata sandi berhasil diganti");
      }
      // login & daftar (tanpa konfirmasi email) diteruskan oleh event SIGNED_IN.
    } catch (err) {
      setAuthMessage(authErrorText(err));
    } finally {
      el.authSubmit.disabled = false;
      el.authSubmit.textContent = AUTH_TEXT[state.authMode].submit;
    }
  });

  async function logout() {
    await flush().catch(() => {});
    if ((dirty.size || pendingDeletes.size) && !confirm("Ada perubahan yang belum tersimpan ke server. Tetap keluar?")) return;
    const user = state.user;
    if (user) localStorage.removeItem(cacheKeyFor(user)); // jangan tinggalkan catatan di perangkat
    unsubscribeRealtime();
    const { error } = await sb.auth.signOut({ scope: "local" }).catch((e) => ({ error: e }));
    if (error) console.warn("signOut:", error.message);
    if (state.user) {
      resetSession();
      render();
      showAuth();
    }
    toast("Kamu sudah keluar");
  }
  el.logoutBtn.addEventListener("click", logout);

  // ---------- Init ----------
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  function boot() {
    applyTheme();
    registerServiceWorker();

    const shareId = new URLSearchParams(location.search).get("share");
    if (shareId) return bootShared(shareId);

    // Tautan reservasi: simpan dulu (login lewat Google mengalihkan halaman dan membuang query).
    const venueParam = new URLSearchParams(location.search).get("reservasi");
    if (venueParam && FOLDER_UUID_RE.test(venueParam)) {
      localStorage.setItem(PENDING_VENUE_KEY, venueParam.toLowerCase());
      history.replaceState(null, "", location.pathname);
    }

    setAuthMode("login");

    const problem = configProblem();
    if (problem) {
      showAuth();
      el.authTitle.textContent = "Hampir siap";
      el.authSub.textContent = "Hubungkan aplikasi ke Supabase dulu. Panduan lengkapnya ada di README.md.";
      el.authSetup.textContent = problem;
      el.authSetup.classList.remove("hidden");
      el.authForm.classList.add("hidden");
      el.authSeg.classList.add("hidden");
      return;
    }

    // Tautan dari email (konfirmasi / reset sandi) membawa info di URL.
    const params = new URLSearchParams(location.hash.slice(1) + "&" + location.search.slice(1));
    state.recovering = params.get("type") === "recovery";
    const urlError = params.get("error_description") || params.get("error");
    if (urlError) {
      const code = params.get("error_code") || params.get("error") || "";
      console.warn("Galat dari redirect login:", code, urlError);
      state.urlError = describeRedirectError(code, urlError);
      history.replaceState(null, "", location.pathname);
    }

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    // Jangan memanggil Supabase langsung di dalam callback (bisa deadlock) — tunda ke tick berikutnya.
    sb.auth.onAuthStateChange((event, session) => setTimeout(() => handleAuthEvent(event, session), 0));
    setupOAuthButtons();
  }
  boot();
})();
