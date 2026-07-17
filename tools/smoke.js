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

// filament-tab Scope defaults to the tightest option, before anything touches it
ok($("filamentScope").value === "nozzle", "Scope defaults to 'This printer + nozzle'");

// printer-tab gating: no printer selected yet -> Filament tab disabled with a "select a
// printer" prompt, and navigating anywhere else bounces back to Printers with an explanation
{
  const filTabBtn = () => [...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "filaments");
  ok(filTabBtn().disabled === true, "Filament tab is disabled before any printer is selected");
  ok($("tabSelFilament").textContent.includes("Select a Printer"), "Filament tab subtitle prompts to select a printer");
  let lastAlert = "";
  const origAlert = window.alert;
  window.alert = (msg) => { lastAlert = msg; };
  [...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "filaments").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("tab-printers").classList.contains("active"), "navigating to Filaments with no printer selected bounces back to Printers");
  ok(/printer/i.test(lastAlert), "bounce-back explains why via an alert");
  window.alert = origAlert;
}

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
{
  const filTabBtn = [...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "filaments");
  ok(filTabBtn.disabled === false, "Filament tab re-enabled once a printer is selected");
  ok(!$("tabSelFilament").textContent.includes("Select a Printer"), "Filament tab subtitle drops the prompt once a printer is selected");
}
ok(d.printers[0].hotend === "E3D Revo", "hotend recorded");
ok(typeof d.printers[0].pubId === "string" && d.printers[0].pubId.length > 0, "printer has random pubId");
ok(d.printers[0].nozzles && d.printers[0].nozzles[0].diameter === 0.4, "printer seeded with a 0.4 nozzle");
ok(d.printers[0].bed && d.printers[0].bed.x === 350 && d.printers[0].bed.y === 350, "printer bed size saved");
ok($("nozzleSeedModal").hidden === false, "new printer prompts about its seeded nozzle");
$("nozzleSeedOk").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("nozzleSeedModal").hidden === true, "seeded-nozzle prompt dismisses on OK");

// Scope dropdown gating: with exactly one printer that has exactly one nozzle, every Scope value
// is identical — the whole dropdown should lock to "nozzle" rather than offer a choice with no
// actual effect
ok($("filamentScope").disabled === true, "single printer + single nozzle: Scope dropdown is locked");
ok(readData().filamentScope === "nozzle", "single printer + single nozzle: scope forced to the tightest value");
ok(/Locked here/.test($("filamentScopeHelp").title), "locked dropdown's tooltip explains why");

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
// add filament (custom formulation, plus a custom nickname)
setFieldKey($("filamentForm"), "name", "Kitchen Roll PLA");
setFieldKey($("filamentForm"), "maker", "Polymaker");
setFieldKey($("filamentForm"), "material", "PLA");
setFieldKey($("filamentForm"), "formulation", "PolyTerra");
setFieldKey($("filamentForm"), "diameter", "1.75");
click("saveFilamentBtn");
d = readData();
ok(d.filaments.length === 1, "filament saved");
ok(d.customOptions.filamentFormulation.includes("PolyTerra"), "custom formulation remembered");
ok(d.filaments[0].hardness == null, "hardness null for non-TPU filament");
ok(d.filaments[0].name === "Kitchen Roll PLA", "custom filament nickname is actually saved");
ok([...$("filamentList").querySelectorAll(".card .title")].some(t => t.textContent.includes("Kitchen Roll PLA")), "custom nickname shows as the filament card title");

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

// Scope dropdown gating: now two printers, but each still has just one nozzle — the dropdown
// itself is meaningful again ("all printers" now differs from "this printer"), but "This printer
// (any nozzle)" specifically is still a no-op (no printer has a second nozzle to distinguish), so
// only that one option should stay locked
ok($("filamentScope").disabled === false, "two single-nozzle printers: Scope dropdown itself unlocks");
ok($("filamentScopePrinterOpt").disabled === true, "two single-nozzle printers: 'This printer (any nozzle)' stays locked (still a no-op)");
ok(/n\/a/.test($("filamentScopePrinterOpt").textContent), "locked option's label explains why");

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
// printer/nozzle/filament context card lives in the fixed header, not the scrolling body, so it
// stays visible while scrolled into the settings below
ok($("testContext").closest(".results-head") != null, "PA test's context card lives in the modal's fixed header");
ok($("testContext").closest(".results-body") == null, "PA test's context card is not inside the scrolling body");
// Ironing modal gets the identical header treatment (same combo already selected above —
// updateIroningContext() already populated it via selectFilament, regardless of visibility)
$("tab-ironing").hidden = false;
ok($("ironingContext").closest(".results-head") != null, "Ironing test's context card lives in the modal's fixed header, same as PA");
ok($("ironingContext").closest(".results-body") == null, "Ironing test's context card is not inside the scrolling body");
click("ironModalClose");
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
{
  const basicOpt = [...$("testMode").options].find(o => o.value === "basic");
  ok(!!basicOpt && basicOpt.disabled, "basic mode is visible but disabled in the Mode dropdown (advanced-only for now)");
  ok(basicOpt.textContent === "Basic — Coming Soon™", "disabled basic option is labeled 'Basic — Coming Soon™'");
}
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
// z-index ties between same-level .modal elements resolve by DOM order (later wins) — patternModal
// must come after tab-test/tab-ironing so it renders on top when opened from inside the PA test,
// not behind it
ok(($("tab-test").compareDocumentPosition($("patternModal")) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0, "pattern picker is declared after the PA test modal (wins the stacking tie)");
ok(($("tab-ironing").compareDocumentPosition($("patternModal")) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0, "pattern picker is declared after the Ironing test modal (wins the stacking tie)");
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
ok($("singlePaOut").querySelector("label.blocklabel") !== null, "single PA shows a small title, matching the Adaptive PA model block's style");
{
  const label = $("singlePaOut").querySelector("label.blocklabel");
  const singleCopyBtn = label ? label.querySelector(".copybtn") : null;
  ok(!!singleCopyBtn, "single PA copy-to-clipboard icon sits in the label, matching the Adaptive PA model block's format");
  ok(!$("singlePaOut").querySelector(".out"), "single PA value isn't boxed — plain text like the Adaptive PA model block");
  const valBox = $("singlePaOut").querySelector(".resultblock b");
  ok(!!valBox, "single PA value sits on its own line below the label, unboxed");
  ok(!!singleCopyBtn && valBox && singleCopyBtn.getAttribute("data-copy") === valBox.textContent, "copy icon copies the exact value shown");
  const hint = $("singlePaOut").querySelector("p.hint");
  ok(!!hint && /fit at mid-point/.test(hint.textContent), "fit-note sits on its own line below the value");
  ok(!!hint && hint.querySelector("span.help") !== null, "fit-note has an explanatory tooltip icon");
}

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
ok($("tab-test").hidden === false, "clicking the in-progress PA button resumes the run (opens the PA modal)");
ok($("runInProgressModal").hidden === true, "no separate in-progress popup for PA anymore — the titlebar badge covers it");
ok(/Resumed planned run/.test($("recommendOut").textContent), "resume populated test tab");
// resuming a saved in-flight (planned) run locks every setting that shaped its results table —
// only the table itself (plus Analyze/Export/Save and the view-only sort) stays usable.
{
  ok($("testInFlightBadge").hidden === false && /In-Flight/.test($("testInFlightBadge").textContent) && /settings locked/i.test($("testInFlightBadge").textContent), "titlebar shows an In-Flight / settings-locked badge while resumed");
  ok($("abandonRunBtn").hidden === false, "Abandon button appears alongside the badge, no popup needed to explain why");
  ["maxFlow", "maxFlowConfirm", "testMode", "basicMethod", "layerH", "flowPoints", "speedList", "accelPoints", "accelList", "recommendBtn", "loadPointsBtn", "importGcodeBtn", "pvStart", "pvEnd", "pvStep", "pvFlows", "pvAccels", "pvLoadBtn"].forEach(id => {
    ok($(id).disabled === true, "resuming an in-flight run disables #" + id);
  });
  [...document.getElementsByName("recUnit"), ...document.getElementsByName("pvUnit")].forEach(r => ok(r.disabled === true, "resuming an in-flight run disables the " + r.name + " radio"));
  ok($("resultSort").disabled !== true, "'Group / sort by' stays enabled while locked (view-only, doesn't touch the test)");
  const lockedRow = $("resultsBody").querySelector("tr");
  ok(lockedRow.querySelector(".ovchk").disabled === true, "an existing row's Override checkbox is disabled — can't unlock its flow/accel");
  ok(lockedRow.querySelector('input[data-key="flow"]').disabled === true && lockedRow.querySelector('input[data-key="accel"]').disabled === true, "existing row's flow/accel stay locked (Override can't be ticked to free them)");
  ok(lockedRow.querySelector('input[data-key="bestPA"]').disabled !== true && lockedRow.querySelector('input[data-key="notes"]').disabled !== true, "existing row's Best PA / Notes stay editable — that's the whole point of resuming");
  ok($("analyzeBtn").disabled !== true && $("exportBtnModel").disabled !== true && $("savePlannedBtn").disabled !== true && $("saveRunBtn").disabled !== true, "Analyze / Export / Save stay usable while locked");
  const rowsBefore = $("resultsBody").querySelectorAll("tr").length;
  click("addRowBtn");
  const newRow = $("resultsBody").querySelectorAll("tr")[rowsBefore];
  ok($("resultsBody").querySelectorAll("tr").length === rowsBefore + 1, "Add row still works while locked");
  ok(newRow.querySelector(".ovchk").disabled === true, "a freshly added row's Override checkbox is still disabled (can't be un-ticked either way)");
  ok(newRow.querySelector('input[data-key="flow"]').disabled !== true && newRow.querySelector('input[data-key="accel"]').disabled !== true, "…but a freshly added row's flow/accel start out editable — it's the only way to define a new row's identity");
  newRow.querySelector("td:last-child button").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("resultsBody").querySelectorAll("tr").length === rowsBefore, "Delete row still works while locked");
}
// formatVersion 2.0: geometry is never cached/persisted, so a resumed run's picker must
// regenerate purely from its stored settings (synthPatternBlock fallback in openPattern)
{
  const resumedRow = $("resultsBody").querySelector("tr");
  resumedRow.querySelector("button.iconbtn").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("patternModal").hidden === false, "resumed run's pattern picker opens");
  ok($("patternSvg").querySelectorAll("line").length > 5, "resumed run's picker renders geometry regenerated from settings, not a cache");
  $("patternModal").hidden = true;
}
// resuming an already-saved planned run is NOT itself an unsaved change — closing right back up
// with no edits made must NOT prompt the guard (previously it always did: openRun() used to mark
// the job dirty unconditionally on resume, regardless of whether anything was actually touched).
click("paModalClose");
ok($("jobGuardModal").hidden === true, "closing a freshly-resumed run with no edits does not prompt the guard");
ok($("tab-test").hidden === true, "…and the modal actually closes, no guard in the way");
// clean up: the PA button now prioritizes an in-progress run over history (same as Iron), so
// later "completed run" tests need this outstanding planned run gone first. Re-open it, make a
// real edit this time (so there's something genuinely unsaved), then abandon via the guard.
{
  const plaCardResume2 = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA") && !c.textContent.includes("(copy)"));
  const paResumeBtn2 = [...plaCardResume2.querySelectorAll(".actions button")].find(b => /^PA/.test(b.textContent));
  paResumeBtn2.dispatchEvent(new window.Event("click", { bubbles: true }));
  ev($("resultsBody"), "input");   // simulate actually entering a result
  click("paModalClose");
  ok($("jobGuardModal").hidden === false, "closing the PA modal after a real edit prompts the unsaved guard");
  $("jobGuardAbandon").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(!readData().runs.some(r => r.status === "planned" && r.filamentId === pla.id), "abandoning the resumed job deletes it (no more planned run for PLA)");
  ok($("tab-test").hidden === true, "abandon also closes the PA modal");
}

// export robustness: stamps lastExportedAt, status reflects freshness, later edits go stale
click("exportBtn");
let dex = readData();
ok(typeof dex.lastExportedAt === "string" && dex.lastExportedAt.length > 10, "export stamps lastExportedAt");
ok(dex.formatVersion === "2.1", "export includes formatVersion 2.1");
ok(!("gcodeCache" in dex), "export omits gcodeCache entirely");
ok(/exported/.test($("dataStatus").textContent) && !$("dataStatus").classList.contains("stale"), "status shows a fresh (not stale) export");
tickClock();
window.PA_test.savePlanned();   // any save bumps lastModifiedAt past the export
ok($("dataStatus").classList.contains("stale") && /newer than/.test($("dataStatus").textContent), "status flags saved changes newer than the last export");
// that savePlanned() call is only here to exercise the stale-flag check, but it's a real save —
// it leaves a fresh planned run sitting on PLA. savePlanned's own resetTestTab() already clears
// currentRunId back to null (by design — "leave the tab fresh for the next run"), so resume it
// properly first (same as the earlier cleanup) so currentRunId points at it again. This time,
// clean up with the direct "Abandon this run" button instead of the dirty-edit-then-guard dance —
// exercising the whole point of that button: no field to twiddle first.
{
  const plaCardAgain = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA") && !c.textContent.includes("(copy)"));
  const paBtnAgain = [...plaCardAgain.querySelectorAll(".actions button")].find(b => /^PA/.test(b.textContent));
  paBtnAgain.dispatchEvent(new window.Event("click", { bubbles: true }));   // resumes + sets currentRunId
  ok($("abandonRunBtn").hidden === false, "Abandon button is offered directly on a resumed in-flight run");
  click("abandonRunBtn");   // confirm() is mocked true — and nothing was dirtied first, that's the point
  ok(!readData().runs.some(r => r.status === "planned" && r.filamentId === pla.id), "Abandon button removes the run immediately, with no edit required first");
  ok($("tab-test").hidden === true, "Abandon button also closes the PA modal");
  ok($("abandonRunBtn").hidden === true, "Abandon button hides itself again once there's no in-flight run open");
}
ok(typeof window.PAStore.key === "string" && window.PAStore.key.length > 0, "storage key exposed for cross-tab sync");

// basic mode: still unreachable from the UI (disabled option in the Mode dropdown, see the
// "advanced-only for now" assertion above) — no in-UI coverage until it's actually re-enabled.

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

// editing the CURRENTLY SELECTED filament to restrict it away from the currently selected
// printer hides its card (renderFilaments' pin filter) — the selection needs to clear along with
// it, otherwise it keeps silently driving the PA/Ironing test context for a filament the user can
// no longer see or reach
{
  // "My Trident" is the renamed Voron from the earlier printer-edit test — a stable, distinctly
  // named target to restrict to (a plain "any printer that isn't the current one" pick would also
  // catch the untouched Voron *clone* left over from the "clone + edit printer" test earlier, which
  // isn't a printer this test can navigate back to by name)
  const otherPrinterId = readData().printers.find(p => p.name === "My Trident").id;
  const plaCardSel = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA") && !c.textContent.includes("(copy)"));
  plaCardSel.dispatchEvent(new window.Event("click", { bubbles: true }));   // select it
  const plaId = readData().filaments.find(f => f.material === "PLA").id;
  ok(readData().lastFilamentId === plaId, "PLA filament is selected before the edit");
  const curPrinterId = readData().lastPrinterId;
  ok(curPrinterId !== otherPrinterId, "the currently selected printer isn't the one we're about to restrict to");
  [...plaCardSel.querySelectorAll(".actions button")].find(b => b.textContent === "Edit").dispatchEvent(new window.Event("click", { bubbles: true }));
  $("filamentRestrict").checked = true; ev($("filamentRestrict"), "change");
  const otherPrinterCb = [...$("filamentPrinters").querySelectorAll("input")].find(cb => cb.value === otherPrinterId);
  ok(!!otherPrinterCb, "'My Trident' is available to restrict to");
  otherPrinterCb.checked = true;
  click("saveFilamentBtn");
  d = readData();
  const plaNow = d.filaments.find(f => f.id === plaId);
  ok(plaNow.printers.length === 1 && plaNow.printers[0] === otherPrinterId, "PLA filament now restricted to a printer OTHER than the currently selected one");
  ok(d.lastFilamentId == null, "restricting the selected filament away from the current printer clears the selection");
  ok(![...$("filamentList").querySelectorAll(".card,.frow")].some(c => c.textContent.includes("PLA")), "the now-restricted PLA filament is hidden from the current printer's list");
  ok($("filamentPinNotice").hidden === false, "pin notice shown for the newly-hidden filament");
  ok(/No filament selected/.test($("testContext").textContent), "PA test context reflects no filament selected, not the hidden one");
  ok(/No filament selected/.test($("ironingContext").textContent), "Ironing test context reflects no filament selected, not the hidden one");

  // cleanup: undo the restriction so downstream tests (clone, saved-results modal, etc.) can find
  // PLA again — switch to "My Trident" (making it visible), remove the restriction, then switch
  // back to the printer that was selected before this block
  const otherPrinterCard = [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("My Trident"));
  otherPrinterCard.dispatchEvent(new window.Event("click", { bubbles: true }));
  const plaCardVisibleAgain = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA"));
  ok(!!plaCardVisibleAgain, "PLA visible again once its pinned printer is selected");
  [...plaCardVisibleAgain.querySelectorAll(".actions button")].find(b => b.textContent === "Edit").dispatchEvent(new window.Event("click", { bubbles: true }));
  $("filamentRestrict").checked = false; ev($("filamentRestrict"), "change");
  click("saveFilamentBtn");
  ok(readData().filaments.find(f => f.id === plaId).printers.length === 0, "cleanup: PLA restriction removed");
  const origPrinterCard = [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("Bambu Lab A1"));
  origPrinterCard.dispatchEvent(new window.Event("click", { bubbles: true }));
}

// clone a filament
const fbefore = readData().filaments.length;
const pf2 = [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("PLA"));
[...pf2.querySelectorAll(".actions button")].find(b => b.textContent === "Clone").dispatchEvent(new window.Event("click", { bubbles: true }));
d = readData();
ok(d.filaments.length === fbefore + 1, "filament clone adds one");
ok(d.filaments.some(f => (f.color || "").includes("(copy)")), "filament clone marked (copy)");

// saved-results modal (per filament): opens from the filament card, shows params + Orca-copy data
{
  // this block tests the modal itself, not Scope filtering — earlier clone/re-add steps left a
  // different printer selected than the one the completed run was made under, which (correctly,
  // under the new "nozzle" default) would grey out its PA button. Widen to "all" so the button
  // reflects the filament's full history regardless of what's currently selected.
  $("filamentScope").value = "all"; ev($("filamentScope"), "change");
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
  ok(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(body), "a completed run's Date field renders in the default YYYY-MM-DD HH:MM (24h, absolute) format");
  // Single PA carries over into the saved-results view the same way it looked live: a small
  // title (with its copy icon) outside the box, the value unboxed on its own line below (same
  // plain-text presentation as the Adaptive PA model block), and the fit-note below that.
  ok(/Single PA/.test(body), "saved-results view shows the Single PA value");
  ok($("resultsBodyView").querySelector("label.blocklabel + div.resultblock b") !== null, "saved-results view: Single PA title sits right before its unboxed value, same as live");
  ok($("resultsBodyView").querySelector("label.blocklabel .copybtn") !== null, "saved-results view: Single PA copy icon sits in the label, not next to the value");
  ok($("resultsBodyView").querySelector("p.hint span.help") !== null, "saved-results view: Single PA fit-note keeps its tooltip");
  {
    const orcaIdx = body.indexOf("Single PA"), adaptiveIdx = body.indexOf("Adaptive PA model");
    ok(orcaIdx >= 0 && adaptiveIdx >= 0 && orcaIdx < adaptiveIdx, "saved-results view: Single PA renders above Adaptive PA model, mirroring Orca's own order");
  }
  // title bar: printer/nozzle row (with maker icon) on top, filament row (with swatch) below —
  // instead of the old single filament-name title
  ok($("resultsPrinterRow").textContent.length > 0 && !/deleted/.test($("resultsPrinterRow").textContent), "title's printer/nozzle row is populated");
  ok($("resultsFilamentRow").textContent.length > 0 && !/deleted/.test($("resultsFilamentRow").textContent), "title's filament row is populated");
  ok(!!$("resultsFilamentRow").querySelector(".colorsq"), "filament row shows a colour swatch");
  ok($("resultsPrinterRow").querySelector(".tsname") && $("resultsPrinterRow").querySelector(".tssub"), "printer row has a name line and a nozzle sub-line");
  // Results is first and not collapsible; Printer/Filament/Test settings/Data table/Plot & Analysis
  // follow, all collapsed by default — the last two mirror the in-flight test's own section order
  // (settings, then the table, then Analyze) and only appear because this run has a full grid.
  ok(!$("resultsBodyView").querySelector("h3.rsec-static").closest("details"), "Results section is not collapsible");
  ok($("resultsBodyView").firstElementChild.tagName === "H3" && $("resultsBodyView").firstElementChild.classList.contains("rsec-static"), "Results is the first thing in the modal body");
  const secs = [...$("resultsBodyView").querySelectorAll("details.rsec")];
  ok(secs.length === 5, "Printer/Filament/Test settings/Data table/Plot & Analysis are five collapsible sections (this run has a full grid)");
  ok(secs.every(d => !d.open), "sections are collapsed by default");
  ok(/^Printer - /.test(secs[0].querySelector("summary").textContent), "printer section title is 'Printer - [name]'");
  ok(/^Filament - /.test(secs[1].querySelector("summary").textContent), "filament section title is 'Filament - [name]'");
  ok(/^Test settings/.test(secs[2].querySelector("summary").textContent), "test settings section comes third");
  ok(/^Data table/.test(secs[3].querySelector("summary").textContent), "Data table section comes fourth");
  ok(/^Plot & Analysis/.test(secs[4].querySelector("summary").textContent), "Plot & Analysis section comes fifth (last)");
  // Data table: read-only — no Override checkboxes, no Delete buttons, every value cell disabled
  {
    const viewRows = [...secs[3].querySelectorAll("#viewResultsBody tr")];
    ok(viewRows.length === 15, "read-only data table shows all 15 saved rows");
    ok(viewRows.every(tr => !tr.querySelector(".ovchk")), "read-only rows have no Override checkbox");
    ok(viewRows.every(tr => !tr.querySelector('button:not(.iconbtn)')), "read-only rows have no Delete button");
    ok(viewRows.every(tr => ["flow", "accel", "bestPA", "notes"].every(k => tr.querySelector(`input[data-key="${k}"]`).disabled)), "every value in a read-only row is disabled — nothing here can be edited");
    ok(viewRows.every(tr => !!tr.querySelector("button.iconbtn")), "read-only rows still have the pattern-picker button");
  }
  // Plot & Analysis: recomputed from the saved run's results, same as the live Analyze button
  {
    const plotSvg = secs[4].querySelector("#viewPlot"), analysisOut = secs[4].querySelector("#viewAnalysisOut");
    ok(!!plotSvg && plotSvg.childNodes.length > 0, "read-only plot is drawn from the saved run's data");
    ok(!!analysisOut && /badge/.test(analysisOut.innerHTML), "read-only analysis text is produced (clean/outlier/scattered badge)");
  }
  // Read-only pattern picker: opens for reference, but nothing about it is editable
  {
    const firstPickBtn = secs[3].querySelector("#viewResultsBody tr button.iconbtn");
    firstPickBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    ok($("patternModal").hidden === false, "read-only pick button still opens the picker");
    ok($("patternModal").classList.contains("readonly"), "picker is flagged read-only");
    const beforeSelText = $("patternSel").textContent;
    const otherLine = [...$("patternSvg").querySelectorAll(".paline")].find(g => !g.classList.contains("sel"));
    if (otherLine) otherLine.dispatchEvent(new window.Event("click", { bubbles: true }));
    ok($("patternSel").textContent === beforeSelText, "clicking another line does nothing in read-only mode — highlighting is fixed");
    const bestPaBefore = firstPickBtn.closest("tr").querySelector('input[data-key="bestPA"]').value;
    click("patternOk");
    ok($("patternModal").hidden === true, "OK just closes the read-only picker");
    ok(firstPickBtn.closest("tr").querySelector('input[data-key="bestPA"]').value === bestPaBefore, "OK does not write anything back in read-only mode");
  }
  // scroll position: replacing #resultsBodyView's innerHTML doesn't reset its own scrollTop on its
  // own (same scrollable element, just new children) — verify the explicit reset actually fires
  {
    $("resultsBodyView").scrollTop = 500;   // simulate a leftover scroll position from a previous view
    click("resultsClose");
    resBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
    ok($("resultsBodyView").scrollTop === 0, "reopening a saved run resets scroll to the top, even if the last view was left scrolled down");
  }
  ok($("resultsClone").textContent === "Rerun with these settings", "run-clone button relabelled 'Rerun with these settings'");
  const copyBtns = [...$("resultsBodyView").querySelectorAll(".copybtn")];
  ok(copyBtns.length > 0, "results expose copy buttons for the Orca-bound values");
  copyBtns[0].dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(copyBtns[0].classList.contains("copied"), "copy button shows a copied state");
  // clone → a fresh editable run with blank results, modal closed, on the PA tab
  $("resultsClone").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("resultsModal").hidden === true, "clone closes the results modal");
  ok($("tab-test").hidden === false, "clone opens the PA modal");
  ok([...$("resultsBody").querySelectorAll('input[data-key="bestPA"]')].every(i => i.value === ""), "clone starts a new run with blank results (same settings)");
  ok($("resultsBody").querySelectorAll("tr.outlier").length === 0 && [...$("resultsBody").querySelectorAll(".edgewarn,.outlierwarn")].every(w => w.hidden), "clone clears stale row warning indicators");
  ok($("modelBlock").hidden === true, "clone hides the export model block (blank results = button only)");
  ok(/Delete this run/.test($("resultsDelete").title) && $("resultsDelete").classList.contains("iconbtn"), "run delete is an icon-only trashcan button");
  // re-open + delete
  resBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  $("resultsDelete").dispatchEvent(new window.Event("click", { bubbles: true }));   // confirm() mocked true
  ok(readData().runs.filter(r => r.status === "complete").length === before - 1, "delete removes the run");
  ok($("resultsModal").hidden === true, "deleting the last run for a filament closes the modal");
  {
    const btn = resBtn();
    ok(!!btn && btn.classList.contains("muted") && !btn.disabled, "PA button goes grey/inert but stays clickable once the filament has no completed (or planned) runs — grey now means 'start a fresh test', not disabled");
  }
  // cleanup: the clone above (line ~617) left the PA modal open with an unsaved (never-persisted)
  // run — close it via the unsaved-job guard so it doesn't leak into later sections.
  click("paModalClose");
  ok($("jobGuardModal").hidden === false, "closing the still-dirty cloned PA modal prompts the guard");
  $("jobGuardAbandon").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("tab-test").hidden === true, "PA modal closed after cleanup");
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

// filament-tab Scope: PA/Iron button state, count, and click target follow the selected
// printer/nozzle scope, not just which filament they belong to
{
  // an earlier block (saved-results modal) deliberately widened Scope to "all" to test modal
  // mechanics regardless of filter state, and never needed to reset it — pin it back here so
  // this block's own nozzle/printer/all transitions are unambiguous regardless of run order.
  $("filamentScope").value = "nozzle"; ev($("filamentScope"), "change");

  // fresh printer with two nozzles, fresh filament — disposable, just for this test
  setFieldKey($("printerForm"), "maker", "ScopeTestCo");
  setFieldKey($("printerForm"), "model", "RigY");
  click("savePrinterBtn");
  let dd = readData();
  const sp = dd.printers.find(p => p.maker === "ScopeTestCo");
  setFieldKey($("nozzleForm"), "diameter", "0.6");
  click("saveNozzleBtn");   // second nozzle, distinguishable by diameter
  dd = readData();
  const sNozA = dd.printers.find(p => p.id === sp.id).nozzles.find(n => Number(n.diameter) === 0.4);
  const sNozB = dd.printers.find(p => p.id === sp.id).nozzles.find(n => Number(n.diameter) === 0.6);

  setFieldKey($("filamentForm"), "maker", "ScopeCo");
  setFieldKey($("filamentForm"), "material", "PLA");
  click("saveFilamentBtn");
  const scopeFil = readData().filaments.find(f => f.maker === "ScopeCo");

  const spCard = () => [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("RigY"));
  const nozCardS = (n) => [...$("nozzleList").querySelectorAll(".card")].find(c => c.textContent.includes(n.diameter + "mm"));
  const scopeFilCard = () => [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("ScopeCo"));
  const scopeBtn = () => [...scopeFilCard().querySelectorAll(".actions button")].find(b => /^PA/.test(b.textContent));

  spCard().dispatchEvent(new window.Event("click", { bubbles: true }));
  nozCardS(sNozA).dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(scopeBtn().classList.contains("muted") && !scopeBtn().disabled, "brand-new filament is grey (but clickable) under nozzle scope (no runs anywhere yet)");

  // save a planned run under this printer + nozzle A
  $("maxFlow").value = "20"; $("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
  $("maxFlowConfirm").dispatchEvent(new window.Event("click", { bubbles: true }));
  $("flowPoints").value = "3"; $("accelLimit").value = "4000"; $("accelList").value = ""; $("speedList").value = "";
  click("recommendBtn"); click("loadPointsBtn");
  window.PA_test.savePlanned();   // bounces to the Filaments tab; re-select the same combo below

  spCard().dispatchEvent(new window.Event("click", { bubbles: true }));
  nozCardS(sNozA).dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(scopeBtn().classList.contains("warn") && !scopeBtn().disabled, "nozzle scope: orange once a run exists on this exact printer+nozzle");

  // switch to nozzle B on the SAME printer — nozzle scope no longer sees the run
  nozCardS(sNozB).dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(scopeBtn().classList.contains("muted") && !scopeBtn().disabled, "nozzle scope: grey (but clickable) on a different nozzle of the same printer");

  // widen to printer scope (any nozzle) — the run counts again from nozzle B
  $("filamentScope").value = "printer"; ev($("filamentScope"), "change");
  ok(scopeBtn().classList.contains("warn") && !scopeBtn().disabled, "printer scope: orange regardless of which nozzle is selected, same printer");

  // switch to a completely different, still-alive printer — printer scope no longer sees the run
  const bCardHere = () => [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("Bambu Lab A1"));
  bCardHere().dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(scopeBtn().classList.contains("muted") && !scopeBtn().disabled, "printer scope: grey (but clickable) on a completely different printer");

  // widen to all printers — the run counts regardless of current selection
  $("filamentScope").value = "all"; ev($("filamentScope"), "change");
  ok(scopeBtn().classList.contains("warn") && !scopeBtn().disabled, "all-printers scope: orange regardless of which printer/nozzle is selected");

  // Scope dropdown gating: RigY (this block's printer) has two nozzles, so the fleet is "mixed" —
  // everything should be fully unlocked, regardless of how many other single-nozzle printers exist
  ok($("filamentScope").disabled === false, "mixed fleet (a multi-nozzle printer exists): Scope dropdown is not locked");
  ok($("filamentScopePrinterOpt").disabled === false, "mixed fleet: 'This printer (any nozzle)' stays enabled");
  ok($("filamentScopePrinterOpt").textContent === "This printer (any nozzle)", "mixed fleet: option label is the plain, unqualified one");
  // pick "printer" scope, then remove RigY's second nozzle — the fleet becomes all-single-nozzle
  // (assuming no other printer at this point has more than one), so the option should lock AND the
  // now-unselectable "printer" value should snap down to "nozzle" rather than sit stale
  $("filamentScope").value = "printer"; ev($("filamentScope"), "change");
  ok(readData().filamentScope === "printer", "scope set to 'printer' ahead of the nozzle-count-drop check");
  spCard().dispatchEvent(new window.Event("click", { bubbles: true }));   // RigY must be selected — removeNozzle acts on data.lastPrinterId
  const nozBRemoveBtn = [...nozCardS(sNozB).querySelectorAll(".actions button")].find(b => b.textContent === "Remove");
  nozBRemoveBtn.dispatchEvent(new window.Event("click", { bubbles: true }));   // confirm() mocked true
  ok(readData().printers.find(p => p.id === sp.id).nozzles.length === 1, "RigY's second nozzle removed, back to a single-nozzle printer");
  ok($("filamentScopePrinterOpt").disabled === true, "fleet now all-single-nozzle: 'This printer (any nozzle)' locks again");
  ok(/n\/a/.test($("filamentScopePrinterOpt").textContent), "locked option's label explains why");
  ok(readData().filamentScope === "nozzle", "the now-unselectable 'printer' scope snapped down to 'nozzle' automatically");
  ok($("filamentScope").disabled === false, "more than one printer still exists, so the dropdown itself stays usable (only the option locked)");

  // clean up: resume + abandon the scope-test run, remove the disposable printer/filament,
  // restore the default scope for the sections that follow
  spCard().dispatchEvent(new window.Event("click", { bubbles: true }));
  nozCardS(sNozA).dispatchEvent(new window.Event("click", { bubbles: true }));
  $("filamentScope").value = "nozzle"; ev($("filamentScope"), "change");
  scopeBtn().dispatchEvent(new window.Event("click", { bubbles: true }));   // resumes the run
  click("abandonRunBtn");   // confirm() is mocked true
  ok(!readData().runs.some(r => r.filamentId === scopeFil.id), "scope-test run cleaned up");
  const spRemoveBtn = () => [...spCard().querySelectorAll(".actions button")].find(b => b.title === "Remove");
  spRemoveBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  [...scopeFilCard().querySelectorAll(".actions button")].find(b => b.title === "Remove").dispatchEvent(new window.Event("click", { bubbles: true }));
  [...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "printers").dispatchEvent(new window.Event("click", { bubbles: true }));
}

// one in-flight run per printer+nozzle+filament combo (PA + Iron) — saving again for the exact
// same combo updates the existing in-flight run in place; a different nozzle on the same printer
// is a genuinely separate combo and gets its own independent in-flight run
{
  setFieldKey($("printerForm"), "maker", "FlightTestCo");
  setFieldKey($("printerForm"), "model", "RigF");
  click("savePrinterBtn");
  let dd = readData();
  const fp = dd.printers.find(p => p.maker === "FlightTestCo");
  setFieldKey($("nozzleForm"), "diameter", "0.6");
  click("saveNozzleBtn");
  dd = readData();
  const fNozA = dd.printers.find(p => p.id === fp.id).nozzles.find(n => Number(n.diameter) === 0.4);
  const fNozB = dd.printers.find(p => p.id === fp.id).nozzles.find(n => Number(n.diameter) === 0.6);

  setFieldKey($("filamentForm"), "maker", "FlightCo");
  setFieldKey($("filamentForm"), "material", "PLA");
  click("saveFilamentBtn");
  const flightFil = readData().filaments.find(f => f.maker === "FlightCo");

  const fpCard = () => [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("RigF"));
  const fNozCard = (n) => [...$("nozzleList").querySelectorAll(".card")].find(c => c.textContent.includes(n.diameter + "mm"));
  const flightFilCard = () => [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("FlightCo"));
  const runsForNoz = (n) => readData().runs.filter(r => r.printerId === fp.id && r.nozzleId === n.id && r.filamentId === flightFil.id);
  const ironForNoz = (n) => readData().ironingRuns.filter(r => r.printerId === fp.id && r.nozzleId === n.id && r.filamentId === flightFil.id);

  const planRun = (accelLimit) => {
    $("maxFlow").value = "20"; $("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
    $("maxFlowConfirm").dispatchEvent(new window.Event("click", { bubbles: true }));
    $("flowPoints").value = "3"; $("accelLimit").value = String(accelLimit); $("accelList").value = ""; $("speedList").value = "";
    click("recommendBtn"); click("loadPointsBtn");
    window.PA_test.savePlanned();
  };

  fpCard().dispatchEvent(new window.Event("click", { bubbles: true }));
  fNozCard(fNozA).dispatchEvent(new window.Event("click", { bubbles: true }));
  flightFilCard().dispatchEvent(new window.Event("click", { bubbles: true }));

  planRun(4000);
  ok(runsForNoz(fNozA).length === 1, "PA: first planned run for the combo saved");

  // re-select the SAME combo (savePlanned already reset currentRunId) and save again
  fpCard().dispatchEvent(new window.Event("click", { bubbles: true }));
  fNozCard(fNozA).dispatchEvent(new window.Event("click", { bubbles: true }));
  planRun(5000);
  ok(runsForNoz(fNozA).length === 1, "PA: saving again for the exact same combo updates the existing planned run instead of duplicating it");

  // a different nozzle on the same printer+filament is a separate combo
  fNozCard(fNozB).dispatchEvent(new window.Event("click", { bubbles: true }));
  planRun(4000);
  ok(runsForNoz(fNozB).length === 1 && runsForNoz(fNozA).length === 1, "PA: a different nozzle gets its own independent in-flight run, doesn't merge with nozzle A's");

  // Iron: same pattern — defaults (10 speed/flow points each) already satisfy the >=2 minimum
  fNozCard(fNozA).dispatchEvent(new window.Event("click", { bubbles: true }));
  click("ironingSaveBtn");
  ok(ironForNoz(fNozA).length === 1, "Iron: first incomplete run for the combo saved");
  // saveIroningRun() lands straight on the saved-results view for this filament — same title
  // restructure (printer/nozzle row + filament row) and Results-at-top reorder as the PA view,
  // but results stay fully editable here (no lock concept — ironing results are subjective).
  ok($("ironResultsModal").hidden === false, "saving an ironing run opens its saved-results view");
  ok($("ironResultsPrinterRow").textContent.length > 0, "Ironing saved-results view: printer/nozzle title row is populated");
  ok($("ironResultsFilamentRow").textContent.length > 0, "Ironing saved-results view: filament title row is populated");
  {
    const ironBody = $("ironResultsBodyView");
    const h3 = ironBody.querySelector("h3.rsec-static");
    ok(!!h3 && /Results/.test(h3.textContent), "Ironing saved-results view: Results heading is present");
    ok(ironBody.firstElementChild === h3, "Ironing saved-results view: Results sits at the top, above Printer/Filament/Test settings");
    const summaries = [...ironBody.querySelectorAll("details.rsec summary")].map(s => s.textContent);
    ok(/^Printer/.test(summaries[0]) && /^Filament/.test(summaries[1]) && summaries[2] === "Test settings", "Ironing saved-results view: Printer, Filament, Test settings follow Results, collapsed");
    ok(ironBody.querySelector("button[data-iron-picker-open]") !== null, "Ironing saved-results view: a Change-results/Name-samples button is still present (stays editable)");
  }
  click("ironResultsClose");
  fpCard().dispatchEvent(new window.Event("click", { bubbles: true }));
  fNozCard(fNozA).dispatchEvent(new window.Event("click", { bubbles: true }));
  click("ironingSaveBtn");   // same combo again — should update in place, not duplicate
  ok(ironForNoz(fNozA).length === 1, "Iron: saving again for the same combo updates in place, doesn't duplicate");
  fNozCard(fNozB).dispatchEvent(new window.Event("click", { bubbles: true }));
  click("ironingSaveBtn");
  ok(ironForNoz(fNozB).length === 1 && ironForNoz(fNozA).length === 1, "Iron: a different nozzle gets its own independent in-flight run");

  // clean up: remove the disposable printer + filament (cascade-prunes all these test runs)
  const fpRemoveBtn = () => [...fpCard().querySelectorAll(".actions button")].find(b => b.title === "Remove");
  fpRemoveBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  [...flightFilCard().querySelectorAll(".actions button")].find(b => b.title === "Remove").dispatchEvent(new window.Event("click", { bubbles: true }));
  [...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "printers").dispatchEvent(new window.Event("click", { bubbles: true }));
}

// orphan cleanup: deleting a printer/nozzle/filament cascades to prune any run that referenced
// it (a run pointing at something deleted can never be reached again from the UI) and, for
// printer/nozzle, the confirm() warns with a count when there's actually something to lose.
{
  let lastConfirmMsg = "";
  const origConfirm = window.confirm;
  window.confirm = (msg) => { lastConfirmMsg = msg; return true; };
  const setupRun = (accelLimit) => {
    $("maxFlow").value = "20"; $("maxFlow").dispatchEvent(new window.Event("input", { bubbles: true }));
    $("maxFlowConfirm").dispatchEvent(new window.Event("click", { bubbles: true }));
    $("flowPoints").value = "3"; $("accelLimit").value = String(accelLimit); $("accelList").value = ""; $("speedList").value = "";
    click("recommendBtn"); click("loadPointsBtn");
    window.PA_test.savePlanned();
  };

  // fresh printer with two nozzles, fresh filament — all disposable, just for this test
  setFieldKey($("printerForm"), "maker", "OrphanTestCo");
  setFieldKey($("printerForm"), "model", "RigX");
  click("savePrinterBtn");
  let dd = readData();
  const op = dd.printers.find(p => p.maker === "OrphanTestCo");
  setFieldKey($("nozzleForm"), "diameter", "0.6");
  click("saveNozzleBtn");   // second nozzle, distinguishable by diameter
  dd = readData();
  const nozA = dd.printers.find(p => p.id === op.id).nozzles.find(n => Number(n.diameter) === 0.4);
  const nozB = dd.printers.find(p => p.id === op.id).nozzles.find(n => Number(n.diameter) === 0.6);
  ok(nozA && nozB, "orphan-test printer has two distinguishable nozzles");

  setFieldKey($("filamentForm"), "maker", "OrphanCo");
  setFieldKey($("filamentForm"), "material", "PLA");
  click("saveFilamentBtn");
  const orphFil = readData().filaments.find(f => f.maker === "OrphanCo");

  const opCard = () => [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("RigX"));
  opCard().dispatchEvent(new window.Event("click", { bubbles: true }));   // select printer
  const nozCard = (n) => [...$("nozzleList").querySelectorAll(".card")].find(c => c.textContent.includes(n.diameter + "mm"));
  nozCard(nozA).dispatchEvent(new window.Event("click", { bubbles: true }));   // select nozzle A
  const orphFilCard = () => [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("OrphanCo"));
  orphFilCard().dispatchEvent(new window.Event("click", { bubbles: true }));   // select filament

  setupRun(5000);
  ok(readData().runs.some(r => r.printerId === op.id && r.nozzleId === nozA.id && r.filamentId === orphFil.id), "orphan-test run saved (printer+nozzleA+filament)");

  // removing the OTHER nozzle (no runs tied to it) shouldn't warn or touch anything
  const beforeRunCount = readData().runs.length;
  const nozRemoveBtn = (n) => [...nozCard(n).querySelectorAll(".actions button")].find(b => b.textContent === "Remove");
  nozRemoveBtn(nozB).dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(!/filament test/.test(lastConfirmMsg), "removing an unused nozzle has no orphan warning");
  ok(readData().runs.length === beforeRunCount, "removing an unused nozzle doesn't touch runs");

  // removing nozzle A (has the run) warns with a count and prunes it
  nozRemoveBtn(nozA).dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(/This will delete all filament tests associated with this nozzle \(1\)/.test(lastConfirmMsg), "removing a nozzle with runs warns with the affected count");
  ok(!readData().runs.some(r => r.nozzleId === nozA.id), "removing the nozzle prunes its run");

  // rebuild under the same printer for the printer-delete case
  click("saveNozzleBtn");
  const nozC = readData().printers.find(p => p.id === op.id).nozzles[0];
  nozCard(nozC).dispatchEvent(new window.Event("click", { bubbles: true }));
  setupRun(6000);
  ok(readData().runs.some(r => r.printerId === op.id), "second orphan-test run saved under the printer");
  const pRemoveBtn = () => [...opCard().querySelectorAll(".actions button")].find(b => b.title === "Remove");
  pRemoveBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(/This will delete all filament tests associated with this printer \(1\)/.test(lastConfirmMsg), "removing a printer with runs warns with the affected count");
  ok(!readData().runs.some(r => r.printerId === op.id), "removing the printer prunes its runs");
  ok(!readData().printers.some(p => p.id === op.id), "printer itself removed");

  // filament cascade: rebuild one more run under a still-alive printer/nozzle (Bambu Lab A1,
  // from the earlier nozzle-cleanup test), tied to the same orphan filament, then remove the
  // filament and confirm its run goes with it
  const bCardNow = () => [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("Bambu Lab A1"));
  bCardNow().dispatchEvent(new window.Event("click", { bubbles: true }));
  orphFilCard().dispatchEvent(new window.Event("click", { bubbles: true }));
  setupRun(7000);
  ok(readData().runs.some(r => r.filamentId === orphFil.id), "third orphan-test run saved under the filament");
  [...orphFilCard().querySelectorAll(".actions button")].find(b => b.title === "Remove").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok(!readData().filaments.some(f => f.id === orphFil.id), "filament removed");
  ok(!readData().runs.some(r => r.filamentId === orphFil.id), "removing the filament prunes its runs");

  window.confirm = origConfirm;
  // savePlanned()/removeFilament() leave the Filaments tab active — restore the pre-block tab
  // state so the unsaved-job-guard test below (which assumes it isn't already active) still holds.
  [...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "printers").dispatchEvent(new window.Event("click", { bubbles: true }));
}

// modal-open/close mechanics: a grey (zero-match) PA/Iron button opens a fresh modal instead of
// sitting inert, a clean modal's backdrop closes it outright, and Ironing carries its own
// independent dirty-guard (ironDirty) that shares the jobGuardModal UI with PA's (jobDirty)
{
  setFieldKey($("printerForm"), "maker", "ModalTestCo");
  setFieldKey($("printerForm"), "model", "RigM");
  setFieldKey($("printerForm"), "bedX", "300");
  setFieldKey($("printerForm"), "bedY", "300");
  click("savePrinterBtn");
  setFieldKey($("filamentForm"), "maker", "ModalCo");
  setFieldKey($("filamentForm"), "material", "PLA");
  click("saveFilamentBtn");
  const mFil = readData().filaments.find(f => f.maker === "ModalCo");
  const mFilCard = () => [...$("filamentList").querySelectorAll(".card,.frow")].find(c => c.textContent.includes("ModalCo"));
  const mPaBtn = () => [...mFilCard().querySelectorAll(".actions button")].find(b => /^PA/.test(b.textContent));
  const mIronBtn = () => [...mFilCard().querySelectorAll(".actions button")].find(b => /^Iron/.test(b.textContent));

  // grey PA button (no runs yet) opens the PA modal fresh, rather than sitting inert
  ok(mPaBtn().classList.contains("muted") && !mPaBtn().disabled, "fresh filament's PA button is grey but clickable");
  ok($("tab-test").hidden === true, "PA modal starts closed");
  mPaBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("tab-test").hidden === false, "clicking the grey PA button opens the PA modal fresh");
  ok(readData().lastFilamentId === mFil.id, "opening fresh selects that filament");
  // a brand-new (not resumed) test is fully unlocked — no leftover lock state from a previously
  // resumed run elsewhere in the suite, and no in-flight badge
  ok($("testInFlightBadge").hidden === true, "no in-flight badge on a fresh test");
  ok($("abandonRunBtn").hidden === true, "no Abandon button on a fresh test either — nothing to abandon");
  ok($("maxFlow").disabled !== true && $("testMode").disabled !== true && $("pvStart").disabled !== true, "a fresh test's settings are fully editable, not locked");
  // backdrop click closes a clean modal outright (nothing dirty to guard)
  $("tab-test").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("tab-test").hidden === true, "clicking the modal backdrop closes a clean PA modal");
  ok($("jobGuardModal").hidden === true, "no guard fires when nothing is dirty");

  // grey Iron button similarly opens the Ironing modal fresh
  ok(mIronBtn().classList.contains("muted") && !mIronBtn().disabled, "fresh filament's Iron button is grey but clickable");
  mIronBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("tab-ironing").hidden === false, "clicking the grey Iron button opens the Ironing modal fresh");
  $("tab-ironing").dispatchEvent(new window.Event("click", { bubbles: true }));   // backdrop click, clean
  ok($("tab-ironing").hidden === true, "clicking the modal backdrop closes a clean Ironing modal");

  // Ironing has its own independent dirty-guard (ironDirty), separate from PA's jobDirty
  mIronBtn().dispatchEvent(new window.Event("click", { bubbles: true }));
  ev($("ironGap"), "input");   // marks the Ironing job dirty
  click("ironModalClose");
  ok($("jobGuardModal").hidden === false, "Ironing's own dirty flag prompts the shared guard on close");
  ok(/Ironing/.test($("jobGuardTitle").textContent), "guard title reflects the Ironing context");
  ok($("tab-ironing").hidden === false, "guard blocks the Ironing modal close until resolved");
  $("jobGuardAbandon").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok($("jobGuardModal").hidden === true && $("tab-ironing").hidden === true, "abandon closes the guard and the Ironing modal");
  ok(!readData().ironingRuns.some(r => r.filamentId === mFil.id), "no stray Ironing run left behind by the guard's abandon path");

  // clean up
  const mpCard = () => [...$("printerList").querySelectorAll(".card")].find(c => c.textContent.includes("RigM"));
  [...mpCard().querySelectorAll(".actions button")].find(b => b.title === "Remove").dispatchEvent(new window.Event("click", { bubbles: true }));
  [...mFilCard().querySelectorAll(".actions button")].find(b => b.title === "Remove").dispatchEvent(new window.Event("click", { bubbles: true }));
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

// unsaved-PA-job guard: closing the PA modal while dirty prompts; abandon proceeds and closes it
// (the modal — not the underlying Printers/Filaments tab nav — is what the guard gates now; the
// modal's backdrop covers the nav in the real UI, so the tab switch itself no longer needs a guard)
setFieldKey($("printerForm"), "maker", "GuardTestCo");
setFieldKey($("printerForm"), "model", "RigZ");
setFieldKey($("printerForm"), "bedX", "250");
setFieldKey($("printerForm"), "bedY", "250");
click("savePrinterBtn");
$("tab-test").hidden = false;   // simulate the PA modal being open
ev($("resultsBody"), "input");   // marks the PA job dirty
click("paModalClose");
ok($("jobGuardModal").hidden === false, "unsaved-job guard prompts on modal close");
ok($("tab-test").hidden === false, "guard blocks the modal close until resolved");
$("jobGuardAbandon").dispatchEvent(new window.Event("click", { bubbles: true }));
ok($("jobGuardModal").hidden === true && $("tab-test").hidden === true, "abandon closes the guard and the PA modal");
click("paModalClose");
ok($("jobGuardModal").hidden === true, "no guard once the job is cleared (nothing dirty to prompt about)");

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

  // ---- formatVersion 2.1 migration: old-format import drops gcodeCache and each run's dead
  // `analysis`/old `singlePaText` fields, stamps 2.1, and sweeps any run left pointing at a
  // printer/nozzle/filament that no longer exists ----
  {
    const oldFormat = window.PAStore.defaultData();
    delete oldFormat.formatVersion;   // simulate a pre-2.1 export
    oldFormat.gcodeCache = { legacy: { byKey: {} } };
    oldFormat.printers = [{ id: "p1", maker: "Test", model: "X", nozzles: [{ id: "n1", maker: "Generic", material: "Brass", diameter: 0.4 }] }];
    oldFormat.filaments = [{ id: "f1", maker: "Test", material: "PLA", printers: [] }];
    oldFormat.runs = [
      {
        id: "r1", status: "complete", printerId: "p1", nozzleId: "n1", filamentId: "f1", settings: {},
        analysis: { fit: { b0: 0.03, b1: -0.0001, b2: 0, r2: 0.9 } },
        singlePaText: 'Single PA (non-adaptive): <b>0.0259</b> <span class="muted">(fit at mid-point; median entry = 0.025)</span>'
      },
      { id: "r2", status: "complete", printerId: "ghost-printer", nozzleId: "n1", filamentId: "f1", settings: {} },
      { id: "r3", status: "planned", printerId: "p1", nozzleId: "ghost-nozzle", filamentId: "f1", settings: {} },
      { id: "r4", status: "complete", printerId: "p1", nozzleId: "n1", filamentId: "ghost-filament", settings: {} }
    ];
    const fakeOldFile = { text: () => Promise.resolve(JSON.stringify(oldFormat)) };
    const migrated = await window.PAStore.importJSON(fakeOldFile);
    ok(migrated.formatVersion === "2.1", "old-format import stamps formatVersion 2.1");
    ok(!("gcodeCache" in migrated), "old-format import drops gcodeCache");
    ok(migrated.runs.length === 1 && migrated.runs[0].id === "r1", "runs orphaned by a deleted printer/nozzle/filament are swept on migration, valid run survives");
    ok(!("analysis" in migrated.runs[0]) && !("singlePaText" in migrated.runs[0]), "storage-level migration drops the dead analysis field and the old baked singlePaText field");
  }

  // ---- app.js-level backfill: recomputes singlePaValue/singlePaMedian straight from a run's own
  // `results` for old runs that predate those fields — this is the piece storage.js can't do itself
  // (needs the fit math), and it runs on every (re)load, not just the very first one, so importing
  // an old file mid-session backfills too, not just the initial page load ----
  {
    const d = {
      runs: [
        { id: "basic1", mode: "basic", results: [{ x: null, accel: null, bestPA: 0.021, notes: "" }] },
        { id: "adv1", mode: "advanced", results: [{ x: 5, accel: 2000, bestPA: 0.02, notes: "" }, { x: 10, accel: 2000, bestPA: 0.03, notes: "" }] },
        { id: "already", mode: "advanced", singlePaValue: "0.0400", singlePaMedian: 0.04, results: [{ x: 5, accel: 2000, bestPA: 0.09, notes: "" }] },
        { id: "empty", mode: "advanced", results: [] }
      ]
    };
    window.PA_test.backfillSinglePaResults(d);
    const byId = (id) => d.runs.find(r => r.id === id);
    ok(byId("basic1").singlePaValue === 0.021 && byId("basic1").singlePaMedian === null, "backfill: basic-mode run recovers its single entered value, no median");
    ok(byId("adv1").singlePaValue === "0.0300" && byId("adv1").singlePaMedian === 0.03, "backfill: advanced-mode run with <3 points falls back to the median (no fit possible)");
    ok(byId("already").singlePaValue === "0.0400" && byId("already").singlePaMedian === 0.04, "backfill: a run that already has singlePaValue is left untouched");
    ok(byId("empty").singlePaValue === undefined, "backfill: a run with no results is left alone");
  }

  // ---- Settings modal: gear button, relocated theme/debug controls, date/time format + ----
  // ---- in-progress/completed display-style pickers, and their live example previews ----
  {
    ok($("settingsModal").hidden === true, "settings modal starts closed");
    ok($("themeSel").closest(".modal-box") !== null, "theme select now lives inside a modal, not the header toolbar");
    ok($("debugClearBtn").closest(".modal-box").id !== "debugModal", "DEBUG: Clear data button now lives in the Settings modal, not the header");
    click("settingsBtn");
    ok($("settingsModal").hidden === false, "gear button opens the Settings modal");
    // defaults, per the user's stated + confirmed choices
    ok($("dateFormatSel").value === "YYYY-MM-DD", "date format defaults to YYYY-MM-DD");
    ok($("timeFormatSel").value === "24h", "time format defaults to 24-hour");
    ok($("inProgressStyleSel").value === "relative", "in-progress test dates default to relative");
    ok($("completedStyleSel").value === "absolute", "completed test dates default to absolute");
    ok(/^\d{4}-\d{2}-\d{2}$/.test($("dateFormatExample").textContent), "date format example reflects the current selection (YYYY-MM-DD)");
    ok(/^\d{2}:\d{2}$/.test($("timeFormatExample").textContent), "time format example reflects 24h");
    ok(/ago$|^Today|^Yesterday/.test($("inProgressStyleExample").textContent), "in-progress example shows a relative string by default");
    ok(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test($("completedStyleExample").textContent), "completed example shows an absolute string by default");

    // switching date format updates its own example live
    $("dateFormatSel").value = "DD/MM/YYYY"; ev($("dateFormatSel"), "change");
    ok(/^\d{2}\/\d{2}\/\d{4}$/.test($("dateFormatExample").textContent), "date format example updates to DD/MM/YYYY");
    ok(readData().dateFormat === "DD/MM/YYYY", "date format choice persists to storage");
    $("dateFormatSel").value = "Mon D, YYYY"; ev($("dateFormatSel"), "change");
    ok(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test($("dateFormatExample").textContent), "date format example updates to 'Mon D, YYYY'");

    // switching time format updates its own example live
    $("timeFormatSel").value = "12h"; ev($("timeFormatSel"), "change");
    ok(/^\d{1,2}:\d{2} (AM|PM)$/.test($("timeFormatExample").textContent), "time format example updates to 12-hour AM/PM");
    ok(readData().timeFormat === "12h", "time format choice persists to storage");

    // flipping in-progress to absolute, and completed to relative, swaps each example's shape
    $("inProgressStyleSel").value = "absolute"; ev($("inProgressStyleSel"), "change");
    ok(/\d{1,2}:\d{2} (AM|PM)/.test($("inProgressStyleExample").textContent), "in-progress example switches to absolute (honoring the 12h time format)");
    ok(readData().inProgressDateStyle === "absolute", "in-progress style choice persists to storage");
    $("completedStyleSel").value = "relative"; ev($("completedStyleSel"), "change");
    ok(/ago$|^Today|^Yesterday/.test($("completedStyleExample").textContent), "completed example switches to relative");
    ok(readData().completedDateStyle === "relative", "completed style choice persists to storage");

    // restore defaults so the rest of the suite (and any dependent assertions above) aren't
    // affected by this block's format changes
    $("dateFormatSel").value = "YYYY-MM-DD"; ev($("dateFormatSel"), "change");
    $("timeFormatSel").value = "24h"; ev($("timeFormatSel"), "change");
    $("inProgressStyleSel").value = "relative"; ev($("inProgressStyleSel"), "change");
    $("completedStyleSel").value = "absolute"; ev($("completedStyleSel"), "change");

    // theme select still works from its new home inside the modal
    $("themeSel").value = "dark"; ev($("themeSel"), "change");
    ok(document.documentElement.dataset.theme === "dark", "theme select still switches theme from inside the Settings modal");
    $("themeSel").value = "light"; ev($("themeSel"), "change");   // restore to match the earlier theme assertion

    // DEBUG: Clear data still opens its confirmation modal from its new home
    click("debugClearBtn");
    ok($("debugModal").hidden === false, "DEBUG: Clear data still opens the danger-zone confirmation modal from inside Settings");
    $("debugModal").hidden = true;   // dismiss without clearing anything

    // close via the Close button, and via backdrop click
    click("settingsCloseBtn");
    ok($("settingsModal").hidden === true, "Close button closes the Settings modal");
    click("settingsBtn");
    $("settingsModal").dispatchEvent(new window.Event("click", { bubbles: true }));
    ok($("settingsModal").hidden === true, "backdrop click closes the Settings modal");
  }

  // relative-date formatter: the Settings preview's fixed reference point is 3 days before "now",
  // so with the in-progress style back to its default (relative), the example should read exactly
  // "3 days ago" — a direct check on the day-bucketing boundary logic.
  {
    click("settingsBtn");
    ok(/^3 days ago$/.test($("inProgressStyleExample").textContent), "relative example correctly buckets a 3-day-old reference as '3 days ago'");
    click("settingsCloseBtn");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
