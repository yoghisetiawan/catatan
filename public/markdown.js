// Parser Markdown Catatan — satu sumber kebenaran untuk pratinjau (HTML) dan ekspor (Word/PDF/Excel/PPT).
//
//   CatatanMarkdown.parse(md)        → daftar blok (heading, paragraph, list, quote, code, hr, table)
//   CatatanMarkdown.toHtml(blocks)   → string HTML
//   CatatanMarkdown.render(md)       → parse + toHtml
//   CatatanMarkdown.parseInline(txt) → daftar node inline: { text, bold, italic, strike, code, href } | { image, alt, src }
(() => {
  "use strict";

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Inline ----------
  // Urutan alternatif menentukan prioritas: kode → gambar → tebal → miring → coret → tautan → URL polos.
  const INLINE_RE = new RegExp(
    [
      "`([^`]+)`", //                                                              1 kode
      "!\\[([^\\]]*)\\]\\((attachment:[A-Za-z0-9/_.-]+|https:\\/\\/[^\\s)]+)\\)", // 2 alt, 3 sumber gambar
      "\\*\\*([^*]+)\\*\\*", //                                                    4 tebal
      "(^|[^*])\\*([^*\\s][^*]*)\\*", //                                           5 karakter sebelum, 6 miring
      "~~([^~]+)~~", //                                                            7 coret
      "\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)", //                           8 teks, 9 href
      "(^|\\s)(https?:\\/\\/[^\\s<]+)", //                                         10 pemisah, 11 URL polos
    ].join("|"),
    "g"
  );

  function parseInline(text, style = {}, out = []) {
    let last = 0;
    const push = (t, extra) => {
      if (t) out.push(Object.assign({}, style, extra, { text: t }));
    };
    for (const m of String(text).matchAll(INLINE_RE)) {
      push(text.slice(last, m.index));
      if (m[1] !== undefined) {
        push(m[1], { code: true });
      } else if (m[3] !== undefined) {
        out.push({ image: true, alt: m[2], src: m[3] });
      } else if (m[4] !== undefined) {
        parseInline(m[4], Object.assign({}, style, { bold: true }), out);
      } else if (m[6] !== undefined) {
        push(m[5]);
        parseInline(m[6], Object.assign({}, style, { italic: true }), out);
      } else if (m[7] !== undefined) {
        parseInline(m[7], Object.assign({}, style, { strike: true }), out);
      } else if (m[9] !== undefined) {
        if (style.href) push(m[0]); // tautan di dalam tautan: biarkan teks biasa
        else parseInline(m[8], Object.assign({}, style, { href: m[9] }), out);
      } else if (m[11] !== undefined) {
        push(m[10]);
        push(m[11], style.href ? {} : { href: m[11] });
      }
      last = m.index + m[0].length;
    }
    push(text.slice(last));
    return out;
  }

  function inlineToHtml(nodes) {
    return nodes
      .map((n) => {
        if (n.image) {
          return n.src.startsWith("attachment:")
            ? `<img alt="${escapeHtml(n.alt)}" data-attachment="${n.src.slice(11)}" class="img-loading" loading="lazy">`
            : `<img alt="${escapeHtml(n.alt)}" src="${escapeHtml(n.src)}" loading="lazy">`;
        }
        let h = escapeHtml(n.text);
        if (n.code) h = `<code>${h}</code>`;
        if (n.bold) h = `<strong>${h}</strong>`;
        if (n.italic) h = `<em>${h}</em>`;
        if (n.strike) h = `<del>${h}</del>`;
        if (n.href) h = `<a href="${escapeHtml(n.href)}" target="_blank" rel="noopener noreferrer">${h}</a>`;
        return h;
      })
      .join("");
  }

  const inlineToText = (nodes) => nodes.map((n) => (n.image ? (n.alt ? `[gambar: ${n.alt}]` : "[gambar]") : n.text)).join("");

  // ---------- Tabel ----------
  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const cells = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\" && s[i + 1] === "|") {
        cur += "|";
        i++;
      } else if (s[i] === "|") {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += s[i];
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const SEP_CELL = /^:?-+:?$/;
  function separatorCells(line) {
    if (!line || !line.includes("|") || !line.includes("-")) return null;
    const cells = splitRow(line);
    return cells.length && cells.every((c) => SEP_CELL.test(c)) ? cells : null;
  }

  // ---------- Blok ----------
  function parse(md) {
    const lines = String(md).split("\n");
    const blocks = [];
    let para = null;
    let list = null;
    let code = null;

    const flushPara = () => {
      para = null;
    };
    const closeList = () => {
      list = null;
    };
    const openList = (ordered) => {
      if (!list || list.ordered !== ordered) {
        list = { type: "list", ordered, items: [] };
        blocks.push(list);
      }
      return list;
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];

      if (/^```/.test(raw.trim())) {
        if (code) {
          blocks.push({ type: "code", text: code.join("\n") });
          code = null;
        } else {
          flushPara();
          closeList();
          code = [];
        }
        continue;
      }
      if (code) {
        code.push(raw);
        continue;
      }

      // Tabel: baris judul yang diikuti baris pemisah (| --- | --- |) dengan jumlah kolom sama.
      if (raw.includes("|")) {
        const sep = separatorCells(lines[i + 1]);
        const header = sep && splitRow(raw);
        if (sep && header.length === sep.length) {
          flushPara();
          closeList();
          const n = header.length;
          const align = sep.map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null));
          const rows = [];
          let j = i + 2;
          while (j < lines.length && lines[j].trim() && lines[j].includes("|") && !/^```/.test(lines[j].trim())) {
            const cells = splitRow(lines[j]);
            while (cells.length < n) cells.push("");
            rows.push(cells.slice(0, n).map((c) => parseInline(c)));
            j++;
          }
          blocks.push({ type: "table", align, header: header.map((c) => parseInline(c)), rows });
          i = j - 1;
          continue;
        }
      }

      let m;
      if (!raw.trim()) {
        flushPara();
        closeList();
      } else if ((m = raw.match(/^(#{1,3})\s+(.*)$/))) {
        flushPara();
        closeList();
        blocks.push({ type: "heading", level: m[1].length, inline: parseInline(m[2]) });
      } else if (/^(-{3,}|\*{3,})$/.test(raw.trim())) {
        flushPara();
        closeList();
        blocks.push({ type: "hr" });
      } else if ((m = raw.match(/^>\s?(.*)$/))) {
        flushPara();
        closeList();
        blocks.push({ type: "quote", inline: parseInline(m[1]) });
      } else if ((m = raw.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/))) {
        flushPara();
        openList(false).items.push({ inline: parseInline(m[2]), checked: m[1].toLowerCase() === "x", line: i });
      } else if ((m = raw.match(/^\s*[-*+]\s+(.*)$/))) {
        flushPara();
        openList(false).items.push({ inline: parseInline(m[1]), checked: null, line: i });
      } else if ((m = raw.match(/^\s*\d+\.\s+(.*)$/))) {
        flushPara();
        openList(true).items.push({ inline: parseInline(m[1]), checked: null, line: i });
      } else {
        closeList();
        if (!para) {
          para = { type: "paragraph", lines: [] };
          blocks.push(para);
        }
        para.lines.push(parseInline(raw));
      }
    }
    if (code) blocks.push({ type: "code", text: code.join("\n") });
    return blocks;
  }

  // ---------- HTML ----------
  function toHtml(blocks) {
    let html = "";
    for (const b of blocks) {
      switch (b.type) {
        case "heading":
          html += `<h${b.level}>${inlineToHtml(b.inline)}</h${b.level}>`;
          break;
        case "paragraph":
          html += `<p>${b.lines.map(inlineToHtml).join("<br>")}</p>`;
          break;
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          html += `<${tag}>`;
          for (const it of b.items) {
            if (it.checked === null) html += `<li>${inlineToHtml(it.inline)}</li>`;
            else
              html += `<li class="task${it.checked ? " done" : ""}"><input type="checkbox" data-line="${it.line}"${it.checked ? " checked" : ""}><span>${inlineToHtml(it.inline)}</span></li>`;
          }
          html += `</${tag}>`;
          break;
        }
        case "quote":
          html += `<blockquote>${inlineToHtml(b.inline)}</blockquote>`;
          break;
        case "code":
          html += `<pre><code>${escapeHtml(b.text)}</code></pre>`;
          break;
        case "hr":
          html += "<hr>";
          break;
        case "table": {
          const cell = (tag, c, i) => `<${tag}${b.align[i] ? ` style="text-align:${b.align[i]}"` : ""}>${inlineToHtml(c)}</${tag}>`;
          html +=
            `<div class="table-wrap"><table><thead><tr>${b.header.map((c, i) => cell("th", c, i)).join("")}</tr></thead>` +
            `<tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => cell("td", c, i)).join("")}</tr>`).join("")}</tbody></table></div>`;
          break;
        }
      }
    }
    return html || '<p style="color:var(--faint)">Belum ada isi.</p>';
  }

  window.CatatanMarkdown = {
    parse,
    parseInline,
    inlineToHtml,
    inlineToText,
    toHtml,
    render: (md) => toHtml(parse(md)),
    escapeHtml,
  };
})();
