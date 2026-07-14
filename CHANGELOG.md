# Changelog

All notable changes to PA-Helper are recorded here.

**Versioning:** `v0.1.<build>`. During beta the major.minor is fixed at `0.1`; the build number
increments on each stamped build (`node tools/stamp.js`) and resets to `1` when the minor version
rolls. A minor bump (`0.1` → `0.2` → …) marks a milestone improvement. **v1.0** will mark the first
"fully usable" release and a tagged GitHub release.

## [Unreleased]

### Added
- **Bed size on printers** (`js/beds.js` + printer form): maker-driven **model dropdown** (newest
  first) that auto-fills bed shape / X / Y / origin, with Custom + manual entry. A printer must have
  a bed before you can leave the Printers tab (bounce-back gate) — this also migrates existing
  printers. Printer form reorganized into readable rows (maker+model / toolhead+extruder+hotend+drive
  / bed shape+X+Y+origin / max accel).
- **Unsaved-PA-job guard**: once you start a PA test, navigating away — switching tabs or closing the
  browser tab — prompts you to save it as an in-progress run or abandon it.
- Editable **printer name** (shown as the card title) and the maker's **favicon** on each printer card
  (hotlinked live from the maker's site, never stored).
- New printers auto-seed one **Generic 0.4 mm Brass** nozzle and then prompt you to keep it or delete
  it and add your own.
- **Plate-fit**: the recommend output now tells you how many test plates the job needs on your bed
  (e.g. "25 objects → 3 plates, 12 per plate on your 280×280 mm bed").

### Changed
- `beds.js` rebuilt as a clean, documented single-purpose data file: real per-maker models (Voron =
  Trident / V2.4 / V0 / Switchwire / Legacy), kit vendors (LDO/Formbot) dropped as makers, `[x,y]` /
  `[d]` / `null` bed scheme, newest-first, one maker block each for easy PR review.
- The Add-printer form now starts blank and fills in as you make selections (maker → parts + models,
  model → bed size).

### Fixed
- A remembered custom printer model no longer appears under every maker (the model dropdown no longer
  pools global custom entries).
- **Orca-method PA-pattern replica** (`js/pattern.js`) — generates the exact block that OrcaSlicer
  prints for the no-g-code picker: chevrons, the anchoring frame, the filled number tab, the
  seven-segment PA / flow / acceleration glyphs (Orca's own digit method, not a font), and the
  per-block registration square. Validated against a real Orca g-code block. The block widens when
  a longer accel label (e.g. `12000`) is present, matching the print.
- Early-beta warning banner (app + README) and this changelog.
- Version display in the footer (`v0.1.<build>`).

### Changed
- Pattern picker unified: an imported g-code file is drawn from its real toolpath; a generated
  block uses the replica. (Previously the no-g-code case used an approximate schematic.)
- Registration square is now solid-filled; the number tab has its own frame aligned to the pattern
  frame (one continuous border); digits use the theme-contrast ink so they read as printed lines,
  not negative space; the number tab depth grows with the longest label so a 5-char accel enlarges
  the block, matching the print.

### Notes
- Provenance of the Orca method we replicate is tracked in `docs/orca-method-provenance.md`
  (the checklist for the monthly upstream-change tripwire).

## v0.1 — 2026-07-14

- First public GitHub commit. Client-side, offline PA-calibration companion: printers / filaments /
  PA-test workflow, adaptive PA table + PA-vs-flow/accel plot + OrcaSlicer export, g-code import with
  a real-geometry line picker, three-tab UI with theming, AGPLv3.
