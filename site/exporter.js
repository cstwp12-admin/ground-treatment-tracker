/* Ground Treatment Tracker · workbook write-back. Loaded on demand.
   Takes the master workbook (.xlsx) and writes the changes made in the app back into it by
   editing the sheet XML directly, so formatting, formulas, charts and photos are untouched.
   Formulas are not recalculated here; the file is flagged so Excel recalculates when it opens.
   Uses vendor/fflate.umd.js (MIT). Developed by WPN. */
(function (global) {
  "use strict";
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const unesc = s => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const colNum = l => { let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const colName = n => { let s = ""; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const dec = b => new TextDecoder("utf-8").decode(b), enc = s => new TextEncoder().encode(s);
  const serial = iso => Math.round(Date.parse(String(iso).slice(0, 10) + "T00:00:00Z") / 86400000) + 25569;
  const TRACKERS = ["RR_Tracker", "PVD_Tracker", "PE_Tracker"];

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (global.fflate) return res();
      const s = document.createElement("script"); s.src = src; s.onload = res;
      s.onerror = () => rej(Error("Could not load " + src + ". Open the app online once so it can be cached."));
      document.head.appendChild(s);
    });
  }

  class Strings {
    constructor(xml) {
      this.xml = xml; this.items = []; const re = /<si>[\s\S]*?<\/si>/g; let m;
      while ((m = re.exec(xml))) this.items.push(unesc(m[0].replace(/<[^>]+>/g, "")));
      this.added = [];
    }
    text(i) { return this.items[i] ?? this.added[i - this.items.length] ?? ""; }
    add(t) { this.added.push(t); return this.items.length + this.added.length - 1; }
    toXml() {
      if (!this.added.length) return this.xml;
      let x = this.xml.replace("</sst>", this.added.map(t => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join("") + "</sst>");
      const total = this.items.length + this.added.length;
      x = x.replace(/uniqueCount="\d+"/, `uniqueCount="${total}"`).replace(/(<sst[^>]*?) count="(\d+)"/, (a, p, n) => `${p} count="${Number(n) + this.added.length}"`);
      return x;
    }
  }

  class Sheet {
    constructor(xml, sst) { this.xml = xml; this.sst = sst; }
    rowRe(r) { return new RegExp(`<row r="${r}"(?: [^>]*)?(?:/>|>[\\s\\S]*?</row>)`); }
    cellRe(ref) { return new RegExp(`<c r="${ref}"((?: [A-Za-z:]+="[^"]*")*?)(?:/>|>[\\s\\S]*?</c>)`); }
    cell(ref) { const m = this.cellRe(ref).exec(this.xml); return m ? m[0] : null; }
    isFormula(ref) { const c = this.cell(ref); return !!c && c.includes("<f"); }
    text(ref) {
      const c = this.cell(ref); if (!c) return "";
      const t = /\bt="([^"]*)"/.exec(c.slice(0, c.indexOf(">")));
      const v = /<v>([\s\S]*?)<\/v>/.exec(c);
      if (t && t[1] === "s" && v) return this.sst.text(Number(v[1]));
      if (t && t[1] === "inlineStr") return unesc(c.replace(/<[^>]+>/g, ""));
      return v ? unesc(v[1]) : "";
    }
    header(row) {
      const out = []; const m = this.rowRe(row).exec(this.xml); if (!m) return out;
      const re = /<c r="([A-Z]+)\d+"/g; let c;
      while ((c = re.exec(m[0]))) out.push({ col: c[1], t: this.text(c[1] + row).replace(/\s+/g, " ").trim() });
      return out;
    }
    rowOf(col, id, from = 5) {
      const re = new RegExp(`<c r="${col}(\\d+)"[^>]*t="s"[^>]*><v>(\\d+)</v></c>`, "g"); let m;
      while ((m = re.exec(this.xml))) if (Number(m[1]) >= from && this.sst.text(Number(m[2])) === id) return Number(m[1]);
      return 0;
    }
    set(ref, value, kind) {
      const body = kind === "s" ? ` t="s"><v>${this.sst.add(String(value))}</v></c>` : `><v>${value}</v></c>`;
      const m = this.cellRe(ref).exec(this.xml);
      if (m) { const attrs = m[1].replace(/ t="[^"]*"/g, ""); this.xml = this.xml.slice(0, m.index) + `<c r="${ref}"${attrs}${body}` + this.xml.slice(m.index + m[0].length); return; }
      const [, col, row] = /^([A-Z]+)(\d+)$/.exec(ref), rm = this.rowRe(row).exec(this.xml);
      if (!rm) throw Error("Row " + row + " is missing in the workbook sheet.");
      const cells = [...rm[0].matchAll(/<c r="([A-Z]+)\d+"/g)], after = cells.find(c => colNum(c[1]) > colNum(col));
      const cellXml = `<c r="${ref}"${body}`; let newRow;
      if (/<row[^>]*\/>$/.test(rm[0])) newRow = rm[0].replace(/\/>$/, `>${cellXml}</row>`);
      else if (after) newRow = rm[0].replace(`<c r="${after[0].slice(6, -1)}"`, cellXml + `<c r="${after[0].slice(6, -1)}"`);
      else newRow = rm[0].replace("</row>", cellXml + "</row>");
      this.xml = this.xml.replace(rm[0], newRow);
    }
  }

  /** state: app state. Returns {bytes, summary[]} */
  async function updateWorkbook(buf, state, opts) {
    await loadScript("vendor/fflate.umd.js");
    let files; try { files = fflate.unzipSync(new Uint8Array(buf)); } catch (e) { throw Error("This file is not a valid .xlsx workbook."); }
    if (!files["xl/workbook.xml"] || !files["xl/sharedStrings.xml"]) throw Error("This does not look like the GT tracker workbook.");
    const wbx = dec(files["xl/workbook.xml"]), rels = dec(files["xl/_rels/workbook.xml.rels"]), paths = {};
    for (const m of wbx.matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
      const t = new RegExp(`<Relationship [^>]*Id="${m[2]}"[^>]*>`).exec(rels) || [];
      const tg = /Target="([^"]+)"/.exec(t[0] || ""); if (tg) paths[unesc(m[1])] = "xl/" + tg[1].replace(/^\/?(xl\/)?/, "");
    }
    if (!paths.Master_List) throw Error("Master_List sheet not found. Is this the GT tracker workbook?");
    const sst = new Strings(dec(files["xl/sharedStrings.xml"])), sheets = {};
    const sh = n => { if (!paths[n]) return null; return sheets[n] || (sheets[n] = new Sheet(dec(files[paths[n]]), sst)); };
    const summary = [], warn = [];
    const rows = state.records.filter(r => r.appUpdated);

    // ---- tracker sheets
    let nStage = 0, nText = 0;
    const hdrCache = {};
    for (const r of rows) {
      let done = false;
      for (const tn of TRACKERS) {
        const s = sh(tn); if (!s) continue;
        const row = s.rowOf("A", r.id); if (!row) continue;
        const h = hdrCache[tn] || (hdrCache[tn] = s.header(4));
        const stageCols = h.filter(x => /^S\d+\b/.test(x.t)).sort((a, b) => colNum(a.col) - colNum(b.col)).map(x => x.col);
        const col = pre => { const x = h.find(y => y.t.toLowerCase().startsWith(pre)); return x && x.col; };
        r.stages.forEach((st, i) => {
          const c = stageCols[i]; if (!c) { if (i >= stageCols.length) warn.push(r.id + ": stage " + (i + 1) + " has no column in " + tn + "."); return; }
          if (s.isFormula(c + row)) return; // calculated cell, for example instrumentation
          if (st.rating === "NA") s.set(c + row, "N/A", "s"); else s.set(c + row, Math.round(Number(st.rating) * 10000) / 10000);
          nStage++;
        });
        for (const [pre, val] of [["current activity", r.activity], ["next activity", r.next], ["issues", r.issue]]) { const c = col(pre); if (c && val != null) { s.set(c + row, val, "s"); nText++; } }
        const cd = col("last updated"); if (cd && r.lastUpdated) s.set(cd + row, serial(r.lastUpdated));
        const cu = col("updated by"); if (cu && r.updatedBy) s.set(cu + row, r.updatedBy, "s");
        done = true; break;
      }
      if (!done) warn.push(r.id + " was not found in any tracker sheet; add it by hand.");
    }
    summary.push(`${rows.length} segment${rows.length === 1 ? "" : "s"} written: ${nStage} stage ratings, ${nText} remarks.`);

    // ---- instruments
    const ins = state.instruments.filter(i => i.appUpdated), is = sh("Instrumentation");
    if (ins.length && is) {
      const h = is.header(4), stc = (h.find(x => x.t.toLowerCase() === "status") || {}).col;
      let n = 0; for (const i of ins) { const row = is.rowOf("A", i.id); if (row && stc) { is.set(stc + row, i.status, "s"); n++; } else warn.push("Instrument " + i.id + " not found."); }
      summary.push(`${n} instrument status${n === 1 ? "" : "es"} written.`);
    }

    // ---- cut-off date
    const dash = sh("Dashboard"); if (dash && state.meta.cutoff) dash.set("C4", serial(state.meta.cutoff));

    // ---- Progress_History month column
    const ph = sh("Progress_History");
    if (ph && opts && opts.progress && state.meta.cutoff) {
      const h = ph.header(4), ym = state.meta.cutoff.slice(0, 7);
      const mc = h.map(x => { const m = new RegExp(`<c r="${x.col}4"[^>]*><v>(\\d+(?:\\.\\d+)?)</v>`).exec(ph.xml); return m ? { col: x.col, d: new Date(Math.round((Number(m[1]) - 25569) * 86400000)).toISOString().slice(0, 7) } : null; }).filter(Boolean).find(x => x.d === ym);
      if (mc) { let n = 0; for (const r of state.records) { const p = opts.progress(r); if (p == null) continue; const row = ph.rowOf("A", r.id); if (row) { ph.set(mc.col + row, Math.round(p * 1e6) / 1e6); n++; } } summary.push(`Progress_History column for ${ym} filled for ${n} segments.`); }
      else warn.push("No Progress_History column for " + ym + "; history not written.");
    }

    // ---- write out
    let wx = wbx;
    if (/<calcPr[^>]*\/>/.test(wx)) wx = wx.replace(/<calcPr([^>]*?)\/>/, (a, p) => /fullCalcOnLoad/.test(p) ? a : `<calcPr${p} fullCalcOnLoad="1"/>`); else wx = wx.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    const out = {}; const keys = Object.keys(files).sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0));
    for (const k of keys) out[k] = files[k];
    out["xl/workbook.xml"] = enc(wx); out["xl/sharedStrings.xml"] = enc(sst.toXml());
    for (const n in sheets) out[paths[n]] = enc(sheets[n].xml);
    if (files["xl/calcChain.xml"]) { /* formulas unchanged, chain stays valid */ }
    summary.push("The workbook recalculates when it is opened in Excel. Open it once and save before importing it back into the app.");
    return { bytes: fflate.zipSync(out, { level: 6 }), summary, warnings: warn };
  }
  global.GTExport = { updateWorkbook };
})(window);
