/* PA-Helper — printer bed dimensions  (single-purpose data file)
 * ==============================================================================================
 * This is the ONE place printer model + bed data lives. It is the file most likely to receive
 * community pull requests, so it is kept deliberately simple and easy to review.
 *
 * HOW TO ADD / EDIT A MAKER
 *   - One block per MAKER (the machine's designer/brand — NOT a kit re-seller; a Voron kit from
 *     LDO / Formbot / Fysetc is still a "Voron").
 *   - `domain`: the maker's website domain.
 *   - `favicon`: the direct URL to the maker's icon, shown on the printer card, hotlinked live from
 *     their own site. We never download or store it, and render nothing if it fails to load — so no
 *     copyright concern. To fill this in for a new maker: open the vendor's homepage, look in the page
 *     source `<head>` for `<link rel="icon" href="...">` (prefer a PNG/SVG over a tiny .ico), and use
 *     that absolute URL; if there's no such tag, fall back to `https://<domain>/favicon.ico`. At runtime
 *     the app also falls back to `<domain>/favicon.ico` automatically if this URL 404s.
 *   - `origin` (per maker): "corner" = (0,0) at front-left — most bed-slingers & CoreXY.
 *                           "center" = origin at the middle — common on deltas.
 *   - `models` are listed NEWEST → OLDEST by release date. The array order is what the dropdown
 *     shows; `released` is just a human hint (year or YYYY-MM).
 *   - `bed`:
 *        [x, y]  — fixed rectangular bed, millimetres.
 *        [d]     — round bed, diameter in millimetres (also set `shape: "round"` on the model).
 *        null    — the design ships in several bed sizes (e.g. Voron, RatRig); the user types
 *                  their own size. Leave a "// 250 / 300 / 350" comment as a hint.
 *
 * Nothing here is ever blocking: every value is editable in the app and "Custom…" always allows a
 * hand-typed model. But accurate data makes the multi-plate planning better for everyone, so
 * please check the manufacturer's spec sheet before submitting a change.
 * ==============================================================================================
 */
window.PA_BEDS = {

  "Voron": {                    // kit vendor ≠ maker — https://docs.vorondesign.com/hardware.html
    domain: "vorondesign.com", favicon: "https://vorondesign.com/favicon.ico", origin: "corner",
    models: [
      { name: "Trident",    bed: null,        released: "2022" },   // 250 / 300 / 350
      { name: "V2.4",       bed: null,        released: "2021" },   // 250 / 300 / 350
      { name: "V0",         bed: [120, 120],  released: "2021" },
      { name: "Switchwire", bed: [250, 210],  released: "2020" },
      { name: "Legacy",     bed: null,        released: "2019" }    // 250 / 300
    ]
  },

  "Bambu Lab": {
    domain: "bambulab.com", favicon: "https://bambulab.com/favicon.png", origin: "corner",
    models: [
      { name: "A1",      bed: [256, 256], released: "2024-01" },
      { name: "X1E",     bed: [256, 256], released: "2024-01" },
      { name: "A1 mini", bed: [180, 180], released: "2023-09" },
      { name: "P1S",     bed: [256, 256], released: "2023-09" },
      { name: "P1P",     bed: [256, 256], released: "2022-10" },
      { name: "X1C",     bed: [256, 256], released: "2022-07" }
    ]
  },

  "Prusa Research": {
    domain: "prusa3d.com", favicon: "https://www.prusa3d.com/favicon.ico", origin: "corner",
    models: [
      { name: "CORE One",     bed: [250, 220], released: "2025" },
      { name: "MK4 / MK4S",   bed: [250, 210], released: "2023" },
      { name: "XL",           bed: [360, 360], released: "2023" },
      { name: "MINI / MINI+", bed: [180, 180], released: "2021" },
      { name: "MK3S / MK3S+", bed: [250, 210], released: "2019" }
    ]
  },

  "Creality": {
    domain: "creality.com", favicon: "https://www.creality.com/favicon.ico", origin: "corner",
    models: [
      { name: "Ender-3 V3 (KE/SE)", bed: [220, 220], released: "2023" },
      { name: "K1 Max",             bed: [300, 300], released: "2023" },
      { name: "K1",                 bed: [220, 220], released: "2023" },
      { name: "CR-10 Max",          bed: [450, 450], released: "2020" },
      { name: "Ender-5",            bed: [220, 220], released: "2019" },
      { name: "Ender-3 / V2 / S1",  bed: [220, 220], released: "2018" },
      { name: "CR-10",              bed: [300, 300], released: "2017" }
    ]
  },

  "QIDI": {
    domain: "qidi3d.com", favicon: "https://qidi3d.com/cdn/shop/files/pagelogo-NEW_32x32.png", origin: "corner",
    models: [
      { name: "Plus4",     bed: [305, 305], released: "2024" },
      { name: "Q1 Pro",    bed: [245, 245], released: "2024" },
      { name: "X-Max 3",   bed: [325, 325], released: "2023" },
      { name: "X-Plus 3",  bed: [280, 280], released: "2023" },
      { name: "X-Smart 3", bed: [175, 180], released: "2023" }
    ]
  },

  "RatRig": {                   // V-Core / V-Minion — most designs ship in several sizes
    domain: "ratrig.com", favicon: "https://ratrig.com/cdn/shop/files/RR-favicon_2.png", origin: "corner",
    models: [
      { name: "V-Core 4", bed: null,        released: "2024" },   // 300 / 400 / 500
      { name: "V-Minion", bed: [180, 180],  released: "2022" },
      { name: "V-Core 3", bed: null,        released: "2021" }    // 200 / 300 / 400 / 500
    ]
  },

  "Sovol": {
    domain: "sovol3d.com", favicon: "https://www.sovol3d.com/cdn/shop/files/Sovol_icon_7a153c97-987b-4cbf-8e7d-77cc6f65312f.png", origin: "corner",
    models: [
      { name: "SV08",      bed: [350, 350], released: "2024" },
      { name: "SV07",      bed: [220, 220], released: "2023" },
      { name: "SV06 Plus", bed: [300, 300], released: "2023" },
      { name: "SV06",      bed: [220, 220], released: "2023" }
    ]
  },

  "Anycubic": {
    domain: "anycubic.com", favicon: "https://anycubic.com/favicon-202512.png", origin: "corner",
    models: [
      { name: "Kobra 3",       bed: [250, 250], released: "2024" },
      { name: "Kobra 2 Max",   bed: [420, 420], released: "2023" },
      { name: "Kobra 2 / Pro", bed: [220, 220], released: "2023" }
    ]
  },

  "Elegoo": {
    domain: "elegoo.com", favicon: "https://www.elegoo.com/cdn/shop/files/bluefavicon-3.png", origin: "corner",
    models: [
      { name: "Neptune 4 Max",   bed: [420, 420], released: "2023" },
      { name: "Neptune 4 / Pro", bed: [225, 225], released: "2023" },
      { name: "Neptune 3",       bed: [220, 220], released: "2022" }
    ]
  }

};
