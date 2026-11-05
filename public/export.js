// Ekspor catatan ke Word (.docx), PDF, Excel (.xlsx), dan PowerPoint (.pptx).
//
// Semua format dibuat di browser dari hasil parser Markdown yang sama dengan pratinjau.
// Pustaka (docx, pdfmake, ExcelJS, PptxGenJS) baru dimuat saat dibutuhkan, dari jsDelivr,
// dengan versi tetap dan hash Subresource Integrity.
//
//   CatatanExport.exportNote(format, note, { fetchAttachment, includeImages }) → Promise<Blob>
//   CatatanExport.exportAllNotes(notes)                                         → Promise<Blob>  (Excel)
(() => {
  "use strict";

  const MD = window.CatatanMarkdown;
  const BRAND = "5B5BD6";
  const CDN = "https://cdn.jsdelivr.net/npm/";

  // ---------- Pemuat pustaka ----------
  const LIBS = {
    docx: {
      check: () => window.docx && window.docx.Packer,
      files: [[CDN + "docx@9.15.2/dist/index.iife.js", "sha384-ud8085E8t6iW4uUom5nN5cpzTZ4OdsNKB/AKWfOsI62tzsoV2X7r7/o4KWESO8rq"]],
    },
    pptx: {
      check: () => window.PptxGenJS,
      files: [[CDN + "pptxgenjs@4.0.1/dist/pptxgen.bundle.js", "sha384-qb0Xhi7LLYpvW1HCK6oMrmDLSY9sy7vwm6ZlV6KjtrlL9yg30+YN4neTwnmX+Kp8"]],
    },
    excel: {
      check: () => window.ExcelJS,
      files: [[CDN + "exceljs@4.4.0/dist/exceljs.min.js", "sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz"]],
    },
    pdf: {
      check: () => window.pdfMake && window.pdfMake.createPdf,
      files: [
        [CDN + "pdfmake@0.3.13/build/pdfmake.min.js", "sha384-/JVvlU2iyYp0inj2VW4i5tkJYTSn1bVkfuhFeEXFTXMMgiSjR+dDD1pnRqgl5csu"],
        [CDN + "pdfmake@0.3.13/build/vfs_fonts.js", "sha384-pkBUW1wxcm6m7ZjKDxADnNHqnz+Sx9sAL1ndsLNv/GZnWZgodPYsju1yxeyQnn0c"],
      ],
    },
  };

  function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.integrity = integrity;
      s.crossOrigin = "anonymous";
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        s.remove();
        reject(new Error("gagal memuat " + src));
      };
      document.head.appendChild(s);
    });
  }

  const loading = {};
  function loadLib(name) {
    const lib = LIBS[name];
    if (lib.check()) return Promise.resolve();
    if (!loading[name]) {
      loading[name] = (async () => {
        for (const [src, sri] of lib.files) await loadScript(src, sri);
        if (!lib.check()) throw new Error("pustaka tidak terinisialisasi");
      })().catch(() => {
        delete loading[name]; // izinkan coba lagi
        throw new Error("Tidak dapat memuat pustaka ekspor. Periksa koneksi internet lalu coba lagi.");
      });
    }
    return loading[name];
  }

  // ---------- Pembantu umum ----------
  const plain = (nodes) => MD.inlineToText(nodes);
  const titleOf = (note) => (note.title || "").trim() || "Tanpa judul";
  const fmtDate = (ts) => new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const metaLine = (note) =>
    [note.tags && note.tags.length ? note.tags.map((t) => "#" + t).join(" ") : "", note.updatedAt ? `Diubah ${fmtDate(note.updatedAt)}` : ""]
      .filter(Boolean)
      .join("  ·  ");
  // Baris paragraf yang isinya hanya gambar dijadikan blok gambar tersendiri.
  function normalizeBlocks(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.type !== "paragraph") {
        out.push(b);
        continue;
      }
      let cur = [];
      const flush = () => {
        if (cur.length) out.push({ type: "paragraph", lines: cur });
        cur = [];
      };
      for (const line of b.lines) {
        const imgs = line.filter((n) => n.image);
        const rest = line.filter((n) => !n.image && n.text.trim());
        if (imgs.length && !rest.length) {
          flush();
          imgs.forEach((im) => out.push({ type: "image", alt: im.alt, src: im.src }));
        } else {
          cur.push(line);
        }
      }
      flush();
    }
    return out;
  }

  // Teks pengganti gambar. `skipped` = pengguna sengaja tidak menyertakan gambar.
  const imageFallback = (b, skipped) =>
    b.src.startsWith("attachment:") ? (skipped ? `[gambar${b.alt ? ": " + b.alt : ""}]` : `[gambar tidak tersedia${b.alt ? ": " + b.alt : ""}]`) : `${b.alt || "gambar"} (${b.src})`;

  // ---------- Gambar lampiran ----------
  const toDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  // Semua format menerima PNG/JPEG; format lain (WebP, GIF) diubah ke PNG.
  async function normalizeImage(blob) {
    const bmp = await createImageBitmap(blob);
    const { width, height } = bmp;
    let out = blob;
    if (blob.type !== "image/png" && blob.type !== "image/jpeg") {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      out = await new Promise((r) => c.toBlob(r, "image/png"));
    }
    if (bmp.close) bmp.close();
    return {
      bytes: new Uint8Array(await out.arrayBuffer()),
      ext: out.type === "image/jpeg" ? "jpg" : "png",
      mime: out.type,
      width,
      height,
      dataUrl: await toDataUrl(out),
    };
  }

  async function loadImages(blocks, fetchAttachment) {
    const paths = new Set();
    for (const b of blocks) {
      if (b.type === "image" && b.src.startsWith("attachment:")) paths.add(b.src.slice(11));
    }
    const map = new Map();
    for (const path of paths) {
      try {
        const blob = await fetchAttachment(path);
        if (blob) map.set(path, await normalizeImage(blob));
      } catch {
        /* gambar ini dilewati; diganti keterangan teks */
      }
    }
    return map;
  }

  const imageFor = (images, b) => (b.src.startsWith("attachment:") ? images.get(b.src.slice(11)) : null);
  const fit = (w, h, maxW, maxH) => {
    const k = Math.min(1, maxW / w, maxH / h);
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  };

  // =====================================================================
  //  WORD
  // =====================================================================
  async function toWord(note, blocks, images) {
    await loadLib("docx");
    const d = window.docx;
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ExternalHyperlink, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat, Footer, PageNumber, UnderlineType } = d;

    const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT };
    const numbering = [
      {
        reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      },
    ];

    const runs = (nodes, base = {}) =>
      nodes.map((n) => {
        if (n.image) return new TextRun({ text: n.alt ? `[gambar: ${n.alt}]` : "[gambar]", italics: true, color: "888888", size: base.size });
        const o = { text: n.text, bold: n.bold || base.bold, italics: n.italic || base.italics, strike: n.strike || base.strike, color: base.color, size: base.size };
        if (n.code) {
          o.font = "Consolas";
          o.shading = { type: ShadingType.CLEAR, fill: "F1F1F4", color: "auto" };
        }
        if (n.href) {
          return new ExternalHyperlink({ link: n.href, children: [new TextRun({ ...o, color: "0563C1", underline: { type: UnderlineType.SINGLE } })] });
        }
        return new TextRun(o);
      });

    const children = [];
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(titleOf(note))] }));
    const meta = metaLine(note);
    if (meta) children.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: meta, color: "888888", size: 18 })] }));

    const HEAD = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
    let olCount = 0;

    for (const b of blocks) {
      switch (b.type) {
        case "heading":
          children.push(new Paragraph({ heading: HEAD[b.level - 1], children: runs(b.inline) }));
          break;
        case "paragraph": {
          const kids = [];
          b.lines.forEach((line, i) => {
            if (i) kids.push(new TextRun({ break: 1 }));
            kids.push(...runs(line));
          });
          children.push(new Paragraph({ children: kids }));
          break;
        }
        case "list": {
          let ref = "bullets";
          if (b.ordered) {
            ref = "ol" + ++olCount;
            numbering.push({
              reference: ref,
              levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
            });
          }
          for (const it of b.items) {
            if (it.checked === null) {
              children.push(new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: runs(it.inline) }));
            } else {
              children.push(
                new Paragraph({
                  indent: { left: 360 },
                  spacing: { after: 60 },
                  children: [
                    new TextRun({ text: it.checked ? "☑ " : "☐ ", font: "Segoe UI Symbol", color: it.checked ? BRAND : "666666" }),
                    ...runs(it.inline, it.checked ? { color: "888888", strike: true } : {}),
                  ],
                })
              );
            }
          }
          break;
        }
        case "quote":
          children.push(
            new Paragraph({
              indent: { left: 360 },
              border: { left: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 10 } },
              children: runs(b.inline, { italics: true, color: "555555" }),
            })
          );
          break;
        case "code": {
          const kids = b.text.split("\n").map((ln, i) => new TextRun({ text: ln, font: "Consolas", size: 19, break: i ? 1 : 0 }));
          children.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: "F4F4F6", color: "auto" }, spacing: { before: 60, after: 160 }, children: kids }));
          break;
        }
        case "hr":
          children.push(new Paragraph({ spacing: { before: 120, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } } }));
          break;
        case "image": {
          const img = imageFor(images, b);
          if (!img) {
            children.push(new Paragraph({ children: [new TextRun({ text: imageFallback(b, images.skipped), italics: true, color: "888888" })] }));
            break;
          }
          const s = fit(img.width, img.height, 600, 760);
          children.push(
            new Paragraph({
              spacing: { before: 60, after: 160 },
              children: [new ImageRun({ type: img.ext, data: img.bytes, transformation: { width: s.w, height: s.h }, altText: { title: b.alt || "gambar", description: b.alt || "gambar", name: b.alt || "gambar" } })],
            })
          );
          break;
        }
        case "table": {
          const line = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
          const cell = (nodes, i, head) =>
            new TableCell({
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              shading: head ? { type: ShadingType.CLEAR, fill: "ECECF8", color: "auto" } : undefined,
              children: [new Paragraph({ alignment: ALIGN[b.align[i]] || AlignmentType.LEFT, children: runs(nodes, head ? { bold: true } : {}) })],
            });
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
              rows: [
                new TableRow({ tableHeader: true, children: b.header.map((c, i) => cell(c, i, true)) }),
                ...b.rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) })),
              ],
            }),
            new Paragraph({ spacing: { after: 120 } })
          );
          break;
        }
      }
    }

    const heading = (id, name, size, before) => ({
      id,
      name,
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: { size, bold: true, color: "1F1F2E", font: "Calibri" },
      paragraph: { spacing: { before, after: 120 }, keepNext: true },
    });

    const doc = new Document({
      creator: "Catatan",
      title: titleOf(note),
      description: "Diekspor dari Catatan",
      styles: {
        default: { document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { after: 120, line: 300 } } } },
        paragraphStyles: [
          heading("Title", "Title", 48, 0),
          heading("Heading1", "Heading 1", 34, 320),
          heading("Heading2", "Heading 2", 28, 260),
          heading("Heading3", "Heading 3", 24, 200),
        ],
      },
      numbering: { config: numbering },
      sections: [
        {
          properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          footers: {
            default: new Footer({
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 18, color: "888888" })] })],
            }),
          },
          children,
        },
      ],
    });
    return Packer.toBlob(doc);
  }

  // =====================================================================
  //  PDF
  // =====================================================================
  // Font bawaan PDF (Roboto) tidak punya emoji & simbol dingbat; hapus agar tidak tampil kotak kosong.
  const pdfClean = (t) => String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍]/gu, "");

  async function toPdf(note, blocks, images) {
    await loadLib("pdf");
    const PAGE_W = 515; // A4 (595pt) dikurangi margin 2 × 40pt

    const run = (n, base = {}) => {
      if (n.image) return { text: n.alt ? `[gambar: ${pdfClean(n.alt)}]` : "[gambar]", italics: true, color: "#888888" };
      const o = { text: pdfClean(n.text) };
      if (n.bold || base.bold) o.bold = true;
      if (n.italic || base.italics) o.italics = true;
      if (n.strike || base.strike) o.decoration = "lineThrough";
      if (base.color) o.color = base.color;
      if (n.code) {
        o.background = "#EEEEF2";
        o.color = "#B4235A";
      }
      if (n.href) {
        o.link = n.href;
        o.color = "#0563C1";
        o.decoration = "underline";
      }
      return o;
    };
    const runs = (nodes, base) => nodes.map((n) => run(n, base));
    const box = (checked) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><rect x="0.75" y="0.75" width="10.5" height="10.5" rx="2" fill="${checked ? "#5B5BD6" : "none"}" stroke="#5B5BD6" stroke-width="1.5"/>${
        checked ? '<path d="M3 6.2l2 2 4-4.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' : ""
      }</svg>`;

    const content = [{ text: pdfClean(titleOf(note)).trim() || "Tanpa judul", fontSize: 24, bold: true, color: "#1F1F2E", margin: [0, 0, 0, 4] }];
    const meta = metaLine(note);
    if (meta) content.push({ text: pdfClean(meta), fontSize: 9, color: "#888888", margin: [0, 0, 0, 14] });

    for (const b of blocks) {
      switch (b.type) {
        case "heading":
          content.push({ text: runs(b.inline), fontSize: [20, 16, 13][b.level - 1], bold: true, color: "#1F1F2E", margin: [0, 12, 0, 6] });
          break;
        case "paragraph": {
          const t = [];
          b.lines.forEach((line, i) => {
            if (i) t.push({ text: "\n" });
            t.push(...runs(line));
          });
          content.push({ text: t, margin: [0, 0, 0, 8] });
          break;
        }
        case "list":
          b.items.forEach((it, i) => {
            const marker =
              it.checked !== null
                ? { svg: box(it.checked), width: 12, margin: [0, 2, 0, 0] }
                : { text: b.ordered ? `${i + 1}.` : "•", width: b.ordered ? 18 : 12, alignment: b.ordered ? "right" : "center" };
            content.push({
              columns: [marker, { text: runs(it.inline, it.checked ? { color: "#888888", strike: true } : {}), width: "*" }],
              columnGap: 6,
              margin: [6, 0, 0, i === b.items.length - 1 ? 8 : 3],
            });
          });
          break;
        case "quote":
          content.push({
            table: { widths: ["*"], body: [[{ text: runs(b.inline, { italics: true, color: "#555555" }), margin: [4, 2, 0, 2] }]] },
            layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 3 : 0), vLineColor: () => "#" + BRAND },
            margin: [0, 0, 0, 8],
          });
          break;
        case "code":
          content.push({
            table: { widths: ["*"], body: [[{ text: pdfClean(b.text) || " ", preserveLeadingSpaces: true, fontSize: 9, color: "#222222", fillColor: "#F4F4F6", margin: [6, 6, 6, 6] }]] },
            layout: "noBorders",
            margin: [0, 0, 0, 8],
          });
          break;
        case "hr":
          content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: PAGE_W, y2: 0, lineWidth: 0.8, lineColor: "#CCCCCC" }], margin: [0, 8, 0, 8] });
          break;
        case "image": {
          const img = imageFor(images, b);
          if (!img) {
            content.push({ text: pdfClean(imageFallback(b, images.skipped)), italics: true, color: "#888888", margin: [0, 0, 0, 8] });
            break;
          }
          const s = fit(img.width * 0.75, img.height * 0.75, PAGE_W, 600);
          content.push({ image: img.dataUrl, width: s.w, height: s.h, margin: [0, 4, 0, 10] });
          break;
        }
        case "table": {
          const cell = (nodes, i, head) => ({ text: runs(nodes, head ? { bold: true } : {}), alignment: b.align[i] || "left", fillColor: head ? "#ECECF8" : undefined });
          content.push({
            table: { headerRows: 1, widths: b.header.map(() => "*"), body: [b.header.map((c, i) => cell(c, i, true)), ...b.rows.map((r) => r.map((c, i) => cell(c, i, false)))] },
            layout: { hLineColor: () => "#D0D0D8", vLineColor: () => "#D0D0D8", hLineWidth: () => 0.6, vLineWidth: () => 0.6, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 },
            margin: [0, 0, 0, 10],
          });
          break;
        }
      }
    }

    const def = {
      info: { title: pdfClean(titleOf(note)).trim(), author: "Catatan", creator: "Catatan" },
      pageSize: "A4",
      pageMargins: [40, 50, 40, 50],
      defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.25 },
      content,
      footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: "center", fontSize: 8, color: "#999999", margin: [0, 16, 0, 0] }),
    };
    return window.pdfMake.createPdf(def).getBlob();
  }

  // =====================================================================
  //  EXCEL
  // =====================================================================
  const XL_HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + BRAND } };
  const XL_HEAD_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
  const XL_LIMIT = 32000; // batas sel Excel 32.767 karakter

  const cap = (s) => (s.length > XL_LIMIT ? s.slice(0, XL_LIMIT) + "…" : s);
  // Angka murni jadi angka (supaya bisa dijumlah); "007", nomor telepon, dll. tetap teks.
  const cellValue = (s) => (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s) ? Number(s) : cap(s));

  function styleHeader(row) {
    row.eachCell((c) => {
      c.fill = XL_HEAD_FILL;
      c.font = XL_HEAD_FONT;
      c.alignment = { vertical: "middle", wrapText: true };
    });
    row.height = 22;
  }

  async function toExcel(note, blocks) {
    await loadLib("excel");
    const wb = new window.ExcelJS.Workbook();
    wb.creator = "Catatan";
    wb.title = titleOf(note);
    wb.created = new Date();

    const ws = wb.addWorksheet("Catatan", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Jenis", key: "type", width: 16 },
      { header: "Isi", key: "text", width: 90 },
      { header: "Status", key: "status", width: 12 },
    ];
    styleHeader(ws.getRow(1));

    let no = 0;
    const add = (type, text, status = "", font) => {
      const row = ws.addRow({ no: ++no, type, text: cap(text), status });
      row.alignment = { vertical: "top", wrapText: true };
      row.getCell("no").alignment = { vertical: "top", horizontal: "center" };
      if (font) row.getCell("text").font = font;
      if (status === "Selesai") row.getCell("status").font = { color: { argb: "FF2E9D62" }, bold: true };
      if (status === "Belum") row.getCell("status").font = { color: { argb: "FFC27C0E" }, bold: true };
      return row;
    };

    add("Judul catatan", titleOf(note)).getCell("text").font = { bold: true, size: 13 };
    if (note.tags && note.tags.length) add("Tag", note.tags.map((t) => "#" + t).join(" "));
    if (note.updatedAt) add("Diubah", new Date(note.updatedAt).toLocaleString("id-ID"));

    let tableNo = 0;
    for (const b of blocks) {
      switch (b.type) {
        case "heading":
          add(`Judul ${b.level}`, plain(b.inline)).getCell("text").font = { bold: true };
          break;
        case "paragraph":
          add("Teks", b.lines.map(plain).join("\n"));
          break;
        case "list":
          b.items.forEach((it, i) => {
            if (it.checked !== null) add("Tugas", plain(it.inline), it.checked ? "Selesai" : "Belum");
            else add(b.ordered ? "Nomor" : "Poin", (b.ordered ? `${i + 1}. ` : "") + plain(it.inline));
          });
          break;
        case "quote":
          add("Kutipan", plain(b.inline), "", { italic: true, color: { argb: "FF555555" } });
          break;
        case "code":
          add("Kode", b.text, "", { name: "Consolas" });
          break;
        case "image":
          add("Gambar", b.alt || b.src.replace(/^attachment:/, ""));
          break;
        case "table": {
          const name = `Tabel ${++tableNo}`;
          add("Tabel", `→ lihat lembar "${name}"`);
          const t = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
          const header = b.header.map(plain);
          t.addRow(header);
          styleHeader(t.getRow(1));
          b.rows.forEach((r) => {
            const row = t.addRow(r.map((c) => cellValue(plain(c))));
            row.alignment = { vertical: "top", wrapText: true };
          });
          header.forEach((h, i) => {
            const longest = Math.max(h.length, ...b.rows.map((r) => plain(r[i]).length));
            const col = t.getColumn(i + 1);
            col.width = Math.min(60, Math.max(10, longest + 3));
            if (b.align[i]) col.alignment = { horizontal: b.align[i], vertical: "top", wrapText: true };
          });
          t.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + b.rows.length, column: header.length } };
          break;
        }
      }
    }
    if (no > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + no, column: 4 } };

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  // Ringkasan isi catatan sebagai teks biasa (untuk ekspor semua catatan).
  function blocksToPlain(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.type === "heading") out.push(plain(b.inline));
      else if (b.type === "paragraph") out.push(b.lines.map(plain).join("\n"));
      else if (b.type === "quote") out.push("> " + plain(b.inline));
      else if (b.type === "code") out.push(b.text);
      else if (b.type === "image") out.push(b.alt ? `[gambar: ${b.alt}]` : "[gambar]");
      else if (b.type === "list")
        b.items.forEach((it, i) => out.push((it.checked === null ? (b.ordered ? `${i + 1}. ` : "• ") : it.checked ? "☑ " : "☐ ") + plain(it.inline)));
      else if (b.type === "table") {
        out.push(b.header.map(plain).join(" | "));
        b.rows.forEach((r) => out.push(r.map(plain).join(" | ")));
      }
    }
    return out.join("\n");
  }

  async function exportAllNotes(notes) {
    await loadLib("excel");
    const wb = new window.ExcelJS.Workbook();
    wb.creator = "Catatan";
    wb.title = "Semua catatan";
    wb.created = new Date();
    const ws = wb.addWorksheet("Catatan", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "Judul", key: "title", width: 34 },
      { header: "Tag", key: "tags", width: 24 },
      { header: "Disematkan", key: "pinned", width: 13 },
      { header: "Dibuat", key: "created", width: 19, style: { numFmt: "dd/mm/yyyy hh:mm" } },
      { header: "Diubah", key: "updated", width: 19, style: { numFmt: "dd/mm/yyyy hh:mm" } },
      { header: "Isi", key: "text", width: 100 },
    ];
    styleHeader(ws.getRow(1));
    [...notes]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach((n) => {
        const row = ws.addRow({
          title: titleOf(n),
          tags: (n.tags || []).map((t) => "#" + t).join(" "),
          pinned: n.pinned ? "Ya" : "",
          created: new Date(n.createdAt),
          updated: new Date(n.updatedAt),
          text: cap(blocksToPlain(MD.parse(n.content || ""))),
        });
        row.alignment = { vertical: "top", wrapText: true };
      });
    if (notes.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + notes.length, column: 6 } };
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  // =====================================================================
  //  POWERPOINT
  // =====================================================================
  const SL = { X: 0.85, W: 11.6, TOP: 1.55, BOTTOM: 6.95 };
  const MAX_H = SL.BOTTOM - SL.TOP;
  const textLines = (len, cpl) => Math.max(1, Math.ceil(len / cpl));

  // Perkiraan tinggi (inci) tiap potongan konten pada ukuran font yang dipakai.
  const estimate = {
    paragraph: (b) => b.lines.reduce((s, l) => s + textLines(plain(l).length, 84), 0) * 0.37 + 0.15,
    list: (b) => b.items.reduce((s, it) => s + textLines(plain(it.inline).length + 3, 78) * 0.37 + 0.08, 0) + 0.1,
    quote: (b) => textLines(plain(b.inline).length, 74) * 0.37 + 0.25,
    code: (b) => b.text.split("\n").length * 0.26 + 0.35,
    table: (b) => (b.rows.length + 1) * 0.42 + 0.2,
    heading: () => 0.6,
  };

  // Pecah blok yang lebih tinggi dari satu slide menjadi beberapa potongan.
  function splitBlock(b) {
    const h = (estimate[b.type] || (() => 0.4))(b);
    if (h <= MAX_H) return [b];
    if (b.type === "list") {
      const parts = [];
      let cur = [];
      let ch = 0.1;
      for (const it of b.items) {
        const ih = textLines(plain(it.inline).length + 3, 78) * 0.37 + 0.08;
        if (cur.length && ch + ih > MAX_H) {
          parts.push({ ...b, items: cur });
          cur = [];
          ch = 0.1;
        }
        cur.push(it);
        ch += ih;
      }
      if (cur.length) parts.push({ ...b, items: cur });
      return parts;
    }
    if (b.type === "code") {
      const lines = b.text.split("\n");
      const per = Math.max(4, Math.floor((MAX_H - 0.35) / 0.26));
      const parts = [];
      for (let i = 0; i < lines.length; i += per) parts.push({ ...b, text: lines.slice(i, i + per).join("\n") });
      return parts;
    }
    if (b.type === "table") {
      const per = Math.max(2, Math.floor((MAX_H - 0.2) / 0.42) - 1);
      const parts = [];
      for (let i = 0; i < b.rows.length; i += per) parts.push({ ...b, rows: b.rows.slice(i, i + per) });
      return parts;
    }
    if (b.type === "paragraph") {
      const parts = [];
      let cur = [];
      let ch = 0.15;
      for (const l of b.lines) {
        const lh = textLines(plain(l).length, 84) * 0.37;
        if (cur.length && ch + lh > MAX_H) {
          parts.push({ ...b, lines: cur });
          cur = [];
          ch = 0.15;
        }
        cur.push(l);
        ch += lh;
      }
      if (cur.length) parts.push({ ...b, lines: cur });
      return parts;
    }
    return [b];
  }

  async function toPowerPoint(note, blocks, images) {
    await loadLib("pptx");
    const pptx = new window.PptxGenJS();
    pptx.layout = "LAYOUT_WIDE"; // 13,33 × 7,5 inci (16:9)
    pptx.title = titleOf(note);
    pptx.author = "Catatan";
    pptx.company = "Catatan";
    pptx.theme = { headFontFace: "Calibri", bodyFontFace: "Calibri" };
    pptx.defineSlideMaster({
      title: "CATATAN",
      background: { color: "FFFFFF" },
      objects: [{ rect: { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: BRAND } } }],
      slideNumber: { x: 12.3, y: 7.0, w: 0.7, h: 0.3, fontSize: 10, color: "999999", align: "right" },
    });

    const runs = (nodes, base = {}) =>
      nodes.map((n) => {
        if (n.image) return { text: n.alt ? `[gambar: ${n.alt}]` : "[gambar]", options: { ...base, italic: true, color: "888888" } };
        const o = { ...base };
        if (n.bold) o.bold = true;
        if (n.italic) o.italic = true;
        if (n.strike) o.strike = "sngStrike";
        if (n.code) {
          o.fontFace = "Consolas";
          o.color = "B4235A";
        }
        if (n.href) {
          o.hyperlink = { url: n.href };
          o.color = "0563C1";
        }
        return { text: n.text, options: o };
      });
    const endPara = (rs) => {
      if (rs.length) rs[rs.length - 1].options = { ...rs[rs.length - 1].options, breakLine: true };
      return rs;
    };

    // ---- Slide judul
    const cover = pptx.addSlide();
    cover.background = { color: BRAND };
    cover.addText(titleOf(note), { x: 1, y: 2.3, w: 11.3, h: 1.8, fontSize: 44, bold: true, color: "FFFFFF", fontFace: "Calibri", valign: "bottom", margin: 0, fit: "shrink" });
    const meta = metaLine(note);
    if (meta) cover.addText(meta, { x: 1, y: 4.3, w: 11.3, h: 0.6, fontSize: 18, color: "E4E4FA", fontFace: "Calibri", valign: "top", margin: 0 });

    // ---- Bagi isi menjadi bagian (satu bagian per judul H1/H2)
    const sections = [];
    let cur = { title: null, items: [] };
    const pushSection = () => {
      if (cur.items.length || cur.title) sections.push(cur);
    };
    for (const b of blocks) {
      if (b.type === "heading" && b.level <= 2) {
        pushSection();
        cur = { title: plain(b.inline), items: [] };
      } else if (b.type !== "hr") {
        cur.items.push(b);
      }
    }
    pushSection();

    for (const sec of sections) {
      const base = sec.title || (sections.length > 1 ? "Ringkasan" : titleOf(note));
      let pageNo = 0;
      let slide = null;
      let y = SL.TOP;

      const newSlide = (isImage = false) => {
        if (!isImage) pageNo++;
        slide = pptx.addSlide({ masterName: "CATATAN" });
        slide.addText(!isImage && pageNo > 1 ? `${base} (${pageNo})` : base, { x: SL.X, y: 0.45, w: SL.W, h: 0.8, fontSize: 30, bold: true, color: "1F1F2E", fontFace: "Calibri", valign: "middle", margin: 0, fit: "shrink" });
        slide.addShape(pptx.ShapeType.rect, { x: SL.X, y: 1.28, w: 0.9, h: 0.05, fill: { color: BRAND }, line: { color: BRAND, width: 0 } });
        y = SL.TOP;
      };

      for (const raw of sec.items) {
        // Gambar: satu slide tersendiri
        if (raw.type === "image") {
          newSlide(true);
          const img = imageFor(images, raw);
          if (!img) {
            slide.addText(imageFallback(raw, images.skipped), { x: SL.X, y, w: SL.W, h: 0.6, fontSize: 18, italic: true, color: "888888", margin: 0 });
          } else {
            const maxW = SL.W;
            const maxH = 4.8;
            const k = Math.min(maxW / img.width, maxH / img.height);
            const w = img.width * k;
            const h = img.height * k;
            slide.addImage({ data: img.dataUrl, x: SL.X + (maxW - w) / 2, y, w, h });
            if (raw.alt) slide.addText(raw.alt, { x: SL.X, y: y + h + 0.1, w: SL.W, h: 0.4, fontSize: 14, color: "888888", align: "center", margin: 0 });
          }
          slide = null;
          continue;
        }

        for (const b of splitBlock(raw)) {
          const h = (estimate[b.type] || (() => 0.5))(b);
          if (!slide || (y + h > SL.BOTTOM && y > SL.TOP)) newSlide();
          const o = { x: SL.X, y, w: SL.W, h, fontFace: "Calibri", valign: "top", margin: 0, fontSize: 20, color: "2A2A35" };

          if (b.type === "paragraph") {
            const rs = [];
            b.lines.forEach((line) => rs.push(...endPara(runs(line))));
            slide.addText(rs, { ...o, paraSpaceAfter: 6 });
          } else if (b.type === "list") {
            const rs = [];
            b.items.forEach((it, i) => {
              if (it.checked !== null) {
                rs.push({ text: it.checked ? "☑ " : "☐ ", options: { fontFace: "Segoe UI Symbol", color: it.checked ? BRAND : "666666" } });
                rs.push(...endPara(runs(it.inline, it.checked ? { color: "888888", strike: "sngStrike" } : {})));
              } else {
                const bullet = b.ordered ? { type: "number", indent: 26 } : { code: "2022", indent: 22 };
                // Properti paragraf (bullet) cukup di potongan pertama; potongan berikutnya tetap satu paragraf.
                const itemRuns = runs(it.inline);
                if (!itemRuns.length) itemRuns.push({ text: " ", options: {} });
                itemRuns[0] = { ...itemRuns[0], options: { ...itemRuns[0].options, bullet } };
                rs.push(...endPara(itemRuns));
              }
            });
            slide.addText(rs, { ...o, paraSpaceAfter: 5 });
          } else if (b.type === "heading") {
            slide.addText(endPara(runs(b.inline, { bold: true })), { ...o, fontSize: 24, color: "1F1F2E" });
          } else if (b.type === "quote") {
            slide.addShape(pptx.ShapeType.rect, { x: SL.X, y, w: 0.06, h: h - 0.1, fill: { color: BRAND }, line: { color: BRAND, width: 0 } });
            slide.addText(endPara(runs(b.inline, { italic: true, color: "555555" })), { ...o, x: SL.X + 0.25, w: SL.W - 0.25 });
          } else if (b.type === "code") {
            slide.addText(b.text || " ", { ...o, fontFace: "Consolas", fontSize: 13, color: "222222", fill: { color: "F4F4F6" }, margin: 8 });
          } else if (b.type === "table") {
            const n = b.header.length;
            const cell = (nodes, i, head) => ({
              text: runs(nodes, head ? { bold: true } : {}),
              options: { align: b.align[i] || "left", fill: head ? { color: "ECECF8" } : undefined },
            });
            slide.addTable([b.header.map((c, i) => cell(c, i, true)), ...b.rows.map((r) => r.map((c, i) => cell(c, i, false)))], {
              x: SL.X,
              y,
              w: SL.W,
              colW: Array(n).fill(SL.W / n),
              fontSize: 14,
              fontFace: "Calibri",
              color: "2A2A35",
              valign: "middle",
              border: { type: "solid", pt: 0.75, color: "D0D0D8" },
            });
          }
          y += h + 0.15;
        }
      }
    }
    return pptx.write({ outputType: "blob" });
  }

  // =====================================================================
  //  API
  // =====================================================================
  async function exportNote(format, note, ctx = {}) {
    const blocks = normalizeBlocks(MD.parse(note.content || ""));
    const wantImages = ctx.includeImages !== false && typeof ctx.fetchAttachment === "function" && format !== "xlsx";
    const images = wantImages ? await loadImages(blocks, ctx.fetchAttachment) : new Map();
    images.skipped = !wantImages && ctx.includeImages === false;
    switch (format) {
      case "docx":
        return toWord(note, blocks, images);
      case "pdf":
        return toPdf(note, blocks, images);
      case "xlsx":
        return toExcel(note, blocks);
      case "pptx":
        return toPowerPoint(note, blocks, images);
      default:
        throw new Error("Format tidak dikenal: " + format);
    }
  }

  window.CatatanExport = { exportNote, exportAllNotes, blocksToPlain };
})();
