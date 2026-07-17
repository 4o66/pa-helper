/* PA-Helper — app.js  (AGPLv3)  All logic client-side; no network, no AI. */
(function () {
  "use strict";
  const P = window.PA_PRESETS, Store = window.PAStore;
  // migration: "Dual Color" formulation was renamed to "Multi-Color"
  function migrateFormulationNames(d) {
    (d.filaments || []).forEach(f => {
      if (Array.isArray(f.formulation)) f.formulation = f.formulation.map(v => v === "Dual Color" ? "Multi-Color" : v);
      else if (f.formulation === "Dual Color") f.formulation = "Multi-Color";
    });
  }
  // migration: old runs stored a fully-rendered `singlePaText` HTML snapshot instead of the actual
  // result — storage.js's migrate() already drops that dead field (formatVersion 2.1), but recomputing
  // the real numbers needs the fit math below, which only lives here, not in storage.js. Recovered
  // straight from each run's own `results` rows, so nothing is lost. Called after every point `data`
  // gets (re)loaded — not just the initial page load — so importing an old file mid-session, or
  // reconnecting an old file on disk, also backfills correctly.
  function backfillSinglePaResults(d) {
    (d.runs || []).forEach(r => {
      if (r.singlePaValue != null || !r.results || !r.results.length) return;
      if ((r.mode || "advanced") === "basic") {
        const v = r.results[0] && r.results[0].bestPA;
        if (v != null) { r.singlePaValue = v; r.singlePaMedian = null; }
        return;
      }
      const rows = r.results.map(x => ({ x: x.x, accel: x.accel, bestPA: x.bestPA })).filter(x => x.x != null && x.bestPA != null && x.accel != null);
      if (!rows.length) return;
      const ys = rows.map(x => x.bestPA).slice().sort((a, b) => a - b), median = ys[Math.floor(ys.length / 2)];
      let single = median;
      if (rows.length >= 3) {
        const { fit } = computeFitAnalysis(rows);
        const midX = (Math.min(...rows.map(x => x.x)) + Math.max(...rows.map(x => x.x))) / 2;
        const accs = rows.map(x => x.accel).sort((a, b) => a - b), midA = accs[Math.floor(accs.length / 2)];
        single = fit.type === "mlr" ? fit.predict(midX, midA) : fit.predict(midX);
      }
      r.singlePaValue = single.toFixed(4); r.singlePaMedian = median;
    });
  }
  let data = Store.load();
  migrateFormulationNames(data);
  backfillSinglePaResults(data);

  const $ = (id) => document.getElementById(id);
  const el = (t, cls) => { const e = document.createElement(t); if (cls) e.className = cls; return e; };
  const svgEl = (t) => document.createElementNS("http://www.w3.org/2000/svg", t);
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const parseList = (s) => (s || "").split(",").map(x => num(x)).filter(x => x != null);
  const today = () => new Date().toISOString().slice(0, 10);
  // Date/time display — configurable via the Settings modal (dateFormat, timeFormat, and
  // in-progress-vs-completed relative/absolute style). Falls back gracefully to a plain string
  // for anything that doesn't parse (e.g. very old records missing a `created` timestamp).
  const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(d, fmt) {
    const p = (n) => String(n).padStart(2, "0");
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    switch (fmt) {
      case "MM/DD/YYYY": return `${p(m)}/${p(day)}/${y}`;
      case "DD/MM/YYYY": return `${p(day)}/${p(m)}/${y}`;
      case "DD-MM-YYYY": return `${p(day)}-${p(m)}-${y}`;
      case "Mon D, YYYY": return `${MONTH_ABBR[m - 1]} ${day}, ${y}`;
      case "D Mon YYYY": return `${day} ${MONTH_ABBR[m - 1]} ${y}`;
      default: return `${y}-${p(m)}-${p(day)}`;   // YYYY-MM-DD
    }
  }
  function fmtTime(d, fmt) {
    const p = (n) => String(n).padStart(2, "0");
    if (fmt === "12h") {
      let h = d.getHours() % 12; if (h === 0) h = 12;
      return `${h}:${p(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
    }
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  // Absolute timestamp per the current Settings (used directly, and as the >1yr/edge-case
  // fallback for the relative style below).
  function fmtAbsolute(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return fmtDate(d, data.dateFormat) + " " + fmtTime(d, data.timeFormat);
  }
  function fmtRelative(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    if (diffDays === 0) return "Today " + fmtTime(d, data.timeFormat);
    if (diffDays === 1) return "Yesterday " + fmtTime(d, data.timeFormat);
    if (diffDays > 1 && diffDays < 7) return diffDays + " days ago";
    if (diffDays >= 7 && diffDays < 31) { const w = Math.round(diffDays / 7); return w + (w === 1 ? " week ago" : " weeks ago"); }
    if (diffDays >= 31 && diffDays < 365) { const mo = Math.round(diffDays / 30.4); return mo + (mo === 1 ? " month ago" : " months ago"); }
    return fmtAbsolute(iso);   // a year+ old, or a future/clock-skew timestamp — just show the date
  }
  // The single entry point used at every "when was this run" call site: `inProgress` picks which
  // of the two Settings styles (relative/absolute) applies. Kept under the old name so none of
  // the existing call sites needed to change shape, just gain a second argument.
  function fmtDateTime(iso, inProgress) {
    const style = inProgress ? data.inProgressDateStyle : data.completedDateStyle;
    return style === "relative" ? fmtRelative(iso) : fmtAbsolute(iso);
  }
  function linspace(a, b, n) { if (n < 2) return [a]; const out = []; for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1)); return out; }
  const PALETTE = ["#4aa8ff", "#37c98b", "#ffb84a", "#c98bff", "#5de0e6", "#ff8f5d", "#8bff9e"];

  // ---- session state ----
  let currentSettings = null, lastFit = null, currentRunId = null, editingPrinterId = null, editingFilamentId = null, lastBasicMethod = P.basicDefault, gcodeImported = false, gcodeBlocks = null, jobDirty = false, ironDirty = false, pendingModal = null, importPlates = [], coverageMissing = [], accelListAuto = true, speedListAuto = true, accelPtsAuto = true, speedPtsAuto = true, maxFlowConfirmed = false, testFormLocked = false, lastSinglePa = null;
  let ironSpeedListAuto = true, ironFlowListAuto = true, ironingLoaded = false;
  const PA_FACTORS = ["toolhead", "extruder", "drive", "hotend"];
  const FILAMENT_PA_FACTORS = ["material", "formulation", "fiber", "fiberName", "fiberPct", "hardness", "diameter"];

  // ---- persistence ----
  let saveTimer = null;
  function persist() { data.lastModifiedAt = new Date().toISOString(); Store.save(data); if (typeof setStatus === "function") setStatus(); }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); }

  // ---- generic field builder ----
  function makeFieldNode(spec) {
    if (spec.customKey && !data.customOptions[spec.customKey]) data.customOptions[spec.customKey] = [];
    const wrap = el("div", "field" + (spec.newRow ? " newrow" : "")); wrap.dataset.key = spec.key;
    const lab = el("label"); lab.textContent = spec.label;
    if (spec.help) {
      const h = el("span", "help"); h.textContent = "?"; h.title = spec.help;
      h.setAttribute("tabindex", "0"); h.setAttribute("role", "img"); h.setAttribute("aria-label", "Help: " + spec.help);
      h.addEventListener("click", () => alert(spec.help));
      lab.append(" ", h);
    }
    wrap.append(lab);
    let api;
    if (spec.kind === "select") {
      const sel = el("select");
      if (spec.placeholder) { const b = el("option"); b.value = ""; b.textContent = typeof spec.placeholder === "string" ? spec.placeholder : "Select…"; sel.append(b); }
      if (spec.optional) { const b = el("option"); b.value = ""; b.textContent = "— none —"; sel.append(b); }
      const flat = spec.options ? spec.options.map(String) : (spec.groups ? spec.groups.reduce((a, g) => a.concat(g.items.map(String)), []) : []);
      const addOpt = (parent, o) => { const op = el("option"); op.value = String(o); op.textContent = String(o); parent.append(op); };
      if (spec.groups) spec.groups.forEach(g => { const og = document.createElement("optgroup"); og.label = g.group; g.items.forEach(o => addOpt(og, o)); sel.append(og); });
      else flat.forEach(o => addOpt(sel, o));
      if (spec.customKey) data.customOptions[spec.customKey].filter(o => !flat.includes(String(o))).forEach(o => addOpt(sel, o));
      let custom = null;
      if (spec.customKey) {
        const cu = el("option"); cu.value = "__custom__"; cu.textContent = "Custom…"; sel.append(cu);
        custom = el("input", "custom-in"); custom.placeholder = "Custom " + spec.label; custom.hidden = true;
        sel.addEventListener("change", () => { custom.hidden = sel.value !== "__custom__"; if (!custom.hidden) custom.focus(); });
      }
      wrap.append(sel); if (custom) wrap.append(custom);
      api = {
        spec,
        get: () => (custom && sel.value === "__custom__") ? custom.value.trim() : sel.value,
        set: (v) => { v = v == null ? "" : String(v);
          if ([...sel.options].some(o => o.value === v)) { sel.value = v; if (custom) custom.hidden = true; }
          else if (v && custom) { sel.value = "__custom__"; custom.hidden = false; custom.value = v; }
          else sel.selectedIndex = 0; },
        // Rebuild the option list at runtime (used for the maker-dependent model dropdown).
        setOptions: (list) => {
          const keep = api.get();
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          if (spec.placeholder) { const b = el("option"); b.value = ""; b.textContent = typeof spec.placeholder === "string" ? spec.placeholder : "Select…"; sel.append(b); }
          if (spec.optional) { const b = el("option"); b.value = ""; b.textContent = "— none —"; sel.append(b); }
          (list || []).forEach(o => addOpt(sel, o));
          // NOTE: dynamic dropdowns (the model list) do NOT pool global remembered customs — those
          // are maker-specific, so pooling them showed e.g. a QIDI model under Voron. Custom… only.
          if (spec.customKey) { const cu = el("option"); cu.value = "__custom__"; cu.textContent = "Custom…"; sel.append(cu); }
          api.set(keep);
        }
      };
    } else {
      const inp = el("input"); inp.type = (spec.kind === "number") ? "number" : "text";
      if (spec.step) inp.step = spec.step;
      if (spec.customKey) { const dl = el("datalist"); dl.id = "dl_" + spec.customKey; data.customOptions[spec.customKey].forEach(o => { const op = el("option"); op.value = o; dl.append(op); }); inp.setAttribute("list", dl.id); wrap.append(inp, dl); }
      else wrap.append(inp);
      api = { spec, get: () => inp.value.trim(), set: (v) => { inp.value = v == null ? "" : v; } };
    }
    if (spec.default != null) api.set(spec.default);
    return { node: wrap, api };
  }
  function buildForm(container, specs) {
    container.innerHTML = "";
    const map = {};
    specs.forEach(s => { const { node, api } = makeFieldNode(s); container.append(node); map[s.key] = api; });
    return map;
  }
  const readForm = (map) => { const o = {}; Object.keys(map).forEach(k => o[k] = map[k].get()); return o; };
  const fillForm = (map, obj) => { if (obj) Object.keys(map).forEach(k => map[k] && map[k].set(obj[k])); };
  function rememberCustoms(map) {
    Object.keys(map).forEach(k => {
      const api = map[k], s = api.spec; if (!s.customKey) return;
      if (s.customKey === "printerModel") return;   // models are maker-specific — don't pool globally
      const v = api.get(); if (!v) return;
      const builtin = (s.options ? s.options : (s.groups ? s.groups.reduce((a, g) => a.concat(g.items), []) : [])).map(String);
      const arr = data.customOptions[s.customKey] || (data.customOptions[s.customKey] = []);
      if (!builtin.includes(String(v)) && !arr.includes(v)) arr.push(v);
    });
  }

  const PRINTER_FIELDS = [
    // Row 1: name (card title) + maker + model
    { key: "name", label: "Printer name (optional)", kind: "text", newRow: true, help: "A nickname shown as the card title. Leave blank to use maker + model." },
    { key: "maker", label: "Printer maker", kind: "select", options: P.printerMakers, customKey: "printerMaker", placeholder: "Select maker…" },
    { key: "model", label: "Printer model", kind: "select", options: [], customKey: "printerModel", placeholder: "Select model…", help: "Pick your model to auto-fill the bed size, or Custom… to type one. Newest models first." },
    // Row 2: toolhead, extruder, hotend  (drive wraps below)
    { key: "toolhead", label: "Toolhead", kind: "select", options: P.toolheads, customKey: "toolhead", newRow: true, placeholder: "Select…" },
    { key: "extruder", label: "Extruder", kind: "select", options: P.extruders, customKey: "extruder", placeholder: "Select…" },
    { key: "hotend", label: "Hotend", kind: "select", options: P.hotends, customKey: "hotend", placeholder: "Select…" },
    { key: "drive", label: "Drive", kind: "select", options: P.extruderDrives, placeholder: "Select…" },
    // Row 4: bed shape, X, Y (diameter for round)  (origin wraps below)
    { key: "bedShape", label: "Bed shape", kind: "select", options: ["Rectangular", "Round"], default: "Rectangular", newRow: true, help: "Rectangular for bed-slingers and CoreXY; Round for deltas." },
    { key: "bedX", label: "Bed size X (mm)", kind: "number", step: "1", help: "Usable bed width. Auto-filled from the model; edit if your machine differs. Used to work out how many test plates a big job needs." },
    { key: "bedY", label: "Bed size Y (mm)", kind: "number", step: "1", help: "Usable bed depth." },
    { key: "bedDiameter", label: "Bed diameter (mm)", kind: "number", step: "1", help: "Usable bed diameter (round/delta beds)." },
    { key: "origin", label: "Origin", kind: "select", options: ["Front-left (0,0)", "Center"], default: "Front-left (0,0)", help: "Where (0,0) sits — front-left for most bed-slingers/CoreXY, center for many deltas." },
    // Last row: max acceleration
    { key: "maxAccel", label: "Max acceleration (mm/s²)", kind: "number", step: "500", default: 12000, newRow: true, help: "The highest acceleration this printer can reliably run — a function of its frame, motors, toolhead mass and input shaping. Used as the ceiling for the PA test's acceleration sweep." }
  ];
  const NOZZLE_FIELDS = [
    { key: "maker", label: "Nozzle maker", kind: "select", options: P.nozzleMakers, customKey: "nozzleMaker" },
    { key: "model", label: "Nozzle model", kind: "text", customKey: "nozzleModel" },
    { key: "diameter", label: "Diameter (mm)", kind: "select", options: P.nozzleDiameters, default: 0.4 },
    { key: "material", label: "Material", kind: "select", options: P.nozzleMaterials, customKey: "nozzleMaterial" }
  ];
  const FILAMENT_FIELDS = [
    { key: "name", label: "Filament name (optional)", kind: "text", newRow: true, help: "A nickname shown as the card title. Leave blank to use maker + material + colour." },
    { key: "maker", label: "Filament maker", kind: "select", options: P.filamentMakers, customKey: "filamentMaker" },
    { key: "material", label: "Material", kind: "select", options: P.filamentMaterials, customKey: "filamentMaterial" },
    { key: "formulation", label: "Formulation", kind: "select", groups: P.filamentFormulations, customKey: "filamentFormulation", optional: true, default: "Basic", help: "Optional sub-type or product line that isn't its own material — e.g. Matte, Silk, Odorless, High Speed. It's what turns \"ABS\" into \"QIDI Odorless ABS\". Basic = a standard formulation." },
    { key: "color", label: "Color", kind: "text", customKey: "filamentColor" },
    { key: "diameter", label: "Diameter (mm)", kind: "select", options: P.filamentDiameters, default: 1.75 },
    { key: "hardness", label: "TPU hardness (Shore)", kind: "select", options: P.tpuHardness, customKey: "tpuHardness", optional: true, default: "95A", help: "Shore hardness of a TPU/flexible filament — e.g. 95A (common), 85A (softer), 60D (rigid). Only shown for TPU." },
    { key: "fiber", label: "Fiber filled", kind: "select", options: P.fiberTypes, default: "No", help: "Carbon-fiber or glass fill stiffens the filament and changes flow/PA. Choose Custom to name the fiber and enter a % fill." },
    { key: "fiberName", label: "Fiber type", kind: "text", customKey: "fiberName", help: "Name the fiber/filler for a Custom fill (e.g. aramid, basalt)." },
    { key: "fiberPct", label: "Fiber fill %", kind: "number", step: "1" }
  ];
  let printerForm, nozzleForm, filamentForm;

  // New-printer defaults: a saved printer of the same maker+model wins; else the maker's
  // stock config; else a generic fallback. User can change anything afterward.
  function applyPrinterDefaults() {
    if (!printerForm) return;
    const maker = printerForm.maker.get(), model = printerForm.model.get();
    let cfg = null;
    if (maker && model) {
      const prev = data.printers.find(p => p.maker === maker && p.model === model);
      if (prev) cfg = { toolhead: prev.toolhead, extruder: prev.extruder, drive: prev.drive, hotend: prev.hotend };
    }
    if (!cfg && maker && P.makerStock[maker]) cfg = P.makerStock[maker];
    if (!cfg) cfg = P.genericDefault;
    printerForm.toolhead.set(cfg.toolhead);
    printerForm.extruder.set(cfg.extruder);
    printerForm.drive.set(cfg.drive);
    printerForm.hotend.set(cfg.hotend);
  }

  // ---- bed data (js/beds.js) ----
  const BEDS = window.PA_BEDS || {};
  const bedEntry = (maker) => BEDS[maker] || null;
  const bedModels = (maker) => { const b = bedEntry(maker); return (b && b.models) ? b.models : []; };
  function applyModelOptions() {
    if (!printerForm || !printerForm.model.setOptions) return;
    printerForm.model.setOptions(bedModels(printerForm.maker.get()).map(m => m.name));
  }
  // Auto-fill the bed fields from beds.js for the current maker+model (leaves them alone if unknown).
  function autofillBed() {
    if (!printerForm || !printerForm.bedShape) return;
    const b = bedEntry(printerForm.maker.get());
    if (b && b.origin) printerForm.origin.set(b.origin === "center" ? "Center" : "Front-left (0,0)");
    const m = bedModels(printerForm.maker.get()).find(x => x.name === printerForm.model.get());
    if (m && Array.isArray(m.bed)) {
      if (m.bed.length === 1) { printerForm.bedShape.set("Round"); printerForm.bedDiameter.set(m.bed[0]); }
      else { printerForm.bedShape.set("Rectangular"); printerForm.bedX.set(m.bed[0]); printerForm.bedY.set(m.bed[1]); }
    }
    updatePrinterConditionals();
  }
  function updatePrinterConditionals() {
    if (!printerForm || !printerForm.bedShape) return;
    const round = printerForm.bedShape.get() === "Round";
    const show = (key, on) => { const w = document.querySelector('#printerForm .field[data-key="' + key + '"]'); if (w) w.style.display = on ? "" : "none"; };
    show("bedX", !round); show("bedY", !round); show("bedDiameter", round);
  }
  // full setup after (re)building the printer form
  // Fresh Add form starts BLANK — model options only; stock defaults fill in on maker change.
  function initPrinterDefaults() { applyModelOptions(); updatePrinterConditionals(); }
  // does a printer have a usable bed defined? (gate uses this)
  function hasBed(p) {
    const b = p && p.bed; if (!b) return false;
    return b.shape === "round" ? (b.diameter > 0) : (b.x > 0 && b.y > 0);
  }

  // ---- lookups ----
  const getPrinter = (id) => data.printers.find(p => p.id === id) || null;
  const getFilament = (id) => data.filaments.find(f => f.id === id) || null;
  // Most recent run's max volumetric speed for this exact printer+nozzle+filament (else null).
  function lastMaxFlowFor(pid, nid, fid) {
    const r = data.runs.find(x => x.printerId === pid && x.nozzleId === nid && x.filamentId === fid && x.maxFlow != null);
    return r ? r.maxFlow : null;
  }
  const printerLabel = (p) => p ? (p.name || [p.maker, p.model].filter(Boolean).join(" ")) || "(unnamed printer)" : "?";
  // A multi-instance printer's units are stored as {id, label} — id and label happen to be equal
  // for anything created through the instances textarea (parseInstances), but that's not
  // guaranteed (e.g. imported/generated data can give units real distinct ids), so anywhere an
  // instance is displayed must look up its label rather than assume the id IS the label.
  function instanceLabel(p, instanceId) {
    if (!p || !instanceId) return null;
    const inst = (p.instances || []).find(i => i.id === instanceId);
    return inst ? inst.label : instanceId;   // fall back to the raw id only if it's truly orphaned
  }
  const COLORS = P.colorDict || {};
  const COLOR_KEYS = Object.keys(COLORS).sort((a, b) => b.length - a.length);
  function colorHex(name) { if (!name) return null; const s = String(name).toLowerCase(); for (const k of COLOR_KEYS) if (s.includes(k)) return COLORS[k]; return null; }
  // All colours named in a string, in the ORDER they appear (for a multi-colour gradient).
  // Longest keys claim their span first so "space grey" wins over "grey"; consecutive
  // duplicate hexes are collapsed so the gradient has meaningful stops.
  function colorList(name) {
    if (!name) return [];
    const s = String(name).toLowerCase();
    const taken = new Array(s.length).fill(false), hits = [];
    for (const k of COLOR_KEYS) {                 // COLOR_KEYS is longest-first
      let from = 0, idx;
      while ((idx = s.indexOf(k, from)) !== -1) {
        let overlap = false;
        for (let i = idx; i < idx + k.length; i++) if (taken[i]) { overlap = true; break; }
        if (!overlap) { hits.push({ pos: idx, hex: COLORS[k] }); for (let i = idx; i < idx + k.length; i++) taken[i] = true; }
        from = idx + k.length;
      }
    }
    hits.sort((a, b) => a.pos - b.pos);
    const out = [];
    for (const h of hits) if (out[out.length - 1] !== h.hex) out.push(h.hex);
    return out;
  }
  const isMultiColor = (f) => formList(f).some(v => v === "Multi-Color" || v === "Dual Color");
  // CSS background for a filament swatch: a left→right gradient for a multi-colour spool
  // with 2+ detected colours, otherwise the single dominant colour (or null = no colour).
  function colorFill(f) {
    if (isMultiColor(f)) { const cs = colorList(f.color); if (cs.length >= 2) return `linear-gradient(90deg, ${cs.join(", ")})`; if (cs.length) return cs[0]; return null; }
    return colorHex(f.color);
  }
  function fiberTag(f) {
    if (!f || !f.fiber || f.fiber === "No") return "";
    const map = { "Carbon Fiber": "CF", "Glass Filled": "GF" };
    let base = map[f.fiber] || f.fiberName || "Filled";
    if (f.fiberPct) base += " " + f.fiberPct + "%";
    return base;
  }
  // Formulation may be a single string (today) OR an array (future multi-select).
  // These normalizers let the rest of the app treat it uniformly, so enabling
  // multi-select later is just a UI change — storage/label/filter already cope.
  const formList = (f) => { const v = f && f.formulation; return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []); };
  const formText = (f) => formList(f).join(" ");
  const filamentLabel = (f) => f ? (f.name || [f.maker, f.material, fiberTag(f), f.hardness, formText(f), f.color].filter(Boolean).join(" ")) || "(unnamed filament)" : "?";
  function updateFilamentConditionals() {
    if (!filamentForm) return;
    const mat = filamentForm.material ? filamentForm.material.get() : "";
    const fiber = filamentForm.fiber ? filamentForm.fiber.get() : "No";
    const show = (key, on) => { const w = document.querySelector('#filamentForm .field[data-key="' + key + '"]'); if (w) w.style.display = on ? "" : "none"; };
    show("hardness", /tpu/i.test(mat));
    show("fiberName", fiber === "Custom");
    show("fiberPct", fiber === "Custom");
  }
  const isRestricted = (f) => Array.isArray(f.printers) && f.printers.length > 0;

  // ---- theme ----
  function applyTheme(t) { document.documentElement.dataset.theme = t || "system"; }

  // ---- tabs ----
  const markJobDirty = () => { jobDirty = true; };
  const clearJobDirty = () => { jobDirty = false; };
  const markIronDirty = () => { ironDirty = true; };
  const clearIronDirty = () => { ironDirty = false; };
  // Once a PA run has been saved in-flight (status "planned") and its results table generated,
  // reopening it locks every setting that shaped that table — changing them after the fact would
  // silently invalidate rows already collected against the original settings. Only the results
  // table stays live (Best PA / Notes / Add row / Delete row), plus Analyze / Export / Save, and
  // "Group / sort by" (view-only, doesn't touch the test itself). Per-row Override checkboxes are
  // locked too, so an existing row's flow/accel identity can't be unlocked for editing — a freshly
  // added row still gets an editable flow/accel by default (addRow() below), since there's no
  // other way to define one.
  const TEST_LOCK_IDS = [
    "maxFlow", "maxFlowConfirm", "testMode", "basicMethod",
    "layerH", "flowPoints", "speedList", "accelPoints", "accelList", "recommendBtn", "loadPointsBtn",
    "importGcodeBtn", "importAddBtn", "gcodeInput", "gcodeInputAdd",
    "pvStart", "pvEnd", "pvStep", "pvFlows", "pvAccels", "pvLoadBtn"
  ];
  function setTestFormLocked(locked) {
    testFormLocked = locked;
    TEST_LOCK_IDS.forEach(id => { const e = $(id); if (e) e.disabled = locked; });
    document.querySelectorAll('input[name="recUnit"], input[name="pvUnit"]').forEach(r => { r.disabled = locked; });
    document.querySelectorAll("#resultsBody .ovchk").forEach(c => { c.disabled = locked; });
    if ($("testInFlightBadge")) $("testInFlightBadge").hidden = !locked;
    // Abandoning used to require dirtying some field first just to reach the unsaved-job guard's
    // Abandon button — offer it directly whenever there's an actual in-flight run sitting here.
    if ($("abandonRunBtn")) $("abandonRunBtn").hidden = !locked;
  }
  function applyTab(name) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.id === "tab-" + name));
  }
  function switchTab(name) {
    // Gate: a printer must be selected (or created) before leaving the Printers tab at all —
    // nozzle selection, filament matching, and PA/Ironing test setup all assume one is active.
    // Bounce back rather than letting the user wander into an undefined state. The Filament tab
    // button is also disabled outright (see updateTabLabels) as the main line of defense.
    if (name !== "printers" && !getPrinter(data.lastPrinterId)) {
      alert("Select or add a printer first.");
      name = "printers";
    }
    // Gate: the selected printer must have a bed size before leaving the Printers tab (it's
    // needed to work out how many test plates a job takes). Bounce back and open its editor.
    if (name !== "printers") {
      const p = getPrinter(data.lastPrinterId);
      if (p && !hasBed(p)) {
        alert("Set the bed size for “" + printerLabel(p) + "” first — it's needed to plan test-plate layout.");
        name = "printers";
        editPrinter(p.id);
      }
    }
    applyTab(name);
  }
  // ---- PA / Ironing modals ----
  // Both tests live in modals now (opened from a filament card's PA/Iron button) rather than nav
  // tabs, so they float on top of whichever of Printers/Filaments is showing underneath. Closing
  // guards on unsaved changes the same way the old tab-switch guard did, just per-modal instead of
  // per-tab — see jobGuardSave/Abandon/Cancel below, which dispatch on pendingModal.
  function openPaModal() { $("tab-test").hidden = false; }
  function closePaModal() {
    if (jobDirty) {
      pendingModal = "pa";
      $("jobGuardTitle").textContent = "Unsaved PA test";
      $("jobGuardMsg").textContent = "You've started a PA test that isn't saved. Save it as an in-progress run to resume later, or abandon it?";
      $("jobGuardModal").hidden = false;
      return;
    }
    $("tab-test").hidden = true;
  }
  function openIronModal() { $("tab-ironing").hidden = false; }
  function closeIronModal() {
    if (ironDirty) {
      pendingModal = "iron";
      $("jobGuardTitle").textContent = "Unsaved Ironing test";
      $("jobGuardMsg").textContent = "You've changed Ironing test settings that aren't saved. Save now, or discard the changes?";
      $("jobGuardModal").hidden = false;
      return;
    }
    $("tab-ironing").hidden = true;
  }
  function switchSubtab(name) {
    document.querySelectorAll(".subtab-btn").forEach(b => b.classList.toggle("active", b.dataset.subtab === name));
    document.querySelectorAll(".subtab").forEach(s => s.classList.toggle("active", s.id === "subtab-" + name));
    if (name === "printed") prefillProvide();
  }
  // A tab's selection subtitle: a leading icon/swatch (vertically centred) with two text lines.
  function tabSel(host, icon, line1, line2) {
    if (!host) return;
    host.innerHTML = "";
    if (icon) host.append(icon);
    const t = el("div", "tstext");
    const a = el("div", "tsname"); a.textContent = line1; t.append(a);
    const b = el("div", "tssub"); b.textContent = line2 || ""; t.append(b);
    host.append(t);
  }
  function updateTabLabels() {
    const p = getPrinter(data.lastPrinterId), n = getSelectedNozzle(), f = getFilament(data.lastFilamentId);
    const tp = $("tabSelPrinter"), tf = $("tabSelFilament");
    if (tp) {
      if (p) {
        const unit = p.multi && data.lastInstanceId ? " (" + instanceLabel(p, data.lastInstanceId) + ")" : "";
        tabSel(tp, makerFavicon(p.maker), printerLabel(p) + unit, n ? nozzleLabel(n) : "No nozzle");
      } else { tp.innerHTML = ""; tp.textContent = "Not selected"; }
    }
    if (tf) {
      if (!p) {
        const no = el("span", "no-ic"); no.textContent = "🚫"; no.title = "Select a printer first";
        tabSel(tf, no, "Select a Printer", "");
      } else if (f) tabSel(tf, colorSquare(f, "colorsq tabsw"), filLine1(f), filLine2(f));
      else { tf.innerHTML = ""; tf.textContent = "Not selected"; }
    }
    // Filament tab is unreachable until a printer is selected — enforced here (not just in
    // switchTab) so the button itself looks and behaves inert, not just silently bounces.
    const filTabBtn = document.querySelector('.tab-btn[data-tab="filaments"]');
    if (filTabBtn) filTabBtn.disabled = !p;
  }

  /* =================== PRINTERS TAB =================== */
  // Maker favicon, hotlinked live from the vendor (never downloaded/stored). Uses the URL in beds.js;
  // if that 404s or fails to load, falls back to <domain>/favicon.ico, and if that fails too, shows
  // nothing. (We can't re-parse the vendor's <link rel="icon"> at runtime — cross-origin HTML reads are
  // blocked by CORS — so the automatic runtime fallback is the domain default favicon.ico.)
  function makerFavicon(maker) {
    const be = bedEntry(maker) || {};
    const fallback = be.domain ? "https://" + be.domain + "/favicon.ico" : null;
    const icon = be.favicon || fallback;
    if (!icon) return null;
    const fav = el("img", "favicon"); fav.alt = ""; fav.setAttribute("loading", "lazy");
    fav.addEventListener("error", () => {
      if (fallback && fav.getAttribute("src") !== fallback) fav.src = fallback;   // try domain default once
      else fav.remove();
    });
    fav.src = icon;
    return fav;
  }
  // Icon-only red "Remove" button (trashcan). Meaning is clear from the glyph; keeps card rows compact.
  const TRASH_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  const GEAR_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
  function removeButton(onClick) {
    const b = el("button", "danger iconbtn"); b.type = "button"; b.title = "Remove"; b.setAttribute("aria-label", "Remove");
    b.innerHTML = TRASH_SVG; b.addEventListener("click", onClick); return b;
  }
  function renderPrinters() {
    const wrap = $("printerList"); wrap.innerHTML = "";
    if (!data.printers.length) { wrap.innerHTML = '<p class="hint">No printers yet — add one below.</p>'; return; }
    data.printers.forEach(p => {
      const card = el("div", "card" + (p.id === data.lastPrinterId ? " selected" : ""));
      const title = el("div", "title");
      const fav = makerFavicon(p.maker); if (fav) title.append(fav);
      title.append(document.createTextNode(printerLabel(p)));
      card.append(title);
      const meta = el("div", "meta");
      meta.innerHTML = `${p.toolhead || "—"} · ${p.extruder || "—"} (${p.drive || "?"}) · ${p.hotend || "—"}`;
      card.append(meta);
      if (p.multi && p.instances && p.instances.length) {
        const sel = el("select");
        p.instances.forEach(inst => { const o = el("option"); o.value = inst.id; o.textContent = inst.label; sel.append(o); });
        // Each printer remembers its OWN last-picked unit (p.lastInstanceId), independent of which
        // printer is currently active — so this dropdown always reflects where you left this
        // specific printer, instead of defaulting to the first unit the moment it's not selected.
        sel.value = (p.lastInstanceId && p.instances.some(i => i.id === p.lastInstanceId)) ? p.lastInstanceId : p.instances[0].id;
        sel.addEventListener("change", () => {
          const chosen = sel.value;
          p.lastInstanceId = chosen;
          // Picking a unit on a printer that ISN'T the currently-selected one used to silently set
          // lastInstanceId while leaving some other printer as data.lastPrinterId — the sticky
          // context card would then show the wrong printer entirely. Select this printer first.
          if (data.lastPrinterId !== p.id) selectPrinter(p.id);
          else { data.lastInstanceId = chosen; persist(); updateTestContext(); updateIroningContext(); updateTabLabels(); }
        });
        const iw = el("div", "meta"); iw.append(document.createTextNode("Unit: ")); iw.append(sel); card.append(iw);
      }
      const actions = el("div", "actions");
      const edit = el("button", "secondary"); edit.textContent = "Edit"; edit.addEventListener("click", () => editPrinter(p.id));
      const clone = el("button", "secondary"); clone.textContent = "Clone"; clone.addEventListener("click", () => clonePrinter(p.id));
      const rm = removeButton(() => removePrinter(p.id));
      actions.append(edit, clone, rm); card.append(actions);
      card.addEventListener("click", (e) => selectCardOnClick(e, () => selectPrinter(p.id)));
      wrap.append(card);
    });
  }
  function selectPrinter(id) {
    data.lastPrinterId = id;
    const p = getPrinter(id);
    // Each printer remembers its own last-picked unit (p.lastInstanceId) — selecting it resumes
    // wherever you left THAT printer, rather than always snapping back to unit 1.
    if (p && p.multi && p.instances && p.instances.length) {
      data.lastInstanceId = (p.lastInstanceId && p.instances.some(inst => inst.id === p.lastInstanceId)) ? p.lastInstanceId : p.instances[0].id;
      p.lastInstanceId = data.lastInstanceId;
    } else {
      data.lastInstanceId = null;
    }
    if (!(p && p.nozzles && p.nozzles.some(n => n.id === data.lastNozzleId))) data.lastNozzleId = (p && p.nozzles && p.nozzles.length) ? p.nozzles[0].id : null;
    persist(); renderPrinters(); renderNozzles(); renderFilaments(); deriveGeometryFromNozzle(); updateTestContext(); updateIroningContext(); resetMaxFlowForCombo(); updateTabLabels();
  }
  function removePrinter(id) {
    const p = getPrinter(id); if (!p) return;
    const orphanCount = (data.runs || []).filter(x => x.printerId === id).length + (data.ironingRuns || []).filter(x => x.printerId === id).length;
    const warn = orphanCount ? ` This will delete all filament tests associated with this printer (${orphanCount}).` : "";
    if (!confirm(`Remove printer "${printerLabel(p)}"? This cannot be undone.${warn}`)) return;
    data.printers = data.printers.filter(x => x.id !== id);
    // cascade: a run pointing at a deleted printer can never be reached from the UI again — prune it
    if (currentRunId && (data.runs || []).some(r => r.id === currentRunId && r.printerId === id)) currentRunId = null;
    data.runs = (data.runs || []).filter(x => x.printerId !== id);
    data.ironingRuns = (data.ironingRuns || []).filter(x => x.printerId !== id);
    // remove this printer from any filament pin lists; empty list = unrestricted again
    data.filaments.forEach(f => { if (Array.isArray(f.printers) && f.printers.length) f.printers = f.printers.filter(x => x !== id); });
    if (data.lastPrinterId === id) { data.lastPrinterId = null; data.lastInstanceId = null; data.lastNozzleId = null; }
    if (editingPrinterId === id) resetPrinterForm();
    persist(); renderPrinters(); renderNozzles(); renderFilaments(); renderFilamentPrinterPicker(); updateTestContext(); updateIroningContext(); updateTabLabels();
  }

  // ---- edit / clone ----
  function readPrinterForm() {
    const v = readForm(printerForm);
    const multi = $("printerMulti").checked;
    const shape = v.bedShape === "Round" ? "round" : "rect";
    const origin = v.origin === "Center" ? "center" : "corner";
    const bed = shape === "round"
      ? { shape, diameter: num(v.bedDiameter) || 0, origin }
      : { shape, x: num(v.bedX) || 0, y: num(v.bedY) || 0, origin };
    return { name: v.name, maker: v.maker, model: v.model, toolhead: v.toolhead, extruder: v.extruder, drive: v.drive, hotend: v.hotend, maxAccel: num(v.maxAccel) || 12000, bed, multi, instances: multi ? parseInstances($("instancesInput").value) : [] };
  }
  function resetPrinterForm() {
    editingPrinterId = null;
    $("printerAdd").open = false; $("instancesInput").value = ""; $("printerMulti").checked = false; $("instancesWrap").hidden = true;
    $("savePrinterBtn").textContent = "Save printer";
    $("printerAdd").querySelector("summary").textContent = "+ Add a printer";
    printerForm = buildForm($("printerForm"), PRINTER_FIELDS); initPrinterDefaults();
  }
  function editPrinter(id) {
    const p = getPrinter(id); if (!p) return;
    editingPrinterId = id;
    fillForm(printerForm, p);
    applyModelOptions();                        // model options depend on maker (set above)
    printerForm.model.set(p.model);
    if (p.bed) {                                // restore bed fields from the nested bed object
      printerForm.bedShape.set(p.bed.shape === "round" ? "Round" : "Rectangular");
      printerForm.bedX.set(p.bed.x); printerForm.bedY.set(p.bed.y); printerForm.bedDiameter.set(p.bed.diameter);
      printerForm.origin.set(p.bed.origin === "center" ? "Center" : "Front-left (0,0)");
    }
    updatePrinterConditionals();
    $("printerMulti").checked = !!p.multi; $("instancesWrap").hidden = !p.multi;
    $("instancesInput").value = (p.instances || []).map(i => i.label).join(", ");
    $("savePrinterBtn").textContent = "Update printer";
    $("printerAdd").querySelector("summary").textContent = "Editing " + printerLabel(p);
    $("printerAdd").open = true;
    if ($("printerAdd").scrollIntoView) $("printerAdd").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function clonePrinter(id) {
    const p = getPrinter(id); if (!p) return;
    const pubId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Store.uid();
    const copy = Object.assign({}, p, {
      id: Store.uid(), pubId, model: (p.model || "") + " (copy)",
      instances: (p.instances || []).map(i => ({ id: i.id, label: i.label })),
      nozzles: (p.nozzles || []).map(n => Object.assign({}, n, { id: Store.uid() })),
      created: new Date().toISOString()
    });
    data.printers.unshift(copy); persist(); renderFilamentPrinterPicker(); selectPrinter(copy.id);
  }

  // ---- nozzles (per printer) ----
  const nozzleLabel = (n) => n ? [n.maker, n.model, (n.diameter != null && n.diameter !== "" ? n.diameter + "mm" : ""), n.material].filter(Boolean).join(" ") || "(nozzle)" : "?";
  const getSelectedNozzle = () => { const p = getPrinter(data.lastPrinterId); if (!p || !p.nozzles) return null; return p.nozzles.find(n => n.id === data.lastNozzleId) || p.nozzles[0] || null; };
  // Every new printer auto-seeds ONE default nozzle so there's something to select — a universal
  // Generic 0.4 mm Brass. After save the user is prompted to keep it or replace it (savePrinter).
  function seedNozzle() {
    return { id: Store.uid(), maker: "Generic", model: "", diameter: 0.4, material: "Brass" };
  }
  function renderNozzles() {
    const sec = $("nozzleSection"), list = $("nozzleList");
    const p = getPrinter(data.lastPrinterId);
    if (!p) { sec.hidden = true; return; }
    sec.hidden = false; $("nozzleForPrinter").textContent = printerLabel(p); list.innerHTML = "";
    if (!(p.nozzles || []).length) { list.innerHTML = '<p class="hint">No nozzles yet — add one below.</p>'; return; }
    p.nozzles.forEach(n => {
      const card = el("div", "card" + (n.id === data.lastNozzleId ? " selected" : ""));
      const title = el("div", "title"); title.textContent = nozzleLabel(n); card.append(title);
      const actions = el("div", "actions");
      const rm = el("button", "danger"); rm.textContent = "Remove";
      rm.addEventListener("click", () => removeNozzle(n.id));
      actions.append(rm); card.append(actions);
      card.addEventListener("click", (e) => selectCardOnClick(e, () => selectNozzle(n.id)));
      list.append(card);
    });
  }
  function selectNozzle(id) { data.lastNozzleId = id; persist(); renderNozzles(); renderFilaments(); deriveGeometryFromNozzle(); updateTestContext(); updateIroningContext(); resetMaxFlowForCombo(); updateTabLabels(); }
  function removeNozzle(id) {
    const p = getPrinter(data.lastPrinterId); if (!p) return;
    const n = (p.nozzles || []).find(x => x.id === id); if (!n) return;
    const orphanCount = (data.runs || []).filter(x => x.printerId === p.id && x.nozzleId === id).length + (data.ironingRuns || []).filter(x => x.printerId === p.id && x.nozzleId === id).length;
    const warn = orphanCount ? ` This will delete all filament tests associated with this nozzle (${orphanCount}).` : "";
    if (!confirm(`Remove nozzle "${nozzleLabel(n)}"? This cannot be undone.${warn}`)) return;
    p.nozzles = p.nozzles.filter(x => x.id !== id);
    // cascade: a run tied to a deleted nozzle can never be reached from the UI again — prune it
    if (currentRunId && (data.runs || []).some(r => r.id === currentRunId && r.printerId === p.id && r.nozzleId === id)) currentRunId = null;
    data.runs = (data.runs || []).filter(x => !(x.printerId === p.id && x.nozzleId === id));
    data.ironingRuns = (data.ironingRuns || []).filter(x => !(x.printerId === p.id && x.nozzleId === id));
    if (data.lastNozzleId === id) data.lastNozzleId = p.nozzles[0] ? p.nozzles[0].id : null;
    persist(); renderNozzles(); renderFilaments(); deriveGeometryFromNozzle(); updateTestContext(); updateIroningContext(); updateTabLabels();
  }
  function saveNozzle() {
    const p = getPrinter(data.lastPrinterId); if (!p) { alert("Select a printer first."); return; }
    const v = readForm(nozzleForm);
    const nz = { id: Store.uid(), maker: v.maker, model: v.model, diameter: v.diameter, material: v.material };
    p.nozzles = p.nozzles || []; p.nozzles.push(nz);
    rememberCustoms(nozzleForm); data.lastNozzleId = nz.id; persist();
    $("nozzleAdd").open = false; nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS);
    // renderFilaments() re-evaluates Scope gating too — adding a 2nd nozzle to a printer can
    // un-lock "This printer (any nozzle)" (or the whole dropdown), so this can't be skipped.
    renderNozzles(); renderFilaments(); deriveGeometryFromNozzle(); updateTestContext(); updateIroningContext(); updateTabLabels();
  }
  function deriveGeometryFromNozzle() {
    const n = getSelectedNozzle(); const dia = n ? (num(n.diameter) || 0.4) : 0.4;
    const lw = Math.round(dia * P.lineWidthFactor * 100) / 100, lh = Math.round(dia * P.layerHeightFactor * 100) / 100;
    if ($("lineW")) $("lineW").value = lw;
    if ($("layerH")) $("layerH").value = lh;
    const gh = $("geomHint"); if (gh) gh.textContent = `Line width is set by Orca's method (${lw} mm = ${P.lineWidthFactor}× your ${dia} mm nozzle) and used automatically. Layer height defaults to ${lh} mm (${P.layerHeightFactor}× your nozzle) — Orca takes it from your print profile, so change it only if you calibrate at a different layer height.`;
  }
  function parseInstances(text) {
    return (text || "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(label => ({ id: label, label }));
  }
  function savePrinter() {
    const v = readPrinterForm();
    if (!v.maker && !v.model) { alert("Give the printer at least a maker or model."); return; }
    if (editingPrinterId) {
      const p = getPrinter(editingPrinterId); if (!p) { resetPrinterForm(); return; }
      const changed = PA_FACTORS.some(k => (p[k] || "") !== (v[k] || ""));
      const runCount = data.runs.filter(r => r.printerId === p.id).length;
      if (changed && runCount > 0 && !confirm(`You changed a PA-determining part (toolhead / extruder / drive / hotend). The ${runCount} saved run${runCount > 1 ? "s" : ""} for "${printerLabel(p)}" were calibrated on the old setup and are no longer valid for the new one. Save anyway?`)) return;
      Object.assign(p, v);
      rememberCustoms(printerForm); persist();
      resetPrinterForm(); renderPrinters(); renderNozzles(); renderFilamentPrinterPicker(); updateTestContext(); updateIroningContext(); updateTabLabels();
      return;
    }
    const pubId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Store.uid();
    const printer = Object.assign({ id: Store.uid(), pubId }, v, { nozzles: [], created: new Date().toISOString() });
    printer.nozzles = [seedNozzle()];
    data.printers.unshift(printer);
    rememberCustoms(printerForm); persist();
    resetPrinterForm(); renderFilamentPrinterPicker();
    selectPrinter(printer.id);
    // Tell the user about the auto-seeded default nozzle; let them keep it or add their own.
    $("nozzleSeedMsg").textContent = "Added a default nozzle — Generic 0.4 mm Brass — to “" + printerLabel(printer) + "”. Keep it, or delete it and add your own.";
    $("nozzleSeedModal").hidden = false;
  }

  /* =================== FILAMENTS TAB =================== */
  // Planned (in-progress) runs no longer get their own pinned section — they're handled the same
  // way as in-progress ironing runs: the "PA" button on the filament card turns orange, and
  // clicking it jumps straight into the open run instead of the results modal. See filActions().
  const FACETS = [["maker", "Maker"], ["material", "Material"], ["formulation", "Formulation"], ["color", "Color"]];
  let filamentFilters = { maker: "", material: "", formulation: "", color: "" };
  const facetValues = (f, key) => key === "formulation" ? formList(f) : (f[key] ? [f[key]] : []);

  function filActions(f) {
    const actions = el("div", "actions");
    const edit = el("button", "secondary"); edit.textContent = "Edit"; edit.addEventListener("click", () => editFilament(f.id));
    const clone = el("button", "secondary"); clone.textContent = "Clone"; clone.addEventListener("click", () => cloneFilament(f.id));
    const rm = removeButton(() => removeFilament(f.id));
    actions.append(edit, clone);

    // PA and Iron buttons always show (grey/inert with nothing at the current Scope, orange while
    // in progress, blue/plain once done) so the two states are directly comparable across every
    // filament, including ones with no tests at all yet.
    const paRuns = completedRunsFor(f.id);
    const paPlanned = paRuns.find(r => r.status === "planned");   // in progress: printed, waiting on results
    const pa = el("button", paRuns.length ? (paPlanned ? "warn" : null) : "muted");
    pa.textContent = "PA" + (paRuns.length > 1 ? " (" + paRuns.length + ")" : "");
    pa.addEventListener("click", () => {
      // An in-progress run takes priority over the history view — jump straight to it instead
      // of the results modal, since that's what needs finishing before anything else can happen.
      // The "In-Flight · Settings locked" titlebar badge (see setTestFormLocked) already explains
      // why the settings are greyed out — a separate popup on top of it was redundant.
      if (paPlanned) { resumeRun(paPlanned.id); }
      else if (paRuns.length) openResults(f.id);
      // No runs at the current Scope yet — the button opens the PA modal fresh so a first test
      // can be started, rather than sitting inert forever.
      else { selectFilament(f.id); resetTestTab(); openPaModal(); }
    });
    actions.append(pa);

    const ironRuns = completedIroningRunsFor(f.id);
    const incomplete = ironRuns.find(r => !(r.namedResults && r.namedResults.length));   // no named results yet == still waiting on print results
    const iron = el("button", ironRuns.length ? (incomplete ? "warn" : null) : "muted");
    iron.textContent = "Iron" + (ironRuns.length > 1 ? " (" + ironRuns.length + ")" : "");
    iron.addEventListener("click", () => {
      // Land on the actual data-entry screen (the naming picker), not just the Ironing modal's
      // settings — that's where "enter the datapoints" actually happens for an ironing run.
      if (incomplete) { openIroningRun(incomplete.id); openIronPicker(incomplete.id); showRunInProgressModal("You have a run in progress. To start a new run, name samples on the open run and save, or delete the in progress run."); }
      else if (ironRuns.length) openIronResults(f.id);
      // No runs at the current Scope yet — open the Ironing modal fresh to start a first test.
      else { selectFilament(f.id); openIronModal(); }
    });
    actions.append(iron);

    actions.append(rm); return actions;
  }
  function pinIcon() { const s = el("span", "pin-ic"); s.textContent = "📌"; s.title = "Restricted to specific printer(s)"; return s; }
  function filMeta(f) { const done = data.runs.filter(r => r.filamentId === f.id && r.status === "complete").length; return `${f.diameter || "?"} mm · ${done} completed run${done === 1 ? "" : "s"}`; }

  // Filament label split over two lines (used by the Filament tab button): maker + material on
  // top, characteristics + colour beneath.
  const filLine1 = (f) => [f.maker, f.material].filter(Boolean).join(" ") || "(unnamed filament)";
  const filLine2 = (f) => [fiberTag(f), f.hardness, formText(f), f.color].filter(Boolean).join(" ");
  function colorSquare(f, cls) {
    const sq = el("div", cls || "colorsq"); const fill = colorFill(f);
    if (fill) sq.style.background = fill; else sq.classList.add("nocolor");
    return sq;
  }
  // Clicking anywhere on a card/row selects it (no dedicated Select button) — except clicks on
  // the action buttons (Edit/Clone/Remove/PA/Iron/etc.) or an inline <select> (e.g. the printer
  // card's multi-instance unit picker), which have their own handlers.
  function selectCardOnClick(e, selectFn) { if (e.target.closest(".actions") || e.target.closest("select")) return; selectFn(); }
  function filamentCard(f) {
    const card = el("div", "card fcard" + (f.id === data.lastFilamentId ? " selected" : ""));
    const band = el("div", "colorband"); const fill = colorFill(f); if (fill) band.style.background = fill; else band.classList.add("nocolor"); card.append(band);
    const title = el("div", "title"); title.textContent = filamentLabel(f); if (isRestricted(f)) title.prepend(pinIcon()); card.append(title);
    const meta = el("div", "meta"); meta.textContent = filMeta(f); card.append(meta);
    card.append(filActions(f));
    card.addEventListener("click", (e) => selectCardOnClick(e, () => selectFilament(f.id)));
    return card;
  }
  function filamentRow(f) {
    const row = el("div", "frow" + (f.id === data.lastFilamentId ? " selected" : ""));
    const sq = el("span", "colorsq"); const fill = colorFill(f); if (fill) sq.style.background = fill; else sq.classList.add("nocolor"); row.append(sq);
    const name = el("span", "fname"); name.textContent = filamentLabel(f); if (isRestricted(f)) name.prepend(pinIcon()); row.append(name);
    row.append(filActions(f));
    row.addEventListener("click", (e) => selectCardOnClick(e, () => selectFilament(f.id)));
    return row;
  }
  function renderFilamentFilters(base) {
    const bar = $("filamentFilters"); bar.innerHTML = "";
    if (data.filaments.length <= 1) return;
    FACETS.forEach(([key, label]) => {
      const vals = [...new Set(base.flatMap(f => facetValues(f, key)))].sort();
      if (vals.length <= 1) return;
      const sel = el("select");
      const all = el("option"); all.value = ""; all.textContent = "All " + label.toLowerCase(); sel.append(all);
      vals.forEach(v => { const o = el("option"); o.value = v; o.textContent = v; sel.append(o); });
      sel.value = filamentFilters[key] || "";
      sel.addEventListener("change", () => { filamentFilters[key] = sel.value; renderFilaments(); });
      bar.append(sel);
    });
  }
  function renderFilamentPrinterPicker() {
    const box = $("filamentPrinters"); if (!box) return; box.innerHTML = "";
    if (!data.printers.length) { box.innerHTML = '<p class="hint">No printers yet — add one on the Printer tab first.</p>'; return; }
    data.printers.forEach(p => { const l = el("label", "checkline"); const cb = el("input"); cb.type = "checkbox"; cb.value = p.id; l.append(cb, document.createTextNode(" " + printerLabel(p))); box.append(l); });
  }
  // Scope help text — shared default, extended when the dropdown or "any nozzle" option is locked.
  const SCOPE_HELP_DEFAULT = "How much of your printer/nozzle setup counts toward a filament's PA/Iron button state, count, and what clicking it opens. Narrower = only tests done on exactly what's selected now; wider finds tests done on other nozzles or printers too.";
  const SCOPE_PRINTER_OPT_LABEL = "This printer (any nozzle)";
  // Scope only matters when there's actually something to distinguish. Both checks below are
  // fleet-wide (every printer, not just the currently selected one) on purpose: gating on the
  // CURRENT printer's nozzle count alone would flip the dropdown's/option's enabled state just
  // from switching between printers you already have, which could look like the scope silently
  // changed out from under you. Basing it on the whole fleet means it only ever changes when your
  // printer/nozzle roster itself changes (add/remove a printer or nozzle).
  function updateScopeGating() {
    const sel = $("filamentScope"); if (!sel) return;
    const help = $("filamentScopeHelp"), printerOpt = $("filamentScopePrinterOpt");
    const allSingleNozzle = data.printers.every(p => (p.nozzles || []).length <= 1);
    const onlyOnePrinter = data.printers.length === 1;
    const nothingToScope = onlyOnePrinter && allSingleNozzle;   // every scope value would be identical
    const before = data.filamentScope;
    if (nothingToScope) data.filamentScope = "nozzle";
    else if (allSingleNozzle && data.filamentScope === "printer") {
      // The option backing the stored value just became unselectable (fleet changed under it) —
      // snap to the tightest scope instead of leaving a stale, unselectable value in place. The
      // visible filament list doesn't actually change: with every printer single-nozzle, "printer"
      // and "nozzle" scope were already equivalent sets.
      data.filamentScope = "nozzle";
    }
    if (data.filamentScope !== before) persist();
    sel.disabled = nothingToScope;
    help.title = nothingToScope
      ? SCOPE_HELP_DEFAULT + " Locked here — with only one printer and one nozzle in your fleet, every Scope option would behave identically."
      : SCOPE_HELP_DEFAULT;
    if (printerOpt) {
      printerOpt.disabled = allSingleNozzle;
      printerOpt.textContent = allSingleNozzle ? SCOPE_PRINTER_OPT_LABEL + " — n/a, no printer has more than one nozzle" : SCOPE_PRINTER_OPT_LABEL;
    }
  }
  function renderFilaments() {
    updateScopeGating();
    if ($("filamentScope")) $("filamentScope").value = data.filamentScope || "nozzle";
    const pid = data.lastPrinterId;
    const all = data.filaments.slice();
    let base = all, hiddenByPin = 0;
    if (pid) { base = all.filter(f => !isRestricted(f) || f.printers.includes(pid)); hiddenByPin = all.length - base.length; }
    renderFilamentFilters(base);
    const list = base.filter(f => FACETS.every(([k]) => !filamentFilters[k] || facetValues(f, k).includes(filamentFilters[k])));
    const view = data.filamentView || "cards";
    const wrap = $("filamentList"); wrap.className = view === "list" ? "flist" : "cards"; wrap.innerHTML = "";
    if (!all.length) wrap.innerHTML = '<p class="hint">No filaments yet — add one below.</p>';
    else if (!list.length) wrap.innerHTML = '<p class="hint">No filaments match the current filter' + (pid ? " for this printer" : "") + '.</p>';
    else list.forEach(f => wrap.append(view === "list" ? filamentRow(f) : filamentCard(f)));
    const note = $("filamentPinNotice");
    if (hiddenByPin > 0) { note.hidden = false; note.textContent = `${hiddenByPin} filament${hiddenByPin > 1 ? "s are" : " is"} restricted to other printers and hidden here.`; }
    else note.hidden = true;
    $("filamentViewToggle").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    updateTabLabels();
  }
  function selectFilament(id) { data.lastFilamentId = id; persist(); renderFilaments(); updateTestContext(); updateIroningContext(); resetMaxFlowForCombo(); updateTabLabels(); }
  function removeFilament(id) {
    const f = getFilament(id); if (!f) return;
    if (!confirm(`Remove filament "${filamentLabel(f)}"? This cannot be undone.`)) return;
    data.filaments = data.filaments.filter(x => x.id !== id);
    // cascade: a run tied to a deleted filament can never be reached from the UI again — prune it
    if (currentRunId && (data.runs || []).some(r => r.id === currentRunId && r.filamentId === id)) currentRunId = null;
    data.runs = (data.runs || []).filter(x => x.filamentId !== id);
    data.ironingRuns = (data.ironingRuns || []).filter(x => x.filamentId !== id);
    if (data.lastFilamentId === id) data.lastFilamentId = null;
    if (editingFilamentId === id) resetFilamentForm();
    persist(); renderFilaments(); updateTestContext(); updateIroningContext(); updateTabLabels();
  }
  function resetFilamentForm() {
    editingFilamentId = null;
    $("filamentAdd").open = false; $("filamentRestrict").checked = false; $("filamentPrinters").hidden = true;
    $("saveFilamentBtn").textContent = "Save filament";
    $("filamentAdd").querySelector("summary").textContent = "+ Add a filament";
    filamentForm = buildForm($("filamentForm"), FILAMENT_FIELDS); updateFilamentConditionals();
  }
  function editFilament(id) {
    const f = getFilament(id); if (!f) return;
    editingFilamentId = id;
    fillForm(filamentForm, f); updateFilamentConditionals();
    const restrict = isRestricted(f);
    $("filamentRestrict").checked = restrict;
    if (restrict) { renderFilamentPrinterPicker(); $("filamentPrinters").hidden = false; [...$("filamentPrinters").querySelectorAll("input")].forEach(cb => { cb.checked = f.printers.includes(cb.value); }); }
    else $("filamentPrinters").hidden = true;
    $("saveFilamentBtn").textContent = "Update filament";
    $("filamentAdd").querySelector("summary").textContent = "Editing " + filamentLabel(f);
    $("filamentAdd").open = true;
    if ($("filamentAdd").scrollIntoView) $("filamentAdd").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function cloneFilament(id) {
    const f = getFilament(id); if (!f) return;
    const copy = Object.assign({}, f, {
      id: Store.uid(),
      name: f.name ? f.name + " (copy)" : "",
      color: f.color ? f.color + " (copy)" : "(copy)",
      printers: (f.printers || []).slice(),
      created: new Date().toISOString()
    });
    data.filaments.unshift(copy); persist(); selectFilament(copy.id);
  }
  function saveFilament() {
    const v = readForm(filamentForm);
    if (!v.material) { alert("Pick a material for the filament."); return; }
    const fiber = (v.fiber && v.fiber !== "No") ? v.fiber : "No";
    const needPct = fiber === "Custom";
    let printers = [];
    if ($("filamentRestrict").checked) printers = [...$("filamentPrinters").querySelectorAll("input:checked")].map(i => i.value);
    const fields = {
      name: v.name,
      maker: v.maker, material: v.material, formulation: v.formulation, color: v.color, diameter: v.diameter,
      hardness: /tpu/i.test(v.material) ? v.hardness : null,
      fiber, fiberName: fiber === "Custom" ? (v.fiberName || null) : null, fiberPct: needPct ? (num(v.fiberPct) || null) : null,
      printers
    };
    if (editingFilamentId) {
      const f = getFilament(editingFilamentId); if (!f) { resetFilamentForm(); return; }
      const norm = (x) => Array.isArray(x) ? x.slice().sort().join("|") : String(x == null ? "" : x);
      const changed = FILAMENT_PA_FACTORS.some(k => norm(f[k]) !== norm(fields[k]));
      const runCount = data.runs.filter(r => r.filamentId === f.id).length;
      if (changed && runCount > 0 && !confirm(`You changed a PA-affecting property (material / formulation / fiber / hardness / diameter). The ${runCount} saved run${runCount > 1 ? "s" : ""} for "${filamentLabel(f)}" were calibrated on the old filament and are no longer valid. Save anyway?`)) return;
      Object.assign(f, fields);
      // Restricting the currently-selected filament away from the currently-selected printer hides
      // its card (see renderFilaments' pin filter) — but leaving it as data.lastFilamentId would
      // silently keep driving the PA/Ironing test context for a filament the user can no longer see
      // or reach. Clear the selection so it falls back to the "no filament selected" state instead.
      if (data.lastFilamentId === f.id && data.lastPrinterId && isRestricted(f) && !f.printers.includes(data.lastPrinterId)) {
        data.lastFilamentId = null;
      }
      rememberCustoms(filamentForm); persist();
      resetFilamentForm(); renderFilaments(); updateTestContext(); updateIroningContext(); updateTabLabels();
      return;
    }
    const fil = Object.assign({ id: Store.uid() }, fields, { created: new Date().toISOString() });
    data.filaments.unshift(fil); rememberCustoms(filamentForm); persist();
    resetFilamentForm();
    selectFilament(fil.id);
  }

  /* =================== PA TEST TAB =================== */
  const isBasic = () => $("testMode").value === "basic";
  const unitIsSpeed = () => $("unitMode").value === "speed";
  const accelPtsN = () => Math.max(1, Math.round(num($("accelPoints").value) || 5));
  const accelFloor = () => (P.adaptive && P.adaptive.accelFloor) || 1000;   // lowest accel worth auto-testing
  const speedPtsN = () => Math.max(2, Math.round(num($("flowPoints").value) || 5));
  // Smart default point counts: sample density tracks the span each axis sweeps, because a
  // narrower range holds less curve to characterize. Heuristic, not hard data; floored at 2.
  const suggestAccelPts = (mx) => Math.max(2, Math.min(5, Math.round(Math.log2((mx || 1000) / 1000)) + 1));   // log span from 1000
  const suggestSpeedPts = (mf) => Math.max(2, Math.min(6, Math.round((mf - P.adaptive.minFlow) / 5) + 1));    // ~1 point per 5 mm³/s
  // Speed axis, in whatever unit the user is displaying. Nozzle velocity (mm/s) and
  // volumetric rate (mm³/s) are the same test; conversion is speed = flow / (LH·LW).
  const axisRnd = (v) => unitIsSpeed() ? Math.round(v) : Math.round(v * 100) / 100;
  const axisMinVal = () => { const mf = P.adaptive.minFlow; return unitIsSpeed() ? mf / convFactor() : mf; };
  const axisMaxVal = () => { const mf = num($("maxFlow").value); if (mf == null) return null; return unitIsSpeed() ? mf / convFactor() : mf; };
  function regenAxis() {                       // refresh the greyed max box + (if auto) the value list
    const mx = axisMaxVal();
    if ($("axisMax")) $("axisMax").value = (mx == null) ? "" : axisRnd(mx);
    if (speedListAuto && mx != null && $("speedList")) $("speedList").value = linspace(axisMinVal(), mx, speedPtsN()).map(axisRnd).join(", ");
  }
  // Volumetric flow per unit nozzle speed = the deposited bead's cross-sectional area.
  // Orca/Slic3r model the bead as a rounded rectangle, so the area is
  //   layer_height × (line_width − layer_height·(1−π/4))   [ = layer_height × line_spacing ]
  // NOT the naive layer_height × line_width. Verified against real Orca g-code: at 0.2×0.45 the
  // measured area is 0.08142 mm², not 0.09 (the naive value overstates flow ~10%). This is the
  // same line_spacing correction js/pattern.js already uses for the chevron geometry.
  const EXTRUSION_K = 1 - Math.PI / 4;   // ≈ 0.2146
  const beadArea = () => { const lh = num($("layerH").value) || 0.2, lw = num($("lineW").value) || 0.45; return lh * (lw - lh * EXTRUSION_K); };
  const convFactor = () => beadArea();
  const xToFlow = (x) => unitIsSpeed() ? x * convFactor() : x;
  const flowToX = (f) => unitIsSpeed() ? f / convFactor() : f;
  const unitName = () => unitIsSpeed() ? "mm/s" : "mm³/s";
  const unitLabel = () => unitIsSpeed() ? "Speed (mm/s)" : "Flow (mm³/s)";

  function updateTestContext() {
    const p = getPrinter(data.lastPrinterId), n = getSelectedNozzle(), f = getFilament(data.lastFilamentId);
    const ctx = $("testContext");
    if (!p || !n || !f) {
      $("testBody").hidden = true;
      ctx.innerHTML = '<span class="badge info">setup</span>To start a test, select a <b>printer</b> and <b>nozzle</b> (Printer tab), then a <b>filament</b> (Filament tab).' +
        (!p ? "<br>• No printer selected." : "") + (p && !n ? "<br>• No nozzle selected." : "") + (!f ? "<br>• No filament selected." : "");
      return;
    }
    const inst = (p.multi && data.lastInstanceId) ? " · unit " + instanceLabel(p, data.lastInstanceId) : "";
    const mx = num(p.maxAccel) || 12000;
    $("accelLimit").value = mx;
    // Smart default: fewer accel points for a narrow accel range (unless the user set the count).
    if (accelPtsAuto) $("accelPoints").value = suggestAccelPts(mx);
    // Re-scale the suggested accel sweep to THIS printer's max (unless the user typed their own).
    if (accelListAuto) $("accelList").value = logAccels(accelFloor(),mx, accelPtsN()).join(", ");
    ctx.innerHTML = `<b>${printerLabel(p)}</b>${inst}<br><span class="muted">${p.toolhead || "—"} · ${p.extruder || "—"} (${p.drive || "?"}) · ${p.hotend || "—"} · max accel ${mx} mm/s²</span><br>Nozzle: <b>${nozzleLabel(n)}</b><br>Filament: <b>${filamentLabel(f)}</b>`;
    $("testBody").hidden = false;
    // Max volumetric speed comes from a separate flow-rate calibration; pre-fill from the
    // last run for this exact printer+nozzle+filament, else prompt the user to enter it.
    const prior = lastMaxFlowFor(data.lastPrinterId, data.lastNozzleId, data.lastFilamentId);
    const fh = $("flowHint");
    if (fh) fh.textContent = prior != null
      ? `Last max volumetric speed for this printer/nozzle/filament: ${prior} mm³/s (prefilled). Confirm it, or change it if your flow calibration differs.`
      : "Enter your max volumetric speed (mm³/s) from your Max Flowrate test (in Orca) for this printer/nozzle/filament, then Confirm — everything below stays locked until you do.";
    // Smart default: fewer speed points for a small flow envelope (unless the user set the count).
    { const mf = num($("maxFlow").value); if (speedPtsAuto && mf != null) $("flowPoints").value = suggestSpeedPts(mf); }
    regenAxis();   // refresh the greyed max-speed box + speed list from the (possibly new) max flow / geometry
    gateMaxFlow();
    applyMode();
  }
  // Max volumetric speed gate: in advanced mode the whole test config below stays locked (inert) until
  // the max flow — a per printer+nozzle+filament value that drives the entire speed↔flow conversion —
  // is confirmed. Basic mode and the read-only run view are never gated.
  function gateMaxFlow() {
    const gated = $("gatedBody"), btn = $("maxFlowConfirm");
    const mf = num($("maxFlow").value), valid = mf != null && mf > 0;
    if (isBasic()) { if (gated) gated.hidden = false; if (btn) btn.hidden = true; return; }
    if (btn) {
      btn.hidden = false;
      btn.disabled = !valid || maxFlowConfirmed;
      btn.textContent = maxFlowConfirmed ? "✓ Confirmed" : "Confirm";
      btn.classList.toggle("confirmed", maxFlowConfirmed);
    }
    // Until the max flow is confirmed, HIDE the rest of the form entirely (not just dim it) so it's
    // obvious the only thing to do is enter + confirm the volumetric rate.
    if (gated) gated.hidden = !maxFlowConfirmed;
  }
  // On a fresh printer/nozzle/filament selection: prefill max flow from a prior run for that exact
  // combo (blank if none), and require a fresh Confirm before anything else can be entered.
  function resetMaxFlowForCombo() {
    const prior = lastMaxFlowFor(data.lastPrinterId, data.lastNozzleId, data.lastFilamentId);
    $("maxFlow").value = (prior != null) ? prior : "";
    maxFlowConfirmed = false;
    regenAxis(); gateMaxFlow();
  }
  function confirmMaxFlow() {
    const mf = num($("maxFlow").value);
    if (mf == null || mf <= 0) { alert("Enter your max volumetric speed (mm³/s) first."); $("maxFlow").focus(); return; }
    maxFlowConfirmed = true; gateMaxFlow();
  }
  function applyMode() {
    const basic = isBasic();
    $("tab-test").dataset.mode = basic ? "basic" : "advanced";
    gateMaxFlow();   // basic ↔ advanced changes whether the gate applies
    const m = $("basicMethod");
    if (basic) { m.disabled = false; m.value = lastBasicMethod || P.basicDefault; }
    else { if (!m.disabled) lastBasicMethod = m.value; m.value = "pattern"; m.disabled = true; }
    updateModeHint();
  }
  function updateModeHint() {
    const basic = isBasic(), method = $("basicMethod").value;
    let h;
    if (!basic) h = "Adaptive PA maps the best PA across flow and acceleration (Orca's pattern method) — most accurate for varied printing. Recommended.";
    else if (method === "pattern") h = "Basic pattern test — pick the cleanest region for one PA value. In Orca, leave the acceleration and speed inputs blank for the pattern test.";
    else if (method === "line") h = "Basic line test prints PA lines side by side; pick the cleanest line for one PA value.";
    else h = "Basic tower test sweeps PA up a tower; read the height with the cleanest corners for one PA value. Simplest.";
    $("modeHint").textContent = h;
  }

  function materialRange() {
    const f = getFilament(data.lastFilamentId) || {};
    const mat = f.material || "";
    const p = getPrinter(data.lastPrinterId) || {};
    const drive = p.drive || "Direct";
    let [s, e, st] = P.paRanges[mat] || P.defaultRange;
    if (drive === "Bowden") { s *= P.bowdenScale; e *= P.bowdenScale; st *= P.bowdenScale; }
    return { mat, drive, start: s, end: e, step: st };
  }
  function logAccels(min, max, n) {
    if (!(max > min)) return [max || min];
    const out = []; for (let i = 0; i < n; i++) { const v = min * Math.pow(max / min, i / (n - 1)); out.push(Math.max(min, Math.round(v / 500) * 500)); }
    return [...new Set(out)];
  }
  const buildGridRows = (pts, accels) => { const rows = []; pts.forEach(f => accels.forEach(a => rows.push({ flow: f, accel: a, bestPA: "", notes: "" }))); return rows; };

  function recommend() {
    currentRunId = null;
    const { mat, drive, start, end, step } = materialRange();
    const dp = step < 0.01 ? 3 : 2;
    if (isBasic()) {
      const method = $("basicMethod").value;
      const extra = method === "pattern" ? "\nIn Orca's pattern test, leave the acceleration and speed inputs blank." : "";
      $("recommendOut").textContent =
`Material: ${mat || "(pick)"}   Drive: ${drive}   Method: ${method}
PA range:  start ${start.toFixed(dp)}   end ${end.toFixed(dp)}   step ${step.toFixed(dp)}
Run Orca's Pressure Advance ${method} test with that range, then read the single best PA and enter it below.${extra}`;
      currentSettings = { source: "recommended", mode: "basic", basicMethod: method, paStart: +start.toFixed(3), paEnd: +end.toFixed(3), paStep: +step.toFixed(3) };
      $("loadPointsBtn").hidden = true;
      return;
    }
    const maxFlow = num($("maxFlow").value);
    if (!maxFlow) { alert("Enter your max volumetric speed (mm³/s) first — from the results of your Max Flowrate test in Orca."); $("maxFlow").focus(); return; }
    const nFlow = speedPtsN();
    let accelMax = num($("accelLimit").value);
    if (!accelMax || accelMax < 500) { accelMax = 12000; $("accelLimit").value = accelMax; }   // guard: accel, not PA
    let accels = parseList($("accelList").value).filter(a => a >= 100);                          // drop stray PA-scale values
    if (!accels.length) accels = logAccels(accelFloor(),accelMax, accelPtsN());
    $("accelList").value = accels.join(", ");
    const cf = convFactor();
    // Speed axis: use the (editable) value list if present, else auto-space min → max flow.
    // The list is in the displayed unit — convert to flow (mm³/s) and nozzle speed (mm/s).
    let axisVals = parseList($("speedList").value).filter(v => v > 0);
    let flowsMm3, speeds;
    if (axisVals.length) {
      if (unitIsSpeed()) { speeds = axisVals.map(v => Math.round(v)); flowsMm3 = axisVals.map(v => v * cf); }
      else { flowsMm3 = axisVals.slice(); speeds = axisVals.map(v => Math.round(v / cf)); }
    } else {
      flowsMm3 = linspace(P.adaptive.minFlow, maxFlow, nFlow);
      speeds = flowsMm3.map(f => Math.round(f / cf));                     // mm/s — what Orca's dialog wants
    }
    const flowPts = flowsMm3.map(f => Math.round(f * 100) / 100);         // results table is always in flow (mm³/s)
    $("speedList").value = (unitIsSpeed() ? speeds : flowPts).join(", ");  // reflect what we'll actually test
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const cp = (val) => ` <button class="copybtn" data-copy="${esc(val)}" title="Copy to clipboard" aria-label="Copy to clipboard">⧉</button>`;
    $("recommendOut").innerHTML =
`Material: ${esc(mat || "(pick)")}   Drive: ${esc(drive)}   Method: pattern

Paste into Orca's Pressure Advance (PA Pattern) test:
  Start PA ${start.toFixed(dp)}   End PA ${end.toFixed(dp)}   PA step ${step.toFixed(dp)}
  Accelerations:  ${accels.join(", ")}${cp(accels.join(","))}
  Speeds (mm/s):  ${speeds.join(", ")}${cp(speeds.join(","))}

Speeds are your ${flowsMm3.map(f => Math.round(f * 100) / 100).join(", ")} mm³/s test flows ÷ the bead cross-section ${beadArea().toFixed(4)} mm²/mm (${num($("layerH").value) || 0.2} mm layer × ${num($("lineW").value) || 0.45} mm width, rounded-bead area — Orca's model).
Test grid = ${speeds.length} speeds × ${accels.length} accels = ${speeds.length * accels.length} points.`;
    // Plate-fit: how many test plates does this matrix take on the selected printer's bed?
    const printer = getPrinter(data.lastPrinterId), bed = printer && printer.bed;
    let plan = null;
    if (bed && window.PAPattern) {
      const combos = [];
      flowPts.forEach(f => accels.forEach(a => combos.push({ accel: a, flow: f })));
      plan = window.PAPattern.planPlates({ bed, combos, paStart: +start.toFixed(3), paEnd: +end.toFixed(3), paStep: +step.toFixed(3), lineWidth: num($("lineW").value), layerHeight: num($("layerH").value), wallLoops: 3 });
      const bedLabel = bed.shape === "round" ? `${bed.diameter} mm round` : `${bed.x}×${bed.y} mm`;
      const pl = el("div", "planline");
      pl.textContent = !plan.fits
        ? `⚠ A single test object (~${Math.round(plan.objW)}×${Math.round(plan.objH)} mm) doesn't fit your ${bedLabel} bed — narrow the PA range or use fewer accels.`
        : `Plate plan: ${plan.count} objects → ${plan.plates} plate${plan.plates > 1 ? "s" : ""} (${plan.perPlate} per plate, ${plan.cols}×${plan.rows}) on your ${bedLabel} bed.`;
      $("recommendOut").appendChild(pl);
    }
    currentSettings = { source: "recommended", mode: "advanced", unit: $("unitMode").value, layerH: num($("layerH").value), lineW: num($("lineW").value), maxFlow, paStart: +start.toFixed(3), paEnd: +end.toFixed(3), paStep: +step.toFixed(3), speeds, points: flowPts, accels, plan };
    $("loadPointsBtn").hidden = false; $("loadPointsBtn")._points = buildGridRows(flowPts, accels);
  }

  // Parse an Orca PA-test .gcode. The true volumetric flow of each (accel,speed) block is read
  // straight from the extrusion geometry — filament_area × (E per XY-mm) × speed — which is what
  // Orca prints on the pattern, so no line-width / layer-height assumptions are needed.
  function parsePaGcode(text) {
    const lines = String(text).split(/\r?\n/);
    const diam = parseFloat((text.match(/filament_diameter:\s*([\d.]+)/i) || [])[1] || 1.75);
    const filA = Math.PI * (diam / 2) ** 2;   // filament cross-section (mm²)
    // Orca brackets the test with "start/end pressure advance pattern" comments — parse only
    // inside them to drop frame/travel/setup noise. If absent (Marlin etc.), scan the whole file.
    const hasMarkers = /start pressure advance pattern/i.test(text);
    let inpat = !hasMarkers, x = 0, y = 0, f = 0, curA = 0, epos = 0, rel = true;
    const pas = [], accC = {}, spdC = {}, flowAcc = {};
    for (const raw of lines) {
      if (/^M83\b/i.test(raw)) rel = true; else if (/^M82\b/i.test(raw)) rel = false;   // relative/absolute E
      if (/start pressure advance pattern/i.test(raw)) { inpat = true; continue; }
      if (/end pressure advance pattern/i.test(raw)) { inpat = false; continue; }
      const code = raw.split(";")[0];
      let m = code.match(/SET_PRESSURE_ADVANCE\s+ADVANCE=([\d.]+)/i) || code.match(/\bM900\s+K([\d.]+)/i);
      if (m && inpat) { const v = parseFloat(m[1]); if (!isNaN(v)) pas.push(v); }
      // Klipper SET_VELOCITY_LIMIT ACCEL= or Marlin M204 S/P; round to nearest 50 (Orca emits ±1 pairs)
      m = code.match(/SET_VELOCITY_LIMIT[^;]*\bACCEL=([\d.]+)/i) || code.match(/\bM204\s+[SP]([\d.]+)/i);
      if (m) { let a = parseFloat(m[1]); if (a >= 100) { const ar = Math.round(a / 50) * 50; curA = ar; if (inpat) accC[ar] = (accC[ar] || 0) + 1; } }
      if (/^G1/i.test(code)) {
        const gx = code.match(/X(-?[\d.]+)/i), gy = code.match(/Y(-?[\d.]+)/i), gf = code.match(/F([\d.]+)/i), ge = code.match(/E(-?[\d.]+)/i);
        if (gf) f = parseFloat(gf[1]);
        const nx = gx ? parseFloat(gx[1]) : x, ny = gy ? parseFloat(gy[1]) : y;
        const L = Math.hypot(nx - x, ny - y); x = nx; y = ny;
        let dE = 0; if (ge) { const ev = parseFloat(ge[1]); dE = rel ? ev : ev - epos; if (!rel) epos = ev; }
        if (inpat && dE > 0 && L > 0 && f > 0) {
          const s = Math.round(f / 60);
          if (s >= 5) { spdC[s] = (spdC[s] || 0) + 1;
            if (curA >= 100) { const k = curA + "|" + s; (flowAcc[k] = flowAcc[k] || { E: 0, L: 0 }); flowAcc[k].E += dE; flowAcc[k].L += L; } }
        }
      }
    }
    const pv = [...new Set(pas)].sort((a, b) => a - b);
    const r = { accels: Object.keys(accC).map(Number).sort((a, b) => a - b), speeds: [] };
    if (pv.length) {
      r.paStart = pv[0]; r.paEnd = pv[pv.length - 1];
      const diffs = {}; for (let i = 1; i < pv.length; i++) { const d = +(pv[i] - pv[i - 1]).toFixed(4); if (d > 0) diffs[d] = (diffs[d] || 0) + 1; }
      let best = null, bc = -1; for (const d in diffs) if (diffs[d] > bc) { bc = diffs[d]; best = +d; }
      r.paStep = best;
    }
    // De-noise speeds: merge near-duplicates (≤3%), drop travel (outlier max), drop frame (outlier count)
    const merged = {}; Object.keys(spdC).forEach(k => merged[k] = spdC[k]);
    let keys = Object.keys(merged).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < keys.length - 1; i++) { const a = keys[i], b = keys[i + 1]; if (a && (b - a) / b <= 0.03) { merged[b] += merged[a]; delete merged[a]; keys.splice(i, 1); i--; } }
    let arr = Object.keys(merged).map(k => ({ s: +k, c: merged[k] })).sort((x, y) => x.s - y.s);
    if (arr.length >= 2 && arr[arr.length - 1].s >= 1.8 * arr[arr.length - 2].s) arr.pop();
    if (arr.length >= 3) { let mi = 0; for (let i = 1; i < arr.length; i++) if (arr[i].c > arr[mi].c) mi = i; const rest = arr.filter((_, i) => i !== mi).map(e => e.c); if (arr[mi].c >= 3 * Math.max(...rest)) arr.splice(mi, 1); }
    r.speeds = arr.map(e => e.s);
    // TRUE volumetric flow per (accel|speed) cell (filament_area × E-per-XY-mm × speed). Snap the
    // raw speeds (Orca emits ±1 pairs like 33/34) to the denoised test speeds and DROP cells whose
    // speed isn't a test speed — those are the anchor/frame (a low anchor speed like 30 that the
    // denoise removed). Without this the anchor shows up as a spurious combo and as a false
    // cross-plate "duplicate" (e.g. 500|30 appears on every plate).
    const snapSpd = (s) => { let best = null, bd = Infinity; for (const ts of r.speeds) { const d = Math.abs(ts - s) / ts; if (d <= 0.03 && d < bd) { bd = d; best = ts; } } return best; };
    const agg = {}, accSeen = {};
    for (const k in flowAcc) {
      const parts = k.split("|"), a = +parts[0], ts = snapSpd(+parts[1]);
      if (ts == null) continue;
      const key = a + "|" + ts; (agg[key] = agg[key] || { E: 0, L: 0 });
      agg[key].E += flowAcc[k].E; agg[key].L += flowAcc[k].L; accSeen[a] = 1;
    }
    r.flow = {};
    for (const key in agg) { const c = agg[key]; if (c.L > 0) r.flow[key] = filA * (c.E / c.L) * (+key.split("|")[1]); }
    r.accels = Object.keys(accSeen).map(Number).sort((a, b) => a - b);   // real test accels (anchor/stray accels dropped)
    return r;
  }
  // Extract per-(accel|speed) block geometry from the g-code toolpath for the pattern picker.
  // Each real test block has many PA chevrons; we also grab the label/frame segments in its box.
  function buildPaBlocks(text, testSpeeds) {
    const tset = new Set(testSpeeds || []);
    const snapS = (s) => { let best = s, bd = Infinity; tset.forEach(ts => { const d = Math.abs(ts - s) / ts; if (d <= 0.03 && d < bd) { bd = d; best = ts; } }); return best; };
    const lines = String(text).split(/\r?\n/);
    const hasMarkers = /start pressure advance pattern/i.test(text);
    let inpat = !hasMarkers, x = 0, y = 0, pa = 0, accel = 0, f = 0, z = 0;
    const segs = [], seen = new Set();
    for (const raw of lines) {
      const zc = raw.match(/^G[01]\b[^;]*\bZ([\d.]+)/i); if (zc) z = parseFloat(zc[1]);   // layer height
      if (/start pressure advance pattern/i.test(raw)) { inpat = true; continue; }
      if (/end pressure advance pattern/i.test(raw)) { inpat = false; continue; }
      const code = raw.split(";")[0];
      let m = code.match(/SET_PRESSURE_ADVANCE\s+ADVANCE=([\d.]+)/i) || code.match(/\bM900\s+K([\d.]+)/i); if (m) pa = parseFloat(m[1]);
      m = code.match(/SET_VELOCITY_LIMIT[^;]*\bACCEL=([\d.]+)/i) || code.match(/\bM204\s+[SP]([\d.]+)/i); if (m) accel = Math.round(parseFloat(m[1]) / 50) * 50;
      if (/^G1/i.test(code)) {
        const gx = code.match(/X(-?[\d.]+)/i), gy = code.match(/Y(-?[\d.]+)/i), gf = code.match(/F([\d.]+)/i), ge = code.match(/E(-?[\d.]+)/i);
        if (gf) f = parseFloat(gf[1]);
        const nx = gx ? parseFloat(gx[1]) : x, ny = gy ? parseFloat(gy[1]) : y;
        if (ge && parseFloat(ge[1]) > 0 && (nx !== x || ny !== y)) {   // capture ALL extrusion (the square prints outside the markers)
          const spd = snapS(Math.round(f / 60));
          const key = [Math.round(x * 10), Math.round(y * 10), Math.round(nx * 10), Math.round(ny * 10)].join(",");
          if (!seen.has(key)) { seen.add(key); segs.push({ x1: x, y1: y, x2: nx, y2: ny, pa, accel, spd, z, inpat }); }
        }
        x = nx; y = ny;
      }
    }
    const byKey = {}; segs.forEach(s => { if (!s.inpat) return; const k = s.accel + "|" + s.spd; (byKey[k] = byKey[k] || []).push(s); });
    const allXs = segs.flatMap(s => [s.x1, s.x2]), allYs = segs.flatMap(s => [s.y1, s.y2]);
    const plate = { box: [Math.min(...allXs), Math.min(...allYs), Math.max(...allXs), Math.max(...allYs)], items: [] };
    const firstZ = Math.min(...segs.map(s => s.z)), L1 = firstZ + 0.05;
    const blocks = {};
    const pseg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); };
    const sdist = (a, b) => Math.min(pseg(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2), pseg(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2), pseg(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2), pseg(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2));
    const isTest = (s) => (tset.size ? tset.has(s.spd) : (s.spd === 50 || s.spd === 100 || s.spd === 150)) && s.accel >= 1000;
    for (const k in byKey) {
      const g = byKey[k]; const pas = [...new Set(g.map(s => s.pa))];
      if (pas.length < 5 || (tset.size ? !tset.has(+k.split("|")[1]) : k.endsWith("|30"))) continue;   // real test block (skip anchor/frame)
      const xs = g.flatMap(s => [s.x1, s.x2]), ys = g.flatMap(s => [s.y1, s.y2]);
      const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const byPa = {}; g.forEach(s => { (byPa[s.pa] = byPa[s.pa] || []).push(s); });
      // Grow the block from its chevrons within 1mm (over pattern geometry) to pull in the
      // frame, number bar and digits while dropping neighbours (>1mm gap).
      const cand = segs.filter(s => s.inpat && ((s.accel + "|" + s.spd === k) || (!isTest(s)
        && Math.min(s.x1, s.x2) >= bbox[0] - 35 && Math.max(s.x1, s.x2) <= bbox[2] + 35
        && Math.min(s.y1, s.y2) >= bbox[1] - 35 && Math.max(s.y1, s.y2) <= bbox[3] + 35)));
      const inc = new Set(g); let changed = true;
      while (changed) {
        changed = false; const arr = [...inc];
        for (const c of cand) { if (inc.has(c)) continue; for (const s of arr) { if (sdist(c, s) < 1.0) { inc.add(c); changed = true; break; } } }
      }
      // drop only the LONG layer-1 shadow teeth under the chevrons; keep short interior
      // segments (e.g. the small square, which overlaps the chevron zone at its edge)
      const inCh = (s) => { const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2; return mx > bbox[0] + 2 && mx < bbox[2] - 2 && my > bbox[1] + 2 && my < bbox[3] - 2; };
      const isShadow = (s) => inCh(s) && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 8;
      // background/frame = connected layer-1 + any first-layer geometry within block±2mm
      // (this catches the small square, which prints OUTSIDE the pattern markers).
      const bgSet = new Set();
      [...inc].forEach(s => { if (s.accel + "|" + s.spd !== k && s.z <= L1 && !isShadow(s)) bgSet.add(s); });
      segs.forEach(s => {
        if (s.z > L1 || (s.inpat && isTest(s)) || isShadow(s)) return;
        if (Math.min(s.x1, s.x2) >= bbox[0] - 2 && Math.max(s.x1, s.x2) <= bbox[2] + 2 && Math.min(s.y1, s.y2) >= bbox[1] - 2 && Math.max(s.y1, s.y2) <= bbox[3] + 2) bgSet.add(s);
      });
      const bg = [...bgSet];
      const text = [...inc].filter(s => s.accel + "|" + s.spd !== k && s.z > L1);
      const uni = [...new Set([...inc, ...bg])];
      const inX = uni.flatMap(s => [s.x1, s.x2]), inY = uni.flatMap(s => [s.y1, s.y2]);
      const rbox = [Math.min(...inX), Math.min(...inY), Math.max(...inX), Math.max(...inY)];
      blocks[k] = { bbox, rbox, byPa, bg, text };
      plate.items.push({ key: k, bbox, rbox });   // rbox = full object footprint (frame + number tab)
    }
    return { byKey: blocks, plate };
  }
  const PROVIDE_INPUTS = ["pvStart", "pvEnd", "pvStep", "pvFlows", "pvAccels"];
  function setProvideDisabled(dis) {
    PROVIDE_INPUTS.forEach(id => { $(id).disabled = dis; });
    [...document.getElementsByName("pvUnit")].forEach(r => { r.disabled = dis; });
  }
  function resetGcode() {
    gcodeImported = false; gcodeBlocks = null; importPlates = []; coverageMissing = [];
    PROVIDE_INPUTS.forEach(id => { $(id).value = ""; }); setProvideDisabled(false);
    $("gcodeHint").textContent = ""; $("importGcodeBtn").textContent = "Import .gcode"; $("gcodeInput").value = "";
    $("importAddBtn").hidden = true; $("coverageModal").hidden = true;
  }
  async function parsePlate(file) {
    const text = await file.text();
    const r = parsePaGcode(text);
    if (r.paStart == null && !r.accels.length && !r.speeds.length) return null;
    return { name: file.name, r, blocks: buildPaBlocks(text, r.speeds) };
  }
  // combos (accel|speed) actually present across all imported plates, from the flow keys
  function presentCombos() { const s = new Set(); importPlates.forEach(p => Object.keys(p.r.flow || {}).forEach(k => s.add(k))); return s; }
  function unionAxes() {
    const acc = new Set(), spd = new Set();
    importPlates.forEach(p => { (p.r.accels || []).forEach(a => acc.add(a)); (p.r.speeds || []).forEach(s => spd.add(s)); });
    return { accels: [...acc].sort((a, b) => a - b), speeds: [...spd].sort((a, b) => a - b) };
  }
  async function importGcode(file) {   // FIRST plate
    const plate = await parsePlate(file);
    if (!plate) { alert("Couldn't read PA-test settings from this file. Enter them manually."); $("gcodeInput").value = ""; return; }
    importPlates = [plate]; coverageMissing = [];
    applyImport(); classifyCoverage(); $("gcodeInput").value = "";
  }
  async function addPlate(file) {      // subsequent plate
    const plate = await parsePlate(file);
    if (!plate) { alert("Couldn't read a PA test from that file."); $("gcodeInputAdd").value = ""; return; }
    const base = importPlates[0].r, m = [];
    const off = (a, b) => a != null && b != null && Math.abs(a - b) > 1e-6;
    if (off(base.paStart, plate.r.paStart)) m.push(`PA start ${plate.r.paStart} (job uses ${base.paStart})`);
    if (off(base.paStep, plate.r.paStep)) m.push(`PA step ${plate.r.paStep} (job uses ${base.paStep})`);
    if (off(base.paEnd, plate.r.paEnd)) m.push(`PA end ${plate.r.paEnd} (job uses ${base.paEnd})`);
    if (m.length && !confirm("This file doesn't look like it belongs to the same test:\n  • " + m.join("\n  • ") + "\n\nImport it anyway?")) { $("gcodeInputAdd").value = ""; return; }
    const have = presentCombos(), dupes = Object.keys(plate.r.flow || {}).filter(k => have.has(k));
    if (dupes.length && !confirm(`${dupes.length} combo(s) on this plate are already loaded from another plate. Add it anyway? (Duplicates are merged; this plate's geometry wins.)`)) { $("gcodeInputAdd").value = ""; return; }
    importPlates.push(plate); applyImport(); classifyCoverage(); $("gcodeInputAdd").value = "";
  }
  // Merge all imported plates into the results table, the picker blocks, and currentSettings.
  function applyImport() {
    const cf = convFactor(), axes = unionAxes(), accels = axes.accels, speeds = axes.speeds;
    const flow = {}, byKey = {};
    importPlates.forEach(p => {
      Object.keys(p.r.flow || {}).forEach(k => { flow[k] = p.r.flow[k]; });                 // later plate wins
      if (p.blocks && p.blocks.byKey) Object.keys(p.blocks.byKey).forEach(k => { byKey[k] = p.blocks.byKey[k]; });
    });
    const present = new Set(Object.keys(flow)), rows = [];
    accels.forEach(a => speeds.forEach(s => { const k = a + "|" + s; if (present.has(k)) rows.push({ flow: (flow[k] != null ? Math.round(flow[k] * 100) / 100 : Math.round(s * cf * 100) / 100), accel: a, speed: s }); }));
    gcodeBlocks = { byKey, plates: importPlates.map(p => p.blocks.plate) };
    const base = importPlates[0].r;
    if (base.paStart != null) $("pvStart").value = base.paStart;
    if (base.paEnd != null) $("pvEnd").value = base.paEnd;
    if (base.paStep != null) $("pvStep").value = base.paStep;
    $("pvAccels").value = accels.join(", ");
    $("unitMode").value = "speed"; updateUnitUI(); $("pvFlows").value = speeds.join(", ");
    setProvideDisabled(true); gcodeImported = true; $("importGcodeBtn").textContent = "Reset"; $("importAddBtn").hidden = false;
    $("testMode").value = "advanced"; applyMode();
    currentSettings = { source: "gcode", mode: "advanced", unit: "speed", layerH: num($("layerH").value), lineW: num($("lineW").value), paStart: base.paStart, paEnd: base.paEnd, paStep: base.paStep, speeds, accels, flow, importedPlates: importPlates.length };
    loadGrid(rows); sortResults(); markJobDirty();
    $("gcodeHint").textContent = `Imported ${importPlates.length} plate${importPlates.length > 1 ? "s" : ""}: ${rows.length} combo${rows.length !== 1 ? "s" : ""} loaded (PA ${base.paStart}–${base.paEnd}).`;
  }
  // 3-state coverage: 1=complete (no popup), 2=gaps (nudge), 3=reconstructable (offer to complete).
  function classifyCoverage() {
    const axes = unionAxes(), accels = axes.accels, speeds = axes.speeds, present = presentCombos(), missing = [];
    accels.forEach(a => speeds.forEach(s => { if (!present.has(a + "|" + s)) missing.push({ accel: a, speed: s }); }));
    coverageMissing = missing;
    const nP = importPlates.length, nC = presentCombos().size;
    if (!missing.length) {
      // A complete cross-product can STILL be a subset of a multi-plate job we can't see (e.g. a
      // 5×4 plate 1 of a 5×5 test). Always offer to import more; the user confirms when it's whole.
      $("coverageTitle").textContent = nP > 1 ? "Plates imported" : "Plate imported";
      $("coverageComplete").hidden = true;
      $("coverageContinue").textContent = "That's the whole job";
      $("coverageMsg").textContent = `${nP} plate${nP > 1 ? "s" : ""} imported — ${nC} combo${nC !== 1 ? "s" : ""} — and this matrix is complete on its own. If the test was split across more plates, import them; otherwise you're all set.`;
      $("coverageModal").hidden = false;
      return;
    }
    const reconstructable = accels.length >= 2 && speeds.length >= 2;
    $("coverageTitle").textContent = "This looks like part of a larger test";
    $("coverageComplete").hidden = !reconstructable;
    $("coverageContinue").textContent = "Continue with these";
    $("coverageMsg").textContent = reconstructable
      ? `The full matrix looks like ${accels.length} accels × ${speeds.length} speeds = ${accels.length * speeds.length} combos, but ${missing.length} ${missing.length === 1 ? "is" : "are"} missing — probably on other plates. Complete the matrix (fill the gaps with generated patterns), import the other plate(s), or continue with these.`
      : `This plate's matrix looks incomplete — ${missing.length} combo${missing.length !== 1 ? "s" : ""} missing. Import the other plate(s), or continue with these.`;
    $("coverageModal").hidden = false;
  }
  // "Complete the matrix": add empty placeholder rows for the missing combos (picker uses a
  // generated pattern for them). Non-blocking — the user can import the real plates later.
  function completeMatrix() {
    const cf = convFactor();
    coverageMissing.forEach(m => addRow({ flow: Math.round(m.speed * cf * 100) / 100, accel: m.accel, speed: m.speed, bestPA: "", notes: "" }, false));
    coverageMissing = []; sortResults(); $("coverageModal").hidden = true;
  }
  function provideLoad() {
    currentRunId = null;
    const paStart = num($("pvStart").value), paEnd = num($("pvEnd").value), paStep = num($("pvStep").value);
    if (isBasic()) {
      currentSettings = { source: "provided", mode: "basic", basicMethod: $("basicMethod").value, paStart, paEnd, paStep };
      $("recommendOut").textContent = `Recorded your basic ${$("basicMethod").value} settings. Enter the best PA below.`;
      markJobDirty(); return;
    }
    const pts = parseList($("pvFlows").value), accels = parseList($("pvAccels").value);
    if (!pts.length) { alert("Enter the " + (unitIsSpeed() ? "speed" : "flow") + " points you tested, comma-separated."); return; }
    if (!accels.length) { alert("Enter the accel values you tested, comma-separated."); return; }
    const cf = convFactor();
    const flows = unitIsSpeed() ? pts.map(p => Math.round(p * cf * 100) / 100) : pts;   // results table is flow
    currentSettings = { source: "provided", mode: "advanced", unit: $("unitMode").value, layerH: num($("layerH").value), lineW: num($("lineW").value), maxFlow: num($("maxFlow").value), paStart, paEnd, paStep, points: flows, accels };
    loadGrid(buildGridRows(flows, accels)); sortResults(); markJobDirty();
  }

  // results table
  // The results table always shows FLOW (mm³/s) — that's what actually prints in the
  // pattern — with the equivalent speed on hover. flow & accel are locked unless the
  // row's Override box is ticked (grid/gcode points are trusted; ticking lets you edit).
  // opts.readonly builds a display-only row for the saved-results view: no Override checkbox, no
  // Delete button, every value cell disabled. opts.target picks which <tbody> the row is appended
  // to (defaults to the live #resultsBody). The pattern-picker button still works either way — in
  // readonly mode it opens the picker read-only (see openPattern).
  function addRow(r, override, opts) {
    opts = opts || {};
    const readonly = !!opts.readonly, target = opts.target || $("resultsBody"), viewSettings = opts.settings || null;
    r = r || { flow: "", accel: "", bestPA: "", notes: "" };
    override = override == null ? true : override;
    const tr = el("tr");
    if (r.speed != null) tr.dataset.speed = r.speed;   // commanded speed → locate its g-code block
    let ov = null;
    if (!readonly) {
      const tdOv = el("td"); ov = el("input"); ov.type = "checkbox"; ov.className = "ovchk"; ov.checked = !!override; ov.disabled = testFormLocked; tdOv.append(ov);
      tr.append(tdOv);
    }
    const inputs = {};
    const cells = ["flow", "accel", "bestPA", "notes"].map(key => {
      const td = el("td"); const inp = el("input"); inp.type = key === "notes" ? "text" : "number";
      if (key === "bestPA") inp.step = "0.001";
      inp.value = r[key]; inp.dataset.key = key; inputs[key] = inp; td.append(inp); return td;
    });
    const setFlowTitle = () => {
      if (tr.dataset.speed != null) { inputs.flow.title = "≈ " + tr.dataset.speed + " mm/s"; return; }
      const fl = num(inputs.flow.value), cf = convFactor(); inputs.flow.title = (fl != null && cf) ? "≈ " + Math.round(fl / cf) + " mm/s" : "";
    };
    setFlowTitle(); inputs.flow.addEventListener("input", setFlowTitle);
    if (readonly) {
      inputs.flow.disabled = true; inputs.accel.disabled = true; inputs.bestPA.disabled = true; inputs.notes.disabled = true;
    } else {
      const applyLock = () => { inputs.flow.disabled = !ov.checked; inputs.accel.disabled = !ov.checked; };
      ov.addEventListener("change", applyLock); applyLock();
    }
    // pattern picker button in the Best PA cell (cells[2])
    cells[2].classList.add("pacell");
    const patBtn = el("button", "secondary iconbtn"); patBtn.type = "button"; patBtn.textContent = "▤";
    patBtn.title = "Pick best PA from the printed pattern"; patBtn.addEventListener("click", () => openPattern(tr, { readonly, settings: viewSettings }));
    cells[2].append(patBtn);
    // range-edge warning: if the chosen PA sits on the tested range's floor/ceiling, the true
    // optimum probably lies beyond the range — flag it so an edge value isn't mistaken for an answer.
    // Reads the LIVE tab's currentSettings, so it's meaningless (and could reference the wrong
    // run's range) in the read-only saved-results view — skip it there.
    if (!readonly) {
      const edge = el("span", "edgewarn"); edge.textContent = "⚠"; edge.hidden = true; cells[2].append(edge);
      const checkEdge = () => {
        const v = num(inputs.bestPA.value), s = currentSettings || {};
        const lo = num(s.paStart), hi = num(s.paEnd), tol = (num(s.paStep) || 0.005) / 2;
        const atHi = v != null && hi != null && Math.abs(v - hi) <= tol;
        const atLo = v != null && lo != null && Math.abs(v - lo) <= tol;
        edge.hidden = !(atHi || atLo);
        edge.title = atHi
          ? `Best PA is at the top of the tested range (${hi}). The real optimum may be higher — raise End PA and re-test.`
          : `Best PA is at the bottom of the tested range (${lo}). The real optimum may be lower — lower Start PA and re-test.`;
      };
      inputs.bestPA.addEventListener("input", checkEdge); checkEdge();
    }
    // outlier marker: set by refreshOutliers() (neighbour-based) when this cell is out of line with
    // its row/col neighbours — live tab only. The read-only view's row-level "outlier" class (tinted
    // red via CSS) comes from a different, regression-based check; see renderViewAnalysis.
    const outl = el("span", "outlierwarn"); outl.textContent = "◆"; outl.hidden = true; cells[2].append(outl);
    if (!readonly) inputs.bestPA.addEventListener("input", refreshOutliers);
    tr.append(...cells);
    if (!readonly) {
      const tdDel = el("td"); const del = el("button", "secondary"); del.textContent = "✕"; del.style.padding = ".2rem .5rem";
      del.addEventListener("click", () => tr.remove()); tdDel.append(del);
      tr.append(tdDel);
    }
    target.append(tr);
  }
  const loadGrid = (rows) => { $("resultsBody").innerHTML = ""; rows.forEach(r => addRow(r, r.override === true)); refreshOutliers(); };
  // Flag Best-PA cells that are out of line with their NEIGHBOURS (same accel row or same flow column),
  // not globally — the PA surface has a real trend, so a global test misses local mispicks (e.g. one
  // cell reading 0.04 when its row/column neighbours sit at 0–0.01). Uses a neighbour median + MAD with
  // an absolute floor of ~2 steps, so it only fires when a point is both statistically and practically off.
  const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
  function computeOutliers() {
    const rows = [...$("resultsBody").querySelectorAll("tr")].map(tr => ({
      tr, flow: num(tr.querySelector('input[data-key="flow"]').value),
      accel: num(tr.querySelector('input[data-key="accel"]').value), pa: num(tr.querySelector('input[data-key="bestPA"]').value)
    })).filter(r => r.pa != null);
    const step = num((currentSettings || {}).paStep) || 0.005, out = new Set();
    rows.forEach(r => {
      const nb = rows.filter(o => o !== r && (o.accel === r.accel || o.flow === r.flow)).map(o => o.pa);
      if (nb.length < 3) return;
      const M = median(nb), mad = median(nb.map(v => Math.abs(v - M))), dev = Math.abs(r.pa - M);
      if (dev >= step * 2 && dev > 3.5 * 1.4826 * mad) out.add(r.tr);
    });
    return out;
  }
  function refreshOutliers() {
    const out = computeOutliers();
    [...$("resultsBody").querySelectorAll("tr")].forEach(tr => {
      const w = tr.querySelector(".outlierwarn"); if (!w) return;
      w.hidden = !out.has(tr);
      w.title = "This PA is out of line with its neighbouring blocks — likely a mispick. Re-check this block (or re-run it).";
    });
  }
  function readResults() {
    return [...$("resultsBody").querySelectorAll("tr")].map(tr => {
      const g = (k) => tr.querySelector(`input[data-key="${k}"]`).value;
      const ov = tr.querySelector("input.ovchk");
      return { x: num(g("flow")), accel: num(g("accel")), bestPA: num(g("bestPA")), notes: g("notes"), override: ov ? ov.checked : true, speed: tr.dataset.speed != null ? num(tr.dataset.speed) : null, tr };
    });
  }
  // ---- pattern picker ----
  let patternTr = null, patternSel = null, patternReadonly = false;
  // Picker geometry is never persisted (formatVersion 2.0) — a reopened run always regenerates
  // via synthPatternBlock() below, from the run's own stored settings (paStart/paEnd/paStep/
  // lineW/layerH), the same path already used for "recommended" runs. This holds for imported
  // g-code runs too: their settings were themselves parsed FROM the g-code, so the regenerated
  // pattern matches — no raw-gcode re-parse needed. See openRun/openPattern.
  function patternSelectPa(pa) {
    patternSel = pa;
    [...$("patternSvg").querySelectorAll(".paline")].forEach(e2 => e2.classList.toggle("sel", e2.dataset.pa === String(pa)));
    $("patternSel").textContent = "Selected PA: " + pa;
  }
  // Build a synthetic (no-g-code) block from the current PA settings, using the Orca-derived
  // generator, so the picker looks like the real print even when nothing was imported.
  function synthPatternBlock(tr) {
    const s = currentSettings || {};
    if (s.paStart == null || s.paEnd == null || !s.paStep || !window.PAPattern) return null;
    const flow = tr ? tr.querySelector('input[data-key="flow"]').value : null;
    const accel = tr ? tr.querySelector('input[data-key="accel"]').value : null;
    return window.PAPattern.synthBlock({ paStart: s.paStart, paEnd: s.paEnd, paStep: s.paStep, lineWidth: num(s.lineW), layerHeight: num(s.layerH), wallLoops: 3, flow: flow, accel: accel });
  }
  // opts.readonly: viewing a saved-results run — the picker still opens (for reference) but line
  // clicks don't select anything and OK just closes it (see the click wiring further down).
  // opts.settings: the SAVED run's own settings, since the read-only picker isn't necessarily
  // opened from the live PA Test tab — currentSettings there could be for a completely different
  // run (or nothing at all). Temporarily substituted for the duration of this render, restored
  // right after, same idea as openRun() nulling gcodeBlocks so it always regenerates from settings
  // rather than risk matching some unrelated live-session g-code import.
  function openPattern(tr, opts) {
    opts = opts || {};
    patternTr = tr; patternSel = null;
    patternReadonly = !!opts.readonly;
    $("patternModal").classList.toggle("readonly", patternReadonly);
    const prevSettings = currentSettings, prevGcodeBlocks = gcodeBlocks;
    if (opts.settings) { currentSettings = opts.settings; gcodeBlocks = null; }
    try {
      const accel = +tr.querySelector('input[data-key="accel"]').value;
      const speed = tr.dataset.speed != null ? +tr.dataset.speed : NaN;
      const block = (gcodeBlocks && gcodeBlocks.byKey && isFinite(accel) && isFinite(speed)) ? gcodeBlocks.byKey[accel + "|" + speed] : null;
      if (block) { renderRealPattern(tr, block, accel, speed); }
      else {
        const synth = synthPatternBlock(tr);
        if (synth) renderRealPattern(tr, synth, accel, isFinite(speed) ? speed : "?");
        else renderSchematic(tr);   // last-ditch fallback (no PA range available)
      }
    } finally {
      currentSettings = prevSettings; gcodeBlocks = prevGcodeBlocks;
    }
    $("patternModal").hidden = false;
  }
  // Which imported plate holds this block (plates ordered low → high accel, as Orca prints them).
  // Used only to annotate the picker title for a multi-plate import — no plate thumbnail is drawn,
  // because Orca positions the tiles with its bin-packing arranger and we can't predict exact cells.
  function importedPlateLabel(curKey) {
    const raw = gcodeBlocks && gcodeBlocks.plates;
    if (!raw || raw.length < 2) return "";
    const minAcc = (pl) => Math.min.apply(null, pl.items.map(it => +it.key.split("|")[0]));
    const plates = raw.slice().sort((a, b) => minAcc(a) - minAcc(b));
    let idx = -1; plates.forEach((pl, i) => { if (pl.items.some(it => it.key === curKey)) idx = i; });
    return idx >= 0 ? `  ·  plate ${idx + 1} of ${plates.length}` : "";
  }
  function renderRealPattern(tr, block, accel, speed) {
    const flow = tr.querySelector('input[data-key="flow"]').value;
    const cur = num(tr.querySelector('input[data-key="bestPA"]').value);
    $("patternTitle").textContent = `Pick the best line — flow ${flow || "?"} mm³/s @ ${accel} mm/s² (${speed} mm/s)`;
    if (gcodeBlocks && gcodeBlocks.plates) $("patternTitle").textContent += importedPlateLabel(accel + "|" + speed);
    const svg = $("patternSvg"); while (svg.firstChild) svg.removeChild(svg.firstChild);
    const [minx, miny, maxx, maxy] = block.rbox, pad = 2, UW = maxx - minx, VH = maxy - miny;
    svg.setAttribute("viewBox", `0 0 ${(VH + 2 * pad).toFixed(1)} ${(UW + 2 * pad).toFixed(1)}`);
    // Y-flip, then rotate 90° clockwise so the printed numbers read upright.
    const P = (px, py) => { const u = px - minx, v = maxy - py; return [(VH - v) + pad, u + pad]; };
    const line = (seg, cls) => { const a = P(seg.x1, seg.y1), b = P(seg.x2, seg.y2); const l = svgEl("line"); l.setAttribute("x1", a[0].toFixed(2)); l.setAttribute("y1", a[1].toFixed(2)); l.setAttribute("x2", b[0].toFixed(2)); l.setAttribute("y2", b[1].toFixed(2)); if (cls) l.setAttribute("class", cls); return l; };
    (block.fills || []).forEach(poly => {                                // filled number tab (synthetic block)
      const pts = poly.map(pt => { const q = P(pt.x, pt.y); return q[0].toFixed(2) + "," + q[1].toFixed(2); }).join(" ");
      const pg = svgEl("polygon"); pg.setAttribute("points", pts); pg.setAttribute("class", "tabfill"); svg.append(pg);
    });
    (block.bg || []).forEach(seg => svg.append(line(seg, "bgfill")));   // frame + square (imported: layer-1 fill too)
    const pas = Object.keys(block.byPa).map(Number).sort((a, b) => a - b);
    patternSel = (cur != null && pas.includes(cur)) ? cur : null;
    pas.forEach(pa => {
      const g = svgEl("g"); g.setAttribute("class", "paline" + (pa === patternSel ? " sel" : "")); g.dataset.pa = pa;
      block.byPa[pa].forEach(seg => g.append(line(seg, "zig")));
      block.byPa[pa].forEach(seg => g.append(line(seg, "hit")));
      if (!patternReadonly) g.addEventListener("click", () => patternSelectPa(pa));
      svg.append(g);
    });
    (block.text || []).forEach(seg => svg.append(line(seg, "labtext")));  // digits: imported strokes or synthetic seven-segment glyphs
    $("patternSel").textContent = patternSel != null ? "Selected PA: " + patternSel : "No line selected yet — click a chevron.";
  }
  // Synthetic pattern for the no-g-code case: mimics the layout OrcaSlicer's Pressure Advance
  // Pattern calibration prints (nested downward chevrons + frame + per-line PA numbers on the
  // side, flow/accel at the bottom). Method/appearance modelled on OrcaSlicer (AGPL-3.0);
  // this is an original from-scratch implementation, no OrcaSlicer code used.
  function renderSchematic(tr) {
    const s = currentSettings || {};
    let start = s.paStart, end = s.paEnd, step = s.paStep;
    if (start == null || end == null || !step) { start = 0; end = 0.1; step = 0.005; }
    const dp = step < 0.01 ? 3 : 2;
    const vals = []; for (let v = start; v <= end + 1e-9 && vals.length < 60; v += step) vals.push(+v.toFixed(4));
    const accel = tr.querySelector('input[data-key="accel"]').value, flow = tr.querySelector('input[data-key="flow"]').value;
    const cur = num(tr.querySelector('input[data-key="bestPA"]').value);
    $("patternTitle").textContent = `Pick the best line — flow ${flow || "?"} mm³/s @ ${accel || "?"} mm/s²  (approximate pattern — import the printed g-code for the exact one)`;
    const svg = $("patternSvg"); while (svg.firstChild) svg.removeChild(svg.firstChild);
    const N = vals.length, pad = 10, chW = 300, barW = 92, rowStep = 20, amp = 30, topCh = pad + amp + 8, footH = 40;
    const H = topCh + (N - 1) * rowStep + amp + pad + footH;
    const W = pad + chW + barW + pad;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const apexX = pad + chW * 0.58;
    const frame = svgEl("rect"); frame.setAttribute("x", pad); frame.setAttribute("y", pad); frame.setAttribute("width", chW); frame.setAttribute("height", H - 2 * pad); frame.setAttribute("class", "sframe"); svg.append(frame);
    const barX = pad + chW; const bar = svgEl("rect"); bar.setAttribute("x", barX); bar.setAttribute("y", pad); bar.setAttribute("width", barW); bar.setAttribute("height", H - 2 * pad); bar.setAttribute("class", "sbar"); svg.append(bar);
    patternSel = (cur != null && vals.includes(cur)) ? cur : null;
    vals.forEach((pa, i) => {
      const ay = topCh + i * rowStep;   // apex (bottom of the downward "v")
      const g = svgEl("g"); g.setAttribute("class", "paline" + (pa === patternSel ? " sel" : "")); g.dataset.pa = pa;
      for (let p = -1; p <= 1; p++) {   // 3-line look
        const o = p * 2.2;
        const poly = svgEl("polyline"); poly.setAttribute("class", "zig");
        poly.setAttribute("points", `${apexX - amp},${ay - amp + o} ${apexX},${ay + o} ${apexX + amp},${ay - amp + o}`);
        g.append(poly);
      }
      const hit = svgEl("polyline"); hit.setAttribute("class", "hit"); hit.setAttribute("points", `${apexX - amp},${ay - amp} ${apexX},${ay} ${apexX + amp},${ay - amp}`); g.append(hit);
      if (i % 2 === 0) { const t = svgEl("text"); t.setAttribute("class", "snum"); t.setAttribute("x", barX + 8); t.setAttribute("y", ay + 4); t.textContent = pa.toFixed(dp); g.append(t); }
      if (!patternReadonly) g.addEventListener("click", () => patternSelectPa(pa));
      svg.append(g);
    });
    const foot = (txt, dy) => { const t = svgEl("text"); t.setAttribute("class", "snum"); t.setAttribute("x", barX + 8); t.setAttribute("y", H - pad - dy); t.textContent = txt; svg.append(t); };
    foot(accel ? accel : "", 8); foot(flow ? flow : "", 22);
    $("patternSel").textContent = patternSel != null ? "Selected PA: " + patternSel : "No line selected yet — click a chevron.";
  }
  function sortResults() {
    const key = $("resultSort") ? $("resultSort").value : "accel";
    const rows = readResults().map(r => ({ flow: r.x, accel: r.accel, bestPA: r.bestPA, notes: r.notes, override: r.override, speed: r.speed }));
    rows.sort((a, b) => key === "flow"
      ? ((a.flow - b.flow) || ((a.accel || 0) - (b.accel || 0)))
      : (((a.accel || 0) - (b.accel || 0)) || (a.flow - b.flow)));
    loadGrid(rows);
    let prev = null;
    [...$("resultsBody").querySelectorAll("tr")].forEach(tr => {
      const v = tr.querySelector(`input[data-key="${key === "flow" ? "flow" : "accel"}"]`).value;
      tr.classList.toggle("group-start", prev !== null && v !== prev); prev = v;
    });
  }
  function updateUnitUI() {
    const spd = unitIsSpeed();
    if ($("pointsLabelText")) $("pointsLabelText").textContent = (spd ? "Speed" : "Flow") + " points";
    if ($("axisMaxLabelText")) $("axisMaxLabelText").textContent = spd ? "Max speed (mm/s)" : "Max flow (mm³/s)";
    if ($("speedListLabelText")) $("speedListLabelText").textContent = (spd ? "Speed values to test (mm/s" : "Flow values to test (mm³/s") + ", comma-separated)";
    [...document.getElementsByName("recUnit")].forEach(r => { r.checked = (r.value === $("unitMode").value); });
    $("pvFlowsLabel").textContent = (spd ? "Speed" : "Flow") + " points tested (" + unitName() + ", comma-separated)";
    $("pvFlows").placeholder = spd ? "e.g. 60, 120, 180, 240" : "e.g. 5, 10, 15, 20";
    [...document.getElementsByName("pvUnit")].forEach(r => { r.checked = (r.value === $("unitMode").value); });
  }

  // regression
  function linreg(xs, ys) {
    const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, x) => a + x * x, 0), sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const d = n * sxx - sx * sx, slope = d === 0 ? 0 : (n * sxy - sx * sy) / d, intercept = (sy - slope * sx) / n;
    const my = sy / n, ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
    const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
    return { type: "simple", slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, predict: (x) => slope * x + intercept };
  }
  function solve3(A, b) {
    const M = [[...A[0], b[0]], [...A[1], b[1]], [...A[2], b[2]]];
    for (let i = 0; i < 3; i++) {
      let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      [M[i], M[p]] = [M[p], M[i]]; if (Math.abs(M[i][i]) < 1e-12) return null;
      for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c]; }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }
  function mlr(xs, as, ys) {
    const n = xs.length; let Sx = 0, Sa = 0, Sy = 0, Sxx = 0, Saa = 0, Sxa = 0, Sxy = 0, Say = 0;
    for (let i = 0; i < n; i++) { const x = xs[i], a = as[i], y = ys[i]; Sx += x; Sa += a; Sy += y; Sxx += x * x; Saa += a * a; Sxa += x * a; Sxy += x * y; Say += a * y; }
    const c = solve3([[n, Sx, Sa], [Sx, Sxx, Sxa], [Sa, Sxa, Saa]], [Sy, Sxy, Say]); if (!c) return null;
    const my = Sy / n; let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) { const pv = c[0] + c[1] * xs[i] + c[2] * as[i]; ssRes += (ys[i] - pv) ** 2; ssTot += (ys[i] - my) ** 2; }
    return { type: "mlr", b0: c[0], b1: c[1], b2: c[2], r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, predict: (x, a) => c[0] + c[1] * x + c[2] * a };
  }
  // Pure fit + outlier-detection math, shared between the live Analyze button and the saved-results
  // view's read-only Plot & Analysis section. Caller guarantees rows.length >= 3 and each row has
  // non-null x/accel/bestPA; the row objects themselves are untouched (no .tr side effects here —
  // callers own their own DOM and decide how to mark outliers on it).
  function computeFitAnalysis(rows) {
    const xs = rows.map(r => r.x), as = rows.map(r => r.accel), ys = rows.map(r => r.bestPA);
    const accelSet = [...new Set(as)].sort((a, b) => a - b);
    const multi = accelSet.length > 1 && rows.length >= 4;
    const fit = multi ? (mlr(xs, as, ys) || linreg(xs, ys)) : linreg(xs, ys);
    const pred = rows.map(r => fit.type === "mlr" ? fit.predict(r.x, r.accel) : fit.predict(r.x));
    const resid = rows.map((r, i) => Math.abs(ys[i] - pred[i]));
    const mean = resid.reduce((a, b) => a + b, 0) / resid.length;
    const std = Math.sqrt(resid.reduce((a, d) => a + (d - mean) ** 2, 0) / resid.length) || 0;
    const range = Math.max(...ys) - Math.min(...ys), absThresh = Math.max(0.01, range * 0.15);
    const outliers = []; rows.forEach((r, i) => { if (resid[i] > Math.max(2 * std, absThresh)) outliers.push(r); });
    let html = "";
    if (fit.r2 < 0.4) html += '<span class="badge bad">scattered</span>Points don’t follow a clear trend (R²=' + fit.r2.toFixed(2) + '). Usually the print was inconsistent, not your reading — re-check first-layer squish / flow, then re-run.';
    else if (outliers.length) html += '<span class="badge warn">' + outliers.length + ' outlier' + (outliers.length > 1 ? "s" : "") + '</span>Off-trend (highlighted) — likely a misread line. Re-check: ' + outliers.map(o => o.x + " mm³/s @ " + o.accel + " (picked " + o.bestPA + ")").join("; ") + ".";
    else html += '<span class="badge ok">clean</span>Good fit (R²=' + fit.r2.toFixed(2) + '). ';
    if (fit.type === "mlr") html += ' PA ≈ ' + fit.b1.toExponential(2) + '·mm³/s + ' + fit.b2.toExponential(2) + '·accel + ' + fit.b0.toFixed(4) + '.';
    else if (fit.r2 >= 0.4) html += ' PA ≈ ' + fit.slope.toExponential(2) + '·mm³/s + ' + fit.intercept.toFixed(4) + '.';
    return { fit, outliers, html };
  }
  function analyze() {
    const all = readResults();
    all.forEach(r => r.tr.classList.remove("outlier"));
    const rows = all.filter(r => r.x != null && r.bestPA != null && r.accel != null);
    const out = $("analysisOut");
    if (rows.length < 3) { out.innerHTML = '<span class="badge warn">need data</span>Enter at least 3 points to analyze.'; drawPlot([], null, []); return; }
    const { fit, outliers, html } = computeFitAnalysis(rows);
    lastFit = fit;
    outliers.forEach(r => r.tr.classList.add("outlier"));
    drawPlot(rows, fit, outliers);
    out.innerHTML = html;
  }
  // svgTarget lets the saved-results view's read-only Plot & Analysis section render into its own
  // <svg> (e.g. #viewPlot) instead of the live PA Test tab's #plot — same drawing code either way.
  function drawPlot(rows, fit, outliers, svgTarget) {
    const svg = svgTarget || $("plot"); while (svg.firstChild) svg.removeChild(svg.firstChild);
    const W = 640, H = 360, m = { l: 64, r: 20, t: 20, b: 46 }; if (!rows.length) return;
    const xs = rows.map(r => r.x), ys = rows.map(r => r.bestPA);
    const xmin = Math.min(...xs), xmax = Math.max(...xs) || 1;
    let ymin = Math.min(...ys), ymax = Math.max(...ys); if (ymin === ymax) { ymin -= 0.01; ymax += 0.01; }
    const pad = (ymax - ymin) * 0.15; ymin -= pad; ymax += pad;
    const X = (v) => m.l + (v - xmin) / ((xmax - xmin) || 1) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v - ymin) / ((ymax - ymin) || 1) * (H - m.t - m.b);
    const line = (x1, y1, x2, y2, st, w) => { const l = svgEl("line"); l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2); l.setAttribute("stroke", st); l.setAttribute("stroke-width", w || 1); svg.append(l); };
    const text = (x, y, s, anchor) => { const t = svgEl("text"); t.setAttribute("x", x); t.setAttribute("y", y); t.setAttribute("fill", "#8b97a7"); t.setAttribute("font-size", "11"); t.setAttribute("text-anchor", anchor || "middle"); t.textContent = s; svg.append(t); };
    line(m.l, m.t, m.l, H - m.b, "#6a7686"); line(m.l, H - m.b, W - m.r, H - m.b, "#6a7686");
    for (let i = 0; i <= 4; i++) { const gy = ymin + (ymax - ymin) * i / 4, py = Y(gy); line(m.l, py, W - m.r, py, "#3a4552"); text(m.l - 8, py + 3, gy.toFixed(3), "end"); }
    for (let i = 0; i <= 4; i++) { const gx = xmin + (xmax - xmin) * i / 4; text(X(gx), H - m.b + 16, (Math.round(gx * 10) / 10).toString(), "middle"); }
    text((m.l + W - m.r) / 2, H - 8, "flow (mm³/s)");
    const yl = svgEl("text"); yl.setAttribute("x", 16); yl.setAttribute("y", H / 2); yl.setAttribute("fill", "#8b97a7"); yl.setAttribute("font-size", "11"); yl.setAttribute("text-anchor", "middle"); yl.setAttribute("transform", `rotate(-90 16 ${H / 2})`); yl.textContent = "best PA"; svg.append(yl);
    const accelSet = [...new Set(rows.map(r => r.accel))].sort((a, b) => a - b);
    const colorOf = (a) => PALETTE[Math.max(0, accelSet.indexOf(a)) % PALETTE.length];
    if (fit && fit.type === "mlr") accelSet.forEach(a => line(X(xmin), Y(fit.predict(xmin, a)), X(xmax), Y(fit.predict(xmax, a)), colorOf(a), 2));
    else if (fit) line(X(xmin), Y(fit.predict(xmin)), X(xmax), Y(fit.predict(xmax)), "#4aa8ff", 2);
    rows.forEach(r => { const c = svgEl("circle"); c.setAttribute("cx", X(r.x)); c.setAttribute("cy", Y(r.bestPA)); c.setAttribute("r", 5); c.setAttribute("fill", outliers.includes(r) ? "#ff5d5d" : (accelSet.length > 1 ? colorOf(r.accel) : "#37c98b")); c.setAttribute("stroke", "#0c0f13"); svg.append(c); });
    if (accelSet.length > 1) accelSet.forEach((a, i) => { const ly = m.t + 4 + i * 15; const sw = svgEl("rect"); sw.setAttribute("x", W - m.r - 96); sw.setAttribute("y", ly - 8); sw.setAttribute("width", 10); sw.setAttribute("height", 10); sw.setAttribute("fill", colorOf(a)); svg.append(sw); text(W - m.r - 82, ly + 1, a + " mm/s²", "start"); });
  }

  // The Adaptive-PA model box (label + textarea + copy) only appears once there's something to show,
  // so an un-generated Export section is just the Generate button.
  function syncModelBlock() { const mb = $("modelBlock"); if (mb) mb.hidden = !($("modelOut").value || "").trim(); }
  // Same presentation as the Adaptive PA model block: the copy icon sits inline at the end of the
  // label line (not next to the value), with the value on its own line below.
  const copyIcon = (val) => ` <button class="copybtn" data-copy="${val}" title="Copy to clipboard" aria-label="Copy">⧉</button>`;
  const HELP_SINGLE_PA = "A single constant PA value, for slicers/firmware that don't support adaptive (flow-based) PA. It's the fitted model evaluated at the midpoint of your tested flow and accel range — or, before a fit exists yet, the median of your entered Best PA values.";
  // Builds the Single PA markup from the stored RESULT (value + median), never from presentation
  // state — so a saved run always renders with whatever the current app version's format is,
  // live and in the saved-results view alike. singlePa: {value, median} — median null/omitted for
  // basic mode (no fit, so no fit-note line).
  function renderSinglePaHTML(singlePa) {
    if (!singlePa || singlePa.value == null) return "";
    const label = singlePa.median != null ? "Single PA (non-adaptive)" : "Set this PA value in Orca";
    let html = '<label class="blocklabel">' + label + copyIcon(singlePa.value) + '</label><div class="resultblock"><b>' + singlePa.value + '</b></div>';
    if (singlePa.median != null) html += '<p class="hint">(fit at mid-point; median entry = ' + singlePa.median + ') <span class="help" title="' + HELP_SINGLE_PA + '">?</span></p>';
    return html;
  }
  function exportModel() {
    if (isBasic()) {
      const pa = num($("basicBestPA").value);
      lastSinglePa = pa != null ? { value: pa, median: null } : null;
      $("singlePaOut").innerHTML = lastSinglePa ? renderSinglePaHTML(lastSinglePa) : "Enter your best PA above.";
      $("modelOut").value = ""; syncModelBlock(); return;
    }
    const rows = readResults().filter(r => r.x != null && r.bestPA != null).sort((a, b) => (a.x - b.x) || ((a.accel || 0) - (b.accel || 0)));
    if (!rows.length) { $("modelOut").value = ""; syncModelBlock(); $("singlePaOut").textContent = "Enter some results first."; lastSinglePa = null; return; }
    $("modelOut").value = rows.map(r => `${r.bestPA}, ${r.x.toFixed(2)}, ${r.accel != null ? r.accel : ""}`).join("\n");
    syncModelBlock();
    const ys = rows.map(r => r.bestPA).slice().sort((a, b) => a - b), median = ys[Math.floor(ys.length / 2)];
    let single = median;
    if (lastFit) { const midX = (Math.min(...rows.map(r => r.x)) + Math.max(...rows.map(r => r.x))) / 2; const accs = rows.map(r => r.accel).filter(a => a != null).sort((a, b) => a - b); const midA = accs.length ? accs[Math.floor(accs.length / 2)] : 0; single = lastFit.type === "mlr" ? lastFit.predict(midX, midA) : lastFit.predict(midX); }
    lastSinglePa = { value: single.toFixed(4), median };
    $("singlePaOut").innerHTML = renderSinglePaHTML(lastSinglePa);
  }

  // ---- run lifecycle ----
  function collectRun(status) {
    let existing = data.runs.find(r => r.id === currentRunId);
    // Guard against clobbering a saved run: if currentRunId still points at a run for a DIFFERENT
    // printer/filament/nozzle (e.g. you saved one job, switched combos, and saved another), this is a
    // new job — mint a fresh id instead of overwriting the earlier saved run.
    if (existing && (existing.printerId !== data.lastPrinterId || existing.filamentId !== data.lastFilamentId || existing.nozzleId !== data.lastNozzleId)) {
      existing = null; currentRunId = null;
    }
    const nozzle = getSelectedNozzle();
    const results = isBasic()
      ? (num($("basicBestPA").value) != null ? [{ x: null, accel: null, bestPA: num($("basicBestPA").value), notes: $("basicNotes").value }] : [])
      : readResults().filter(r => r.bestPA != null || r.x != null).map(({ tr, ...r }) => r);
    return {
      id: currentRunId || Store.uid(),
      created: existing ? existing.created : new Date().toISOString(),
      date: today(), status,
      printerId: data.lastPrinterId, instanceId: data.lastInstanceId, filamentId: data.lastFilamentId,
      nozzle, nozzleId: data.lastNozzleId, mode: $("testMode").value, basicMethod: $("basicMethod").value,
      unit: $("unitMode").value, layerH: num($("layerH").value), lineW: num($("lineW").value), maxFlow: num($("maxFlow").value),
      settings: currentSettings || null, results,
      // Only the actual result — the number(s) you'd paste into Orca — is stored, not a rendering of
      // it and not the fit math that produced it. Fit coefficients are scratch work; recomputed fresh
      // from `results` at view-open time if/when the Plot & Analysis section needs them.
      modelText: $("modelOut").value || null,
      singlePaValue: lastSinglePa ? lastSinglePa.value : null,
      singlePaMedian: lastSinglePa && lastSinglePa.median != null ? lastSinglePa.median : null,
      shareCommunity: false
    };
  }
  function upsertRun(run) { const i = data.runs.findIndex(r => r.id === run.id); if (i >= 0) data.runs[i] = run; else data.runs.unshift(run); }
  // Blank the PA test tab back to a fresh, gated state (used after saving a planned run).
  function resetTestTab() {
    currentRunId = null; currentSettings = null; lastFit = null;
    setTestFormLocked(false);                       // a fresh/reset test is always fully editable
    loadGrid([]);                                   // empty the results grid
    if ($("basicBestPA")) { $("basicBestPA").value = ""; $("basicNotes").value = ""; }
    drawPlot([], null, []);
    $("recommendOut").textContent = ""; $("analysisOut").innerHTML = "";
    $("singlePaOut").innerHTML = ""; $("modelOut").value = ""; syncModelBlock();
    resetMaxFlowForCombo();                         // re-prefill + re-gate max flow for the current combo
    clearJobDirty();
  }
  // One in-flight PA run per printer+nozzle+filament combo — mirrors Ironing's existing
  // find-existing-and-update pattern in saveIroningRun() (which just needed nozzleId added).
  // If a planned run already exists for the CURRENT combo and currentRunId isn't already tracking
  // it (e.g. the test tab was reset, or the user never resumed it), adopt that run's id so saving
  // updates it in place instead of collectRun() minting a duplicate for the same combo.
  function adoptExistingPlannedRun() {
    const active = data.runs.find(r => r.id === currentRunId);
    const activeMatchesCombo = active && active.printerId === data.lastPrinterId && active.nozzleId === data.lastNozzleId && active.filamentId === data.lastFilamentId;
    if (activeMatchesCombo) return;
    const dupe = data.runs.find(r => r.status === "planned" && r.printerId === data.lastPrinterId && r.nozzleId === data.lastNozzleId && r.filamentId === data.lastFilamentId);
    if (dupe) currentRunId = dupe.id;
  }
  function savePlanned() {
    if (!data.lastPrinterId || !getSelectedNozzle() || !data.lastFilamentId) { alert("Select a printer, nozzle and filament first."); return; }
    adoptExistingPlannedRun();
    const run = collectRun("planned"); currentRunId = run.id; upsertRun(run); persist(); renderFilaments(); clearJobDirty();
    switchTab("filaments");   // back to the filament page (the run shows pinned there — no popup needed)…
    $("tab-test").hidden = true;   // …close the PA modal…
    resetTestTab();                // …and leave it fresh for the next run
  }
  // Abandoning a run is never recoverable, so it's deleted outright rather than soft-flagged
  // (matches ironing runs and the results modal's own delete). Shared by the direct "Abandon this
  // run" button (skipConfirm=false — nothing else has confirmed yet) and the unsaved-job guard's
  // own Abandon (skipConfirm=true — choosing Abandon there already was the confirmation).
  function abandonPaRun(skipConfirm) {
    if (!skipConfirm && !confirm("Abandon this in-progress run? This can't be undone.")) return;
    // currentRunId can legitimately be null here (e.g. a clone-in-progress, which is deliberately
    // detached from the run it was cloned from) — there's just nothing to delete from storage in
    // that case, but the tab still needs to reset and the modal still needs to close either way.
    if (currentRunId) {
      const i = data.runs.findIndex(x => x.id === currentRunId);
      if (i >= 0) data.runs.splice(i, 1);
    }
    currentRunId = null; loadGrid([]); clearJobDirty(); persist(); renderFilaments();
    setTestFormLocked(false);   // nothing in-flight anymore — drop the badge/abandon-button/locked fields
    $("tab-test").hidden = true;
  }
  function saveRun() {
    if (!data.lastPrinterId || !getSelectedNozzle() || !data.lastFilamentId) { alert("Select a printer, nozzle and filament first."); return; }
    adoptExistingPlannedRun();   // completing shouldn't leave a stale planned duplicate for this combo behind
    exportModel();   // generate the Orca export text now so it's stored with the run (shown on reopen)
    const run = collectRun("complete"); currentRunId = run.id; upsertRun(run);
    persist(); renderFilaments(); clearJobDirty();
    switchTab("filaments");   // completed → back to the filament page (run shows under its filament)…
    $("tab-test").hidden = true;   // …close the PA modal…
    resetTestTab();                // …and leave it fresh for the next run
  }
  const resumeRun = (id) => openRun(id);   // planned run → editable in the PA tab

  /* ---- Saved-results modal (per filament) ---- */
  let resultsRunId = null;
  // Filament-tab Scope control: how much of the current printer/nozzle selection a run has to
  // match to count toward a filament's PA/Iron button state, count, and click target.
  //   "nozzle"  — exact printer + nozzle match (default: tightest, matches what's in front of you)
  //   "printer" — same printer, any nozzle
  //   "all"     — no printer/nozzle filter (today's only behavior, before Scope existed)
  function runMatchesScope(r) {
    const scope = data.filamentScope || "nozzle";
    if (scope === "all") return true;
    if (r.printerId !== data.lastPrinterId) return false;
    if (scope === "nozzle" && r.nozzleId !== data.lastNozzleId) return false;
    return true;
  }
  // Includes "planned" runs too (not just "complete") — a filament's in-progress run and its
  // history all live in one place now, same as ironing runs. "abandoned" runs are permanently
  // deleted rather than kept-but-hidden (see jobGuardAbandon / deleteRunById), so no filter needed for those.
  const completedRunsFor = (fid) => data.runs
    .filter(r => r.filamentId === fid && (r.status === "complete" || r.status === "planned") && runMatchesScope(r))
    .sort((a, b) => String(b.created || b.date || "").localeCompare(String(a.created || a.date || "")));   // newest first
  function showRunInProgressModal(msg) { $("runInProgressMsg").textContent = msg; $("runInProgressModal").hidden = false; }
  function openResults(fid) {
    const runs = completedRunsFor(fid); if (!runs.length) return;
    const pick = $("resultsPick"); pick.innerHTML = "";
    runs.forEach(r => { const o = el("option"); o.value = r.id; o.textContent = printerLabel(getPrinter(r.printerId)) + " · " + fmtDateTime(r.created || r.date, r.status === "planned"); pick.append(o); });
    $("resultsPickWrap").hidden = runs.length < 2;
    pick.value = runs[0].id;
    renderResultsRun(runs[0]);
    $("resultsModal").hidden = false;
  }
  function renderResultsRun(run) {
    resultsRunId = run.id;
    const p = getPrinter(run.printerId), f = getFilament(run.filamentId), s = run.settings || {};
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const copy = (val) => (val != null && String(val) !== "") ? ` <button class="copybtn" data-copy="${esc(val)}" title="Copy to clipboard" aria-label="Copy">⧉</button>` : "";
    const dl = (rows) => '<dl class="results-dl">' + rows.filter(r => r[1] != null && String(r[1]) !== "").map(([k, v, c]) => `<dt>${esc(k)}</dt><dd>${esc(v)}${c != null ? copy(c) : ""}</dd>`).join("") + "</dl>";
    const nz = run.nozzle || (data.lastRunNozzle);
    // Title bar: printer/nozzle (with maker icon) on top, filament (with color swatch) below —
    // same icon+two-line pattern the Printer/Filament nav tabs already use.
    {
      const unit = p && p.multi && run.instanceId ? " (" + instanceLabel(p, run.instanceId) + ")" : "";
      tabSel($("resultsPrinterRow"), p ? makerFavicon(p.maker) : null, p ? printerLabel(p) + unit : "(deleted printer)", nz ? nozzleLabel(nz) : "");
    }
    tabSel($("resultsFilamentRow"), f ? colorSquare(f, "colorsq tabsw") : null, f ? filLine1(f) : "(deleted filament)", f ? filLine2(f) : "");
    const bed = p && p.bed ? (p.bed.shape === "round" ? (p.bed.diameter + " mm ø") : (p.bed.x + "×" + p.bed.y + " mm")) : "";
    const printer = p ? [["Maker", p.maker], ["Model", p.model], ["Toolhead", p.toolhead], ["Extruder", (p.extruder || "") + (p.drive ? " (" + p.drive + ")" : "")], ["Hotend", p.hotend], ["Nozzle", nz ? nozzleLabel(nz) : ""], ["Bed", bed]] : [["Status", "(deleted)"]];
    const fil = f ? [["Maker", f.maker], ["Material", f.material], ["Formulation", formText(f)], ["Color", f.color], ["Diameter", f.diameter ? f.diameter + " mm" : ""], ["Fiber", fiberTag(f)], ["Hardness", f.hardness]] : [["Status", "(deleted)"]];
    const settings = [
      ["Mode", (run.mode || "advanced") + (run.basicMethod ? " (" + run.basicMethod + ")" : "")],
      ["Date", fmtDateTime(run.created || run.date, run.status === "planned")],
      ["Max volumetric speed", run.maxFlow != null ? run.maxFlow + " mm³/s" : ""],
      ["Layer × line width", (run.layerH != null && run.lineW != null) ? (run.layerH + " × " + run.lineW + " mm") : ""],
      ["Start PA", s.paStart], ["End PA", s.paEnd], ["PA step", s.paStep],
      ["Accelerations", (s.accels || []).join(", ")],
      ["Speeds (mm/s)", (s.speeds || []).join(", ")]
    ];
    let orca = "";
    if (run.singlePaValue != null) orca += renderSinglePaHTML({ value: run.singlePaValue, median: run.singlePaMedian });
    if (run.modelText) orca += `<label class="blocklabel">Adaptive PA model — paste into Orca${copy(run.modelText)}</label><pre class="resultblock">${esc(run.modelText)}</pre>`;
    if (!orca) orca = '<p class="hint">No exported values were saved for this run.</p>';
    // Section order below Results mirrors the in-flight PA Test tab's own order (settings, then
    // the data table, then Analyze) — Results itself is the one exception, pulled to the top since
    // it's the thing you most likely came here to read/copy. Printer/Filament/Test settings
    // collapse (collapsed by default, as before); Data table and Plot & Analysis are new, also
    // collapsed by default, and only shown when there's an advanced-mode results grid to show.
    const sec = (title, body) => `<details class="rsec"><summary>${esc(title)}</summary>${body}</details>`;
    const hasGrid = !!(run.results && run.results.length && (run.mode || "advanced") !== "basic");
    const dataTableShell = hasGrid
      ? '<table class="results-table"><thead><tr><th>Flow (mm³/s)</th><th>Accel (mm/s²)</th><th>Best PA</th><th>Notes</th></tr></thead><tbody id="viewResultsBody"></tbody></table>'
      : "";
    const plotShell = hasGrid
      ? '<svg id="viewPlot" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid meet" aria-label="PA vs flow plot"></svg><div id="viewAnalysisOut" class="out"></div>'
      : "";
    $("resultsBodyView").innerHTML =
      `<h3 class="rsec-static">Results</h3>${orca}` +
      sec("Printer - " + (p ? printerLabel(p) : "(deleted)"), dl(printer)) +
      sec("Filament - " + (f ? filamentLabel(f) : "(deleted)"), dl(fil)) +
      sec("Test settings", dl(settings)) +
      (hasGrid ? sec("Data table", dataTableShell) : "") +
      (hasGrid ? sec("Plot & Analysis", plotShell) : "");
    // Replacing innerHTML doesn't reset the container's own scrollTop — it's the same scrollable
    // element, just with new children — so without this, opening a run (or switching the run
    // picker) can land already scrolled partway down from wherever a previous view was left.
    $("resultsBodyView").scrollTop = 0;
    if (hasGrid) { renderViewResultsTable(run); renderViewAnalysis(run); }
  }
  // Read-only Data table: same look as the live results grid, minus Override/Delete — nothing here
  // is meant to change after the fact (see addRow's readonly mode).
  function renderViewResultsTable(run) {
    const body = $("viewResultsBody"); if (!body) return;
    body.innerHTML = "";
    (run.results || []).forEach(r => addRow(
      { flow: r.x, accel: r.accel, bestPA: r.bestPA, notes: r.notes },
      r.override === true,
      { readonly: true, target: body, settings: run.settings }
    ));
  }
  // Read-only Plot & Analysis: recomputes the fit/outlier-flagging from the run's saved results
  // (outlier flags aren't themselves persisted per row) using the same math as the live Analyze
  // button, rendered into this modal's own <svg>/<div> rather than the live PA Test tab's.
  function renderViewAnalysis(run) {
    const plotSvg = $("viewPlot"), out = $("viewAnalysisOut"), body = $("viewResultsBody");
    if (!plotSvg || !out || !body) return;
    const trs = [...body.querySelectorAll("tr")];
    trs.forEach(tr => tr.classList.remove("outlier"));
    const rows = (run.results || [])
      .map((r, i) => ({ x: r.x, accel: r.accel, bestPA: r.bestPA, tr: trs[i] }))
      .filter(r => r.x != null && r.bestPA != null && r.accel != null);
    if (rows.length < 3) { out.innerHTML = '<span class="badge warn">need data</span>Not enough points to analyze.'; drawPlot([], null, [], plotSvg); return; }
    const { fit, outliers, html } = computeFitAnalysis(rows);
    outliers.forEach(r => r.tr.classList.add("outlier"));
    drawPlot(rows, fit, outliers, plotSvg);
    out.innerHTML = html;
  }
  function closeResults() { $("resultsModal").hidden = true; resultsRunId = null; }
  function cloneFromRun(id) {   // load a saved run's settings into a fresh editable run (a re-run)
    closeResults();
    openRun(id);                // resume-load into the PA tab (editable)
    currentRunId = null;        // …but make it a NEW run so it can't overwrite the original
    [...$("resultsBody").querySelectorAll("tr")].forEach(tr => {
      const b = tr.querySelector('input[data-key="bestPA"]'); if (b) b.value = "";
      const n = tr.querySelector('input[data-key="notes"]'); if (n) n.value = "";
      // blanking a value doesn't fire the input handlers, so clear the stale flags by hand
      tr.classList.remove("outlier");
      const ew = tr.querySelector(".edgewarn"); if (ew) ew.hidden = true;
      const ow = tr.querySelector(".outlierwarn"); if (ow) ow.hidden = true;
    });
    if ($("basicBestPA")) { $("basicBestPA").value = ""; $("basicNotes").value = ""; }
    drawPlot([], null, []); $("analysisOut").innerHTML = ""; $("modelOut").value = ""; $("singlePaOut").innerHTML = ""; lastFit = null; syncModelBlock();
    $("recommendOut").textContent = "Cloned from a saved run — same settings, blank results. Re-print, enter the best PA per row, then Save.";
    markJobDirty();
  }
  function deleteRunById(id) {
    const r = data.runs.find(x => x.id === id); if (!r) return;
    if (!confirm("Delete this saved run permanently? This can't be undone.")) return;
    const fid = r.filamentId, i = data.runs.findIndex(x => x.id === id);
    if (i >= 0) data.runs.splice(i, 1);
    if (currentRunId === id) currentRunId = null;
    persist(); renderFilaments();
    if (completedRunsFor(fid).length) openResults(fid); else closeResults();   // stay on the modal if runs remain
  }
  function openRun(id) {
    const r = data.runs.find(x => x.id === id); if (!r) return;
    currentRunId = id;
    // A saved in-flight ("planned") run already has its results table generated — lock the
    // settings that shaped it so they can't be changed out from under it. A completed run being
    // reopened (e.g. cloneFromRun(), which always targets a "complete" run) stays fully editable.
    setTestFormLocked(r.status === "planned");
    gcodeBlocks = null;   // never persisted (formatVersion 2.0) — openPattern falls back to synthPatternBlock(), regenerating from r.settings
    data.lastPrinterId = r.printerId; data.lastInstanceId = r.instanceId || null; data.lastFilamentId = r.filamentId;
    const rp = getPrinter(r.printerId);
    data.lastNozzleId = (rp && rp.nozzles && rp.nozzles.some(n => n.id === r.nozzleId)) ? r.nozzleId : (rp && rp.nozzles && rp.nozzles[0] ? rp.nozzles[0].id : null);
    $("testMode").value = r.mode || "advanced";
    applyMode();   // sets #tab-test's data-mode so the correct (basic vs advanced) results section
                    // is actually visible — setting testMode's value alone doesn't trigger this
    if ((r.mode || "advanced") === "basic") lastBasicMethod = r.basicMethod || P.basicDefault;
    $("basicMethod").value = r.basicMethod || P.basicDefault;
    $("unitMode").value = r.unit || "speed";
    if (r.layerH != null) $("layerH").value = r.layerH;
    if (r.lineW != null) $("lineW").value = r.lineW;
    if (r.maxFlow != null) $("maxFlow").value = r.maxFlow;
    $("modelOut").value = r.modelText || ""; syncModelBlock();     // restore the stored Orca export text
    lastSinglePa = r.singlePaValue != null ? { value: r.singlePaValue, median: r.singlePaMedian != null ? r.singlePaMedian : null } : null;
    $("singlePaOut").innerHTML = renderSinglePaHTML(lastSinglePa);
    currentSettings = r.settings || null;
    updateUnitUI();
    const s = r.settings || {};
    if (r.mode === "basic") {
      if (r.results && r.results[0]) { $("basicBestPA").value = r.results[0].bestPA != null ? r.results[0].bestPA : ""; $("basicNotes").value = r.results[0].notes || ""; }
      $("recommendOut").textContent = `Resumed planned basic ${r.basicMethod || "tower"} run. PA range ${s.paStart}–${s.paEnd} step ${s.paStep}. Enter the best PA below.`;
    } else {
      if (r.results && r.results.length) loadGrid(r.results.map(x => ({ flow: x.x, accel: x.accel, bestPA: x.bestPA, notes: x.notes, override: x.override, speed: x.speed })));
      else if (s.points && s.accels) loadGrid(buildGridRows(s.points, s.accels));
      sortResults();
      $("recommendOut").textContent = `Resumed planned run. PA range ${s.paStart}–${s.paEnd} step ${s.paStep}. Fill in the best PA per row.`;
    }
    maxFlowConfirmed = true;   // a saved run's max flow is trusted — don't re-gate it
    renderPrinters(); renderNozzles(); renderFilaments(); updateTestContext(); updateIroningContext();
    openPaModal();
    // Resuming an already-saved planned run isn't itself an unsaved change — jobDirty should stay
    // false until something is actually edited (the existing input listeners on the results table
    // / basic fields handle that). cloneFromRun() marks dirty itself right after calling this, since
    // a clone genuinely is a fresh unsaved run.
    persist();
    // Land on the actual data-entry screen, not just the top of the tab — the results table
    // (advanced) / result fields (basic) sit below the setup sections, so resuming without this
    // leaves the user staring at "Recommend settings" with the thing they came to do off-screen.
    const entrySec = ((r.mode || "advanced") === "basic") ? $("basicResultSec") : $("resultsSec");
    if (entrySec && entrySec.scrollIntoView) entrySec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setStatus() {
    const s = $("dataStatus"); if (!s) return;
    if (Store.fileConnected()) { s.textContent = "file: pa_data.json (live)"; s.classList.add("file"); s.classList.remove("stale"); s.title = "Every change is written straight to pa_data.json."; return; }
    s.classList.remove("file");
    const exp = data.lastExportedAt, mod = data.lastModifiedAt;
    if (!exp) { s.textContent = "local — not exported"; s.classList.remove("stale"); s.title = "Saved in this browser only. Export to a file, or Connect file."; return; }
    const stale = !!(mod && mod > exp);
    s.textContent = "local · exported " + exp.slice(0, 10) + (stale ? "  ⚠ newer than your last export" : "");
    s.classList.toggle("stale", stale);
    s.title = stale ? "You've saved changes since your last export — Export again to capture them." : "Your last export is up to date with your saved data.";
  }
  function prefillProvide() {
    const { start, end, step } = materialRange();
    if (!$("pvStart").value) $("pvStart").value = +start.toFixed(3);
    if (!$("pvEnd").value) $("pvEnd").value = +end.toFixed(3);
    if (!$("pvStep").value) $("pvStep").value = +step.toFixed(3);
    if (!$("pvAccels").value) $("pvAccels").value = ($("accelList").value || logAccels(accelFloor(),num($("accelLimit").value) || 12000, 5).join(", "));
  }

  /* =================== IRONING TEST TAB =================== */
  // Same selected printer/nozzle/filament as PA Test — no separate picker. Generates a 3MF
  // (window.PAIroning, js/ironing.js) instead of g-code; Orca does the real slicing. See
  // docs/ironing-method-provenance.md for the file format this is built from.

  function bedSizeLabel(p) {
    const b = p && p.bed; if (!b) return "?";
    return b.shape === "round" ? ("⌀" + b.diameter + "mm") : (b.x + "×" + b.y + "mm");
  }

  // The single incomplete (unnamed) ironing run for a printer+filament combo, if any — the same
  // "one in-progress run" invariant saveIroningRun relies on.
  function findIncompleteIroningRun(pid, nid, fid) {
    return (data.ironingRuns || []).find(r => r.printerId === pid && r.nozzleId === nid && r.filamentId === fid && !(r.namedResults && r.namedResults.length));
  }
  function updateIroningContext() {
    const p = getPrinter(data.lastPrinterId), n = getSelectedNozzle(), f = getFilament(data.lastFilamentId);
    const ctx = $("ironingContext"); if (!ctx) return;
    if (!p || !n || !f) {
      $("ironingBody").hidden = true;
      if ($("ironAbandonBtn")) $("ironAbandonBtn").hidden = true;
      ctx.innerHTML = '<span class="badge info">setup</span>To generate an ironing test, select a <b>printer</b> and <b>nozzle</b> (Printer tab), then a <b>filament</b> (Filament tab).' +
        (!p ? "<br>• No printer selected." : "") + (p && !n ? "<br>• No nozzle selected." : "") + (!f ? "<br>• No filament selected." : "");
      return;
    }
    const inst = (p.multi && data.lastInstanceId) ? " · unit " + instanceLabel(p, data.lastInstanceId) : "";
    ctx.innerHTML = `<b>${printerLabel(p)}</b>${inst}<br><span class="muted">Bed: ${bedSizeLabel(p)}</span><br>Nozzle: <b>${nozzleLabel(n)}</b><br>Filament: <b>${filamentLabel(f)}</b>`;
    $("ironingBody").hidden = false;
    if ($("ironAbandonBtn")) $("ironAbandonBtn").hidden = !findIncompleteIroningRun(data.lastPrinterId, n.id, data.lastFilamentId);
    if (!ironingLoaded) { loadIroningSettings(); ironingLoaded = true; }
    refreshIroning();
  }

  function ironSpeeds() { return parseList($("ironSpeedList").value).filter(v => v > 0); }
  function ironFlows() { return parseList($("ironFlowList").value).filter(v => v > 0); }

  function regenIroningAxes() {
    if (ironSpeedListAuto) {
      const n = Math.max(2, Math.round(num($("ironSpeedPoints").value) || 10));
      $("ironSpeedList").value = linspace(num($("ironSpeedMin").value) || 10, num($("ironSpeedMax").value) || 100, n).map(v => Math.round(v)).join(", ");
    }
    if (ironFlowListAuto) {
      const n = Math.max(2, Math.round(num($("ironFlowPoints").value) || 10));
      $("ironFlowList").value = linspace(num($("ironFlowMin").value) || 10, num($("ironFlowMax").value) || 100, n).map(v => Math.round(v)).join(", ");
    }
  }

  // Recomputes the auto lists (unless the user's typed their own), replans the grid against the
  // selected printer's real bed, and persists — called from every relevant field's input handler.
  function refreshIroning() {
    regenIroningAxes();
    updateIroningPlan();
    saveIroningSettings();
  }

  function updateIroningPlan() {
    const out = $("ironingPlanOut"), btn = $("ironingDownloadBtn"), brim = $("ironingBrimInstructions");
    if (!out || !btn) return;
    const gap = num($("ironGap").value);
    const p = getPrinter(data.lastPrinterId);
    if (!p || !hasBed(p)) { out.textContent = ""; btn.disabled = true; if (brim) brim.textContent = ""; return; }
    const speeds = ironSpeeds(), flows = ironFlows();
    if (speeds.length < 2 || flows.length < 2) {
      out.innerHTML = '<span class="badge warn">incomplete</span> Enter at least 2 speed and 2 flow values.';
      btn.disabled = true; if (brim) brim.textContent = ""; return;
    }
    const grid = window.PAIroning.planGrid({
      speeds, flows, bed: p.bed,
      padDiameter: num($("ironPadDiameter").value) || undefined,
      gap: gap
    });
    if (!grid.fits) {
      out.innerHTML = `<span class="badge bad">doesn't fit</span> ${grid.cols}×${grid.rows} grid (${grid.gridW.toFixed(1)}×${grid.gridH.toFixed(1)}mm) is bigger than ${printerLabel(p)}'s usable bed (${grid.ux.toFixed(1)}×${grid.uy.toFixed(1)}mm). Reduce points, pad size, or gap — multi-plate isn't supported yet.`;
      btn.disabled = true;
    } else {
      out.innerHTML = `<span class="badge ok">fits</span> ${grid.cols}×${grid.rows} = ${grid.cols * grid.rows} pads, ${grid.gridW.toFixed(1)}×${grid.gridH.toFixed(1)}mm on a ${grid.ux.toFixed(1)}×${grid.uy.toFixed(1)}mm usable bed.`;
      btn.disabled = false;
    }
    updateIroningBrimInstructions(gap, grid.cols * grid.rows);
  }

  // The per-object brim_type/brim_object_gap metadata we write does NOT join the pads into one
  // piece — that's controlled by Orca's GLOBAL brim settings (brim_width + combine_brims), which
  // live in your active profile, not in the 3MF. We deliberately do NOT embed a project_settings.config
  // to set these automatically: that file is a full 654-key snapshot of your ENTIRE active profile
  // when Orca writes one, and by default Orca applies it wholesale when a .3mf with one is opened on
  // an empty plate (OrcaSlicer#8106 — real reports of people losing tuned printer/filament settings
  // this way). Since PA-Helper never reads your actual Orca profile, we can't safely construct a full
  // replacement — so instead: a precise, computed instruction, not a vague warning.
  function updateIroningBrimInstructions(gap, padCount) {
    const el2 = $("ironingBrimInstructions"); if (!el2) return;
    const width = (gap != null ? gap + 2 : null);
    if (width == null) { el2.textContent = ""; return; }
    el2.innerHTML = '<span class="badge warn">important</span> In Orca, <b>before slicing</b> — Print Settings → Strength → Brim: set <b>Brim type</b> to <b>Outer brim only</b>, <b>Brim width</b> to <b>' + width.toFixed(1) + 'mm</b>, and enable <b>Combine brims</b>.' +
      ' Without this, the ' + (padCount || "") + ' pads print as ' + (padCount || "") + ' separate objects instead of one joined piece — likely a failed print.' +
      ' (Brim width = your pad gap of ' + gap + 'mm + 2mm margin, so adjacent brims always overlap.)';
  }

  // Filesystem-safe-ish slug: letters/digits kept, everything else collapses to one hyphen.
  const fileSlug = (s) => String(s || "").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");

  function downloadIroning3mf() {
    const p = getPrinter(data.lastPrinterId); if (!p || !hasBed(p)) return;
    const f = getFilament(data.lastFilamentId);
    const speeds = ironSpeeds(), flows = ironFlows();
    const res = window.PAIroning.build3mf({
      speeds, flows, bed: p.bed,
      padDiameter: num($("ironPadDiameter").value) || undefined,
      gap: num($("ironGap").value) || undefined
    });
    if (!res.ok) { alert(res.error); return; }
    const blob = window.PAIroning.toBlob(res.bytes);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const namePart = [fileSlug(printerLabel(p)), f ? fileSlug(filamentLabel(f)) : null, `${speeds.length}x${flows.length}`].filter(Boolean).join("_");
    a.download = `ironing-test_${namePart}.3mf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---- saved ironing tests (data.ironingRuns[]) ----
  // "Complete" = has named results (see completedIroningRunsFor's in-progress check elsewhere).
  // Multiple complete runs are allowed per printer+filament (they're history); only one
  // incomplete (unnamed) run may exist per combo at a time — saving again while one's still in
  // progress updates it in place instead of piling up duplicates.
  function collectIroningRun(existing) {
    return {
      id: existing ? existing.id : Store.uid(),
      status: "complete",
      created: existing ? existing.created : new Date().toISOString(),
      date: today(),
      printerId: data.lastPrinterId, instanceId: data.lastInstanceId || null,
      nozzleId: data.lastNozzleId, filamentId: data.lastFilamentId,
      namedResults: existing ? existing.namedResults : undefined,
      settings: {
        speedMin: num($("ironSpeedMin").value), speedMax: num($("ironSpeedMax").value), speedPoints: num($("ironSpeedPoints").value),
        speedList: $("ironSpeedList").value,
        flowMin: num($("ironFlowMin").value), flowMax: num($("ironFlowMax").value), flowPoints: num($("ironFlowPoints").value),
        flowList: $("ironFlowList").value,
        padDiameter: num($("ironPadDiameter").value), gap: num($("ironGap").value)
      }
    };
  }
  function saveIroningRun() {
    if (!data.lastPrinterId || !getSelectedNozzle() || !data.lastFilamentId) { alert("Select a printer, nozzle and filament first."); return; }
    const speeds = ironSpeeds(), flows = ironFlows();
    if (speeds.length < 2 || flows.length < 2) { alert("Enter at least 2 speed and 2 flow values first."); return; }
    data.ironingRuns = data.ironingRuns || [];
    const existing = findIncompleteIroningRun(data.lastPrinterId, data.lastNozzleId, data.lastFilamentId);
    const fresh = collectIroningRun(existing);
    if (existing) data.ironingRuns[data.ironingRuns.indexOf(existing)] = fresh;
    else data.ironingRuns.unshift(fresh);
    persist(); renderFilaments(); clearIronDirty();
    switchTab("filaments");
    $("tab-ironing").hidden = true;   // close the Ironing modal…
    openIronResults(data.lastFilamentId);   // …and land on the naming/results picker
  }
  function deleteIroningRun(id) {
    const r = (data.ironingRuns || []).find(x => x.id === id); if (!r) return;
    if (!confirm("Delete this saved ironing test? This cannot be undone.")) return;
    const fid = r.filamentId;
    data.ironingRuns = (data.ironingRuns || []).filter(x => x.id !== id);
    persist(); renderFilaments(); updateIroningContext();   // refresh the Abandon button too, in case this was the in-progress run
    if (completedIroningRunsFor(fid).length) openIronResults(fid); else closeIronResults();
  }
  // Loads a saved run's sweep/geometry settings into the Ironing modal's fields (shared by the
  // explicit "resume" and "rerun with these settings" flows).
  function loadIroningRunFields(r) {
    const s = r.settings || {};
    if (s.speedMin != null) $("ironSpeedMin").value = s.speedMin;
    if (s.speedMax != null) $("ironSpeedMax").value = s.speedMax;
    if (s.speedPoints != null) $("ironSpeedPoints").value = s.speedPoints;
    ironSpeedListAuto = !s.speedList; if (s.speedList) $("ironSpeedList").value = s.speedList;
    if (s.flowMin != null) $("ironFlowMin").value = s.flowMin;
    if (s.flowMax != null) $("ironFlowMax").value = s.flowMax;
    if (s.flowPoints != null) $("ironFlowPoints").value = s.flowPoints;
    ironFlowListAuto = !s.flowList; if (s.flowList) $("ironFlowList").value = s.flowList;
    if (s.padDiameter != null) $("ironPadDiameter").value = s.padDiameter;
    if (s.gap != null) $("ironGap").value = s.gap;
    refreshIroning();
  }
  // Reopening loads the run's printer/nozzle/filament + settings back into the Ironing tab (fully
  // editable — there's no read-only view-lock for this tab, unlike PA Test's saved-run view).
  // Re-saving only creates a NEW record if the matching printer+filament's current run is already
  // complete (named) — otherwise it updates the in-progress one in place, see saveIroningRun().
  function openIroningRun(id) {
    const r = (data.ironingRuns || []).find(x => x.id === id); if (!r) return;
    if (r.printerId && getPrinter(r.printerId)) selectPrinter(r.printerId);
    const pr = getPrinter(r.printerId);
    if (pr && r.nozzleId && pr.nozzles && pr.nozzles.some(nz => nz.id === r.nozzleId)) selectNozzle(r.nozzleId);
    if (r.instanceId) { data.lastInstanceId = r.instanceId; persist(); }
    if (r.filamentId && getFilament(r.filamentId)) selectFilament(r.filamentId);
    openIronModal();
    loadIroningRunFields(r);
  }
  /* ---- Saved-results modal (per filament) — Ironing ---- */
  let ironResultsRunId = null;
  const completedIroningRunsFor = (fid) => (data.ironingRuns || [])
    .filter(r => r.filamentId === fid && runMatchesScope(r))
    .sort((a, b) => String(b.created || b.date || "").localeCompare(String(a.created || a.date || "")));   // newest first
  function openIronResults(fid) {
    const runs = completedIroningRunsFor(fid); if (!runs.length) return;
    const pick = $("ironResultsPick"); pick.innerHTML = "";
    runs.forEach(r => { const o = el("option"); o.value = r.id; o.textContent = printerLabel(getPrinter(r.printerId)) + " · " + fmtDateTime(r.created || r.date, !(r.namedResults && r.namedResults.length)); pick.append(o); });
    $("ironResultsPickWrap").hidden = runs.length < 2;
    pick.value = runs[0].id;
    renderIronResultsRun(runs[0]);
    $("ironResultsModal").hidden = false;
  }
  function renderIronResultsRun(run) {
    ironResultsRunId = run.id;
    const p = getPrinter(run.printerId), f = getFilament(run.filamentId), s = run.settings || {};
    const nz = p && p.nozzles ? p.nozzles.find(n => n.id === run.nozzleId) : null;
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const copy = (val) => (val != null && String(val) !== "") ? ` <button class="copybtn" data-copy="${esc(val)}" title="Copy to clipboard" aria-label="Copy">⧉</button>` : "";
    const dl = (rows) => '<dl class="results-dl">' + rows.filter(r => r[1] != null && String(r[1]) !== "").map(([k, v, c]) => `<dt>${esc(k)}</dt><dd>${esc(v)}${c != null ? copy(c) : ""}</dd>`).join("") + "</dl>";
    // Title bar: printer/nozzle (with maker icon) on top, filament (with color swatch) below — same
    // icon+two-line pattern the Printer/Filament nav tabs (and the PA saved-results view) use.
    {
      const unit = p && p.multi && run.instanceId ? " (" + instanceLabel(p, run.instanceId) + ")" : "";
      tabSel($("ironResultsPrinterRow"), p ? makerFavicon(p.maker) : null, p ? printerLabel(p) + unit : "(deleted printer)", nz ? nozzleLabel(nz) : "");
    }
    tabSel($("ironResultsFilamentRow"), f ? colorSquare(f, "colorsq tabsw") : null, f ? filLine1(f) : "(deleted filament)", f ? filLine2(f) : "");
    const bed = p && p.bed ? (p.bed.shape === "round" ? (p.bed.diameter + " mm ø") : (p.bed.x + "×" + p.bed.y + " mm")) : "";
    const printer = p ? [["Maker", p.maker], ["Model", p.model], ["Toolhead", p.toolhead], ["Extruder", (p.extruder || "") + (p.drive ? " (" + p.drive + ")" : "")], ["Hotend", p.hotend], ["Nozzle", nz ? nozzleLabel(nz) : ""], ["Bed", bed]] : [["Status", "(deleted)"]];
    const fil = f ? [["Maker", f.maker], ["Material", f.material], ["Formulation", formText(f)], ["Color", f.color], ["Diameter", f.diameter ? f.diameter + " mm" : ""], ["Fiber", fiberTag(f)], ["Hardness", f.hardness]] : [["Status", "(deleted)"]];
    const settings = [
      ["Date", fmtDateTime(run.created || run.date, !(run.namedResults && run.namedResults.length))],
      ["Speed range", (s.speedMin != null && s.speedMax != null) ? (s.speedMin + "–" + s.speedMax + " mm/s (" + (s.speedPoints || "") + " pts)") : ""],
      ["Speed list", s.speedList],
      ["Flow range", (s.flowMin != null && s.flowMax != null) ? (s.flowMin + "–" + s.flowMax + "% (" + (s.flowPoints || "") + " pts)") : ""],
      ["Flow list", s.flowList],
      ["Pad diameter", s.padDiameter != null ? s.padDiameter + " mm" : ""],
      ["Gap", s.gap != null ? s.gap + " mm" : ""]
    ];
    const sec = (title, body) => `<details class="rsec"><summary>${esc(title)}</summary>${body}</details>`;
    const named = run.namedResults || [];
    // Still fully editable here (no lock, unlike PA's saved data) — ironing results are a judgment
    // call, not a measurement, so re-naming samples after the fact is a feature, not a data-integrity risk.
    const resultsBody = named.length
      ? '<table><thead><tr><th>Sample</th><th>Speed</th><th>Flow</th></tr></thead><tbody>' +
          named.map(n => `<tr><td>${esc(n.name)}</td><td>${esc(n.speed)} mm/s</td><td>${esc(n.flow)}%</td></tr>`).join("") +
        '</tbody></table><div class="actions"><button class="secondary" data-iron-picker-open="' + esc(run.id) + '">Change results</button></div>'
      : '<p class="hint">No named results yet.</p><div class="actions"><button data-iron-picker-open="' + esc(run.id) + '">Name samples</button></div>';
    // Results moves to the top, same as the PA saved-results view — it's the thing you most likely
    // came here to read, everything else (printer/filament/settings) collapses below it.
    $("ironResultsBodyView").innerHTML =
      `<h3 class="rsec-static">Results</h3>${resultsBody}` +
      sec("Printer - " + (p ? printerLabel(p) : "(deleted)"), dl(printer)) +
      sec("Filament - " + (f ? filamentLabel(f) : "(deleted)"), dl(fil)) +
      sec("Test settings", dl(settings));
    $("ironResultsBodyView").scrollTop = 0;   // same fix as the PA saved-results view — see there
  }
  function closeIronResults() { $("ironResultsModal").hidden = true; ironResultsRunId = null; }
  function cloneFromIroningRun(id) {   // load a saved ironing test's settings back into the tab for a re-run
    closeIronResults();
    openIroningRun(id);
  }

  /* ---- Results picker: name individual pads on a saved ironing test's grid ---- */
  // Working copy only — nothing touches data.ironingRuns until "Save settings" is clicked.
  // cells is keyed "row,col" -> {name}. row/col match ironing.js's planGrid() (row=flow, col=speed),
  // so "row 3, column 7" here is the same pad the user can count off the physical print.
  let ironPickerState = null, ironPickerResizeHandler = null;
  function openIronPicker(runId) {
    const run = (data.ironingRuns || []).find(r => r.id === runId); if (!run) return;
    const s = run.settings || {};
    const speeds = parseList(s.speedList), flows = parseList(s.flowList);
    if (speeds.length < 2 || flows.length < 2) { alert("This saved test doesn't have a full speed/flow grid to name."); return; }
    const cells = {};
    (run.namedResults || []).forEach(n => { cells[n.row + "," + n.col] = { name: n.name }; });
    const C = window.PAIroning.CONST;
    ironPickerState = {
      runId, speeds, flows, cells,
      padDiameter: s.padDiameter != null ? s.padDiameter : C.padDiameter,
      gap: s.gap != null ? s.gap : C.gap
    };
    $("ironPickerSub").textContent = `${speeds.length}×${flows.length} grid — ${run.date}`;
    hideIronNamePanel();
    $("ironPickerModal").hidden = false;   // must be visible before renderIronPickerGrid measures it to size the SVG
    renderIronPickerGrid();
    if (!ironPickerResizeHandler) { ironPickerResizeHandler = () => renderIronPickerGrid(); window.addEventListener("resize", ironPickerResizeHandler); }
  }
  // Shrinks (or grows) the SVG to whatever space is actually available in the modal — viewport
  // height minus this modal's own header/footer — so the grid never needs its own scrollbar.
  // Not a literal mm-to-px mapping: it fills whatever box it's given, preserving the grid's
  // internal proportions (pad size vs. gap), which is what actually matters here.
  function fitIronPickerSvg(svgEl, totalW, totalH) {
    const modal = $("ironPickerModal");
    const head = modal.querySelector(".results-head"), foot = modal.querySelector(".results-foot"), body = modal.querySelector(".ironpicker-body");
    const winH = (typeof window !== "undefined" && window.innerHeight) || 800;
    const winW = (typeof window !== "undefined" && window.innerWidth) || 1200;
    const headH = (head && head.offsetHeight) || 64, footH = (foot && foot.offsetHeight) || 60;
    const availH = Math.max(100, winH * 0.86 - headH - footH - 24);
    const bodyW = (body && body.clientWidth) || Math.min(winW * 0.9, 700);
    const availW = Math.max(100, bodyW - 8);
    const scale = Math.min(availW / totalW, availH / totalH);
    svgEl.style.width = (totalW * scale).toFixed(1) + "px";
    svgEl.style.height = (totalH * scale).toFixed(1) + "px";
  }
  // Draws the grid to scale from the run's real pad diameter + gap (same spacing formula as
  // ironing.js's planGrid()) so circle size and spacing on screen match the physical print —
  // row=flow, col=speed, same convention as planGrid()'s items.
  function renderIronPickerGrid() {
    const st = ironPickerState; if (!st) return;
    const pad = st.padDiameter, gap = st.gap;
    const cols = st.speeds.length, rows = st.flows.length;
    const gridW = cols * pad + (cols - 1) * gap, gridH = rows * pad + (rows - 1) * gap;
    const mLeft = pad * 1.1, mTop = pad * 0.75;   // just enough room for the axis labels, no extra padding
    const edgeBuf = Math.max(pad * 0.05, 1);   // last row/col's circle stroke sits exactly on the viewBox edge otherwise — clipped
    const totalW = gridW + mLeft + edgeBuf, totalH = gridH + mTop + edgeBuf;
    const fs = Math.max(pad * 0.3, 2.5);
    const esc2 = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

    let svg = `<svg viewBox="0 0 ${totalW.toFixed(2)} ${totalH.toFixed(2)}" class="ironpicker-svg" role="img" aria-label="Ironing test pad grid">`;
    st.speeds.forEach((sp, c) => {
      const cx = mLeft + c * (pad + gap) + pad / 2;
      svg += `<text x="${cx.toFixed(2)}" y="${(mTop * 0.65).toFixed(2)}" font-size="${fs.toFixed(2)}" text-anchor="middle" class="ironaxis">${sp}</text>`;
    });
    st.flows.forEach((fl, r) => {
      const cy = mTop + r * (pad + gap) + pad / 2;
      svg += `<text x="${(mLeft * 0.75).toFixed(2)}" y="${cy.toFixed(2)}" font-size="${fs.toFixed(2)}" text-anchor="end" dominant-baseline="central" class="ironaxis">${fl}%</text>`;
    });
    st.flows.forEach((fl, r) => {
      st.speeds.forEach((sp, c) => {
        const cx = mLeft + c * (pad + gap) + pad / 2, cy = mTop + r * (pad + gap) + pad / 2;
        const cell = st.cells[r + "," + c];
        const label = cell ? cell.name.slice(0, 1).toUpperCase() : "";
        const title = `Row ${r + 1}, Col ${c + 1} — ${sp} mm/s, ${fl}% flow` + (cell ? (" — " + cell.name) : "");
        svg += `<g class="ironcell${cell ? " named" : ""}" data-r="${r}" data-c="${c}">` +
          `<title>${esc2(title)}</title>` +
          `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(pad / 2).toFixed(2)}"/>` +
          (label ? `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" font-size="${fs.toFixed(2)}" text-anchor="middle" dominant-baseline="central" class="ironcell-label">${label}</text>` : "") +
          `</g>`;
      });
    });
    svg += `</svg>`;
    $("ironPickerGrid").innerHTML = svg;
    const svgEl = $("ironPickerGrid").querySelector("svg");
    fitIronPickerSvg(svgEl, totalW, totalH);
    // renderIronPickerGrid() rebuilds every cell node from scratch, so if a naming popover is
    // open (e.g. this run was triggered by a window resize mid-edit), reapply the "active"
    // highlight and re-anchor the popover to the freshly-built cell.
    if (st.activeCell) {
      const activeEl = $("ironPickerGrid").querySelector(`.ironcell[data-r="${st.activeCell.r}"][data-c="${st.activeCell.c}"]`);
      if (activeEl) { activeEl.classList.add("active"); if (!$("ironNamePanel").hidden) positionIronNamePanel(activeEl); }
    }
  }
  // Positions the floating naming popover on the opposite half of the grid (both axes) from the
  // clicked pad, so the pad you're naming stays visible instead of getting covered by the popover.
  function positionIronNamePanel(cellEl) {
    const panel = $("ironNamePanel"), gridWrap = $("ironPickerGridWrap");
    if (!cellEl || !cellEl.getBoundingClientRect || typeof window === "undefined" || !window.innerWidth) return;   // no layout engine (e.g. unit tests) — skip
    const cellRect = cellEl.getBoundingClientRect(), gridRect = gridWrap.getBoundingClientRect();
    panel.style.visibility = "hidden";   // measure its natural (content-fit) size without a visible flash
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    const gcx = gridRect.left + gridRect.width / 2, gcy = gridRect.top + gridRect.height / 2;
    const cellCx = cellRect.left + cellRect.width / 2, cellCy = cellRect.top + cellRect.height / 2;
    let left = (cellCx < gcx) ? (gcx + 10) : (gcx - pw - 10);
    let top = (cellCy < gcy) ? (gcy + 10) : (gcy - ph - 10);
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
    panel.style.left = left + "px"; panel.style.top = top + "px";
    panel.style.visibility = "";
  }
  function onIronCellClick(r, c, cellEl) {
    const st = ironPickerState; if (!st) return;
    st.activeCell = { r, c };
    const sp = st.speeds[c], fl = st.flows[r], cell = st.cells[r + "," + c];
    const isPreset = cell && (cell.name === "Glossy" || cell.name === "Matte");
    $("ironNameCellInfo").textContent = `Row ${r + 1}, Col ${c + 1} — Speed ${sp} mm/s, Flow ${fl}%`;
    [...document.getElementsByName("ironNameChoice")].forEach(rb => { rb.checked = cell ? (isPreset ? rb.value === cell.name : rb.value === "Other") : false; });
    const otherText = $("ironNameOtherText");
    otherText.disabled = !(cell && !isPreset);
    otherText.value = (cell && !isPreset) ? cell.name : "";
    $("ironNameRemove").hidden = !cell;
    $("ironNamePanel").hidden = false;
    positionIronNamePanel(cellEl);
    const prevActive = $("ironPickerGrid").querySelector(".ironcell.active"); if (prevActive) prevActive.classList.remove("active");
    if (cellEl) cellEl.classList.add("active");
  }
  function hideIronNamePanel() {
    $("ironNamePanel").hidden = true;
    [...document.getElementsByName("ironNameChoice")].forEach(rb => rb.checked = false);
    $("ironNameOtherText").disabled = true; $("ironNameOtherText").value = "";
    if (ironPickerState) ironPickerState.activeCell = null;
    const activeEl = $("ironPickerGrid").querySelector(".ironcell.active"); if (activeEl) activeEl.classList.remove("active");
  }
  function commitIronCellName() {
    const st = ironPickerState; if (!st || !st.activeCell) return;
    const choice = document.querySelector('input[name="ironNameChoice"]:checked');
    if (!choice) { alert("Pick Glossy, Matte, or Other first."); return; }
    let name = choice.value;
    if (name === "Other") {
      const desc = $("ironNameOtherText").value.trim();
      if (!desc) { alert('Enter a short description for "Other".'); return; }
      name = desc;
    }
    st.cells[st.activeCell.r + "," + st.activeCell.c] = { name };
    hideIronNamePanel();
    renderIronPickerGrid();
  }
  function removeIronCellName() {
    const st = ironPickerState; if (!st || !st.activeCell) return;
    delete st.cells[st.activeCell.r + "," + st.activeCell.c];
    hideIronNamePanel();
    renderIronPickerGrid();
  }
  function saveIronPickerSettings() {
    const st = ironPickerState; if (!st) return;
    const run = (data.ironingRuns || []).find(r => r.id === st.runId);
    if (run) {
      run.namedResults = Object.keys(st.cells).map(key => {
        const [r, c] = key.split(",").map(Number);
        return { row: r, col: c, speed: st.speeds[c], flow: st.flows[r], name: st.cells[key].name };
      });
      persist(); renderFilaments();   // "Iron" button's in-progress (orange) state depends on namedResults
    }
    closeIronPicker();
    if (run && !$("ironResultsModal").hidden) renderIronResultsRun(run);
  }
  function closeIronPicker() {
    $("ironPickerModal").hidden = true;
    hideIronNamePanel();
    ironPickerState = null;
    if (ironPickerResizeHandler) { window.removeEventListener("resize", ironPickerResizeHandler); ironPickerResizeHandler = null; }
  }

  function saveIroningSettings() {
    data.ironingSettings = {
      speedMin: num($("ironSpeedMin").value), speedMax: num($("ironSpeedMax").value), speedPoints: num($("ironSpeedPoints").value),
      speedList: ironSpeedListAuto ? "" : $("ironSpeedList").value,
      flowMin: num($("ironFlowMin").value), flowMax: num($("ironFlowMax").value), flowPoints: num($("ironFlowPoints").value),
      flowList: ironFlowListAuto ? "" : $("ironFlowList").value,
      padDiameter: num($("ironPadDiameter").value), gap: num($("ironGap").value)
    };
    scheduleSave();
  }
  function loadIroningSettings() {
    const s = data.ironingSettings; if (!s) return;
    if (s.speedMin != null) $("ironSpeedMin").value = s.speedMin;
    if (s.speedMax != null) $("ironSpeedMax").value = s.speedMax;
    if (s.speedPoints != null) $("ironSpeedPoints").value = s.speedPoints;
    if (s.speedList) { $("ironSpeedList").value = s.speedList; ironSpeedListAuto = false; }
    if (s.flowMin != null) $("ironFlowMin").value = s.flowMin;
    if (s.flowMax != null) $("ironFlowMax").value = s.flowMax;
    if (s.flowPoints != null) $("ironFlowPoints").value = s.flowPoints;
    if (s.flowList) { $("ironFlowList").value = s.flowList; ironFlowListAuto = false; }
    if (s.padDiameter != null) $("ironPadDiameter").value = s.padDiameter;
    if (s.gap != null) $("ironGap").value = s.gap;
  }

  function rebuildForms() {
    printerForm = buildForm($("printerForm"), PRINTER_FIELDS);
    nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS);
    filamentForm = buildForm($("filamentForm"), FILAMENT_FIELDS);
    initPrinterDefaults(); updateFilamentConditionals();
  }
  function doClear(kind) {
    if (kind === "cancel") { $("debugModal").hidden = true; return; }
    const labels = {
      all: "ALL data — printers, filaments, PA + ironing history and remembered inputs",
      history: "all PA + ironing run history and remembered inputs",
      filaments: "all filaments",
      printers: "all printers (and their nozzles)"
    };
    if (!confirm(`Permanently delete ${labels[kind]}?\n\nThere is no undo.`)) return;
    if (kind === "all") { const theme = data.theme; data = Store.defaultData(); data.theme = theme; }
    else if (kind === "history") { data.runs = []; data.ironingRuns = []; data.customOptions = Store.defaultData().customOptions; }
    else if (kind === "filaments") { data.filaments = []; data.lastFilamentId = null; }
    else if (kind === "printers") { data.printers = []; data.lastPrinterId = null; data.lastInstanceId = null; data.lastNozzleId = null; }
    editingPrinterId = null; editingFilamentId = null; currentRunId = null; currentSettings = null; lastFit = null; clearJobDirty();
    persist(); rebuildForms(); reloadAll();
    $("debugModal").hidden = true;
  }
  function reloadAll() { renderPrinters(); renderNozzles(); renderFilaments(); renderFilamentPrinterPicker(); deriveGeometryFromNozzle(); updateTestContext(); updateIroningContext(); setStatus(); updateTabLabels(); $("themeSel").value = data.theme || "system"; applyTheme(data.theme); }
  // Settings modal: selects always reflect `data` on open (in case Import/Export changed it
  // underneath), and each example line recomputes off a fixed reference moment so switching
  // date/time format or relative-vs-absolute updates the preview live.
  function populateSettingsModal() {
    $("themeSel").value = data.theme || "system";
    $("dateFormatSel").value = data.dateFormat || "YYYY-MM-DD";
    $("timeFormatSel").value = data.timeFormat || "24h";
    $("inProgressStyleSel").value = data.inProgressDateStyle || "relative";
    $("completedStyleSel").value = data.completedDateStyle || "absolute";
    updateSettingsExamples();
  }
  function updateSettingsExamples() {
    const now = new Date();
    $("dateFormatExample").textContent = fmtDate(now, $("dateFormatSel").value);
    $("timeFormatExample").textContent = fmtTime(now, $("timeFormatSel").value);
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
    $("inProgressStyleExample").textContent = $("inProgressStyleSel").value === "relative" ? fmtRelative(threeDaysAgo) : fmtAbsolute(threeDaysAgo);
    $("completedStyleExample").textContent = $("completedStyleSel").value === "relative" ? fmtRelative(threeDaysAgo) : fmtAbsolute(threeDaysAgo);
  }

  function init() {
    applyTheme(data.theme);
    const v = window.PA_VERSION; if (v && $("buildStamp")) $("buildStamp").textContent = "v" + (v.version || v.hash) + " · " + v.date;
    printerForm = buildForm($("printerForm"), PRINTER_FIELDS);
    nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS);
    filamentForm = buildForm($("filamentForm"), FILAMENT_FIELDS);
    initPrinterDefaults(); updateFilamentConditionals();
    $("basicMethod").value = P.basicDefault;
    $("flowPoints").value = 5; $("accelPoints").value = 5;   // deterministic defaults (defeat browser form-restore)
    $("unitMode").value = "speed";                            // default display = nozzle velocity (how Orca's PA dialog is configured)
    $("ironSpeedMin").value = 10; $("ironSpeedMax").value = 100; $("ironSpeedPoints").value = 10;
    $("ironFlowMin").value = 10; $("ironFlowMax").value = 100; $("ironFlowPoints").value = 10;
    $("ironPadDiameter").value = window.PAIroning.CONST.padDiameter; $("ironGap").value = window.PAIroning.CONST.gap;
    document.querySelectorAll("input, select").forEach(e => e.setAttribute("autocomplete", "off"));
    updateUnitUI(); reloadAll(); resetMaxFlowForCombo();   // prefill+gate max flow for any pre-selected combo
    $("printerForm").addEventListener("change", (e) => {
      const f = e.target.closest(".field"); if (!f) return;
      if (f.dataset.key === "maker") { applyModelOptions(); applyPrinterDefaults(); autofillBed(); }
      else if (f.dataset.key === "model") { applyPrinterDefaults(); autofillBed(); }
      else if (f.dataset.key === "bedShape") { updatePrinterConditionals(); }
    });
    $("filamentForm").addEventListener("change", () => updateFilamentConditionals());
    $("filamentRestrict").addEventListener("change", () => { const on = $("filamentRestrict").checked; if (on) renderFilamentPrinterPicker(); $("filamentPrinters").hidden = !on; });
    $("filamentViewToggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (!b) return; data.filamentView = b.dataset.view; persist(); renderFilaments(); });
    $("filamentScope").addEventListener("change", () => { data.filamentScope = $("filamentScope").value; persist(); renderFilaments(); });

    document.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    switchTab("printers");

    // Ironing Test tab: min/max/points regenerate the list ONLY while it's still auto (same idiom
    // as PA Test's accel/speed lists) — once you type your own list, tweaking min/max/points here
    // no longer clobbers it.
    ["ironSpeedMin", "ironSpeedMax", "ironSpeedPoints"].forEach(id => $(id).addEventListener("input", refreshIroning));
    ["ironFlowMin", "ironFlowMax", "ironFlowPoints"].forEach(id => $(id).addEventListener("input", refreshIroning));
    $("ironSpeedList").addEventListener("input", () => { ironSpeedListAuto = false; updateIroningPlan(); saveIroningSettings(); });
    $("ironFlowList").addEventListener("input", () => { ironFlowListAuto = false; updateIroningPlan(); saveIroningSettings(); });
    ["ironPadDiameter", "ironGap"].forEach(id => $(id).addEventListener("input", () => refreshIroning()));
    $("ironingDownloadBtn").addEventListener("click", downloadIroning3mf);
    $("ironingSaveBtn").addEventListener("click", saveIroningRun);
    $("ironAbandonBtn").addEventListener("click", () => {
      const r = findIncompleteIroningRun(data.lastPrinterId, data.lastNozzleId, data.lastFilamentId);
      if (r) deleteIroningRun(r.id);
    });

    $("themeSel").addEventListener("change", () => { data.theme = $("themeSel").value; applyTheme(data.theme); persist(); });
    $("printerMulti").addEventListener("change", () => { $("instancesWrap").hidden = !$("printerMulti").checked; });
    $("savePrinterBtn").addEventListener("click", savePrinter);
    $("cancelPrinterBtn").addEventListener("click", () => { resetPrinterForm(); renderPrinters(); });
    $("saveNozzleBtn").addEventListener("click", saveNozzle);
    $("saveFilamentBtn").addEventListener("click", saveFilament);
    $("cancelFilamentBtn").addEventListener("click", () => { resetFilamentForm(); renderFilaments(); });

    $("testMode").addEventListener("change", applyMode);
    $("basicMethod").addEventListener("change", () => { if (!$("basicMethod").disabled) lastBasicMethod = $("basicMethod").value; updateModeHint(); });
    $("unitMode").addEventListener("change", updateUnitUI);
    // "Display speed as" — switching converts the current numbers between nozzle velocity and flow
    [...document.getElementsByName("recUnit")].forEach(r => r.addEventListener("change", () => {
      if (!r.checked || r.value === $("unitMode").value) return;
      const cf = convFactor();
      $("unitMode").value = r.value;
      updateUnitUI();
      const conv = (v) => unitIsSpeed() ? v / cf : v * cf;   // flow→speed = /cf, speed→flow = ·cf
      if (speedListAuto) { regenAxis(); }
      else {
        $("speedList").value = parseList($("speedList").value).map(v => axisRnd(conv(v))).join(", ");
        const mx = axisMaxVal(); $("axisMax").value = (mx == null) ? "" : axisRnd(mx);
      }
    }));
    [...document.getElementsByName("pvUnit")].forEach(r => r.addEventListener("change", () => { if (r.checked) { $("unitMode").value = r.value; updateUnitUI(); } }));
    $("recommendBtn").addEventListener("click", recommend);
    // if the user types their own accel list, stop auto-rescaling it to the printer max;
    // keep the "Accel points" count in sync with what they typed
    $("accelList").addEventListener("input", () => {
      const has = !!$("accelList").value.trim();
      accelListAuto = !has;
      if (has) { const c = parseList($("accelList").value).filter(a => a >= 100).length; if (c) $("accelPoints").value = c; }
    });
    // "Accel points" drives how many accel values we auto-space from 1000 → printer max.
    // Regenerate live (input) as you bump the field, and clamp on change/blur.
    const regenAccels = () => { accelListAuto = true; $("accelList").value = logAccels(accelFloor(),num($("accelLimit").value) || 12000, accelPtsN()).join(", "); };
    $("accelPoints").addEventListener("input", () => { accelPtsAuto = false; regenAccels(); });   // user owns the count now
    $("accelPoints").addEventListener("change", () => { accelPtsAuto = false; $("accelPoints").value = accelPtsN(); regenAccels(); });
    $("recommendOut").addEventListener("click", (e) => {
      const b = e.target.closest("[data-copy]"); if (!b) return;
      const val = b.getAttribute("data-copy");
      if (navigator.clipboard) navigator.clipboard.writeText(val);
      b.classList.add("copied"); setTimeout(() => b.classList.remove("copied"), 1300);
    });
    document.querySelectorAll(".subtab-btn").forEach(b => b.addEventListener("click", () => switchSubtab(b.dataset.subtab)));
    switchSubtab("recommend");
    $("pvLoadBtn").addEventListener("click", provideLoad);
    $("importGcodeBtn").addEventListener("click", () => { if (gcodeImported) resetGcode(); else $("gcodeInput").click(); });
    $("gcodeInput").addEventListener("change", (e) => { if (e.target.files[0]) importGcode(e.target.files[0]); });
    // multi-plate import + coverage
    $("importAddBtn").addEventListener("click", () => $("gcodeInputAdd").click());
    $("gcodeInputAdd").addEventListener("change", (e) => { if (e.target.files[0]) addPlate(e.target.files[0]); });
    $("coverageComplete").addEventListener("click", completeMatrix);
    $("coverageImport").addEventListener("click", () => { $("coverageModal").hidden = true; $("gcodeInputAdd").click(); });
    $("coverageContinue").addEventListener("click", () => { $("coverageModal").hidden = true; });
    window.PA_parseGcode = parsePaGcode;
    window.PA_test = { importGcode, addPlate, resetGcode, buildPaBlocks, colorList, colorFill, suggestAccelPts, suggestSpeedPts, beadArea, selectFilament, savePlanned, loadGrid, backfillSinglePaResults, instanceLabel };   // test hooks (jsdom smoke)
    $("loadPointsBtn").addEventListener("click", (e) => { loadGrid(e.target._points || []); sortResults(); markJobDirty(); });
    $("resultSort").addEventListener("change", sortResults);
    $("savePlannedBtn").addEventListener("click", savePlanned);
    $("resultsClone").addEventListener("click", () => { if (resultsRunId) cloneFromRun(resultsRunId); });
    $("resultsDelete").addEventListener("click", () => { if (resultsRunId) deleteRunById(resultsRunId); });
    $("resultsClose").addEventListener("click", closeResults);
    $("resultsPick").addEventListener("change", (e) => { const r = data.runs.find(x => x.id === e.target.value); if (r) renderResultsRun(r); });
    $("ironResultsClone").addEventListener("click", () => { if (ironResultsRunId) cloneFromIroningRun(ironResultsRunId); });
    $("ironResultsDelete").addEventListener("click", () => { if (ironResultsRunId) deleteIroningRun(ironResultsRunId); });
    $("ironResultsClose").addEventListener("click", closeIronResults);
    $("ironResultsPick").addEventListener("change", (e) => { const r = (data.ironingRuns || []).find(x => x.id === e.target.value); if (r) renderIronResultsRun(r); });
    $("ironResultsBodyView").addEventListener("click", (e) => {
      const b = e.target.closest("[data-iron-picker-open]"); if (!b) return;
      openIronPicker(b.getAttribute("data-iron-picker-open"));
    });
    $("ironPickerGrid").addEventListener("click", (e) => {
      const b = e.target.closest(".ironcell"); if (!b) return;
      onIronCellClick(Number(b.getAttribute("data-r")), Number(b.getAttribute("data-c")), b);
    });
    $("ironNameSave").addEventListener("click", commitIronCellName);
    $("ironNameRemove").addEventListener("click", removeIronCellName);
    $("ironNameCancel").addEventListener("click", hideIronNamePanel);
    [...document.getElementsByName("ironNameChoice")].forEach(rb => rb.addEventListener("change", () => {
      const other = document.querySelector('input[name="ironNameChoice"][value="Other"]');
      $("ironNameOtherText").disabled = !(other && other.checked);
    }));
    $("ironPickerSave").addEventListener("click", saveIronPickerSettings);
    $("ironPickerClose").addEventListener("click", closeIronPicker);
    $("resultsBodyView").addEventListener("click", (e) => {
      const b = e.target.closest("[data-copy]"); if (!b) return;
      if (navigator.clipboard) navigator.clipboard.writeText(b.getAttribute("data-copy"));
      b.classList.add("copied"); setTimeout(() => b.classList.remove("copied"), 1300);
    });
    // Unsaved-job guards: mark dirty on edits, prompt on modal close. PA and Ironing each have
    // their own dirty flag (jobDirty / ironDirty), but share one guard modal — jobGuardSave/
    // Abandon/Cancel dispatch on pendingModal ("pa" | "iron") to resolve whichever is open.
    $("resultsBody").addEventListener("input", markJobDirty);
    if ($("basicBestPA")) $("basicBestPA").addEventListener("input", markJobDirty);
    ["ironSpeedMin", "ironSpeedMax", "ironSpeedPoints", "ironSpeedList", "ironFlowMin", "ironFlowMax", "ironFlowPoints", "ironFlowList", "ironPadDiameter", "ironGap"].forEach(id => $(id).addEventListener("input", markIronDirty));
    $("jobGuardSave").addEventListener("click", () => {
      const m = pendingModal; pendingModal = null;
      if (m === "iron") saveIroningRun(); else savePlanned();
      $("jobGuardModal").hidden = true;
    });
    $("jobGuardAbandon").addEventListener("click", () => {
      const m = pendingModal; pendingModal = null;
      if (m === "iron") {
        // Same "not recoverable, delete outright" treatment as PA's abandon, below.
        const r = findIncompleteIroningRun(data.lastPrinterId, data.lastNozzleId, data.lastFilamentId);
        if (r) { data.ironingRuns = (data.ironingRuns || []).filter(x => x.id !== r.id); }
        clearIronDirty(); persist(); renderFilaments(); updateIroningContext();
        $("jobGuardModal").hidden = true; $("tab-ironing").hidden = true;
      } else {
        abandonPaRun(true);   // choosing Abandon here was already the confirmation
        $("jobGuardModal").hidden = true;
      }
    });
    $("jobGuardCancel").addEventListener("click", () => { $("jobGuardModal").hidden = true; pendingModal = null; });
    $("abandonRunBtn").addEventListener("click", () => abandonPaRun());
    window.addEventListener("beforeunload", (e) => { if (jobDirty || ironDirty) { e.preventDefault(); e.returnValue = ""; } });
    // Cross-tab sync: if PA-Helper is open in another tab and it saves, pick up the change here so
    // this tab can't later export a stale in-memory copy. Skip while mid-edit so we don't clobber work.
    window.addEventListener("storage", (e) => {
      if (e.key !== Store.key || !e.newValue || jobDirty || ironDirty) return;
      data = Store.load(); migrateFormulationNames(data); backfillSinglePaResults(data); rebuildForms(); reloadAll();
    });
    // Auto-seeded default nozzle prompt (after saving a new printer)
    $("nozzleSeedOk").addEventListener("click", () => { $("nozzleSeedModal").hidden = true; });
    $("runInProgressOk").addEventListener("click", () => { $("runInProgressModal").hidden = true; });
    $("nozzleSeedReplace").addEventListener("click", () => {
      const p = getPrinter(data.lastPrinterId);
      if (p) { p.nozzles = []; data.lastNozzleId = null; persist(); renderNozzles(); deriveGeometryFromNozzle(); updateTestContext(); updateIroningContext(); }
      $("nozzleSeedModal").hidden = true; $("nozzleAdd").open = true;
      if ($("nozzleAdd").scrollIntoView) $("nozzleAdd").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("flowPoints").addEventListener("input", () => { speedPtsAuto = false; regenAxis(); });   // user owns the count now
    $("flowPoints").addEventListener("change", () => { speedPtsAuto = false; let n = Math.round(num($("flowPoints").value)); if (!(n >= 2)) n = 5; $("flowPoints").value = n; regenAxis(); });
    // max speed is back-calculated from max volumetric flow + geometry; both refresh the axis.
    // While the count is still auto, a new max flow also re-suggests how many speed points to use.
    $("maxFlow").addEventListener("input", () => { const mf = num($("maxFlow").value); if (speedPtsAuto && mf != null) $("flowPoints").value = suggestSpeedPts(mf); regenAxis(); maxFlowConfirmed = false; gateMaxFlow(); });
    $("maxFlowConfirm").addEventListener("click", confirmMaxFlow);
    $("layerH").addEventListener("input", regenAxis);
    // if the user types their own speed/flow list, stop auto-generating it; sync the point count
    $("speedList").addEventListener("input", () => {
      const has = !!$("speedList").value.trim();
      speedListAuto = !has;
      if (has) { const c = parseList($("speedList").value).filter(v => v > 0).length; if (c >= 2) $("flowPoints").value = c; }
      else regenAxis();
    });
    $("addRowBtn").addEventListener("click", () => addRow());
    $("analyzeBtn").addEventListener("click", analyze);
    $("exportBtnModel").addEventListener("click", exportModel);
    $("copyModelBtn").addEventListener("click", () => { navigator.clipboard && navigator.clipboard.writeText($("modelOut").value); });
    $("singlePaOut").addEventListener("click", (e) => {
      const b = e.target.closest("[data-copy]"); if (!b) return;
      if (navigator.clipboard) navigator.clipboard.writeText(b.getAttribute("data-copy"));
      b.classList.add("copied"); setTimeout(() => b.classList.remove("copied"), 1300);
    });
    $("saveRunBtn").addEventListener("click", saveRun);

    $("patternOk").addEventListener("click", () => { if (!patternReadonly && patternTr && patternSel != null) { const inp = patternTr.querySelector('input[data-key="bestPA"]'); inp.value = patternSel; inp.dispatchEvent(new window.Event("input", { bubbles: true })); } $("patternModal").hidden = true; });
    $("patternCancel").addEventListener("click", () => { $("patternModal").hidden = true; });
    $("patternModal").addEventListener("click", (e) => { if (e.target === $("patternModal")) $("patternModal").hidden = true; });
    $("paModalClose").addEventListener("click", closePaModal);
    $("tab-test").addEventListener("click", (e) => { if (e.target === $("tab-test")) closePaModal(); });
    $("ironModalClose").addEventListener("click", closeIronModal);
    $("tab-ironing").addEventListener("click", (e) => { if (e.target === $("tab-ironing")) closeIronModal(); });
    $("debugClearBtn").addEventListener("click", () => { $("debugModal").hidden = false; });
    $("debugModal").addEventListener("click", (e) => { if (e.target === $("debugModal")) $("debugModal").hidden = true; });
    $("debugModal").querySelectorAll("button[data-clear]").forEach(b => b.addEventListener("click", () => doClear(b.dataset.clear)));
    $("settingsBtn").innerHTML = GEAR_SVG;
    $("settingsBtn").addEventListener("click", () => { populateSettingsModal(); $("settingsModal").hidden = false; });
    $("settingsCloseBtn").addEventListener("click", () => { $("settingsModal").hidden = true; });
    $("settingsModal").addEventListener("click", (e) => { if (e.target === $("settingsModal")) $("settingsModal").hidden = true; });
    ["dateFormatSel", "timeFormatSel", "inProgressStyleSel", "completedStyleSel"].forEach(id => {
      $(id).addEventListener("change", () => {
        data.dateFormat = $("dateFormatSel").value;
        data.timeFormat = $("timeFormatSel").value;
        data.inProgressDateStyle = $("inProgressStyleSel").value;
        data.completedDateStyle = $("completedStyleSel").value;
        persist();
        updateSettingsExamples();
      });
    });
    $("exportBtn").addEventListener("click", () => {
      persist();
      data.lastExportedAt = Store.exportJSON(data);   // stamp when we last wrote a file
      Store.save(data);   // save directly (don't re-bump lastModifiedAt past the export time)
      setStatus();
    });
    $("importBtn").addEventListener("click", () => $("importInput").click());
    $("importInput").addEventListener("change", async (e) => { if (e.target.files[0]) { data = await Store.importJSON(e.target.files[0]); migrateFormulationNames(data); backfillSinglePaResults(data); printerForm = buildForm($("printerForm"), PRINTER_FIELDS); nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS); filamentForm = buildForm($("filamentForm"), FILAMENT_FIELDS); initPrinterDefaults(); updateFilamentConditionals(); reloadAll(); } });
    $("connectFileBtn").addEventListener("click", async () => {
      try {
        if (!Store.supportsFS()) { alert("Your browser can't open a file directly (need Chrome/Edge/Brave on https or localhost). Use Import/Export instead."); return; }
        const open = confirm("OK = open an existing pa_data.json.\nCancel = create a new one.");
        const loaded = await Store.connectFile(open);
        if (loaded) { data = loaded; migrateFormulationNames(data); backfillSinglePaResults(data); printerForm = buildForm($("printerForm"), PRINTER_FIELDS); nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS); filamentForm = buildForm($("filamentForm"), FILAMENT_FIELDS); initPrinterDefaults(); updateFilamentConditionals(); reloadAll(); } else { persist(); }
        setStatus();
      } catch (err) { /* cancelled */ }
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
