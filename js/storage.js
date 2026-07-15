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
      gcodeCache: {}                // runId -> parsed pattern-block geometry, so the picker
                                    // still renders the real pattern after a reload/resume
    };
  }

  const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

  function merge(parsed) { return Object.assign(defaultData(), parsed || {}); }

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
    a.download = `pa_data_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return at;
  }

  async function importJSON(file) { const data = merge(JSON.parse(await file.text())); await save(data); return data; }

  return { defaultData, uid, load, save, connectFile, fileConnected, supportsFS, exportJSON, importJSON, key: LS_KEY };
})();
