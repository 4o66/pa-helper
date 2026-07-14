# `pa_data.json` schema (v2)

Single, human-readable file. Hand-editable, versionable, deletable. All fields are
plain strings/numbers so it stays readable and portable.

v2 splits the old flat "profile" into reusable **printers** and **filaments**, and adds
a **run lifecycle** (`planned` → `complete` / `abandoned`). A printer's identity is its
maker/model + toolhead + extruder(+drive) + hotend — the things that dominate pressure
advance; swapping any of those means a new printer. Nozzle and filament are chosen
per run, not baked into the printer.

```jsonc
{
  "version": 2,
  "theme": "system",                 // system | light | dark
  "filamentView": "cards",           // cards | list (filament tab view preference)

  // Custom dropdown entries the user has added (persist + reappear as options).
  "customOptions": {
    "printerMaker": [], "printerModel": [], "toolhead": [], "extruder": [], "hotend": [],
    "nozzleMaker": [], "nozzleModel": [], "nozzleMaterial": [],
    "filamentMaker": [], "filamentMaterial": [], "filamentFormulation": [], "filamentColor": []
  },

  // Reusable machines. Identity = maker/model + toolhead + extruder(+drive) + hotend.
  "printers": [
    {
      "id": "abc123",
      "pubId": "6f9a…-uuid",              // random per-PRINTER id (not per user); reserved for
                                          // the future opt-in community config dataset. Unused offline.
      "maker": "Voron", "model": "Trident 350 AWD",
      "toolhead": "StealthBurner",
      "extruder": "Clockwork 2", "drive": "Direct",   // drive: Direct | Bowden
      "hotend": "Phaetus Rapido UHF",
      "maxAccel": 12000,                               // printer capability (mm/s²); ceiling for the accel sweep
      "multi": false,                                  // true = farm: track individual units
      "instances": [ { "id": "VT-350-001", "label": "VT-350-001" } ],
      "nozzles": [                                     // per-printer nozzle library (swappable, PA-relevant)
        { "id": "nz1", "maker": "Phaetus", "model": "stock", "diameter": 0.4, "material": "Hardened Steel" }
      ],
      "created": "2026-07-13T12:00:00Z"
    }
  ],

  // Reusable spool definitions.
  "filaments": [
    {
      "id": "def456",
      "maker": "Polymaker", "material": "PLA", "formulation": "Basic",  // string today; may be an array of strings in future (multi-select). Readers handle both.
      "color": "Army Green", "diameter": 1.75,
      "hardness": null,                   // Shore hardness string (e.g. "95A") for TPU only; else null
      "fiber": "No",                      // No | Carbon Fiber | Glass Filled | Custom | Advanced
      "fiberName": null,                  // fiber name when fiber == Custom
      "fiberPct": null,                   // % fill when fiber == Custom | Advanced
      "printers": [],                     // restrict visibility to these printer ids; [] = visible on all
      "created": "2026-07-13T12:01:00Z"
    }
  ],

  // Calibration runs. status: planned (settings only) -> complete | abandoned.
  "runs": [
    {
      "id": "run789",
      "created": "2026-07-13T12:05:00Z", "date": "2026-07-13",
      "status": "complete",
      "printerId": "abc123", "instanceId": "VT-350-001",   // instanceId null unless multi
      "filamentId": "def456",
      "nozzle": { "maker": "Phaetus", "model": "stock", "diameter": 0.4, "material": "Hardened Steel" }, // snapshot
      "nozzleId": "nz1",                  // which of the printer's nozzles was used
      "mode": "advanced",                 // advanced (adaptive) | basic
      "basicMethod": "pattern",           // tower | line | pattern (always "pattern" for advanced)
      "unit": "flow", "layerH": 0.2, "lineW": 0.44,   // unit: flow | speed (+ conversion geometry)
      "maxFlow": 20,                      // max volumetric speed (mm³/s) from a prior flow calibration; pre-fills next run for same printer+nozzle+filament
      "settings": {
        "source": "recommended",          // recommended | provided
        "paStart": 0.02, "paEnd": 0.09, "paStep": 0.005,
        "points": [3, 8, 12, 16, 20],     // in `unit` (flow mm³/s or speed mm/s)
        "accels": [1000, 2000, 3500, 6500, 12000]
      },
      "results": [                         // grid rows (advanced) or one row (basic)
        { "x": 3,  "accel": 1000,  "bestPA": 0.030, "notes": "" }
        // ... x is in the run's `unit`; basic runs use { "x": null, "accel": null, "bestPA": … }
      ],
      "analysis": { "fit": { "b1": 0.0004, "b2": 0.0000018, "b0": 0.024, "r2": 0.98 } },
      "modelText": "…exact text pasted into Orca…",
      "shareCommunity": false
    }
  ],

  "lastPrinterId": "abc123",
  "lastInstanceId": "VT-350-001",
  "lastNozzleId": "nz1",
  "lastFilamentId": "def456",

  // Parsed pattern-block geometry per PLANNED run, so the visual picker still renders the
  // real pattern after a reload/resume (the in-memory parse is otherwise lost). Coords only,
  // rounded to 0.1mm (~266 KB/run). Dropped when a run is completed or abandoned.
  "gcodeCache": { "run789": { "byKey": { "8000|100": { "bbox": [], "rbox": [], "byPa": {}, "bg": [], "text": [] } }, "plate": {} } }
}
```

### Notes
- **Printer identity**: swapping extruder, toolhead, or hotend = a new printer entry.
  Nozzle swaps are just a per-run detail (`runs[].nozzle`).
- **Farm scaling**: `multi: true` reveals `instances` (serial / asset IDs). Home users
  leave it off and never see instance tracking; the machine is still always recorded.
- **Run lifecycle**: save a `planned` run before you print, then Resume it later to
  enter results (it becomes `complete`). `abandoned` sets a run aside without deleting
  the filament.
- **`analysis.fit`** is a simple linear fit (`slope`/`intercept`) for a single accel, or
  a two-variable fit (`b1`·x + `b2`·accel + `b0`) when multiple accels are present.
- `shareCommunity` is per-run, defaults `false`. Nothing is shared in Phase A (no
  network). In Phase B, only `shareCommunity: true` runs — and only the hardware/
  filament keys + PA results, never anything identifying — would feed the community set.
```
