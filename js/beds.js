/* PA-Helper — beds.js
 * Standalone bed-dimension data by maker + model, kept separate so it's easy to extend
 * (the monthly "new printer models" check updates THIS file). Plain global, no modules.
 *
 * Each maker entry has:
 *   origin: "corner" (0,0 at front-left, most bed-slingers / CoreXY) or "center" (many deltas).
 *   shape:  "rect" (default) or "round".
 *   models: [ [name, x, y] ]  — named machines (rect, mm), ORDERED NEWEST → OLDEST by release date.
 *   sizes:  [ [name, x, y] ]  — a platform sold in several sizes (e.g. Voron, RatRig), by size.
 * A maker with neither models nor sizes (e.g. kit vendors) falls back to manual entry.
 *
 * These are a STARTER SET of common, widely-known sizes; every value is editable in the form,
 * and "Custom…" always allows a hand-entered model. Release ordering is approximate — refine in
 * the monthly update. Verify against your own machine.
 */
window.PA_BEDS = {
  "Voron":          { origin: "corner", sizes: [["120 (V0)", 120, 120], ["250", 250, 250], ["300", 300, 300], ["350", 350, 350]] },
  "Bambu Lab":      { origin: "corner", models: [["A1", 256, 256], ["X1E", 256, 256], ["A1 mini", 180, 180], ["P1S", 256, 256], ["X1C", 256, 256], ["P1P", 256, 256]] },
  "Prusa Research": { origin: "corner", models: [["CORE One", 250, 220], ["MK4 / MK4S", 250, 210], ["XL", 360, 360], ["MINI / MINI+", 180, 180], ["MK3S / MK3S+", 250, 210]] },
  "Creality":       { origin: "corner", models: [["Ender-3 V3 (KE/SE)", 220, 220], ["K1 Max", 300, 300], ["K1", 220, 220], ["CR-10 Max", 450, 450], ["Ender-5", 220, 220], ["Ender-3 / V2 / S1", 220, 220], ["CR-10", 300, 300]] },
  "QIDI":           { origin: "corner", models: [["Plus4", 305, 305], ["Q1 Pro", 245, 245], ["X-Max 3", 325, 325], ["X-Plus 3", 280, 280], ["X-Smart 3", 175, 180]] },
  "RatRig":         { origin: "corner", sizes: [["200", 200, 200], ["300", 300, 300], ["400", 400, 400], ["500", 500, 500]] },
  "Sovol":          { origin: "corner", models: [["SV08", 350, 350], ["SV07", 220, 220], ["SV06 Plus", 300, 300], ["SV06", 220, 220]] },
  "Anycubic":       { origin: "corner", models: [["Kobra 3", 250, 250], ["Kobra 2 Max", 420, 420], ["Kobra 2 / Pro", 220, 220]] },
  "Elegoo":         { origin: "corner", models: [["Neptune 4 Max", 420, 420], ["Neptune 4 / Pro", 225, 225], ["Neptune 3", 220, 220]] },
  "LDO":            { origin: "corner" },   // kit vendor (mostly Voron builds) → manual entry
  "Formbot":        { origin: "corner" }    // kit vendor → manual entry
};
