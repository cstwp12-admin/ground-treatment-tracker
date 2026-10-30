/* Ground Treatment Tracker · workbook (.xlsx) and alignment (.kml) importer.
   Loaded on demand. Reads cached cell values only (formulas are not evaluated).
   Uses vendor/fflate.umd.js (MIT) for unzipping. Developed by WPN. */
(function (global) {
  "use strict";
  const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (global.fflate) return resolve();
      const s = document.createElement("script");
      s.src = src; s.onload = resolve;
      s.onerror = () => reject(Error("Could not load " + src + ". Open the app online once so it can be cached."));
      document.head.appendChild(s);
    });
  }
  const colIndex = letters => { let n = 0; for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const norm = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  function parseXml(bytes) {
    const doc = new DOMParser().parseFromString(new TextDecoder("utf-8").decode(bytes), "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw Error("Could not read the workbook XML.");
    return doc;
  }
  function serialToISO(v) {
    if (typeof v !== "number" || !isFinite(v) || v < 20000 || v > 80000) return v == null ? null : norm(v);
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }

  class Sheet {
    constructor(doc, sst) {
      this.rows = new Map(); this.maxRow = 0;
      for (const c of doc.getElementsByTagName("c")) {
        const m = /^([A-Z]+)(\d+)$/.exec(c.getAttribute("r") || ""); if (!m) continue;
        const col = colIndex(m[1]), row = Number(m[2]), t = c.getAttribute("t");
        const vEl = c.getElementsByTagName("v")[0];
        let val = null;
        if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map(x => x.textContent).join("");
        else if (vEl) {
          const raw = vEl.textContent;
          if (t === "s") val = sst[Number(raw)];
          else if (t === "str") val = raw;
          else if (t === "b") val = raw === "1";
          else if (t === "e") val = null;
          else { const n = Number(raw); val = isNaN(n) ? raw : n; }
        }
        if (val === "" || val === undefined) val = null;
        if (val == null) continue;
        if (!this.rows.has(row)) this.rows.set(row, new Map());
        this.rows.get(row).set(col, val);
        if (row > this.maxRow) this.maxRow = row;
      }
    }
    get(r, c) { const row = this.rows.get(r); return row ? (row.get(c) ?? null) : null; }
    header(r) { const out = []; const row = this.rows.get(r); if (row) for (const [c, v] of row) out.push({ c, t: norm(v) }); return out; }
  }
  const find = (hdr, prefix) => { const p = prefix.toLowerCase(); const h = hdr.find(x => x.t.toLowerCase().startsWith(p)); return h ? h.c : null; };
  const findExact = (hdr, text) => { const p = text.toLowerCase(); const h = hdr.find(x => x.t.toLowerCase() === p); return h ? h.c : null; };

  async function openBook(buf) {
    await loadScript("vendor/fflate.umd.js");
    let files;
    try {
      files = fflate.unzipSync(new Uint8Array(buf), { filter: f => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) });
    } catch (e) { throw Error("This file is not a valid .xlsx workbook."); }
    if (!files["xl/workbook.xml"]) throw Error("This file is not a valid .xlsx workbook.");
    const sst = [];
    if (files["xl/sharedStrings.xml"]) {
      for (const si of parseXml(files["xl/sharedStrings.xml"]).getElementsByTagName("si")) {
        let t = "";
        for (const ch of si.children) {
          if (ch.tagName === "t") t += ch.textContent;
          else if (ch.tagName === "r") for (const x of ch.children) if (x.tagName === "t") t += x.textContent;
        }
        sst.push(t);
      }
    }
    const rels = {};
    if (files["xl/_rels/workbook.xml.rels"]) for (const r of parseXml(files["xl/_rels/workbook.xml.rels"]).getElementsByTagName("Relationship")) rels[r.getAttribute("Id")] = r.getAttribute("Target");
    const paths = {};
    for (const s of parseXml(files["xl/workbook.xml"]).getElementsByTagName("sheet")) {
      let tgt = rels[s.getAttributeNS(REL_NS, "id")]; if (!tgt) continue;
      tgt = tgt.replace(/^\//, ""); if (!tgt.startsWith("xl/")) tgt = "xl/" + tgt;
      paths[s.getAttribute("name")] = tgt;
    }
    const cache = {};
    return { names: Object.keys(paths), sheet(name) {
      if (!paths[name] || !files[paths[name]]) return null;
      return cache[name] || (cache[name] = new Sheet(parseXml(files[paths[name]]), sst));
    } };
  }

  function parseSegs(text, ids) {
    const s = String(text || "");
    if (/^\s*all\b/i.test(s)) return ids.slice();
    const out = new Set(), re = /(?:GT-?)?(\d{1,2})(?:\s*(?:\u2013|-|\u2014|to)\s*(?:GT-?)?(\d{1,2}))?/gi;
    let m;
    while ((m = re.exec(s))) {
      const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
      for (let n = Math.min(a, b); n <= Math.max(a, b) && n - Math.min(a, b) < 60; n++) {
        const id = "GT-" + String(n).padStart(2, "0"); if (ids.includes(id)) out.add(id);
      }
    }
    return [...out];
  }

  const TRACKERS = [["RR_Tracker", "R&R"], ["PVD_Tracker", "PVD"], ["PE_Tracker", "Piled Embankment"]];
  const DATE_KEYS = new Set(["commenced", "completed", "surchargePlaced", "plannedRemoval", "updated", "loadTestDate", "slabCast"]);

  async function readWorkbook(buf, fileName) {
    const book = await openBook(buf);
    const need = ["Master_List"];
    for (const n of need) if (!book.sheet(n)) throw Error("Sheet \"" + n + "\" not found. Is this the GT tracker workbook?");
    const warnings = [];

    // ---- meta
    const dash = book.sheet("Dashboard"), readme = book.sheet("README");
    const meta = {
      source: fileName || "workbook.xlsx",
      cutoff: dash ? serialToISO(dash.get(4, 3)) : null,
      reportingMonth: dash ? norm(dash.get(4, 4)).replace(/^Reporting month:\s*/i, "") : "",
      title: readme ? norm(readme.get(1, 2)) : "",
      projectLine: readme ? norm(readme.get(2, 2)) : ""
    };
    if (!meta.cutoff) warnings.push("Cut-off date (Dashboard!C4) not found.");

    // ---- master list
    const ml = book.sheet("Master_List"), mh = ml.header(4);
    const M = {}; const mcols = {
      id: "ID", zone: "Zone", from: "CH From", to: "CH To", cat: "GT category", design: "Design GT", gtType: "Current GT type",
      governing: "Governing", depth: "R&R depth", replace: "Replace material", surchT: "Surcharge t", surchM: "Surcharge period",
      pvdL: "PVD L", pvdS: "PVD S", separator: "Separator", basal: "Basal STR", pile: "Pile / slab", bq: "BQ items", cbh: "CBH",
      instrReq: "Instruments req", instrInst: "Instruments installed", prog: "Progress %", act: "Current activity", next: "Next activity",
      issue: "Issues", active: "Active"
    };
    for (const k in mcols) M[k] = find(mh, mcols[k]);
    M.status = findExact(mh, "Status");
    for (const k of ["id", "zone", "from", "to", "cat", "status"]) if (M[k] == null) throw Error("Master_List column for \"" + k + "\" not found (header row 4).");
    const records = [];
    for (let r = 5; r <= ml.maxRow; r++) {
      const id = norm(ml.get(r, M.id)); if (!/^GT-\d+/i.test(id)) continue;
      const g = k => (M[k] == null ? null : ml.get(r, M[k]));
      records.push({
        id, zone: norm(g("zone")), from: Number(g("from")), to: Number(g("to")), type: norm(g("cat")), gtType: norm(g("gtType")),
        design: norm(g("design")), governing: norm(g("governing")), status: norm(g("status")),
        activity: norm(g("act")), next: norm(g("next")), issue: norm(g("issue")),
        workbookProgress: typeof g("prog") === "number" ? g("prog") : null,
        params: {
          "R&R depth (m)": g("depth"), "Replace material": g("replace"), "Surcharge (m)": g("surchT"), "Surcharge period (months)": g("surchM"),
          "PVD length (m)": g("pvdL"), "PVD spacing (m)": g("pvdS"), "Separator": g("separator"), "Basal reinforcement (kN/m)": g("basal"),
          "Pile / slab": g("pile"), "BQ items": g("bq"), "CBH": g("cbh")
        }
      });
    }
    if (!records.length) throw Error("No GT-xx segments found in Master_List.");
    const ids = records.map(r => r.id);
    for (const r of records) for (const k of Object.keys(r.params)) { const v = r.params[k]; if (v == null || v === "") delete r.params[k]; else r.params[k] = String(v); }

    // ---- trackers (stage names, weights, ratings, dates)
    const templates = {}, byId = new Map(records.map(r => [r.id, r]));
    for (const [sheetName, cat] of TRACKERS) {
      const sh = book.sheet(sheetName); if (!sh) { warnings.push("Sheet " + sheetName + " not found."); continue; }
      const hdr = sh.header(4);
      const stageCols = hdr.filter(h => /^S\d+\s/.test(h.t)).map(h => ({ c: h.c, name: h.t.replace(/^S\d+\s*/, "") }));
      const tpl = stageCols.map((s, i) => ({ id: "s" + (i + 1), name: s.name, weight: Number(sh.get(3, s.c)) || 0, rating: 0 }));
      templates[cat] = tpl.map(s => ({ ...s }));
      const T = {
        override: findExact(hdr, "Status override"), status: findExact(hdr, "Status"), commenced: find(hdr, "Work commenced"), completed: find(hdr, "Work completed"),
        surchargePlaced: find(hdr, "Surcharge placed (date"), surchargeMonths: find(hdr, "Surcharge period"), plannedRemoval: find(hdr, "Planned surcharge removal"),
        updated: find(hdr, "Last updated"), updatedBy: find(hdr, "Updated by"), keyParams: find(hdr, "Key design parameters"),
        pilesDone: find(hdr, "Working piles installed (n"), pilesReq: find(hdr, "Working piles required"), loadTestDate: find(hdr, "Load test date"),
        loadTestResult: find(hdr, "Load test result"), slabCast: find(hdr, "Slab cast date"), pda: find(hdr, "PDA tests done")
      };
      for (let r = 5; r <= sh.maxRow; r++) {
        const id = norm(sh.get(r, 1)); const rec = byId.get(id); if (!rec) continue;
        rec.stages = stageCols.map((s, i) => {
          const v = sh.get(r, s.c);
          const rating = typeof v === "number" ? v : (/^n\/?a$/i.test(norm(v)) ? "NA" : 0);
          return { id: "s" + (i + 1), name: s.name, weight: tpl[i].weight, rating };
        });
        rec.tracker = sheetName;
        for (const k in T) {
          if (T[k] == null || ["override", "status"].includes(k)) continue;
          let v = sh.get(r, T[k]); if (v == null) continue;
          rec[k === "updatedBy" ? "updatedBy" : k] = DATE_KEYS.has(k) ? serialToISO(v) : (typeof v === "number" ? v : norm(v));
        }
        if (!rec.status && T.status) rec.status = norm(sh.get(r, T.status));
      }
    }
    templates["Surcharge (PVD omitted)"] = (templates["PVD"] || []).map(s => ({ ...s }));
    for (const r of records) {
      if (!r.stages) { warnings.push(r.id + " not found in any tracker sheet; stages set to the " + r.type + " template at 0%."); const t = templates[r.type] || templates["R&R"] || []; r.stages = t.map(s => ({ ...s })); }
      if (r.lastUpdated === undefined && r.updated) r.lastUpdated = r.updated;
    }

    // ---- registers
    const instruments = [];
    const ins = book.sheet("Instrumentation");
    if (ins) {
      const h = ins.header(4);
      const C = { id: 1, type: find(h, "Type"), ch: find(h, "Chainage"), off: find(h, "Offset"), area: find(h, "Area"), bq: find(h, "BQ"), seg: find(h, "Segment"), st: findExact(h, "Status"), inst: find(h, "Install date"), base: find(h, "Baseline"), last: find(h, "Latest"), rem: find(h, "Remarks") };
      for (let r = 5; r <= ins.maxRow; r++) {
        const id = norm(ins.get(r, 1)); if (!id) continue;
        instruments.push({ id, type: norm(ins.get(r, C.type)), chainage: Number(ins.get(r, C.ch)) || null, offset: norm(ins.get(r, C.off)), area: norm(ins.get(r, C.area)), bq: norm(ins.get(r, C.bq)), segment: norm(ins.get(r, C.seg)), status: norm(ins.get(r, C.st)), installDate: serialToISO(ins.get(r, C.inst)), baselineDate: serialToISO(ins.get(r, C.base)), latestDate: serialToISO(ins.get(r, C.last)), remarks: norm(ins.get(r, C.rem)) });
      }
    } else warnings.push("Instrumentation sheet not found.");

    const rfits = [];
    const rs = book.sheet("RFIT_Register");
    if (rs) {
      const h = rs.header(4);
      const C = { no: 1, sub: find(h, "Subject"), iss: find(h, "Date issued"), resp: find(h, "Date responded"), ref: find(h, "Drawing"), ch: find(h, "Chainage"), seg: find(h, "Segment"), res: find(h, "Response"), eff: find(h, "Effect"), st: findExact(h, "Status"), fu: find(h, "Follow-up") };
      for (let r = 5; r <= rs.maxRow; r++) {
        const no = norm(rs.get(r, 1)); if (!no) continue;
        const segText = norm(rs.get(r, C.seg));
        rfits.push({ no, subject: norm(rs.get(r, C.sub)), issued: serialToISO(rs.get(r, C.iss)), responded: serialToISO(rs.get(r, C.resp)), reference: norm(rs.get(r, C.ref)), chainage: norm(rs.get(r, C.ch)), segmentsText: segText, segments: parseSegs(segText, ids), response: norm(rs.get(r, C.res)), effect: norm(rs.get(r, C.eff)), status: norm(rs.get(r, C.st)), followUp: norm(rs.get(r, C.fu)) });
      }
    } else warnings.push("RFIT_Register sheet not found.");

    const memos = [];
    const ms = book.sheet("Memo_Register");
    if (ms) {
      let hr = 0; for (let r = 1; r <= 10; r++) if (/^memo ref/i.test(norm(ms.get(r, 1)))) { hr = r; break; }
      if (hr) {
        const h = ms.header(hr);
        const C = { date: find(h, "Date"), ft: find(h, "From"), sub: find(h, "Subject"), ch: find(h, "Chainage"), seg: find(h, "Segment"), key: find(h, "Key content"), eff: find(h, "Effect"), st: findExact(h, "Status"), fu: find(h, "Follow-up") };
        for (let r = hr + 1; r <= ms.maxRow; r++) {
          const ref = norm(ms.get(r, 1)); if (!ref) continue;
          const segText = norm(ms.get(r, C.seg));
          memos.push({ ref, date: serialToISO(ms.get(r, C.date)), fromTo: norm(ms.get(r, C.ft)), subject: norm(ms.get(r, C.sub)), chainage: norm(ms.get(r, C.ch)), segmentsText: segText, segments: parseSegs(segText, ids), content: norm(ms.get(r, C.key)), effect: norm(ms.get(r, C.eff)), status: norm(ms.get(r, C.st)), followUp: norm(ms.get(r, C.fu)) });
        }
      }
    }

    // ---- history (Progress_History month columns)
    const snapshots = [];
    const ph = book.sheet("Progress_History");
    if (ph) {
      const h = ph.header(4);
      const monthCols = h.filter(x => x.c >= 7 && typeof ph.get(4, x.c) === "number").map(x => ({ c: x.c, date: serialToISO(ph.get(4, x.c)) }));
      for (const mc of monthCols) {
        const segs = {}; let n = 0;
        for (let r = 5; r <= ph.maxRow; r++) {
          const id = norm(ph.get(r, 1)); const v = ph.get(r, mc.c);
          if (byId.has(id) && typeof v === "number") { segs[id] = v; n++; }
        }
        if (n) snapshots.push({ date: mc.date, label: "Workbook " + mc.date, source: "workbook", segments: segs });
      }
    }
    return { meta, records, templates, instruments, rfits, memos, snapshots, warnings };
  }

  async function readKml(text, fileName) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw Error("This is not a valid KML file.");
    const pts = [], marks = [];
    const isChainFolder = f => { for (const c of f.children) if (c.tagName === "name") return /^chainage/i.test(c.textContent.trim()); return false; };
    const folders = Array.from(doc.getElementsByTagName("Folder"));
    const chainFolder = folders.find(isChainFolder);
    const coordOf = pm => { const pt = pm.getElementsByTagName("Point")[0]; if (!pt) return null; const c = pt.getElementsByTagName("coordinates")[0]; if (!c) return null; const p = c.textContent.trim().split(",").map(Number); return p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) ? p : null; };
    const nameOf = pm => { for (const c of pm.children) if (c.tagName === "name") return c.textContent.trim(); return ""; };
    if (chainFolder) {
      for (const pm of chainFolder.getElementsByTagName("Placemark")) {
        const ch = parseFloat(nameOf(pm)), p = coordOf(pm);
        if (isFinite(ch) && p) pts.push([ch, p[0], p[1]]);
      }
    }
    if (pts.length < 2) throw Error("No chainage points found. The KML needs a folder named \"Chainage_Text\" with placemarks named by chainage in metres (e.g. 62700.000).");
    pts.sort((a, b) => a[0] - b[0]);
    for (const pm of doc.getElementsByTagName("Placemark")) {
      if (chainFolder && chainFolder.contains(pm)) continue;
      const n = nameOf(pm), p = coordOf(pm);
      if (p && /\bbridge\b/i.test(n)) marks.push({ name: n, lon: p[0], lat: p[1] });
    }
    const R = 6371000, rad = Math.PI / 180; let gaps = 0, maxGap = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = (pts[i][1] - pts[i - 1][1]) * rad * R * Math.cos(pts[i][2] * rad), dy = (pts[i][2] - pts[i - 1][2]) * rad * R;
      const d = Math.hypot(dx, dy), dc = pts[i][0] - pts[i - 1][0];
      if (dc > 0 && Math.abs(d - dc) / dc > 0.1) gaps++;
      maxGap = Math.max(maxGap, dc);
    }
    return { map: { pts, marks, source: fileName || "alignment.kml", importedAt: new Date().toISOString() }, check: { points: pts.length, from: pts[0][0], to: pts[pts.length - 1][0], badSpacing: gaps, maxGap } };
  }

  global.GTImport = { readWorkbook, readKml, parseSegs };
})(window);
