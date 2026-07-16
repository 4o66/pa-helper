/* PA-Helper — storage.js  (schema v2)
 * One storage interface so the app doesn't care WHERE data lives. Today: local.
 * Phase B adds an API backend behind this same shape (load/save/etc.) — no rewrite.
 *
 * Layers, in order of preference:
 *   1. A real pa_data.json on disk via the File System Access API (Chrome/Edge/Brave,
 *      https or localhost). Best experience: edits write straight to the file.
 *   2. localStorage working copy — always available, persists between visits.
 *   3. Import/Export JSON — manual file round-trip (works everywhere, incl. file://).
 *
 * v2 model:
 *   printers[]  reusable machines. Identity = maker/model + toolhead + extruder(+drive)
 *               + hotend. Swapping any of those = a NEW printer. Nozzle & filament are
 *               per-run, not part of identity. `multi` reveals per-unit `instances`.
 *   filaments[] reusable spool definitions.
 *   runs[]      a PA test tied to a printer(+instance) + filament + per-run nozzle.
 *               status: "planned" (settings only) -> "complete" | "abandoned".
 */
window.PAStore = (function () {
  const LS_KEY = "pa_helper_data_v2";
  let fileHandle = null;

  function defaultData() {
    return {
      version: 2,
      // Document-format revision WITHIN the v2 schema/storage key — bumped when the *shape* of
      // what's exported changes in a way old files need migrating for. 2.0 = gcodeCache removed
      // (see migrate() below); a file missing this (or with an older value) is old-format.
      formatVersion: "2.0",
      theme: "system",              // system | light | dark
      customOptions: {
        printerMaker: [], printerModel: [], toolhead: [], extruder: [], hotend: [],
        nozzleMaker: [], nozzleModel: [], nozzleMaterial: [],
        filamentMaker: [], filamentMaterial: [], filamentFormulation: [], filamentColor: [], tpuHardness: []
      },
      printers: [],                 // {id, pubId, maker, model, toolhead, extruder, drive, hotend, multi, instances:[{id,label}], nozzles:[{id,maker,model,diameter,material}], created}
      filaments: [],                // {id, maker, material, formulation, color, diameter, hardness, fiber, fiberName, fiberPct, printers:[], created}
      runs: [],                     // see header
      lastPrinterId: null,
      lastInstanceId: null,
      lastNozzleId: null,           // selected nozzle within the selected printer
      lastFilamentId: null,
      // gcodeCache intentionally NOT part of the schema as of formatVersion 2.0 — the picker's
      // pattern geometry is fully reproducible from a run's stored settings (js/pattern.js), so
      // persisting it was pure machine-only bloat (~96% of a typical export's real data) in a
      // file that's meant to be human-readable. See migrate() and js/app.js's openRun/openPattern.
      ironingSettings: null,         // last-used Ironing Test tab settings (speed/flow sweep,
                                      // pad geometry) — see updateIroningContext() in app.js
      ironingRuns: []                // saved ironing tests — {id, status:"complete", date, printerId,
                                      // instanceId, nozzleId, filamentId, settings}. No "planned" state
                                      // yet (no results-entry step to wait on) — saving IS complete.
    };
  }

  const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

  // Old-format files (has gcodeCache, or missing/pre-2.0 formatVersion) migrate in memory here:
  // drop gcodeCache, stamp the current formatVersion. No other data is touched or lost. Every
  // load path (load/connectFile/importJSON) routes through merge(), so this always runs on read.
  function migrate(d) {
    if (d.gcodeCache || d.formatVersion !== "2.0") {
      delete d.gcodeCache;
      d.formatVersion = "2.0";
    }
    return d;
  }

  function merge(parsed) { return migrate(Object.assign(defaultData(), parsed || {})); }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return merge(JSON.parse(raw));
    } catch (e) { console.warn("load failed", e); }
    return defaultData();
  }

  async function save(data) {
    const text = JSON.stringify(data, null, 2);
    try { localStorage.setItem(LS_KEY, text); } catch (e) { console.warn("localStorage save failed", e); }
    if (fileHandle) {
      try { const w = await fileHandle.createWritable(); await w.write(text); await w.close(); }
      catch (e) { console.warn("file write failed", e); }
    }
    return true;
  }

  const supportsFS = () => "showSaveFilePicker" in window && "showOpenFilePicker" in window;

  async function connectFile(preferOpen) {
    if (!supportsFS()) throw new Error("File System Access API not available (use https/localhost, or Import/Export).");
    const opts = { suggestedName: "pa_data.json", types: [{ description: "PA-Helper data", accept: { "application/json": [".json"] } }] };
    fileHandle = preferOpen ? (await window.showOpenFilePicker(opts))[0] : await window.showSaveFilePicker(opts);
    if (preferOpen) {
      const f = await fileHandle.getFile();
      const data = merge(JSON.parse(await f.text()));
      await save(data);
      return data;
    }
    return null;
  }
  function fileConnected() { return !!fileHandle; }

  // Export a snapshot. Stamps `exportedAt` inside the file and dates the download name so repeated
  // exports don't collide/overwrite in the Downloads folder (and you can tell which is newest).
  function exportJSON(data) {
    const at = new Date().toISOString();
    const stamped = Object.assign({}, data, { exportedAt: at });
    const blob = new Blob([JSON.stringify(stamped, null, 2)], { type: "application/json" });
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pa_data_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return at;
  }

  async function importJSON(file) { const data = merge(JSON.parse(await file.text())); await save(data); return data; }

  return { defaultData, uid, load, save, connectFile, fileConnected, supportsFS, exportJSON, importJSON, key: LS_KEY };
})();
