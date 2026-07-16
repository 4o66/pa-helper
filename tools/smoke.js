const { JSDOM } = require("jsdom");
const fs = require("fs");
const DIR = require("path").resolve(__dirname, "..");
const html = fs.readFileSync(DIR + "/index.html", "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://localhost/" });
const { window } = dom; const { document } = window;
window.alert = () => {}; window.confirm = () => true;
// jsdom lacks blob-download plumbing — mock so Export doesn't throw
window.URL.createObjectURL = () => "blob:mock"; window.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () {};
// script list mirrors index.html's own <script> tags (kept in sync manually — ironing.js was
// added after this file was originally written, see js/ironing.js in index.html).
["js/presets.js", "js/storage.js", "js/beds.js", "js/pattern.js", "js/ironing.js", "js/app.js"].forEach(f => window.eval(fs.readFileSync(DIR + "/" + f, "utf8")));
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("FAIL:", m); } };
const ev = (elm, t) => elm.dispatchEvent(new window.Event(t, { bubbles: true }));
const readData = () => JSON.parse(window.localStorage.getItem("pa_helper_data_v2"));
function setField(container, idx, value) {
  const f = container.querySelectorAll(".field")[idx];
  const sel = f.querySelector("select");
  if (sel) {
    if ([...sel.options].some(o => o.value === String(value))) sel.value = String(value);
    else { sel.value = "__custom__"; ev(sel, "change"); f.querySelector("input.custom-in").value = value; }
    ev(sel, "change");
  } else { const inp = f.querySelector("input"); inp.value = value; ev(inp, "change"); }
}
function getField(container, idx) {
  const f = container.querySelectorAll(".field")[idx];
  const sel = f.querySelector("select");
  if (sel) return sel.value === "__custom__" ? f.querySelector("input.custom-in").value : sel.value;
  return f.querySelector("input").value;
}
// key-based field helpers (robust to field reordering)
function fieldByKey(container, key) { return container.querySelector('.field[data-key="' + key + '"]'); }
function setFieldKey(container, key, value) {
  const f = fieldByKey(container, key), sel = f.querySelector("select");
  if (sel) {
    if ([...sel.options].some(o => o.value === String(value))) sel.value = String(value);
    else { sel.value = "__custom__"; ev(sel, "change"); f.querySelector("input.custom-in").value = value; }
    ev(sel, "change");
  } else { const inp = f.querySelector("input"); inp.value = value; ev(inp, "change"); }
}
function getFieldKey(container, key) {
  const f = fieldByKey(container, key), sel = f.querySelector("select");
  if (sel) return sel.value === "__custom__" ? f.querySelector("input.custom-in").value : sel.value;
  return f.querySelector("input").value;
}
const $ = (id) => document.getElementById(id);
const click = (id) => $(id).dispatchEvent(new window.Event("click", { bubbles: true }));
// lastExportedAt/lastModifiedAt are compared at millisecond ISO-string resolution
// (setStatus: mod > exp) — this script runs fast enough that two persist()s in a row can land
// in the same millisecond, making that comparison flaky. Force the clock forward a tick.
const tickClock = () => { const t0 = Date.now(); while (Date.now() === t0) { /* spin */ } };

// theme
ok(document.documentElement.dataset.theme === "system", "default theme system");
$("themeSel").value = "light"; ev($("themeSel"), "change");
ok(document.documentElement.dataset.theme === "light", "theme switches to light");

// add printer
setFieldKey($("printerForm"), "maker", "Voron");
setFieldKey($("printerForm"), "model", "Trident 350");
setFieldKey($("printerForm"), "toolhead", "StealthBurner");
setFieldKey($("printerForm"), "extruder", "Clockwork 2");
setFieldKey($("printerForm"), "hotend", "E3D Revo");
setFieldKey($("printerForm"), "drive", "Direct");
setFieldKey($("printerForm"), "bedX", "350");
setFieldKey($("printerForm"), "bedY", "350");
click("savePrinterBtn");
let d = readData();
ok(d.printers.length === 1, "printer saved");
ok(d.lastPrinterId === d.printers[0].id, "printer auto-selected");
ok(d.printers[0].hotend === "E3D Revo", "hotend recorded");
ok(typeof d.printers[0].pubId === "string" && d.printers[0].pubId.length > 0, "printer has random pubId");
ok(d.printers[0].nozzles && d.printers[0].nozzles[0].diameter === 0.4, "printer seeded with a 0.4 nozzle");
ok(d.printers[0].bed && d.printers[0].bed.x === 350 && d.printers[0].bed.y === 350, "printer bed size saved");
ok($("nozzleSeedModal").hidden === false, "new printer prompts about its seeded nozzle");
$("nozzleSeedOk").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("nozzleSeedModal").hidden === true, "seeded-nozzle prompt dismisses on OK");

// maker stock defaulting (fresh form was rebuilt after save)
setFieldKey($("printerForm"), "maker", "QIDI");
ok(getFieldKey($("printerForm"), "toolhead") === "QIDI (stock)", "QIDI toolhead default");
ok(getFieldKey($("printerForm"), "extruder") === "QIDI (stock)", "QIDI extruder default");
ok(getFieldKey($("printerForm"), "hotend") === "QIDI (stock)", "QIDI hotend default");
// learned default from an existing saved maker+model beats stock/generic
setFieldKey($("printerForm"), "maker", "Voron");
setFieldKey($("printerForm"), "model", "Trident 350");
ok(getFieldKey($("printerForm"), "hotend") === "E3D Revo", "learned hotend default from saved printer");
ok(getFieldKey($("printerForm"), "extruder") === "Clockwork 2", "learned extruder default from saved printer");

// optional filament name field (nickname → card title), like the printer name field
ok(!!document.querySelector('#filamentForm .field[data-key="name"]'), "filament form has an optional name field");
// formulation defaults to Basic; hardness hidden for non-TPU
ok(getFieldKey($("filamentForm"), "formulation") === "Basic", "formulation defaults to Basic");
const hwField = document.querySelector('#filamentForm .field[data-key="hardness"]');
ok(hwField.style.display === "none", "hardness hidden by default (non-TPU)");
// selecting TPU reveals hardness with 95A default
setFieldKey($("filamentForm"), "material", "TPU");
ok(hwField.style.display !== "none", "hardness shown when TPU selected");
ok(getFieldKey($("filamentForm"), "hardness") === "95A", "hardness defaults to 95A");
// add filament (custom formulation)
setFieldKey($("filamentForm"), "maker", "Polymaker");
setFieldKey($("filamentForm"), "material", "PLA");
setFieldKey($("filamentForm"), "formulation", "PolyTerra");
setFieldKey($("filamentForm"), "diameter", "1.75");
click("saveFilamentBtn");
d = readData();
ok(d.filaments.length === 1, "filament saved");
ok(d.customOptions.filamentFormulation.includes("PolyTerra"), "custom formulation remembered");
ok(d.filaments[0].hardness == null, "hardness null for non-TPU filament");

// (the "Use it now, here" hosted-build link moved out of the app header into README — no
// longer part of the running app, so no longer asserted here.)
// tab subtitles reflect selection
ok($("tabSelPrinter").textContent.indexOf("Trident 350") >= 0, "printer tab shows selection");
ok($("tabSelFilament").textContent.indexOf("PLA") >= 0, "filament tab shows selection");
// tab subtitle layout: maker/name on line 1, nozzle/characteristics on line 2 (+ leading icon/swatch)
ok($("tabSelPrinter").querySelector(".tsname") && $("tabSelPrinter").querySelector(".tssub"), "printer tab shows name + nozzle on two lines");
ok(/mm/.test($("tabSelPrinter").querySelector(".tssub").textContent), "printer tab's second line is the nozzle");
ok(!!$("tabSelFilament").querySelector(".colorsq.tabsw"), "filament tab shows a colour swatch to the left");
ok($("tabSelFilament").querySelector(".tsname") && $("tabSelFilament").querySelector(".tssub"), "filament tab splits maker/material and characteristics/colour over two lines");
// nozzle diameter defaults to 0.4
ok(getField($("nozzleForm"), 2) === "0.4", "nozzle diameter defaults to 0.4");

// fiber conditional fields
const pctField = document.querySelector('#filamentForm .field[data-key="fiberPct"]');
const nameField = document.querySelector('#filamentForm .field[data-key="fiberName"]');
ok(pctField.style.display === "none", "fiber % hidden when No");
setFieldKey($("filamentForm"), "fiber", "Carbon Fiber");
ok(pctField.style.display === "none", "fiber % hidden for Carbon Fiber");
setFieldKey($("filamentForm"), "fiber", "Custom");
ok(nameField.style.display !== "none", "fiber name shown for Custom");
ok(pctField.style.display !== "none", "fiber % shown for Custom");

// add a CF filament with a color
setFieldKey($("filamentForm"), "maker", "Bambu Lab");
setFieldKey($("filamentForm"), "material", "PETG");
setFieldKey($("filamentForm"), "color", "Blue");
setFieldKey($("filamentForm"), "fiber", "Carbon Fiber");
click("saveFilamentBtn");
d = readData();
const cf = d.filaments.find(f => f.material === "PETG");
ok(cf && cf.fiber === "Carbon Fiber", "CF fiber saved");
ok(cf.printers.length === 0, "unrestricted filament has empty printers");

// >1 filament => facet filters appear; colored card shows a band
ok($("filamentFilters").querySelectorAll("select").length >= 1, "facet filters shown with >1 filament");
ok([...$("filamentList").querySelectorAll(".colorband")].some(b => b.style.background && !b.classList.contains("nocolor")), "colored filament shows a color band");

// multi-colour: parse colours in order and build a gradient fill
const _cl = window.PA_test.colorList("Rainbow Purple/Pink/White");
ok(_cl.length === 3, "colorList parses three colours from 'Rainbow Purple/Pink/White'");
const _multiFill = window.PA_test.colorFill({ formulation: "Multi-Color", color: "Rainbow Purple/Pink/White" });
ok(/^linear-gradient\(90deg,/.test(_multiFill) && _multiFill.split(",").length >= 4, "multi-colour filament yields a left→right gradient of the parsed colours");
const _soloFill = window.PA_test.colorFill({ formulation: "Basic", color: "Rainbow Purple/Pink/White" });
ok(_soloFill && _soloFill.indexOf("gradient") === -1, "non-multi filament keeps a single dominant colour (no gradient)");
ok(window.PA_test.colorFill({ formulation: "Multi-Color", color: "Purple" }).indexOf("gradient") === -1, "multi-colour with only one detectable colour falls back to a solid swatch");

// view toggle
$("filamentViewToggle").querySelector('button[data-view="list"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("filamentList").classList.contains("flist"), "list view applied");
ok(readData().filamentView === "list", "view persisted");
$("filamentViewToggle").querySelector('button[data-view="cards"]').dispatchEvent(new window.Event("click", { bubbles: true }));

// add a QIDI printer (auto-seeds a Generic 0.4mm Brass nozzle)
setFieldKey($("printerForm"), "maker", "QIDI");
setFieldKey($("printerForm"), "model", "Q1 Pro");
click("savePrinterBtn");
d = readData();
const qidi = d.printers.find(p => p.maker === "QIDI");
ok(!!qidi, "QIDI printer saved");
ok(qidi.bed && qidi.bed.x === 245, "QIDI bed auto-filled from model (Q1 Pro)");
ok(qidi.nozzles && qidi.nozzles[0] && qidi.nozzles[0].maker === "Generic" && qidi.nozzles[0].material === "Brass" && qidi.nozzles[0].diameter === 0.4, "new printer seeded a Generic 0.4mm Brass nozzle");

// restrict a filament to the QIDI printer only
setFieldKey($("filamentForm"), "material", "ASA");
$("filamentRestrict").checked = true; ev($("filamentRestrict"), "change");
const qcb = [...$("filamentPrinters").querySelectorAll("input")].find(cb => cb.value === qidi.id);
qcb.checked = true;
click("saveFilamentBtn");
d = readData();
const asa = d.filaments.find(f => f.material === "ASA");
ok(asa && asa.printers.length === 1 && asa.printers[0] === qidi.id, "filament restricted to QIDI");

// select the Voron -> ASA hidden + notice (cards are clicked directly now — no Select button)
const vcard = [...$("printerList").querySelectorAll(".card")].find(c => /Trident 350/.test(c.textContent));
vcard.dispatchEvent(new window.Event("click", { bubbles: true }));
ok(!$("filamentList").textContent.includes("ASA"), "restricted filament hidden for other printer");
ok($("filamentPinNotice").hidden === false, "pin notice shown when a filament is hidden");

// remove the QIDI printer -> ASA becomes unrestricted
const qcard = [...$("printerList").querySelectorAll(".card")].find(c => /Q1 Pro/.test(c.textContent));
// maker favicon: uses the beds.js URL, falls back to domain/favicon.ico on load failure, then removes
{
  const fav = qcard.querySelector("img.favicon");
  ok(fav && /qidi3d\.com\/cdn\/.+\.png/.test(fav.getAttribute("src")), "printer card favicon uses the beds.js icon URL");
  fav.dispatchEvent(new window.Event("error"));
  ok(fav.getAttribute("src") === "https://qidi3d.com/favicon.ico", "favicon 404 falls back to domain/favicon.ico");
  const parent = fav.parentNode;
  fav.dispatchEvent(new window.Event("error"));
  ok(!parent.contains(fav), "second failure removes the favicon (renders nothing)");
}
qcard.querySelector(".actions button.danger").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(readData().filaments.find(f => f.material === "ASA").printers.length === 0, "pin removed when its only printer deleted");

// re-select PLA filament for the remaining flow (cards are clicked directly — no Select button)
const pla = readData().filaments.find(f => f.material === "PLA");
const plaCard = [...$("filamentList").querySelectorAll(".card")].find(c => c.textContent.includes("PLA"));
plaCard.dispatchEvent(new window.Event("click", { bubbles: true }));

// test context now active
ok($("testBody").hidden === false, "test body shown once printer+nozzle+filament chosen");
ok($("tab-test").dataset.mode === "advanced", "default mode advanced");
ok($("basicMethod").disabled === true, "method control locked in advanced");
ok($("basicMethod").value === "pattern", "advanced forces pattern method");
ok(/max accel 12000/.test($("testContext").innerHTML), "printer max accel shown on test page");
// sub-tabs: recommend default, switch to already-printed prefills PA range
ok(document.getElementById("subtab-recommend").classList.contains("active"), "recommend sub-tab active by default");
document.querySelector('.subtab-btn[data-subtab="printed"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(document.getElementById("subtab-printed").classList.contains("active"), "already-printed sub-tab activates");
ok(parseFloat($("pvStart").value) > 0, "printed sub-tab prefills PA range");
document.querySelector('.subtab-btn[data-subtab="recommend"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("accelLimit").disabled === true, "test-page accel ceiling is read-only");
ok(/Line width is set by Orca's method \(0.45 mm/.test($("geomHint").textContent), "line width Orca-derived (1.125x) from 0.4 nozzle");
ok($("lineW").type === "hidden", "line width field is hidden (Orca controls it, not shown to user)");
ok(parseFloat($("lineW").value) === 0.45, "hidden line width still carries the derived value");

ok(/12000/.test($("accelList").value), "accel list auto-scales to the selected printer's max accel");
// "Accel points" independently controls how many accel values are generated
$("accelPoints").value = "3";
$("accelPoints").dispatchEvent(new window.Event("change", { bubbles: true }));
ok($("accelList").value.split(",").length === 3, "accel points = 3 regenerates a 3-value accel list");
ok(/12000/.test($("accelList").value), "regenerated accel list still ends at the printer max");
$("accelPoints").value = "5";
$("accelPoints").dispatchEvent(new window.Event("change", { bubbles: true }));
ok($("accelList").value.split(",").length === 5, "accel points back to 5 regenerates a 5-value list");
ok(parseFloat($("accelList").value.split(",")[0]) >= 2000, "auto accel sweep floors at ~2000 (skips non-discriminating low accel)");
// flow points and accel points are independent (changing flow points leaves accel list alone)
const _accelBefore = $("accelList").value;
$("flowPoints").value = "7";
$("flowPoints").dispatchEvent(new window.Event("change", { bubbles: true }));
ok($("accelList").value === _accelBefore, "changing flow points does not touch the accel list (independent axes)");
$("flowPoints").value = "5";
// flow↔speed uses Orca's rounded-bead cross-section, not layer×width (verified vs real g-code)
$("layerH").value = "0.2";
const _bead = window.PA_test.beadArea();
ok(Math.abs(_bead - 0.081416) < 0.0005, "bead cross-section = layer×(width−layer·(1−π/4)) = 0.0814 mm² at 0.2×0.45");
ok(_bead < 0.2 * 0.45, "rounded-bead area is smaller than the naive layer×width product");
ok(Math.abs(198 * _bead - 16.12) < 0.2, "speed 198 mm/s → 16.1 mm³/s, matching the printed g-code");
// smart default point counts scale with the span each axis sweeps
const _sa = window.PA_test.suggestAccelPts, _ss = window.PA_test.suggestSpeedPts;
ok(_sa(2000) === 2 && _sa(5000) === 3 && _sa(8000) === 4 && _sa(12000) === 5 && _sa(16000) === 5, "accel points scale with log accel span (2000→2 … 12000→5)");
ok(_sa(20000) <= 5 && _sa(1000) >= 2, "accel points clamp to 2..5");
ok(_ss(8) === 2 && _ss(15) === 3 && _ss(25) === 5 && _ss(50) === 6, "speed points scale with flow envelope (minFlow 3), clamped to 2..6");
// speed axis: greyed max-speed box back-calculated from max flow; default display = nozzle velocity
$("maxFlow").value = "18";
$("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
ok($("axisMaxLabelText").textContent === "Max speed (mm/s)", "default display unit is nozzle velocity (mm/s)");
const _lh = parseFloat($("layerH").value) || 0.2, _lw = parseFloat($("lineW").value) || 0.45;
const _cf = _lh * (_lw - _lh * (1 - Math.PI / 4));   // rounded-bead cross-section (Orca's extrusion model)
ok(Math.abs(parseFloat($("axisMax").value) - Math.round(18 / _cf)) <= 1, "max speed = max flow ÷ rounded-bead cross-section");
ok($("speedList").value.split(",").length === parseInt($("flowPoints").value, 10), "speed list auto-fills one value per speed point");
const _speedMax = parseFloat($("axisMax").value);
// switching to volumetric rate recalculates the numbers
const _flowRadio = [...document.getElementsByName("recUnit")].find(r => r.value === "flow");
_flowRadio.checked = true; _flowRadio.dispatchEvent(new window.Event("change", { bubbles: true }));
ok($("axisMaxLabelText").textContent === "Max flow (mm³/s)", "switching relabels to volumetric rate (mm³/s)");
ok(Math.abs(parseFloat($("axisMax").value) - 18) < 0.5, "max box now shows the volumetric max (~18)");
ok(parseFloat($("axisMax").value) < _speedMax, "flow value differs from the nozzle-speed value (recalculated on switch)");
const _spdRadio = [...document.getElementsByName("recUnit")].find(r => r.value === "speed");
_spdRadio.checked = true; _spdRadio.dispatchEvent(new window.Event("change", { bubbles: true }));
ok($("axisMaxLabelText").textContent === "Max speed (mm/s)", "switching back to nozzle velocity");
$("maxFlow").value = ""; $("speedList").value = "";
// max-flow gate: the rest of the form is HIDDEN until max volumetric speed is confirmed
$("maxFlow").value = ""; $("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
ok($("gatedBody").hidden === true, "form is hidden while max flow is blank/unconfirmed");
ok($("maxFlowConfirm").disabled === true, "confirm disabled with no max flow value");
$("maxFlow").value = "20"; $("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
ok($("maxFlowConfirm").disabled === false && $("gatedBody").hidden === true, "value entered → confirm enabled, form still hidden until confirmed");
$("maxFlowConfirm").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("gatedBody").hidden === false && /Confirmed/.test($("maxFlowConfirm").textContent), "confirming max flow reveals the test form");
$("maxFlow").value = "22"; $("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
ok($("gatedBody").hidden === true, "editing max flow hides the form again until re-confirmed");
ok(![...$("testMode").options].some(o => o.value === "basic"), "basic mode is temporarily removed from the Mode dropdown (advanced-only for now)");
$("maxFlow").value = "20"; $("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
$("maxFlowConfirm").dispatchEvent(new window.Event("click", { bubbles: true }));   // re-confirm for the recommend flow below
$("speedList").value = "";   // the maxFlow inputs above auto-filled it; clear so recommend re-spaces from the count

// advanced recommend + grid
$("maxFlow").value = "20"; $("flowPoints").value = "3"; $("accelLimit").value = "10000"; $("accelList").value = "";
click("recommendBtn");
ok(/Test grid = 3 speeds × 5 accels = 15/.test($("recommendOut").textContent), "grid math 3x5=15");
ok($("recommendOut").querySelector(".planline") && /plate/i.test($("recommendOut").textContent), "recommend shows the plate-fit plan");
ok(/Speeds \(mm\/s\):/.test($("recommendOut").textContent), "recommend outputs Orca speeds");
const copyBtns = [...$("recommendOut").querySelectorAll(".copybtn")];
ok(copyBtns.length === 2, "copy buttons for accelerations + speeds");
ok(copyBtns.every(b => /^\d+(,\d+)+$/.test(b.getAttribute("data-copy"))), "copy value is comma-only data");
copyBtns[0].dispatchEvent(new window.Event("click", { bubbles: true }));
ok(copyBtns[0].classList.contains("copied"), "copy click shows copied state");
ok($("accelList").value.split(",").length === 5, "5 accel values auto-filled");
ok($("accelList").value.split(",").every(a => parseFloat(a) >= 100), "no PA-scale value leaks into accel");
click("loadPointsBtn");
let rows = $("resultsBody").querySelectorAll("tr");
ok(rows.length === 15, "15 grid rows loaded");
// range-edge flag: a Best PA sitting on the tested range ceiling/floor is flagged
{
  const txt = $("recommendOut").textContent;
  const endPA = parseFloat((txt.match(/End PA ([\d.]+)/) || [])[1]);
  const startPA = parseFloat((txt.match(/Start PA ([\d.]+)/) || [])[1]);
  const er = $("resultsBody").querySelector("tr");
  const paIn = er.querySelector('input[data-key="bestPA"]'), warn = er.querySelector(".edgewarn");
  const setPA = (v) => { paIn.value = v; paIn.dispatchEvent(new window.Event("input", { bubbles: true })); };
  setPA(String(endPA));
  ok(warn && warn.hidden === false, "Best PA on the range ceiling is flagged");
  setPA(((startPA + endPA) / 2).toFixed(3));
  ok(warn.hidden === true, "Best PA mid-range is not flagged");
  setPA("");   // restore so the picker/analysis tests below run against a clean row
}
// results always show flow, with speed on hover, and an override lock
const fr0 = $("resultsBody").querySelector("tr");
ok($("colUnit").textContent === "Flow (mm³/s)", "results column is flow");
const fi0 = fr0.querySelector('input[data-key="flow"]'), ov0 = fr0.querySelector("input.ovchk");
ok(ov0 && ov0.checked === false, "grid rows start locked (override off)");
ok(fi0.disabled === true, "flow locked when not overriding");
// generated picker opens and renders the pattern (no plate thumbnail — Orca bin-packs the layout)
fr0.querySelector("button.iconbtn").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("patternModal").hidden === false, "pattern picker opens");
ok($("patternSvg").querySelectorAll("line").length > 5, "picker renders the pattern block");
ok(!document.getElementById("patternThumb"), "no plate thumbnail element (dropped — position not predictable)");
$("patternModal").hidden = true;
ok(/mm\/s/.test(fi0.title), "flow cell shows speed on hover");
ov0.checked = true; ev(ov0, "change");
ok(fi0.disabled === false, "override unlocks flow");
ov0.checked = false; ev(ov0, "change");
// group/sort default accel: consecutive rows are non-decreasing in accel
const accCol = () => [...$("resultsBody").querySelectorAll('input[data-key="accel"]')].map(i => parseFloat(i.value));
const asc = (arr) => arr.every((v, i) => i === 0 || v >= arr[i - 1]);
ok(asc(accCol()), "rows grouped/sorted by accel by default");
$("resultSort").value = "flow"; ev($("resultSort"), "change");
const flowCol = [...$("resultsBody").querySelectorAll('input[data-key="flow"]')].map(i => parseFloat(i.value));
ok(asc(flowCol), "sort by flow reorders rows");
$("resultSort").value = "accel"; ev($("resultSort"), "change");
rows = $("resultsBody").querySelectorAll("tr"); // refresh: sorting rebuilt the DOM

// pattern picker: icon opens popup, one line per PA step, click selects, OK fills the row
const prow = $("resultsBody").querySelector("tr");
prow.querySelector("button.iconbtn").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("patternModal").hidden === false, "pattern picker opens");
const plines = $("patternSvg").querySelectorAll(".paline");
ok(plines.length >= 5, "pattern renders one line per PA step");
plines[3].dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("patternSvg").querySelectorAll(".paline.sel").length === 1, "clicking selects exactly one line");
click("patternOk");
ok($("patternModal").hidden === true, "OK closes the picker");
ok(!isNaN(parseFloat(prow.querySelector('input[data-key="bestPA"]').value)), "picked PA filled into the row");
rows = $("resultsBody").querySelectorAll("tr"); // refresh again (picker didn't rebuild, but be safe)
// fill best PA ~ linear in flow + accel with one outlier
rows.forEach((tr, i) => {
  const flow = parseFloat(tr.querySelector('input[data-key="flow"]').value);
  const acc = parseFloat(tr.querySelector('input[data-key="accel"]').value);
  let pa = 0.02 + 0.001 * flow + 0.000002 * acc;
  if (i === 7) pa += 0.05; // outlier
  tr.querySelector('input[data-key="bestPA"]').value = pa.toFixed(4);
});
click("analyzeBtn");
ok($("plot").childNodes.length > 0, "plot rendered");
ok(/outlier|clean|scattered/.test($("analysisOut").textContent), "analysis text produced");
ok($("resultsBody").querySelectorAll("tr.outlier").length >= 1, "outlier flagged");
click("exportBtnModel");
ok($("modelOut").value.split("\n").length === 15, "model has 15 lines");
ok($("modelBlock").hidden === false, "Adaptive-PA model block appears once Generate has produced output");
ok(/Single PA/.test($("singlePaOut").innerHTML), "single PA produced");

// save completed run
click("saveRunBtn");
d = readData();
ok(d.runs.length === 1 && d.runs[0].status === "complete", "completed run saved");
ok($("tab-filaments").classList.contains("active"), "saving a completed run returns to the filament page");
ok($("resultsBody").querySelectorAll("tr").length === 0, "saving a completed run resets the PA test grid");
ok(d.runs[0].results.length === 15, "run has 15 results");
ok(d.runs[0].maxFlow === 20, "run stores max volumetric speed");
// max speed remembered per printer+nozzle+filament: clear + re-select PLA -> prefilled
$("maxFlow").value = "";
const plaSel = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA"));
plaSel.dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("maxFlow").value === "20", "max speed pre-filled from last matching run");
ok(/Last max volumetric speed/.test($("flowHint").textContent), "prompt shows last-used value");

// speed unit conversion
$("unitMode").value = "speed"; ev($("unitMode"), "change");
ok($("colUnit").textContent === "Flow (mm³/s)", "results column stays flow when unit=speed");
// provide-form unit radio mirrors + drives the unit state
ok([...document.getElementsByName("pvUnit")].find(r => r.value === "speed").checked, "speed radio reflects unit state");
const flowRadio = [...document.getElementsByName("pvUnit")].find(r => r.value === "flow");
flowRadio.checked = true; ev(flowRadio, "change");
ok($("unitMode").value === "flow" && $("colUnit").textContent === "Flow (mm³/s)", "flow radio drives unit back");

// planned-run lifecycle
$("unitMode").value = "flow"; ev($("unitMode"), "change");
click("recommendBtn");
click("loadPointsBtn");
click("savePlannedBtn");
d = readData();
const planned = d.runs.filter(r => r.status === "planned");
ok(planned.length === 1, "planned run created");
ok($("tab-filaments").classList.contains("active"), "saving a planned run returns to the filament page");
ok($("resultsBody").querySelectorAll("tr").length === 0, "saving a planned run resets the PA test grid");
// regression: save a SECOND planned job for a different filament — must not clobber the first
{
  const runA = d.runs.find(r => r.status === "planned");
  const otherFil = d.filaments.find(f => f.id !== runA.filamentId);
  window.PA_test.selectFilament(otherFil.id);   // switch combo (as if setting up a new job)
  // savePlanned now resets the tab, so re-establish settings for the second job
  $("maxFlow").value = "20"; $("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
  $("maxFlowConfirm").dispatchEvent(new window.Event("click", { bubbles: true }));
  $("flowPoints").value = "3"; $("accelLimit").value = "10000"; $("accelList").value = ""; $("speedList").value = "";
  click("recommendBtn"); click("loadPointsBtn");
  window.PA_test.savePlanned();
  const d2 = readData();
  const planned2 = d2.runs.filter(r => r.status === "planned");
  ok(planned2.length === 2, "second planned job (different filament) is saved WITHOUT overwriting the first");
  ok(d2.runs.some(r => r.id === runA.id && r.filamentId === runA.filamentId), "the first saved run survives intact");
  ok(d2.runs.some(r => r.status === "planned" && r.filamentId === otherFil.id), "the second saved run has the new filament");
  window.PA_test.selectFilament(runA.filamentId);   // restore selection for downstream tests
}
// PA's in-progress run no longer gets its own pinned section — it's the same shared pattern
// as Iron: the PA button turns orange (warn) and clicking it jumps straight to the open run.
d = readData();
const plaCardResume = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA"));
const paResumeBtn = [...plaCardResume.querySelectorAll(".actions button")].find(b => /^PA/.test(b.textContent));
ok(paResumeBtn && paResumeBtn.classList.contains("warn"), "PA button is orange while a run is in progress");
paResumeBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("tab-test").classList.contains("active"), "clicking the in-progress PA button resumes the run (test tab)");
ok($("runInProgressModal").hidden === false, "in-progress explainer modal shown");
ok(/Resumed planned run/.test($("recommendOut").textContent), "resume populated test tab");
// formatVersion 2.0: geometry is never cached/persisted, so a resumed run's picker must
// regenerate purely from its stored settings (synthPatternBlock fallback in openPattern)
{
  const resumedRow = $("resultsBody").querySelector("tr");
  resumedRow.querySelector("button.iconbtn").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("patternModal").hidden === false, "resumed run's pattern picker opens");
  ok($("patternSvg").querySelectorAll("line").length > 5, "resumed run's picker renders geometry regenerated from settings, not a cache");
  $("patternModal").hidden = true;
}
$("runInProgressOk").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("runInProgressModal").hidden === true, "OK dismisses the explainer modal");
// clean up: the PA button now prioritizes an in-progress run over history (same as Iron), so
// later "completed run" tests need this outstanding planned run gone first. Resuming already
// marked the job dirty; abandon it via the unsaved-job guard (full delete, same path tested
// again further down for a different job).
[...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "printers").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("jobGuardModal").hidden === false, "navigating away from the resumed job prompts the unsaved guard");
$("jobGuardAbandon").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(!readData().runs.some(r => r.status === "planned" && r.filamentId === pla.id), "abandoning the resumed job deletes it (no more planned run for PLA)");

// export robustness: stamps lastExportedAt, status reflects freshness, later edits go stale
click("exportBtn");
let dex = readData();
ok(typeof dex.lastExportedAt === "string" && dex.lastExportedAt.length > 10, "export stamps lastExportedAt");
ok(dex.formatVersion === "2.0", "export includes formatVersion 2.0");
ok(!("gcodeCache" in dex), "export omits gcodeCache entirely");
ok(/exported/.test($("dataStatus").textContent) && !$("dataStatus").classList.contains("stale"), "status shows a fresh (not stale) export");
tickClock();
window.PA_test.savePlanned();   // any save bumps lastModifiedAt past the export
ok($("dataStatus").classList.contains("stale") && /newer than/.test($("dataStatus").textContent), "status flags saved changes newer than the last export");
// that savePlanned() call is only here to exercise the stale-flag check, but it's a real save —
// it leaves a fresh planned run sitting on PLA. savePlanned's own resetTestTab() already clears
// currentRunId back to null (by design — "leave the tab fresh for the next run"), so dirty+abandon
// would have nothing to delete; resume it properly first (same as the earlier cleanup) so
// currentRunId points at it again, then abandon, so it doesn't dangle into the "saved results
// modal" section further down.
{
  const plaCardAgain = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA") && !c.textContent.includes("(copy)"));
  const paBtnAgain = [...plaCardAgain.querySelectorAll(".actions button")].find(b => /^PA/.test(b.textContent));
  paBtnAgain.dispatchEvent(new window.Event("click", { bubbles: true }));   // resumes + sets currentRunId
  $("runInProgressOk").dispatchEvent(new window.Event("click", { bubbles: true }));
  [...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "printers").dispatchEvent(new window.Event("click", { bubbles: true }));
  $("jobGuardAbandon").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(!readData().runs.some(r => r.status === "planned" && r.filamentId === pla.id), "side-effect planned run from the stale-flag check is cleaned up");
}
ok(typeof window.PAStore.key === "string" && window.PAStore.key.length > 0, "storage key exposed for cross-tab sync");

// basic mode: currently unreachable from the UI (option removed from the Mode dropdown,
// see the "advanced-only for now" assertion above) — no in-UI coverage until it's re-enabled.

// clone + edit printer (Voron now has runs)
const beforeCount = readData().printers.length;
const vClone = [...$("printerList").querySelectorAll(".card")].find(c => /Trident 350/.test(c.textContent));
[...vClone.querySelectorAll(".actions button")].find(b => b.textContent === "Clone").dispatchEvent(new window.Event("click", { bubbles: true }));
d = readData();
ok(d.printers.length === beforeCount + 1, "clone adds a printer");
const clone = d.printers.find(p => /\(copy\)/.test(p.model || ""));
ok(clone && clone.nozzles.length >= 1 && clone.nozzles[0].id, "clone copies nozzles with new ids");

const vEdit = [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("Trident 350") && !/copy/.test(c.textContent));
[...vEdit.querySelectorAll(".actions button")].find(b => b.textContent === "Edit").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("printerAdd").open === true, "edit opens the printer form");
ok(getFieldKey($("printerForm"), "hotend") === "E3D Revo", "edit prefilled hotend");
setFieldKey($("printerForm"), "hotend", "E3D V6");
setFieldKey($("printerForm"), "name", "My Trident");
click("savePrinterBtn");
d = readData();
const vp = d.printers.find(p => p.model === "Trident 350");
ok(vp.hotend === "E3D V6", "edit saved new PA-factor (confirm passed)");
ok(vp.name === "My Trident", "printer name saved on edit");
ok([...$("printerList").querySelectorAll(".card .title")].some(t => t.textContent.includes("My Trident")), "custom name shows as the card title");
ok($("savePrinterBtn").textContent === "Save printer", "printer form reset after edit");

// nozzle cleanup on printer delete + re-add (Sean's report: nozzles "came back")
setFieldKey($("printerForm"), "maker", "Bambu Lab");
setFieldKey($("printerForm"), "model", "A1");
click("savePrinterBtn");            // fresh printer (auto-selected), seeds one nozzle
click("saveNozzleBtn");             // add a 2nd (extra) nozzle to it
const bBefore = readData().printers.find(p => p.maker === "Bambu Lab");
ok(bBefore.nozzles.length === 2, "extra nozzle added to printer");
const bCard = () => [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("Bambu Lab A1"));
const removeBtnIn = (card) => [...card.querySelectorAll(".actions button")].find(b => b.title === "Remove");
ok(removeBtnIn(bCard()).classList.contains("iconbtn") && removeBtnIn(bCard()).textContent.trim() === "", "Remove is an icon-only (trashcan) button, no text");
removeBtnIn(bCard()).dispatchEvent(new window.Event("click", { bubbles: true }));
ok(!readData().printers.some(p => p.maker === "Bambu Lab"), "printer removed");
setFieldKey($("printerForm"), "maker", "Bambu Lab");
setFieldKey($("printerForm"), "model", "A1");
click("savePrinterBtn");
const bAfter = readData().printers.find(p => p.maker === "Bambu Lab");
ok(bAfter.nozzles.length === 1, "re-added printer has one fresh nozzle (no stale nozzles carried over)");
ok(bAfter.nozzles[0].id !== bBefore.nozzles[0].id, "re-added printer's nozzle is a new instance");

// edit a filament (color, non-PA) -> no warn, saves
const pf = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA"));
[...pf.querySelectorAll(".actions button")].find(b => b.textContent === "Edit").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("saveFilamentBtn").textContent === "Update filament", "filament edit opens in update mode");
setFieldKey($("filamentForm"), "color", "Charcoal");
click("saveFilamentBtn");
d = readData();
ok(d.filaments.find(f => f.material === "PLA").color === "Charcoal", "filament edit saved");
ok($("saveFilamentBtn").textContent === "Save filament", "filament form reset after edit");

// clone a filament
const fbefore = readData().filaments.length;
const pf2 = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA"));
[...pf2.querySelectorAll(".actions button")].find(b => b.textContent === "Clone").dispatchEvent(new window.Event("click", { bubbles: true }));
d = readData();
ok(d.filaments.length === fbefore + 1, "filament clone adds one");
ok(d.filaments.some(f => (f.color || "").includes("(copy)")), "filament clone marked (copy)");

// saved-results modal (per filament): opens from the filament card, shows params + Orca-copy data
{
  const before = readData().runs.filter(r => r.status === "complete").length;
  ok(before >= 1, "a completed run exists to show results for");
  // scoped to the ORIGINAL PLA card specifically — another filament (otherFil) still has its
  // own in-progress PA button, and the PLA *clone* card (added a few steps up) also contains
  // "PLA" in its text, so an unscoped/uncareful match could grab either the wrong filament or
  // the copy (which has 0 runs and no PA button at all).
  const resBtn = () => {
    const card = [...document.querySelectorAll("#filamentList .card,#filamentList .frow")].find(c => c.textContent.includes("PLA") && !c.textContent.includes("(copy)"));
    return card && [...card.querySelectorAll(".actions button")].find(b => /^PA/.test(b.textContent));
  };
  ok(!!resBtn(), "filament with a completed run shows a PA button");
  resBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("resultsModal").hidden === false, "Results opens the modal over a dimmed backdrop");
  const body = $("resultsBodyView").textContent;
  ok(/Printer/.test(body) && /Filament/.test(body) && /Test settings/.test(body) && /Results/.test(body), "modal shows printer, filament, settings and results sections");
  // title bar: no "Results —" prefix, plus a colour swatch
  ok($("resultsTitle").textContent.length > 0 && !/Results\s*[—-]/.test($("resultsTitle").textContent), "modal title drops the 'Results —' prefix (just the filament)");
  ok(!!$("resultsSwatch"), "modal title bar has a colour swatch");
  // Printer/Filament/Test settings collapse (collapsed by default); Results does not
  const secs = [...$("resultsBodyView").querySelectorAll("details.rsec")];
  ok(secs.length === 3, "Printer/Filament/Test settings are three collapsible sections");
  ok(secs.every(d => !d.open), "sections are collapsed by default");
  ok(/^Printer - /.test(secs[0].querySelector("summary").textContent), "printer section title is 'Printer - [name]'");
  ok(/^Filament - /.test(secs[1].querySelector("summary").textContent), "filament section title is 'Filament - [name]'");
  ok(!$("resultsBodyView").querySelector("h3.rsec-static").closest("details"), "Results section is not collapsible");
  ok($("resultsClone").textContent === "Rerun with these settings", "run-clone button relabelled 'Rerun with these settings'");
  const copyBtns = [...$("resultsBodyView").querySelectorAll(".copybtn")];
  ok(copyBtns.length > 0, "results expose copy buttons for the Orca-bound values");
  copyBtns[0].dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(copyBtns[0].classList.contains("copied"), "copy button shows a copied state");
  // clone → a fresh editable run with blank results, modal closed, on the PA tab
  $("resultsClone").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("resultsModal").hidden === true, "clone closes the results modal");
  ok($("tab-test").classList.contains("active"), "clone opens the PA test tab");
  ok([...$("resultsBody").querySelectorAll('input[data-key="bestPA"]')].every(i => i.value === ""), "clone starts a new run with blank results (same settings)");
  ok($("resultsBody").querySelectorAll("tr.outlier").length === 0 && [...$("resultsBody").querySelectorAll(".edgewarn,.outlierwarn")].every(w => w.hidden), "clone clears stale row warning indicators");
  ok($("modelBlock").hidden === true, "clone hides the export model block (blank results = button only)");
  ok(/Delete this run/.test($("resultsDelete").title) && $("resultsDelete").classList.contains("iconbtn"), "run delete is an icon-only trashcan button");
  // re-open + delete
  resBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  $("resultsDelete").dispatchEvent(new window.Event("click", { bubbles: true }));   // confirm() mocked true
  ok(readData().runs.filter(r => r.status === "complete").length === before - 1, "delete removes the run");
  ok($("resultsModal").hidden === true, "deleting the last run for a filament closes the modal");
  ok(!resBtn(), "PA button disappears once the filament has no completed (or planned) runs");
}

// outlier flag: neighbour-based, catches a local mispick that a global test would miss (real ABS run)
{
  const abs = [
    [4.07, 1000, 0.03], [8.14, 1000, 0.03], [12.21, 1000, 0.03],
    [4.07, 2000, 0.01], [8.14, 2000, 0.025], [12.21, 2000, 0.03],
    [4.07, 4000, 0], [8.14, 4000, 0.02], [12.21, 4000, 0.02],
    [4.07, 8000, 0.01], [8.14, 8000, 0.005], [12.21, 8000, 0.015],
    [4.07, 12000, 0.04], [8.14, 12000, 0], [12.21, 12000, 0.01]
  ].map(([flow, accel, bestPA]) => ({ flow, accel, bestPA, override: true }));
  window.PA_test.loadGrid(abs);
  const flagged = [...$("resultsBody").querySelectorAll("tr")]
    .filter(tr => !tr.querySelector(".outlierwarn").hidden)
    .map(tr => ({ a: parseFloat(tr.querySelector('input[data-key="accel"]').value), pa: parseFloat(tr.querySelector('input[data-key="bestPA"]').value) }));
  ok(flagged.some(x => x.a === 12000 && Math.abs(x.pa - 0.04) < 1e-9), "outlier flag catches the 0.04 @ 12000 mispick");
  ok(!flagged.some(x => x.a === 1000), "clean flat low-accel row (all 0.03) is not flagged");
  ok(flagged.length <= 2, "outlier flag is conservative — doesn't light up the whole grid");
  window.PA_test.loadGrid([]);   // clear scratch grid
}

// DEBUG clear data (destructive — keep last)
click("debugClearBtn");
ok($("debugModal").hidden === false, "clear-data modal opens");
$("debugModal").querySelector('button[data-clear="filaments"]').dispatchEvent(new window.Event("click", { bubbles: true }));
ok(readData().filaments.length === 0 && readData().printers.length > 0, "clear filaments only wipes filaments");
click("debugClearBtn");
$("debugModal").querySelector('button[data-clear="all"]').dispatchEvent(new window.Event("click", { bubbles: true }));
d = readData();
ok(d.printers.length === 0 && d.filaments.length === 0 && d.runs.length === 0, "clear ALL wipes everything");
ok($("debugModal").hidden === true, "modal closes after clearing");

// g-code parser (best-effort)
const gc = ["; PA test", "M204 S1000", "M900 K0.02", "G1 X0 Y0", "G1 X10 E1 F1800", "M204 S4000", "M900 K0.03", "G1 X20 E1 F3000", "SET_PRESSURE_ADVANCE ADVANCE=0.04", "G1 X30 E1 F1800"].join("\n");
const gr = window.PA_parseGcode(gc);
ok(gr.paStart === 0.02 && gr.paEnd === 0.04, "gcode PA range parsed");
ok(Math.abs(gr.paStep - 0.01) < 1e-9, "gcode PA step parsed");
ok(gr.accels.length === 2 && gr.accels.includes(1000) && gr.accels.includes(4000), "gcode accels parsed");
ok(gr.speeds.includes(30) && gr.speeds.includes(50), "gcode speeds parsed (F/60)");
ok(gr.flow && Object.keys(gr.flow).length >= 1, "gcode parser returns true-flow map");

// pattern label formatting matches Orca convert_number_to_string (significant figures)
const _ns = window.PAPattern.numStr;
ok(_ns(12.86, 4) === "12.9" && _ns(7.9, 4) === "7.9" && _ns(3.01, 4) === "3.01" && _ns(17.83, 4) === "17.8", "flow prints at 3 sig figs when numberLen=4 (12.86 → 12.9), matching the print");
ok(_ns(12.86, 5) === "12.86" && _ns(3.01, 5) === "3.01", "a 5-digit accel bumps numberLen to 5 → flow keeps 4 sig figs (12.86)");
ok(_ns(5000, 4) === "5000" && _ns(12000, 5) === "12000", "accel (≥1000) prints at full precision");
ok(_ns(0.07, 4) === "0.07" && _ns(0.055, 5) === "0.055", "PA values print cleanly");
// generated block widens when the accel label is 5 digits (Orca max_numbering_length)
const _b4 = window.PAPattern.synthBlock({ paStart: 0.01, paEnd: 0.07, paStep: 0.01, lineWidth: 0.45, layerHeight: 0.2, wallLoops: 3, flow: 12.86, accel: 5000 });
const _b5 = window.PAPattern.synthBlock({ paStart: 0.01, paEnd: 0.07, paStep: 0.01, lineWidth: 0.45, layerHeight: 0.2, wallLoops: 3, flow: 12.86, accel: 12000 });
ok((_b5.rbox[3] - _b5.rbox[1]) > (_b4.rbox[3] - _b4.rbox[1]), "5-digit accel deepens the number tab (taller block)");

// plate-fit / layout engine
const P25 = window.PAPattern.planPlates({ bed: { shape: "rect", x: 350, y: 350 }, combos: Array.from({ length: 25 }, () => ({ accel: 8000, flow: 8 })), paStart: 0, paEnd: 0.08, paStep: 0.005, lineWidth: 0.44, layerHeight: 0.2, wallLoops: 3 });
ok(P25.fits && P25.perPlate >= 1 && P25.objW > 0, "plate-fit: objects fit a 350x350 bed");
ok(P25.plates === Math.ceil(25 / P25.perPlate) && P25.items.length === 25, "plate-fit: plate count = ceil(N/perPlate)");
const Ptiny = window.PAPattern.planPlates({ bed: { shape: "rect", x: 60, y: 40 }, combos: [{ accel: 8000, flow: 8 }], paStart: 0, paEnd: 0.08, paStep: 0.005, lineWidth: 0.44, layerHeight: 0.2, wallLoops: 3 });
ok(!Ptiny.fits && Ptiny.plates === Infinity, "plate-fit: object too big for a tiny bed does not fit");

// unsaved-PA-job guard: navigating away while dirty prompts; abandon proceeds and clears
const tabBtn = (t) => [...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === t);
ev($("resultsBody"), "input");   // marks a PA job dirty
tabBtn("filaments").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("jobGuardModal").hidden === false, "unsaved-job guard prompts on navigation");
ok(!$("tab-filaments").classList.contains("active"), "guard blocks the tab switch until resolved");
$("jobGuardAbandon").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("jobGuardModal").hidden === true && $("tab-filaments").classList.contains("active"), "abandon closes guard and proceeds to target tab");
tabBtn("printers").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("jobGuardModal").hidden === true && $("tab-printers").classList.contains("active"), "no guard once the job is cleared");

(async () => {
  // ---- multi-plate import + 3-state coverage ----
  const fakeFile = (name, text) => ({ name, text: () => Promise.resolve(text) });
  const genPlate = (combos) => {
    const pas = [0.015, 0.025, 0.035, 0.045, 0.055];
    const g = ["; filament_diameter: 1.75", "M83", "; start pressure advance pattern"];
    combos.forEach(([a, s], ci) => {
      g.push("SET_VELOCITY_LIMIT ACCEL=" + a);
      let x = ci * 40;
      pas.forEach(pa => { g.push("SET_PRESSURE_ADVANCE ADVANCE=" + pa); g.push(`G1 X${x} Y0 F${s * 60}`); g.push(`G1 X${x + 10} Y10 E0.5 F${s * 60}`); g.push(`G1 X${x} Y20 E0.5 F${s * 60}`); x += 3; });
    });
    g.push("; end pressure advance pattern");
    return g.join("\n");
  };
  const clickEl = (id) => $(id).dispatchEvent(new window.Event("click", { bubbles: true }));

  // A: one plate with a gap → reconstructable coverage prompt → complete the matrix
  window.PA_test.resetGcode();
  await window.PA_test.importGcode(fakeFile("p1.gcode", genPlate([[1000, 50], [2000, 50], [1000, 80]])));
  ok($("importAddBtn").hidden === false, "import shows the 'add plate' button");
  ok($("resultsBody").querySelectorAll("tr").length === 3, "first plate loads its 3 combos");
  ok($("coverageModal").hidden === false && $("coverageComplete").hidden === false, "a matrix gap flags reconstructable coverage");
  clickEl("coverageComplete");
  ok($("resultsBody").querySelectorAll("tr").length === 4, "Complete the matrix adds a placeholder row for the missing combo");
  ok($("coverageModal").hidden === true, "coverage modal closes after completing");

  // B: import the missing plate → merges to a complete matrix, no prompt
  window.PA_test.resetGcode();
  await window.PA_test.importGcode(fakeFile("q1.gcode", genPlate([[1000, 50], [2000, 50], [1000, 80]])));
  clickEl("coverageContinue");
  await window.PA_test.addPlate(fakeFile("q2.gcode", genPlate([[2000, 80]])));
  ok($("resultsBody").querySelectorAll("tr").length === 4, "adding the missing plate merges to a complete 4-combo matrix");
  ok($("coverageModal").hidden === false && $("coverageComplete").hidden === true, "a complete matrix still offers to import more plates (no gaps to fill)");
  clickEl("coverageContinue");
  ok($("coverageModal").hidden === true, "'that's the whole job' closes the coverage prompt");
  const row0 = $("resultsBody").querySelector("tr");
  row0.querySelector("button.iconbtn").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("patternSvg").querySelectorAll("line").length > 3, "imported picker renders the first-layer toolpath");
  ok(/plate \d+ of \d+/i.test($("patternTitle").textContent), "multi-plate import annotates the picker title with which plate");
  $("patternModal").hidden = true;

  // C: a first plate complete on its own STILL prompts to import more (the 5×4-of-5×5 case)
  window.PA_test.resetGcode();
  await window.PA_test.importGcode(fakeFile("c1.gcode", genPlate([[1000, 50], [2000, 50], [1000, 80], [2000, 80]])));
  ok($("coverageModal").hidden === false && $("coverageComplete").hidden === true, "a complete-looking first plate still prompts to import more plates");
  clickEl("coverageImport");
  ok($("coverageModal").hidden === true, "'import additional plate' closes the prompt");

  // ---- formatVersion 2.0 migration: old-format import drops gcodeCache and stamps 2.0 ----
  {
    const oldFormat = window.PAStore.defaultData();
    delete oldFormat.formatVersion;   // simulate a pre-2.0 export
    oldFormat.gcodeCache = { legacy: { byKey: {} } };
    oldFormat.runs = [{ id: "r1", status: "complete", printerId: "p1", nozzleId: "n1", filamentId: "f1", settings: {} }];
    const fakeOldFile = { text: () => Promise.resolve(JSON.stringify(oldFormat)) };
    const migrated = await window.PAStore.importJSON(fakeOldFile);
    ok(migrated.formatVersion === "2.0", "old-format import stamps formatVersion 2.0");
    ok(!("gcodeCache" in migrated), "old-format import drops gcodeCache");
    ok(migrated.runs.some(r => r.id === "r1"), "existing run data survives migration");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
