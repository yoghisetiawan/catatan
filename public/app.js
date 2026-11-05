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
    backToLoginBtn: $("#backToLoginBtn"),
    authSubmit: $("#authSubmit"),
    pwToggle: $("#pwToggle"),
    pwHint: $("#pwHint"),
    userAvatar: $("#userAvatar"),
    userEmail: $("#userEmail"),
    logoutBtn: $("#logoutBtn"),
  };

  // ---------- State ----------
  let notes = [];
  const prefs = Object.assign({ theme: null, sort: "updated" }, load(PREFS_KEY, {}));
  const state = { view: "all", activeId: null, query: "", mode: "edit", user: null, session: null, authMode: "login", recovering: false };
  const dirty = new Set();
  let saveTimer = null;
  let flushing = null;

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

  const toRow = (n) => ({
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
  });

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
  });

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
    const text = { saving: "Menyimpan…", saved: "Tersimpan", error: "Offline — mencoba lagi…" }[kind];
    el.saveStatus.textContent = text;
    el.saveStatus.classList.toggle("saving", kind !== "saved");
  }

  // Tandai catatan sebagai berubah; dikirim ke server secara berkelompok.
  function persist(note, immediate = false) {
    if (note) dirty.add(note.id);
    setStatus("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, immediate ? 0 : 600);
  }

  function flush() {
    if (flushing) return flushing.then(flush);
    if (!dirty.size) {
      setStatus("saved");
      return Promise.resolve();
    }
    const ids = [...dirty].slice(0, 500);
    ids.forEach((id) => dirty.delete(id));
    const batch = ids.map((id) => notes.find((n) => n.id === id)).filter(Boolean);
    flushing = saveNotes(batch)
      .then(() => {
        setStatus(dirty.size ? "saving" : "saved");
        if (dirty.size) saveTimer = setTimeout(flush, 0);
      })
      .catch((err) => {
        if (!state.user) return;
        if (isPermanentError(err)) {
          setStatus("saved");
          toast("Gagal menyimpan: " + err.message);
          return;
        }
        ids.forEach((id) => dirty.add(id));
        setStatus("error");
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 5000);
      })
      .finally(() => {
        flushing = null;
      });
    return flushing;
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
        "Aplikasi catatan yang ringan dan cepat. Semua catatan **tersimpan otomatis** di browser kamu.",
        "",
        "## Yang bisa kamu lakukan",
        "- [x] Menulis catatan dengan *Markdown*",
        "- [ ] Menyematkan catatan penting",
        "- [ ] Memberi tag dan warna",
        "- [ ] Mencari catatan dengan cepat",
        "",
        "## Pintasan keyboard",
        "- `N` — catatan baru",
        "- `⌘/Ctrl + K` — cari",
        "- `⌘/Ctrl + E` — ganti Tulis / Pratinjau",
        "",
        "> Tip: buka **Pratinjau** dan klik kotak centang untuk menandai tugas selesai.",
      ].join("\n"),
      tags: ["mulai"],
      color: "#8b6cf0",
      pinned: true,
      trashed: false,
      createdAt: now,
      updatedAt: now,
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
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  }

  function renderMarkdown(md) {
    const lines = md.split("\n");
    let html = "";
    let list = null; // "ul" | "ol"
    let para = [];
    let inCode = false;
    let code = [];

    const flushPara = () => {
      if (para.length) html += `<p>${para.map(inline).join("<br>")}</p>`;
      para = [];
    };
    const closeList = () => {
      if (list) html += `</${list}>`;
      list = null;
    };
    const openList = (type) => {
      if (list !== type) {
        closeList();
        html += `<${type}>`;
        list = type;
      }
    };

    lines.forEach((raw, i) => {
      if (/^```/.test(raw.trim())) {
        if (inCode) {
          html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
          code = [];
          inCode = false;
        } else {
          flushPara();
          closeList();
          inCode = true;
        }
        return;
      }
      if (inCode) return code.push(raw);

      const line = escapeHtml(raw);
      let m;
      if (!line.trim()) {
        flushPara();
        closeList();
      } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        flushPara(); closeList();
        html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
      } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        flushPara(); closeList();
        html += "<hr>";
      } else if ((m = line.match(/^&gt;\s?(.*)$/))) {
        flushPara(); closeList();
        html += `<blockquote>${inline(m[1])}</blockquote>`;
      } else if ((m = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/))) {
        flushPara(); openList("ul");
        const done = m[1].toLowerCase() === "x";
        html += `<li class="task${done ? " done" : ""}"><input type="checkbox" data-line="${i}"${done ? " checked" : ""}><span>${inline(m[2])}</span></li>`;
      } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
        flushPara(); openList("ul");
        html += `<li>${inline(m[1])}</li>`;
      } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
        flushPara(); openList("ol");
        html += `<li>${inline(m[1])}</li>`;
      } else {
        closeList();
        para.push(line);
      }
    });
    if (inCode) html += `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`;
    flushPara();
    closeList();
    return html || '<p style="color:var(--faint)">Belum ada isi.</p>';
  }

  // ---------- Filtering ----------
  function visibleNotes() {
    const q = state.query.trim().toLowerCase();
    let list = notes.filter((n) => {
      if (state.view === "trash") return n.trashed;
      if (n.trashed) return false;
      if (state.view === "pinned") return n.pinned;
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

  function allTags() {
    const counts = {};
    notes.forEach((n) => !n.trashed && n.tags.forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], "id"));
  }

  // ---------- Rendering ----------
  const PIN_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

  function cardHtml(n, q) {
    const tags = n.tags.slice(0, 3).map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join("");
    return `
      <button class="note-card${n.id === state.activeId ? " active" : ""}" data-id="${n.id}" style="--note-color:${n.color || "transparent"}">
        <h4>${n.pinned && !n.trashed ? PIN_SVG : ""}<span class="t">${n.title ? highlight(n.title, q) : '<span style="color:var(--faint)">Tanpa judul</span>'}</span></h4>
        <p>${snippet(n, q)}</p>
        <div class="meta"><span>${relativeTime(n.updatedAt)}</span>${tags}</div>
      </button>`;
  }

  function renderList() {
    const list = visibleNotes();
    const q = state.query.trim();

    const titles = { all: "Semua catatan", pinned: "Disematkan", trash: "Sampah" };
    el.listTitle.textContent = state.view.startsWith("tag:") ? "#" + state.view.slice(4) : titles[state.view];

    if (!list.length) {
      const msg = q
        ? `Tidak ada catatan yang cocok dengan “${escapeHtml(q)}”.`
        : state.view === "trash"
        ? "Sampah kosong."
        : state.view === "pinned"
        ? "Belum ada catatan yang disematkan."
        : "Belum ada catatan.<br>Tekan <b>N</b> untuk membuat yang pertama.";
      el.noteList.innerHTML = `<div class="list-empty">${msg}</div>`;
    } else if (state.view === "all" && !q) {
      const pinned = list.filter((n) => n.pinned);
      const others = list.filter((n) => !n.pinned);
      let html = "";
      if (pinned.length) html += `<div class="group-label">Disematkan</div>` + pinned.map((n) => cardHtml(n, q)).join("");
      if (others.length) html += (pinned.length ? `<div class="group-label">Lainnya</div>` : "") + others.map((n) => cardHtml(n, q)).join("");
      el.noteList.innerHTML = html;
    } else {
      el.noteList.innerHTML = list.map((n) => cardHtml(n, q)).join("");
    }

    // counts
    const live = notes.filter((n) => !n.trashed);
    document.querySelector('[data-count="all"]').textContent = live.length;
    document.querySelector('[data-count="pinned"]').textContent = live.filter((n) => n.pinned).length;
    document.querySelector('[data-count="trash"]').textContent = notes.length - live.length;

    // nav state
    el.nav.forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
    renderTags();
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

  function renderEditor() {
    const n = activeNote();
    el.emptyState.classList.toggle("hidden", !!n);
    el.editor.classList.toggle("hidden", !n);
    el.app.classList.toggle("editing", !!n);
    if (!n) return;

    if (el.titleInput.value !== n.title) el.titleInput.value = n.title;
    if (el.contentInput.value !== n.content) el.contentInput.value = n.content;

    const readOnly = n.trashed;
    el.titleInput.readOnly = readOnly;
    el.contentInput.readOnly = readOnly;
    el.tagInput.classList.toggle("hidden", readOnly);
    el.pinBtn.classList.toggle("hidden", readOnly);
    el.colorPicker.classList.toggle("hidden", readOnly);
    el.restoreBtn.classList.toggle("hidden", !readOnly);
    el.deleteBtn.title = readOnly ? "Hapus permanen" : "Pindahkan ke sampah";
    el.pinBtn.classList.toggle("active", n.pinned);
    el.pinBtn.title = n.pinned ? "Lepas sematan" : "Sematkan";

    renderChips(n);
    renderColors(n);
    renderMode();
    updateFooter(n);
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
    if (preview && n) el.preview.innerHTML = renderMarkdown(n.content);
  }

  function updateFooter(n) {
    const words = plainText(n.content).split(/\s+/).filter(Boolean).length;
    el.wordCount.textContent = `${words} kata · ${n.content.length} karakter`;
    el.dateInfo.textContent = `Diubah ${fullDate(n.updatedAt)}`;
  }

  function render() {
    renderList();
    renderEditor();
  }

  // ---------- Actions ----------
  function createNote() {
    const now = Date.now();
    const tag = state.view.startsWith("tag:") ? [state.view.slice(4)] : [];
    const n = { id: uid(), title: "", content: "", tags: tag, color: "", pinned: state.view === "pinned", trashed: false, createdAt: now, updatedAt: now };
    notes.unshift(n);
    if (state.view === "trash") state.view = "all";
    state.query = "";
    el.searchInput.value = "";
    state.activeId = n.id;
    state.mode = "edit";
    persist(n);
    render();
    el.titleInput.focus();
  }

  function selectNote(id) {
    state.activeId = id;
    render();
  }

  function touch(n) {
    n.updatedAt = Date.now();
    persist(n);
    renderList();
    updateFooter(n);
  }

  function deleteActive() {
    const n = activeNote();
    if (!n) return;
    if (n.trashed) {
      if (!confirm("Hapus catatan ini secara permanen? Tindakan ini tidak bisa dibatalkan.")) return;
      notes = notes.filter((x) => x.id !== n.id);
      dirty.delete(n.id);
      state.activeId = null;
      render();
      deleteNote(n.id)
        .then(() => toast("Catatan dihapus permanen"))
        .catch((err) => {
          if (!state.user) return;
          notes.push(n);
          render();
          toast("Gagal menghapus: " + err.message);
        });
      return;
    }
    n.trashed = true;
    n.pinned = false;
    state.activeId = null;
    persist(n, true);
    render();
    toast("Dipindahkan ke sampah", "Urungkan", () => {
      n.trashed = false;
      state.activeId = n.id;
      persist(n, true);
      render();
    });
  }

  function restoreActive() {
    const n = activeNote();
    if (!n) return;
    n.trashed = false;
    state.view = "all";
    persist(n, true);
    render();
    toast("Catatan dipulihkan");
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
    state.view = view;
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

  // ---------- Events ----------
  el.newNoteBtn.addEventListener("click", createNote);
  el.emptyNewBtn.addEventListener("click", createNote);

  el.nav.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  el.tagList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tag]");
    if (b) setView(state.view === "tag:" + b.dataset.tag ? "all" : "tag:" + b.dataset.tag);
  });

  el.noteList.addEventListener("click", (e) => {
    const card = e.target.closest(".note-card");
    if (card) selectNote(card.dataset.id);
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
    persist(n);
    render();
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

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!state.user) return;
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

  function setAuthMode(mode) {
    state.authMode = mode;
    const t = AUTH_TEXT[mode];
    el.authSeg.classList.toggle("hidden", mode === "reset" || mode === "newpass");
    el.authSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.auth === mode));
    el.authTitle.textContent = t.title;
    el.authSub.textContent = t.sub;
    el.authSubmit.textContent = t.submit;
    el.emailField.classList.toggle("hidden", mode === "newpass");
    el.pwField.classList.toggle("hidden", mode === "reset");
    el.pwHint.classList.toggle("hidden", mode !== "register" && mode !== "newpass");
    el.authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
    el.forgotBtn.classList.toggle("hidden", mode !== "login");
    el.backToLoginBtn.classList.toggle("hidden", mode !== "reset");
    setAuthMessage("");
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
    dirty.clear();
    notes = [];
    Object.assign(state, { view: "all", activeId: null, query: "", mode: "edit", user: null });
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

  async function enterApp(user) {
    state.user = user;
    el.userEmail.textContent = user.email;
    el.userEmail.title = user.email;
    el.userAvatar.textContent = (user.email || "?").charAt(0);

    let migrated = 0;
    try {
      migrated = await migrateLocalNotes();
    } catch {
      /* biarkan catatan lokal tetap ada untuk dicoba lagi nanti */
    }
    notes = await fetchNotes();
    if (state.user !== user) return; // keluar saat sedang memuat

    // Catatan sambutan sekali per akun (ditandai di metadata pengguna, berlaku lintas perangkat).
    if (!notes.length && !migrated && !(user.user_metadata && user.user_metadata.welcomed)) {
      const w = welcomeNote();
      notes.push(w);
      persist(w, true);
      sb.auth.updateUser({ data: { welcomed: true } }).catch(() => {});
    }

    document.body.classList.remove("booting");
    document.body.classList.add("authed");
    const first = visibleNotes()[0];
    state.activeId = first && window.innerWidth > 760 ? first.id : null;
    render();
    setStatus("saved");
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

  el.logoutBtn.addEventListener("click", async () => {
    await flush().catch(() => {});
    if (dirty.size && !confirm("Ada perubahan yang belum tersimpan ke server. Tetap keluar?")) return;
    const { error } = await sb.auth.signOut({ scope: "local" }).catch((e) => ({ error: e }));
    if (error) console.warn("signOut:", error.message);
    if (state.user) {
      resetSession();
      render();
      showAuth();
    }
    toast("Kamu sudah keluar");
  });

  // ---------- Init ----------
  function boot() {
    applyTheme();
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
    const urlError = params.get("error_description");
    if (urlError) {
      state.urlError = /expired|invalid/i.test(urlError)
        ? "Tautan dari email sudah kedaluwarsa atau tidak valid. Silakan minta tautan baru."
        : urlError;
      history.replaceState(null, "", location.pathname);
    }

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    // Jangan memanggil Supabase langsung di dalam callback (bisa deadlock) — tunda ke tick berikutnya.
    sb.auth.onAuthStateChange((event, session) => setTimeout(() => handleAuthEvent(event, session), 0));
  }
  boot();
})();
