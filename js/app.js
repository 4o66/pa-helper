/* PA-Helper — app.js  (AGPLv3)  All logic client-side; no network, no AI. */
(function () {
  "use strict";
  const P = window.PA_PRESETS, Store = window.PAStore;
  let data = Store.load();

  const $ = (id) => document.getElementById(id);
  const el = (t, cls) => { const e = document.createElement(t); if (cls) e.className = cls; return e; };
  const svgEl = (t) => document.createElementNS("http://www.w3.org/2000/svg", t);
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const parseList = (s) => (s || "").split(",").map(x => num(x)).filter(x => x != null);
  const today = () => new Date().toISOString().slice(0, 10);
  function linspace(a, b, n) { if (n < 2) return [a]; const out = []; for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1)); return out; }
  const PALETTE = ["#4aa8ff", "#37c98b", "#ffb84a", "#c98bff", "#5de0e6", "#ff8f5d", "#8bff9e"];

  // ---- session state ----
  let currentSettings = null, lastFit = null, currentRunId = null, editingPrinterId = null, editingFilamentId = null, lastBasicMethod = P.basicDefault, gcodeImported = false, gcodeBlocks = null, jobDirty = false, pendingTab = null, importPlates = [], coverageMissing = [], accelListAuto = true;
  const PA_FACTORS = ["toolhead", "extruder", "drive", "hotend"];
  const FILAMENT_PA_FACTORS = ["material", "formulation", "fiber", "fiberName", "fiberPct", "hardness", "diameter"];

  // ---- persistence ----
  let saveTimer = null;
  function persist() { Store.save(data); }
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
  const COLORS = P.colorDict || {};
  const COLOR_KEYS = Object.keys(COLORS).sort((a, b) => b.length - a.length);
  function colorHex(name) { if (!name) return null; const s = String(name).toLowerCase(); for (const k of COLOR_KEYS) if (s.includes(k)) return COLORS[k]; return null; }
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
  const filamentLabel = (f) => f ? [f.maker, f.material, fiberTag(f), f.hardness, formText(f), f.color].filter(Boolean).join(" ") || "(unnamed filament)" : "?";
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
  function applyTab(name) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.id === "tab-" + name));
  }
  function switchTab(name) {
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
    // Guard: an unsaved PA test in progress — prompt to save-in-progress or abandon before leaving.
    if (jobDirty && name !== "test") { pendingTab = name; $("jobGuardModal").hidden = false; return; }
    applyTab(name);
  }
  function switchSubtab(name) {
    document.querySelectorAll(".subtab-btn").forEach(b => b.classList.toggle("active", b.dataset.subtab === name));
    document.querySelectorAll(".subtab").forEach(s => s.classList.toggle("active", s.id === "subtab-" + name));
    if (name === "printed") prefillProvide();
  }
  function updateTabLabels() {
    const p = getPrinter(data.lastPrinterId), n = getSelectedNozzle(), f = getFilament(data.lastFilamentId);
    const tp = $("tabSelPrinter"), tf = $("tabSelFilament");
    if (tp) tp.textContent = p ? (printerLabel(p) + (n ? " · " + nozzleLabel(n) : "")) : "Not selected";
    if (tf) tf.textContent = f ? filamentLabel(f) : "Not selected";
  }

  /* =================== PRINTERS TAB =================== */
  function renderPrinters() {
    const wrap = $("printerList"); wrap.innerHTML = "";
    if (!data.printers.length) { wrap.innerHTML = '<p class="hint">No printers yet — add one below.</p>'; return; }
    data.printers.forEach(p => {
      const card = el("div", "card" + (p.id === data.lastPrinterId ? " selected" : ""));
      const title = el("div", "title");
      const dom = (bedEntry(p.maker) || {}).domain;   // maker favicon, hotlinked live (never stored)
      if (dom) { const fav = el("img", "favicon"); fav.src = "https://" + dom + "/favicon.ico"; fav.alt = ""; fav.setAttribute("loading", "lazy"); fav.addEventListener("error", () => fav.remove()); title.append(fav); }
      title.append(document.createTextNode(printerLabel(p)));
      card.append(title);
      const meta = el("div", "meta");
      meta.innerHTML = `${p.toolhead || "—"} · ${p.extruder || "—"} (${p.drive || "?"}) · ${p.hotend || "—"}`;
      card.append(meta);
      if (p.multi && p.instances && p.instances.length) {
        const sel = el("select");
        p.instances.forEach(inst => { const o = el("option"); o.value = inst.id; o.textContent = inst.label; sel.append(o); });
        if (p.id === data.lastPrinterId && data.lastInstanceId) sel.value = data.lastInstanceId;
        sel.addEventListener("change", () => { data.lastInstanceId = sel.value; persist(); updateTestContext(); });
        const iw = el("div", "meta"); iw.append(document.createTextNode("Unit: ")); iw.append(sel); card.append(iw);
      }
      const actions = el("div", "actions");
      const selBtn = el("button"); selBtn.textContent = p.id === data.lastPrinterId ? "Selected ✓" : "Select";
      selBtn.addEventListener("click", () => selectPrinter(p.id));
      const edit = el("button", "secondary"); edit.textContent = "Edit"; edit.addEventListener("click", () => editPrinter(p.id));
      const clone = el("button", "secondary"); clone.textContent = "Clone"; clone.addEventListener("click", () => clonePrinter(p.id));
      const rm = el("button", "danger"); rm.textContent = "Remove";
      rm.addEventListener("click", () => removePrinter(p.id));
      actions.append(selBtn, edit, clone, rm); card.append(actions);
      wrap.append(card);
    });
  }
  function selectPrinter(id) {
    data.lastPrinterId = id;
    const p = getPrinter(id);
    data.lastInstanceId = (p && p.multi && p.instances && p.instances.length) ? p.instances[0].id : null;
    if (!(p && p.nozzles && p.nozzles.some(n => n.id === data.lastNozzleId))) data.lastNozzleId = (p && p.nozzles && p.nozzles.length) ? p.nozzles[0].id : null;
    persist(); renderPrinters(); renderNozzles(); renderFilaments(); deriveGeometryFromNozzle(); updateTestContext(); updateTabLabels();
  }
  function removePrinter(id) {
    const p = getPrinter(id); if (!p) return;
    if (!confirm(`Remove printer "${printerLabel(p)}"? This cannot be undone.`)) return;
    data.printers = data.printers.filter(x => x.id !== id);
    // remove this printer from any filament pin lists; empty list = unrestricted again
    data.filaments.forEach(f => { if (Array.isArray(f.printers) && f.printers.length) f.printers = f.printers.filter(x => x !== id); });
    if (data.lastPrinterId === id) { data.lastPrinterId = null; data.lastInstanceId = null; data.lastNozzleId = null; }
    if (editingPrinterId === id) resetPrinterForm();
    persist(); renderPrinters(); renderNozzles(); renderFilaments(); renderFilamentPrinterPicker(); updateTestContext(); updateTabLabels();
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
      const sel = el("button"); sel.textContent = n.id === data.lastNozzleId ? "Selected ✓" : "Select";
      sel.addEventListener("click", () => selectNozzle(n.id));
      const rm = el("button", "danger"); rm.textContent = "Remove";
      rm.addEventListener("click", () => removeNozzle(n.id));
      actions.append(sel, rm); card.append(actions); list.append(card);
    });
  }
  function selectNozzle(id) { data.lastNozzleId = id; persist(); renderNozzles(); deriveGeometryFromNozzle(); updateTestContext(); updateTabLabels(); }
  function removeNozzle(id) {
    const p = getPrinter(data.lastPrinterId); if (!p) return;
    const n = (p.nozzles || []).find(x => x.id === id); if (!n) return;
    if (!confirm(`Remove nozzle "${nozzleLabel(n)}"? This cannot be undone.`)) return;
    p.nozzles = p.nozzles.filter(x => x.id !== id);
    if (data.lastNozzleId === id) data.lastNozzleId = p.nozzles[0] ? p.nozzles[0].id : null;
    persist(); renderNozzles(); deriveGeometryFromNozzle(); updateTestContext(); updateTabLabels();
  }
  function saveNozzle() {
    const p = getPrinter(data.lastPrinterId); if (!p) { alert("Select a printer first."); return; }
    const v = readForm(nozzleForm);
    const nz = { id: Store.uid(), maker: v.maker, model: v.model, diameter: v.diameter, material: v.material };
    p.nozzles = p.nozzles || []; p.nozzles.push(nz);
    rememberCustoms(nozzleForm); data.lastNozzleId = nz.id; persist();
    $("nozzleAdd").open = false; nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS);
    renderNozzles(); deriveGeometryFromNozzle(); updateTestContext(); updateTabLabels();
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
      resetPrinterForm(); renderPrinters(); renderNozzles(); renderFilamentPrinterPicker(); updateTestContext(); updateTabLabels();
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
  function renderInProgress() {
    const wrap = $("inProgressWrap"), list = $("inProgressList"); list.innerHTML = "";
    const planned = data.runs.filter(r => r.status === "planned");
    wrap.hidden = planned.length === 0;
    planned.forEach(r => {
      const f = getFilament(r.filamentId), p = getPrinter(r.printerId);
      const card = el("div", "card pin");
      const title = el("div", "title"); title.innerHTML = '<span class="badge warn">planned</span>' + filamentLabel(f); card.append(title);
      const meta = el("div", "meta"); meta.textContent = `${printerLabel(p)} · ${r.mode}${r.basicMethod ? " (" + r.basicMethod + ")" : ""} · ${r.date}`; card.append(meta);
      const actions = el("div", "actions");
      const res = el("button"); res.textContent = "Resume"; res.addEventListener("click", () => resumeRun(r.id));
      const ab = el("button", "danger"); ab.textContent = "Abandon"; ab.addEventListener("click", () => abandonRun(r.id));
      actions.append(res, ab); card.append(actions);
      list.append(card);
    });
  }
  function abandonRun(id) {
    const r = data.runs.find(x => x.id === id); if (!r) return;
    if (!confirm("Abandon this run? The filament stays; only this unfinished run is set aside.")) return;
    r.status = "abandoned"; if (currentRunId === id) { currentRunId = null; clearJobDirty(); }
    if (data.gcodeCache) delete data.gcodeCache[id];
    persist(); renderInProgress();
  }
  const FACETS = [["maker", "Maker"], ["material", "Material"], ["formulation", "Formulation"], ["color", "Color"]];
  let filamentFilters = { maker: "", material: "", formulation: "", color: "" };
  const facetValues = (f, key) => key === "formulation" ? formList(f) : (f[key] ? [f[key]] : []);

  function filActions(f) {
    const actions = el("div", "actions");
    const selBtn = el("button"); selBtn.textContent = f.id === data.lastFilamentId ? "Selected ✓" : "Select";
    selBtn.addEventListener("click", () => selectFilament(f.id));
    const edit = el("button", "secondary"); edit.textContent = "Edit"; edit.addEventListener("click", () => editFilament(f.id));
    const clone = el("button", "secondary"); clone.textContent = "Clone"; clone.addEventListener("click", () => cloneFilament(f.id));
    const rm = el("button", "danger"); rm.textContent = "Remove";
    rm.addEventListener("click", () => removeFilament(f.id));
    actions.append(selBtn, edit, clone, rm); return actions;
  }
  function pinIcon() { const s = el("span", "pin-ic"); s.textContent = "📌"; s.title = "Restricted to specific printer(s)"; return s; }
  function filMeta(f) { const done = data.runs.filter(r => r.filamentId === f.id && r.status === "complete").length; return `${f.diameter || "?"} mm · ${done} completed run${done === 1 ? "" : "s"}`; }

  function filamentCard(f) {
    const card = el("div", "card fcard" + (f.id === data.lastFilamentId ? " selected" : ""));
    const band = el("div", "colorband"); const hex = colorHex(f.color); if (hex) band.style.background = hex; else band.classList.add("nocolor"); card.append(band);
    const title = el("div", "title"); title.textContent = filamentLabel(f); if (isRestricted(f)) title.prepend(pinIcon()); card.append(title);
    const meta = el("div", "meta"); meta.textContent = filMeta(f); card.append(meta);
    card.append(filActions(f)); return card;
  }
  function filamentRow(f) {
    const row = el("div", "frow" + (f.id === data.lastFilamentId ? " selected" : ""));
    const sq = el("span", "colorsq"); const hex = colorHex(f.color); if (hex) sq.style.background = hex; else sq.classList.add("nocolor"); row.append(sq);
    const name = el("span", "fname"); name.textContent = filamentLabel(f); if (isRestricted(f)) name.prepend(pinIcon()); row.append(name);
    row.append(filActions(f)); return row;
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
  function renderCompletedRuns() {
    const wrap = $("completedWrap"), list = $("completedList");
    if (!wrap) return;
    const done = data.runs.filter(r => r.status === "complete");
    wrap.hidden = done.length === 0; list.innerHTML = "";
    done.slice(0, 30).forEach(r => {
      const f = getFilament(r.filamentId), p = getPrinter(r.printerId);
      const card = el("div", "card");
      const title = el("div", "title"); title.textContent = filamentLabel(f); card.append(title);
      const meta = el("div", "meta"); meta.textContent = `${printerLabel(p)} · ${r.date} · ${r.results.length} pts`; card.append(meta);
      const actions = el("div", "actions"); const op = el("button"); op.textContent = "Open"; op.addEventListener("click", () => resumeRun(r.id)); actions.append(op); card.append(actions);
      list.append(card);
    });
  }
  function renderFilaments() {
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
  function selectFilament(id) { data.lastFilamentId = id; persist(); renderFilaments(); updateTestContext(); updateTabLabels(); }
  function removeFilament(id) {
    const f = getFilament(id); if (!f) return;
    if (!confirm(`Remove filament "${filamentLabel(f)}"? This cannot be undone.`)) return;
    data.filaments = data.filaments.filter(x => x.id !== id);
    if (data.lastFilamentId === id) data.lastFilamentId = null;
    if (editingFilamentId === id) resetFilamentForm();
    persist(); renderFilaments(); updateTestContext(); updateTabLabels();
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
      rememberCustoms(filamentForm); persist();
      resetFilamentForm(); renderFilaments(); updateTestContext(); updateTabLabels();
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
  const convFactor = () => (num($("layerH").value) || 0.2) * (num($("lineW").value) || 0.45);
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
    const inst = (p.multi && data.lastInstanceId) ? " · unit " + data.lastInstanceId : "";
    const mx = num(p.maxAccel) || 12000;
    $("accelLimit").value = mx;
    // Re-scale the suggested accel sweep to THIS printer's max (unless the user typed their own).
    if (accelListAuto) $("accelList").value = logAccels(1000, mx, 5).join(", ");
    ctx.innerHTML = `<b>${printerLabel(p)}</b>${inst}<br><span class="muted">${p.toolhead || "—"} · ${p.extruder || "—"} (${p.drive || "?"}) · ${p.hotend || "—"} · max accel ${mx} mm/s²</span><br>Nozzle: <b>${nozzleLabel(n)}</b><br>Filament: <b>${filamentLabel(f)}</b>`;
    $("testBody").hidden = false;
    // Max volumetric speed comes from a separate flow-rate calibration; pre-fill from the
    // last run for this exact printer+nozzle+filament, else prompt the user to enter it.
    const prior = lastMaxFlowFor(data.lastPrinterId, data.lastNozzleId, data.lastFilamentId);
    const fh = $("flowHint");
    if (prior != null) {
      if (!num($("maxFlow").value)) $("maxFlow").value = prior;
      if (fh) fh.textContent = `Last max volumetric speed for this printer/nozzle/filament: ${prior} mm³/s. Change it if your flow calibration differs.`;
    } else if (fh) {
      fh.textContent = "Enter your max volumetric speed (mm³/s) from the results of your Max Flowrate test (in Orca) for this printer/nozzle/filament.";
    }
    applyMode();
  }
  function applyMode() {
    const basic = isBasic();
    $("tab-test").dataset.mode = basic ? "basic" : "advanced";
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
    const nFlow = Math.max(2, Math.round(num($("flowPoints").value) || 5));
    let accelMax = num($("accelLimit").value);
    if (!accelMax || accelMax < 500) { accelMax = 12000; $("accelLimit").value = accelMax; }   // guard: accel, not PA
    let accels = parseList($("accelList").value).filter(a => a >= 100);                          // drop stray PA-scale values
    if (!accels.length) accels = logAccels(1000, accelMax, 5);
    $("accelList").value = accels.join(", ");
    const cf = convFactor();
    const flowsMm3 = linspace(P.adaptive.minFlow, maxFlow, nFlow);
    const speeds = flowsMm3.map(f => Math.round(f / cf));                 // mm/s — what Orca's dialog wants
    const flowPts = flowsMm3.map(f => Math.round(f * 100) / 100);         // results table is always in flow (mm³/s)
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const cp = (val) => ` <button class="copybtn" data-copy="${esc(val)}" title="Copy to clipboard" aria-label="Copy to clipboard">⧉</button>`;
    $("recommendOut").innerHTML =
`Material: ${esc(mat || "(pick)")}   Drive: ${esc(drive)}   Method: pattern

Paste into Orca's Pressure Advance (PA Pattern) test:
  Start PA ${start.toFixed(dp)}   End PA ${end.toFixed(dp)}   PA step ${step.toFixed(dp)}
  Accelerations:  ${accels.join(", ")}${cp(accels.join(","))}
  Speeds (mm/s):  ${speeds.join(", ")}${cp(speeds.join(","))}

Speeds are your ${flowsMm3.map(f => Math.round(f)).join(", ")} mm³/s test flows at ${num($("layerH").value) || 0.2}×${num($("lineW").value) || 0.45} mm geometry.
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
  function addRow(r, override) {
    r = r || { flow: "", accel: "", bestPA: "", notes: "" };
    override = override == null ? true : override;
    const tr = el("tr");
    if (r.speed != null) tr.dataset.speed = r.speed;   // commanded speed → locate its g-code block
    const tdOv = el("td"); const ov = el("input"); ov.type = "checkbox"; ov.className = "ovchk"; ov.checked = !!override; tdOv.append(ov);
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
    const applyLock = () => { inputs.flow.disabled = !ov.checked; inputs.accel.disabled = !ov.checked; };
    ov.addEventListener("change", applyLock); applyLock();
    // pattern picker button in the Best PA cell (cells[2])
    cells[2].classList.add("pacell");
    const patBtn = el("button", "secondary iconbtn"); patBtn.type = "button"; patBtn.textContent = "▤";
    patBtn.title = "Pick best PA from the printed pattern"; patBtn.addEventListener("click", () => openPattern(tr));
    cells[2].append(patBtn);
    const tdDel = el("td"); const del = el("button", "secondary"); del.textContent = "✕"; del.style.padding = ".2rem .5rem";
    del.addEventListener("click", () => tr.remove()); tdDel.append(del);
    tr.append(tdOv, ...cells, tdDel); $("resultsBody").append(tr);
  }
  const loadGrid = (rows) => { $("resultsBody").innerHTML = ""; rows.forEach(r => addRow(r, r.override === true)); };
  function readResults() {
    return [...$("resultsBody").querySelectorAll("tr")].map(tr => {
      const g = (k) => tr.querySelector(`input[data-key="${k}"]`).value;
      const ov = tr.querySelector("input.ovchk");
      return { x: num(g("flow")), accel: num(g("accel")), bestPA: num(g("bestPA")), notes: g("notes"), override: ov ? ov.checked : true, speed: tr.dataset.speed != null ? num(tr.dataset.speed) : null, tr };
    });
  }
  // ---- pattern picker ----
  let patternTr = null, patternSel = null;
  // strip parsed blocks down to just the line coords the picker draws, so they can be
  // cached in pa_data.json and survive a reload/resume (memory-only gcodeBlocks is lost).
  function compactBlocks(gb) {
    if (!gb || !gb.byKey) return null;
    const c = s => ({ x1: +s.x1.toFixed(1), y1: +s.y1.toFixed(1), x2: +s.x2.toFixed(1), y2: +s.y2.toFixed(1) });
    const out = { byKey: {}, plates: gb.plates };
    for (const k in gb.byKey) {
      const b = gb.byKey[k], byPa = {};
      for (const pa in b.byPa) byPa[pa] = b.byPa[pa].map(c);
      out.byKey[k] = { bbox: b.bbox, rbox: b.rbox, byPa, bg: (b.bg || []).map(c), text: (b.text || []).map(c) };
    }
    return out;
  }
  function cacheBlocksFor(runId) {
    if (!gcodeBlocks || !runId) return;
    data.gcodeCache = data.gcodeCache || {};
    data.gcodeCache[runId] = compactBlocks(gcodeBlocks);
  }
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
  function openPattern(tr) {
    patternTr = tr; patternSel = null;
    const accel = +tr.querySelector('input[data-key="accel"]').value;
    const speed = tr.dataset.speed != null ? +tr.dataset.speed : NaN;
    const block = (gcodeBlocks && gcodeBlocks.byKey && isFinite(accel) && isFinite(speed)) ? gcodeBlocks.byKey[accel + "|" + speed] : null;
    $("patternThumb").innerHTML = "";
    if (block) { renderRealPattern(tr, block, accel, speed); }
    else {
      const synth = synthPatternBlock(tr);
      if (synth) renderRealPattern(tr, synth, accel, isFinite(speed) ? speed : "?");
      else renderSchematic(tr);   // last-ditch fallback (no PA range available)
    }
    $("patternModal").hidden = false;
  }
  // Imported-plate thumbnail: every imported plate side by side, the current block + its plate
  // highlighted (Y-flipped so it reads like the bed top-down).
  function renderThumb(curKey) {
    const thumb = $("patternThumb"); if (!thumb) return;
    while (thumb.firstChild) thumb.removeChild(thumb.firstChild);
    const raw = gcodeBlocks && gcodeBlocks.plates;
    thumb.style.display = (raw && raw.length) ? "" : "none";
    if (!raw || !raw.length) return;
    // Order plates low → high accel (as Orca lays them out), regardless of import order.
    const minAcc = (pl) => Math.min.apply(null, pl.items.map(it => +it.key.split("|")[0]));
    const plates = raw.slice().sort((a, b) => minAcc(a) - minAcc(b));
    let curPlate = -1; plates.forEach((pl, i) => { if (pl.items.some(it => it.key === curKey)) curPlate = i; });
    // Draw the FULL bed (with objects at their real bed positions) when the bed is known; else fall
    // back to the printed extents.
    const printer = getPrinter(data.lastPrinterId), bed = printer && printer.bed;
    const round = bed && bed.shape === "round";
    const bx = bed ? (round ? bed.diameter : bed.x) : 0, by = bed ? (round ? bed.diameter : bed.y) : 0;
    const fullBed = !!(bed && bx > 0 && by > 0);
    const oxOff = (bed && bed.origin === "center") ? bx / 2 : 0, oyOff = (bed && bed.origin === "center") ? by / 2 : 0;
    const dims = plates.map(pl => { if (fullBed) return { w: bx, h: by }; const [mnx, mny, mxx, mxy] = pl.box; return { w: mxx - mnx, h: mxy - mny, mnx, mny, mxy }; });
    const maxH = Math.max.apply(null, dims.map(d => d.h)), pad = 3, gapP = Math.max(6, (fullBed ? bx : dims[0].w) * 0.08);
    let x = pad; const px = dims.map(d => { const at = x; x += d.w + gapP; return at; });
    thumb.setAttribute("viewBox", `0 0 ${(x - gapP + pad).toFixed(1)} ${(maxH + 2 * pad).toFixed(1)}`);
    plates.forEach((pl, i) => {
      const d = dims[i], ox = px[i], on = i === curPlate, stroke = on ? "var(--accent2)" : "#8b97a7", sw = on ? 2 : 1.2;
      if (fullBed && round) { const c = svgEl("circle"); c.setAttribute("cx", (ox + bx / 2).toFixed(1)); c.setAttribute("cy", (pad + by / 2).toFixed(1)); c.setAttribute("r", (bx / 2).toFixed(1)); c.setAttribute("fill", "none"); c.setAttribute("stroke", stroke); c.setAttribute("stroke-width", sw); thumb.append(c); }
      else { const bg = svgEl("rect"); bg.setAttribute("x", ox.toFixed(1)); bg.setAttribute("y", pad); bg.setAttribute("width", d.w.toFixed(1)); bg.setAttribute("height", d.h.toFixed(1)); bg.setAttribute("fill", "none"); bg.setAttribute("stroke", stroke); bg.setAttribute("stroke-width", sw); thumb.append(bg); }
      // draw each object's actual first-layer toolpath (frame + tab, chevrons, digits)
      const tx = (x) => (fullBed ? (ox + x + oxOff) : (ox + x - d.mnx)).toFixed(1);
      const ty = (y) => (fullBed ? (pad + by - (y + oyOff)) : (pad + d.mxy - y)).toFixed(1);
      pl.items.forEach(it => {
        const blk = gcodeBlocks.byKey[it.key]; if (!blk) return;
        const cur = it.key === curKey;
        const draw = (seg, col, w) => { const l = svgEl("line"); l.setAttribute("x1", tx(seg.x1)); l.setAttribute("y1", ty(seg.y1)); l.setAttribute("x2", tx(seg.x2)); l.setAttribute("y2", ty(seg.y2)); l.setAttribute("stroke", col); l.setAttribute("stroke-width", w); l.setAttribute("stroke-linecap", "round"); thumb.append(l); };
        (blk.bg || []).forEach(s => draw(s, cur ? "var(--accent)" : "#4a5766", cur ? 1.1 : 0.7));
        for (const pa in blk.byPa) blk.byPa[pa].forEach(s => draw(s, cur ? "var(--accent)" : "#9aa0a6", cur ? 0.9 : 0.55));
        (blk.text || []).forEach(s => draw(s, cur ? "var(--ink)" : "#7a8695", 0.5));
      });
    });
    if (curPlate >= 0 && plates.length > 1) $("patternTitle").textContent += `  ·  plate ${curPlate + 1} of ${plates.length}`;
  }
  // Plate thumbnail for a GENERATED test (no imported plate): from the plate-fit plan, draw the
  // objects on the current row's plate, current one highlighted, and label "plate N of M".
  function renderPlanThumb(tr) {
    const thumb = $("patternThumb"); if (!thumb) return;
    while (thumb.firstChild) thumb.removeChild(thumb.firstChild);
    const plan = currentSettings && currentSettings.plan;
    const printer = getPrinter(data.lastPrinterId), bed = printer && printer.bed;
    if (!plan || !plan.fits || !bed) { thumb.style.display = "none"; return; }
    thumb.style.display = "";
    const flow = num(tr.querySelector('input[data-key="flow"]').value);
    const accel = num(tr.querySelector('input[data-key="accel"]').value);
    const cur = plan.items.find(it => it.combo.accel === accel && (flow == null || Math.abs(it.combo.flow - flow) < 0.6));
    const curPlate = cur ? cur.plate : 0;
    const round = bed.shape === "round";
    const bx = round ? (bed.diameter || 0) : (bed.x || 0);
    const by = round ? (bed.diameter || 0) : (bed.y || 0);
    const nP = Math.max(1, plan.plates), pad = 4, gapP = Math.max(6, bx * 0.1);
    const totalW = nP * bx + (nP - 1) * gapP;
    thumb.setAttribute("viewBox", `0 0 ${(totalW + 2 * pad).toFixed(1)} ${(by + 2 * pad).toFixed(1)}`);
    // One representative generated block — the chevron geometry is identical across combos, so we
    // build it once and stamp it at each object's position (cheap), drawn as the real pattern.
    const rep = (window.PAPattern && currentSettings) ? window.PAPattern.synthBlock({ paStart: currentSettings.paStart, paEnd: currentSettings.paEnd, paStep: currentSettings.paStep, lineWidth: num(currentSettings.lineW), layerHeight: num(currentSettings.layerH), wallLoops: 3 }) : null;
    const r0x = rep ? rep.rbox[0] : 0, r0y = rep ? rep.rbox[1] : 0;
    for (let p = 0; p < nP; p++) {
      const ox = pad + p * (bx + gapP), pstroke = p === curPlate ? "var(--accent2)" : "#8b97a7", psw = p === curPlate ? 2.5 : 1.5;
      if (round) { const c = svgEl("circle"); c.setAttribute("cx", (ox + bx / 2).toFixed(1)); c.setAttribute("cy", (pad + by / 2).toFixed(1)); c.setAttribute("r", (bx / 2).toFixed(1)); c.setAttribute("fill", "none"); c.setAttribute("stroke", pstroke); c.setAttribute("stroke-width", psw); thumb.append(c); }
      else { const b = svgEl("rect"); b.setAttribute("x", ox.toFixed(1)); b.setAttribute("y", pad); b.setAttribute("width", bx); b.setAttribute("height", by); b.setAttribute("fill", "none"); b.setAttribute("stroke", pstroke); b.setAttribute("stroke-width", psw); thumb.append(b); }
      plan.items.filter(it => it.plate === p).forEach(it => {
        const on = cur && it === cur;
        if (!rep) { const r = svgEl("rect"); r.setAttribute("x", (ox + it.x).toFixed(1)); r.setAttribute("y", (pad + it.y).toFixed(1)); r.setAttribute("width", plan.objW.toFixed(1)); r.setAttribute("height", plan.objH.toFixed(1)); r.setAttribute("fill", on ? "var(--accent)" : "#8b97a7"); r.setAttribute("opacity", on ? "1" : "0.3"); thumb.append(r); return; }
        const X = (x) => (ox + it.x + x - r0x).toFixed(1), Y = (y) => (pad + it.y + y - r0y).toFixed(1);
        rep.fills.forEach(poly => { const pg = svgEl("polygon"); pg.setAttribute("points", poly.map(pt => X(pt.x) + "," + Y(pt.y)).join(" ")); pg.setAttribute("fill", on ? "var(--accent)" : "#3a4653"); pg.setAttribute("opacity", on ? "0.45" : "0.3"); thumb.append(pg); });
        const draw = (s, col, w) => { const l = svgEl("line"); l.setAttribute("x1", X(s.x1)); l.setAttribute("y1", Y(s.y1)); l.setAttribute("x2", X(s.x2)); l.setAttribute("y2", Y(s.y2)); l.setAttribute("stroke", col); l.setAttribute("stroke-width", w); l.setAttribute("stroke-linecap", "round"); thumb.append(l); };
        (rep.bg || []).forEach(s => draw(s, on ? "var(--accent)" : "#4a5766", on ? 1.1 : 0.7));
        for (const pa in rep.byPa) rep.byPa[pa].forEach(s => draw(s, on ? "var(--accent)" : "#9aa0a6", on ? 0.9 : 0.55));
        (rep.text || []).forEach(s => draw(s, on ? "var(--ink)" : "#6a7684", 0.5));
      });
    }
    if (plan.plates > 0) $("patternTitle").textContent += `  ·  plate ${curPlate + 1} of ${plan.plates}`;
  }
  function renderRealPattern(tr, block, accel, speed) {
    const flow = tr.querySelector('input[data-key="flow"]').value;
    const cur = num(tr.querySelector('input[data-key="bestPA"]').value);
    $("patternTitle").textContent = `Pick the best line — flow ${flow || "?"} mm³/s @ ${accel} mm/s² (${speed} mm/s)`;
    if (gcodeBlocks && gcodeBlocks.plates) renderThumb(accel + "|" + speed);   // imported plate(s)
    else renderPlanThumb(tr);                                                  // generated test → plate-fit plan
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
      g.addEventListener("click", () => patternSelectPa(pa));
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
    $("patternThumb").innerHTML = "";
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
      g.addEventListener("click", () => patternSelectPa(pa));
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
    $("pvFlowsLabel").textContent = (unitIsSpeed() ? "Speed" : "Flow") + " points tested (" + unitName() + ", comma-separated)";
    $("pvFlows").placeholder = unitIsSpeed() ? "e.g. 60, 120, 180, 240" : "e.g. 5, 10, 15, 20";
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
  function analyze() {
    const all = readResults();
    all.forEach(r => r.tr.classList.remove("outlier"));
    const rows = all.filter(r => r.x != null && r.bestPA != null && r.accel != null);
    const out = $("analysisOut");
    if (rows.length < 3) { out.innerHTML = '<span class="badge warn">need data</span>Enter at least 3 points to analyze.'; drawPlot([], null, []); return; }
    const xs = rows.map(r => r.x), as = rows.map(r => r.accel), ys = rows.map(r => r.bestPA);
    const accelSet = [...new Set(as)].sort((a, b) => a - b);
    const multi = accelSet.length > 1 && rows.length >= 4;
    const fit = multi ? (mlr(xs, as, ys) || linreg(xs, ys)) : linreg(xs, ys);
    lastFit = fit;
    const pred = rows.map(r => fit.type === "mlr" ? fit.predict(r.x, r.accel) : fit.predict(r.x));
    const resid = rows.map((r, i) => Math.abs(ys[i] - pred[i]));
    const mean = resid.reduce((a, b) => a + b, 0) / resid.length;
    const std = Math.sqrt(resid.reduce((a, d) => a + (d - mean) ** 2, 0) / resid.length) || 0;
    const range = Math.max(...ys) - Math.min(...ys), absThresh = Math.max(0.01, range * 0.15);
    const outliers = []; rows.forEach((r, i) => { if (resid[i] > Math.max(2 * std, absThresh)) { outliers.push(r); r.tr.classList.add("outlier"); } });
    drawPlot(rows, fit, outliers);
    let html = "";
    if (fit.r2 < 0.4) html += '<span class="badge bad">scattered</span>Points don’t follow a clear trend (R²=' + fit.r2.toFixed(2) + '). Usually the print was inconsistent, not your reading — re-check first-layer squish / flow, then re-run.';
    else if (outliers.length) html += '<span class="badge warn">' + outliers.length + ' outlier' + (outliers.length > 1 ? "s" : "") + '</span>Off-trend (highlighted) — likely a misread line. Re-check: ' + outliers.map(o => o.x + " mm³/s @ " + o.accel + " (picked " + o.bestPA + ")").join("; ") + ".";
    else html += '<span class="badge ok">clean</span>Good fit (R²=' + fit.r2.toFixed(2) + '). ';
    if (fit.type === "mlr") html += ' PA ≈ ' + fit.b1.toExponential(2) + '·mm³/s + ' + fit.b2.toExponential(2) + '·accel + ' + fit.b0.toFixed(4) + '.';
    else if (fit.r2 >= 0.4) html += ' PA ≈ ' + fit.slope.toExponential(2) + '·mm³/s + ' + fit.intercept.toFixed(4) + '.';
    out.innerHTML = html;
  }
  function drawPlot(rows, fit, outliers) {
    const svg = $("plot"); while (svg.firstChild) svg.removeChild(svg.firstChild);
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

  function exportModel() {
    if (isBasic()) {
      const pa = num($("basicBestPA").value);
      $("singlePaOut").innerHTML = pa != null ? 'Set this PA value in Orca: <b>' + pa + '</b>' : "Enter your best PA above.";
      $("modelOut").value = ""; return;
    }
    const rows = readResults().filter(r => r.x != null && r.bestPA != null).sort((a, b) => (a.x - b.x) || ((a.accel || 0) - (b.accel || 0)));
    if (!rows.length) { $("modelOut").value = ""; $("singlePaOut").textContent = "Enter some results first."; return; }
    $("modelOut").value = rows.map(r => `${r.bestPA}, ${r.x.toFixed(2)}, ${r.accel != null ? r.accel : ""}`).join("\n");
    const ys = rows.map(r => r.bestPA).slice().sort((a, b) => a - b), median = ys[Math.floor(ys.length / 2)];
    let single = median;
    if (lastFit) { const midX = (Math.min(...rows.map(r => r.x)) + Math.max(...rows.map(r => r.x))) / 2; const accs = rows.map(r => r.accel).filter(a => a != null).sort((a, b) => a - b); const midA = accs.length ? accs[Math.floor(accs.length / 2)] : 0; single = lastFit.type === "mlr" ? lastFit.predict(midX, midA) : lastFit.predict(midX); }
    $("singlePaOut").innerHTML = 'Single PA (non-adaptive): <b>' + single.toFixed(4) + '</b> <span class="muted">(fit at mid-point; median entry = ' + median + ')</span>';
  }

  // ---- run lifecycle ----
  function collectRun(status) {
    const existing = data.runs.find(r => r.id === currentRunId);
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
      analysis: lastFit ? (lastFit.type === "mlr" ? { fit: { b0: lastFit.b0, b1: lastFit.b1, b2: lastFit.b2, r2: lastFit.r2 } } : { fit: { slope: lastFit.slope, intercept: lastFit.intercept, r2: lastFit.r2 } }) : null,
      modelText: $("modelOut").value || null, shareCommunity: false
    };
  }
  function upsertRun(run) { const i = data.runs.findIndex(r => r.id === run.id); if (i >= 0) data.runs[i] = run; else data.runs.unshift(run); }
  function savePlanned() {
    if (!data.lastPrinterId || !getSelectedNozzle() || !data.lastFilamentId) { alert("Select a printer, nozzle and filament first."); return; }
    const run = collectRun("planned"); currentRunId = run.id; upsertRun(run); cacheBlocksFor(run.id); persist(); renderInProgress(); clearJobDirty();
    alert("Saved as a planned run. Print it, then reopen PA-Helper → Filament tab → Resume to enter results.");
  }
  function saveRun() {
    if (!data.lastPrinterId || !getSelectedNozzle() || !data.lastFilamentId) { alert("Select a printer, nozzle and filament first."); return; }
    const run = collectRun("complete"); currentRunId = run.id; upsertRun(run);
    cacheBlocksFor(run.id);   // keep the geometry so a completed test can be reopened in the real picker
    persist(); renderInProgress(); renderCompletedRuns(); clearJobDirty();
    alert("Run saved.");
  }
  function resumeRun(id) {
    const r = data.runs.find(x => x.id === id); if (!r) return;
    currentRunId = id;
    gcodeBlocks = (data.gcodeCache && data.gcodeCache[id]) ? data.gcodeCache[id] : null;   // restore real pattern geometry
    data.lastPrinterId = r.printerId; data.lastInstanceId = r.instanceId || null; data.lastFilamentId = r.filamentId;
    const rp = getPrinter(r.printerId);
    data.lastNozzleId = (rp && rp.nozzles && rp.nozzles.some(n => n.id === r.nozzleId)) ? r.nozzleId : (rp && rp.nozzles && rp.nozzles[0] ? rp.nozzles[0].id : null);
    $("testMode").value = r.mode || "advanced";
    if ((r.mode || "advanced") === "basic") lastBasicMethod = r.basicMethod || P.basicDefault;
    $("basicMethod").value = r.basicMethod || P.basicDefault;
    $("unitMode").value = r.unit || "flow";
    if (r.layerH != null) $("layerH").value = r.layerH;
    if (r.lineW != null) $("lineW").value = r.lineW;
    if (r.maxFlow != null) $("maxFlow").value = r.maxFlow;
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
    persist(); renderPrinters(); renderNozzles(); renderFilaments(); updateTestContext(); markJobDirty();
    switchTab("test");
  }

  function setStatus() {
    const s = $("dataStatus");
    if (Store.fileConnected()) { s.textContent = "file: pa_data.json"; s.classList.add("file"); }
    else { s.textContent = "local (this browser)"; s.classList.remove("file"); }
  }
  function prefillProvide() {
    const { start, end, step } = materialRange();
    if (!$("pvStart").value) $("pvStart").value = +start.toFixed(3);
    if (!$("pvEnd").value) $("pvEnd").value = +end.toFixed(3);
    if (!$("pvStep").value) $("pvStep").value = +step.toFixed(3);
    if (!$("pvAccels").value) $("pvAccels").value = ($("accelList").value || logAccels(1000, num($("accelLimit").value) || 12000, 5).join(", "));
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
      all: "ALL data — printers, filaments, PA history and remembered inputs",
      history: "all PA run history and remembered inputs",
      filaments: "all filaments",
      printers: "all printers (and their nozzles)"
    };
    if (!confirm(`Permanently delete ${labels[kind]}?\n\nThere is no undo.`)) return;
    if (kind === "all") { const theme = data.theme; data = Store.defaultData(); data.theme = theme; }
    else if (kind === "history") { data.runs = []; data.gcodeCache = {}; data.customOptions = Store.defaultData().customOptions; }
    else if (kind === "filaments") { data.filaments = []; data.lastFilamentId = null; }
    else if (kind === "printers") { data.printers = []; data.lastPrinterId = null; data.lastInstanceId = null; data.lastNozzleId = null; }
    editingPrinterId = null; editingFilamentId = null; currentRunId = null; currentSettings = null; lastFit = null; clearJobDirty();
    persist(); rebuildForms(); reloadAll();
    $("debugModal").hidden = true;
  }
  function reloadAll() { renderPrinters(); renderNozzles(); renderFilaments(); renderInProgress(); renderCompletedRuns(); renderFilamentPrinterPicker(); deriveGeometryFromNozzle(); updateTestContext(); setStatus(); updateTabLabels(); $("themeSel").value = data.theme || "system"; applyTheme(data.theme); }

  function init() {
    applyTheme(data.theme);
    const v = window.PA_VERSION; if (v && $("buildStamp")) $("buildStamp").textContent = "v" + (v.version || v.hash) + " · " + v.date;
    printerForm = buildForm($("printerForm"), PRINTER_FIELDS);
    nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS);
    filamentForm = buildForm($("filamentForm"), FILAMENT_FIELDS);
    initPrinterDefaults(); updateFilamentConditionals();
    $("basicMethod").value = P.basicDefault;
    $("flowPoints").value = 5;   // deterministic default (defeat browser form-restore)
    document.querySelectorAll("input, select").forEach(e => e.setAttribute("autocomplete", "off"));
    updateUnitUI(); reloadAll();
    $("printerForm").addEventListener("change", (e) => {
      const f = e.target.closest(".field"); if (!f) return;
      if (f.dataset.key === "maker") { applyModelOptions(); applyPrinterDefaults(); autofillBed(); }
      else if (f.dataset.key === "model") { applyPrinterDefaults(); autofillBed(); }
      else if (f.dataset.key === "bedShape") { updatePrinterConditionals(); }
    });
    $("filamentForm").addEventListener("change", () => updateFilamentConditionals());
    $("filamentRestrict").addEventListener("change", () => { const on = $("filamentRestrict").checked; if (on) renderFilamentPrinterPicker(); $("filamentPrinters").hidden = !on; });
    $("filamentViewToggle").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (!b) return; data.filamentView = b.dataset.view; persist(); renderFilaments(); });

    document.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    switchTab("printers");

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
    [...document.getElementsByName("pvUnit")].forEach(r => r.addEventListener("change", () => { if (r.checked) { $("unitMode").value = r.value; updateUnitUI(); } }));
    $("recommendBtn").addEventListener("click", recommend);
    // if the user types their own accel list, stop auto-rescaling it to the printer max
    $("accelList").addEventListener("input", () => { accelListAuto = !$("accelList").value.trim(); });
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
    window.PA_test = { importGcode, addPlate, resetGcode, buildPaBlocks };   // test hooks (jsdom smoke)
    $("loadPointsBtn").addEventListener("click", (e) => { loadGrid(e.target._points || []); sortResults(); markJobDirty(); });
    $("resultSort").addEventListener("change", sortResults);
    $("savePlannedBtn").addEventListener("click", savePlanned);
    // Unsaved-PA-job guard: mark the job dirty on edits, prompt on navigation / tab close.
    $("resultsBody").addEventListener("input", markJobDirty);
    if ($("basicBestPA")) $("basicBestPA").addEventListener("input", markJobDirty);
    $("jobGuardSave").addEventListener("click", () => { savePlanned(); $("jobGuardModal").hidden = true; const t = pendingTab; pendingTab = null; if (t) applyTab(t); });
    $("jobGuardAbandon").addEventListener("click", () => {
      const r = currentRunId ? data.runs.find(x => x.id === currentRunId) : null;
      if (r) { r.status = "abandoned"; if (data.gcodeCache) delete data.gcodeCache[currentRunId]; }
      currentRunId = null; loadGrid([]); clearJobDirty(); persist(); renderInProgress();
      $("jobGuardModal").hidden = true; const t = pendingTab; pendingTab = null; if (t) applyTab(t);
    });
    $("jobGuardCancel").addEventListener("click", () => { $("jobGuardModal").hidden = true; pendingTab = null; });
    window.addEventListener("beforeunload", (e) => { if (jobDirty) { e.preventDefault(); e.returnValue = ""; } });
    // Auto-seeded default nozzle prompt (after saving a new printer)
    $("nozzleSeedOk").addEventListener("click", () => { $("nozzleSeedModal").hidden = true; });
    $("nozzleSeedReplace").addEventListener("click", () => {
      const p = getPrinter(data.lastPrinterId);
      if (p) { p.nozzles = []; data.lastNozzleId = null; persist(); renderNozzles(); deriveGeometryFromNozzle(); updateTestContext(); }
      $("nozzleSeedModal").hidden = true; $("nozzleAdd").open = true;
      if ($("nozzleAdd").scrollIntoView) $("nozzleAdd").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("flowPoints").addEventListener("change", () => { let n = Math.round(num($("flowPoints").value)); if (!(n >= 2)) n = 5; $("flowPoints").value = n; });
    $("addRowBtn").addEventListener("click", () => addRow());
    $("analyzeBtn").addEventListener("click", analyze);
    $("exportBtnModel").addEventListener("click", exportModel);
    $("copyModelBtn").addEventListener("click", () => { navigator.clipboard && navigator.clipboard.writeText($("modelOut").value); });
    $("saveRunBtn").addEventListener("click", saveRun);

    $("patternOk").addEventListener("click", () => { if (patternTr && patternSel != null) { const inp = patternTr.querySelector('input[data-key="bestPA"]'); inp.value = patternSel; } $("patternModal").hidden = true; });
    $("patternCancel").addEventListener("click", () => { $("patternModal").hidden = true; });
    $("patternModal").addEventListener("click", (e) => { if (e.target === $("patternModal")) $("patternModal").hidden = true; });
    $("debugClearBtn").addEventListener("click", () => { $("debugModal").hidden = false; });
    $("debugModal").addEventListener("click", (e) => { if (e.target === $("debugModal")) $("debugModal").hidden = true; });
    $("debugModal").querySelectorAll("button[data-clear]").forEach(b => b.addEventListener("click", () => doClear(b.dataset.clear)));
    $("exportBtn").addEventListener("click", () => { persist(); Store.exportJSON(data); });
    $("importBtn").addEventListener("click", () => $("importInput").click());
    $("importInput").addEventListener("change", async (e) => { if (e.target.files[0]) { data = await Store.importJSON(e.target.files[0]); printerForm = buildForm($("printerForm"), PRINTER_FIELDS); nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS); filamentForm = buildForm($("filamentForm"), FILAMENT_FIELDS); initPrinterDefaults(); updateFilamentConditionals(); reloadAll(); } });
    $("connectFileBtn").addEventListener("click", async () => {
      try {
        if (!Store.supportsFS()) { alert("Your browser can't open a file directly (need Chrome/Edge/Brave on https or localhost). Use Import/Export instead."); return; }
        const open = confirm("OK = open an existing pa_data.json.\nCancel = create a new one.");
        const loaded = await Store.connectFile(open);
        if (loaded) { data = loaded; printerForm = buildForm($("printerForm"), PRINTER_FIELDS); nozzleForm = buildForm($("nozzleForm"), NOZZLE_FIELDS); filamentForm = buildForm($("filamentForm"), FILAMENT_FIELDS); initPrinterDefaults(); updateFilamentConditionals(); reloadAll(); } else { persist(); }
        setStatus();
      } catch (err) { /* cancelled */ }
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
