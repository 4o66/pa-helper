/* PA-Helper — presets.js
 * Built-in dropdown options + material PA-range presets.
 * Plain global (no modules) so the app runs from file:// without a server.
 * Users can add custom entries; those live in pa_data.json (customOptions).
 */
window.PA_PRESETS = {

  // ---- Hardware option lists (each dropdown also offers "Custom…") ----
  // Machine DESIGNERS/brands — not kit re-sellers. A Voron kit from LDO/Formbot/Fysetc is a "Voron".
  printerMakers: [
    "Voron", "Bambu Lab", "Prusa Research", "Creality", "QIDI", "RatRig",
    "Sovol", "Anycubic", "Elegoo"
  ],
  toolheads: [
    "StealthBurner", "Voron Tap", "Dragon Burner", "Xol Toolhead", "A4T",
    "Prusa (stock)", "Bambu (stock)", "QIDI (stock)", "Creality (stock)", "N/A"
  ],
  extruders: [
    "Clockwork 2", "Clockwork 1", "Sherpa Mini", "Orbiter 2.0", "Orbiter 1.5",
    "LGX", "LGX Lite", "BMG / clone", "Hemera", "Galileo 2",
    "Bambu (stock)", "Prusa (stock)", "QIDI (stock)", "Creality Sprite"
  ],
  extruderDrives: ["Direct", "Bowden"],
  hotends: [
    "Phaetus Rapido UHF", "Phaetus Rapido HF", "Phaetus Dragon HF",
    "Phaetus Dragon SF", "E3D Revo", "E3D V6", "E3D Volcano",
    "Slice Mosquito", "Slice Mosquito Magnum", "Dragonfly BMS",
    "Bambu (stock)", "Prusa (stock)", "QIDI (stock)", "Creality (stock)"
  ],
  nozzleMakers: ["Generic", "Phaetus", "E3D", "Bondtech CHT", "Trianglelab", "Mellow", "Bambu", "Creality", "QIDI", "Diamondback"],
  nozzleMaterials: ["Brass", "Hardened Steel", "Tungsten Carbide", "Ruby", "Polycrystalline Diamond (PCD)", "Plated Copper", "Nozzle-X / other"],
  nozzleDiameters: [0.2, 0.25, 0.4, 0.5, 0.6, 0.8, 1.0],
  filamentMakers: [
    "Polymaker", "Prusament", "Bambu Lab", "Hatchbox", "Overture", "eSun",
    "MatterHackers", "Inland", "Sunlu", "Fusion Filaments", "KVP", "QIDI"
  ],
  // Base polymers only — carbon/glass fill is captured by the separate "fiber" field,
  // so -CF variants were removed (PLA + Carbon Fiber instead of "PLA-CF").
  filamentMaterials: [
    "PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "PC", "Nylon (PA)", "PVA", "HIPS"
  ],
  filamentDiameters: [1.75, 2.85, 3.0, "Pellet"],

  // Sub-type / product-line qualifiers that modify a base material without being one.
  // e.g. "QIDI Odorless ABS" = material ABS, formulation Odorless. Grouped, common first.
  // (Because "Silk" is here now, "Silk PLA" was removed from filamentMaterials.)
  filamentFormulations: [
    { group: "Common", items: ["Basic", "Matte", "Silk", "High Speed"] },
    { group: "Functional", items: ["Odorless", "Tough", "Pro", "Rapid", "Translucent"] },
    { group: "Aesthetic", items: ["Metal", "Marble", "Wood", "Glow", "Fluorescent", "Multi-Color"] }
  ],

  // TPU only — Shore hardness, most common first. Dropdown + Custom.
  tpuHardness: ["95A", "98A", "90A", "85A", "82A", "75A", "70A", "60D", "55D"],

  // Fiber fill. Custom reveals a fiber name + % fill entry.
  fiberTypes: ["No", "Carbon Fiber", "Glass Filled", "Custom"],

  // Fuzzy color-name → hex for the swatch/band. Longest key wins (see app.js colorHex).
  colorDict: {
    "black": "#1c1c1c", "white": "#f4f4f4", "grey": "#9aa0a6", "gray": "#9aa0a6",
    "silver": "#c7ccd1", "charcoal": "#36393d", "space grey": "#4a4e54", "gunmetal": "#4b4f56",
    "red": "#d23b3b", "crimson": "#a01f2e", "burgundy": "#5c1a2b", "wine": "#5c1a2b", "maroon": "#5c1a2b",
    "orange": "#e8823a", "amber": "#d99223", "mustard": "#c99a1e", "gold": "#c9a227", "bronze": "#8a6a2f", "copper": "#b06a3b",
    "yellow": "#e8c93a", "lime": "#9bcf3a", "olive": "#7d7a2a", "green": "#3aa64a", "forest": "#1f5a2e",
    "army green": "#5a5f34", "mint": "#7fd6a6", "teal": "#2a9d9d", "cyan": "#39c2d1", "turquoise": "#38c7b4",
    "sky": "#68b6e8", "blue": "#3a6fd2", "navy": "#20305c", "cobalt": "#2a4bd0", "royal": "#2a3fb0",
    "purple": "#7d47c9", "violet": "#7d47c9", "lavender": "#b9a7e0", "indigo": "#4a3b8a",
    "magenta": "#c93a9e", "pink": "#e88ab0", "rose": "#d76a8a", "salmon": "#e88f7a", "coral": "#e87a5d", "peach": "#f0b18a",
    "brown": "#6b4a2f", "tan": "#c8a878", "beige": "#d9cbb0", "cream": "#efe6cf", "ivory": "#efe9d6",
    "natural": "#e8e2d0", "clear": "#dfe7ee", "transparent": "#dfe7ee", "translucent": "#dfe7ee",
    "glow": "#c9e8b0"
  },

  /* ---- Material PA-range presets (DIRECT drive baseline) ----
   * [start, end, step] in the units OrcaSlicer uses for Klipper/Marlin-flavor PA.
   * These are STARTING RANGES for a line/adaptive test, not final values — the
   * whole point of the tool is to narrow them. Bowden setups need far higher PA,
   * so we scale by `bowdenScale` when the profile's drive is Bowden.
   */
  paRanges: {
    "PLA":        [0.010, 0.070, 0.005],
    "PLA+":       [0.010, 0.070, 0.005],
    "PLA-CF":     [0.010, 0.070, 0.005],
    "Silk PLA":   [0.010, 0.080, 0.005],
    "PETG":       [0.030, 0.120, 0.005],   // higher than PLA/ABS
    "PETG-CF":    [0.030, 0.120, 0.005],
    "ABS":        [0.015, 0.075, 0.005],
    "ABS-CF":     [0.015, 0.075, 0.005],
    "ASA":        [0.015, 0.075, 0.005],
    "TPU":        [0.400, 1.200, 0.020],   // soft, very high PA
    "PC":         [0.025, 0.100, 0.005],
    "PC-CF":      [0.025, 0.100, 0.005],
    "Nylon (PA)": [0.030, 0.110, 0.005],
    "PA-CF":      [0.030, 0.110, 0.005],
    "HIPS":       [0.015, 0.075, 0.005],
    "PVA":        [0.030, 0.120, 0.005]
  },
  defaultRange: [0.015, 0.090, 0.005],
  bowdenScale: 10,   // bowden PA is roughly an order of magnitude higher than direct

  /* ---- How many flow/accel points to propose for an adaptive test ---- */
  adaptive: {
    minFlow: 3,          // mm^3/s — lowest test flow
    flowPoints: 5,       // number of flow steps from minFlow up to the printer's max
    accelFractions: [0.4, 1.0],  // test accels = these fractions of the accel ceiling
    // Lowest acceleration worth testing. Below this the PA pattern barely discriminates — the
    // velocity change through corners is too gentle to build much pressure, so every PA value looks
    // clean and the "best" just pins to a range edge (observed on real PLA runs). Start the auto
    // sweep here instead of 1000. Editable in the accel list if a user really wants a low value.
    accelFloor: 2000
  },

  // Orca's own suggested acceleration sweep for adaptive PA
  accelSuggested: [1000, 2000, 4000, 8000, 12000, 16000],

  // PA test methods. Basic (single value): tower (recommended), line, pattern.
  // Advanced (adaptive) is always the pattern method.
  basicMethods: ["tower", "line", "pattern"],
  basicDefault: "tower",

  // Print-geometry defaults derived from nozzle diameter.
  // Line width is NOT editable: Orca computes it as auto_extrusion_width for the
  // line_width option (frPerimeter role) = 1.125 × nozzle (0.4 → 0.45). Source:
  // OrcaSlicer src/libslic3r/Flow.cpp Flow::auto_extrusion_width. See docs/orca-method-provenance.md.
  lineWidthFactor: 1.125,  // line width = 1.125 × nozzle diameter (0.4 → 0.45), Orca auto
  layerHeightFactor: 0.5,  // layer-height *default* only (editable): 0.5 × nozzle (0.4 → 0.20)

  /* ---- New-printer defaults ----
   * When a maker with a stock config is picked, default toolhead/extruder/drive/hotend
   * to its stock parts (user can still change them). Makers without a stock entry fall
   * back to `genericDefault`. A user's own saved printer of the same maker+model always
   * wins over these (see app.js applyPrinterDefaults).
   *
   * FUTURE (server phase, not built yet): each saved printer carries a random per-PRINTER
   * GUID (pubId). With opt-in on first login, those configs seed a public dataset so the
   * most common real-world combo per maker/model can drive these defaults for new users.
   */
  makerStock: {
    "QIDI":           { toolhead: "QIDI (stock)",     extruder: "QIDI (stock)",    drive: "Direct", hotend: "QIDI (stock)",     nozzleMaker: "QIDI",     nozzleModel: "stock",           nozzleMaterial: "Hardened Steel", nozzleDiameter: 0.4 },
    "Bambu Lab":      { toolhead: "Bambu (stock)",    extruder: "Bambu (stock)",   drive: "Direct", hotend: "Bambu (stock)",    nozzleMaker: "Bambu",    nozzleModel: "stock",           nozzleMaterial: "Hardened Steel", nozzleDiameter: 0.4 },
    "Prusa Research": { toolhead: "Prusa (stock)",    extruder: "Prusa (stock)",   drive: "Direct", hotend: "Prusa (stock)",    nozzleMaker: "E3D",      nozzleModel: "Nextruder stock", nozzleMaterial: "Brass",          nozzleDiameter: 0.4 },
    "Creality":       { toolhead: "Creality (stock)", extruder: "Creality Sprite", drive: "Direct", hotend: "Creality (stock)", nozzleMaker: "Creality", nozzleModel: "stock",           nozzleMaterial: "Brass",          nozzleDiameter: 0.4 }
  },
  genericDefault: { toolhead: "StealthBurner", extruder: "Clockwork 2", drive: "Direct", hotend: "Phaetus Rapido HF" }
};
