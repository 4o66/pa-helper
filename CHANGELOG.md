# Changelog

All notable changes to PA-Helper are recorded here.

**Versioning:** `v0.1.<build>`. During beta the major.minor is fixed at `0.1`; the build number
increments on each stamped build (`node tools/stamp.js`) and resets to `1` when the minor version
rolls. A minor bump (`0.1` → `0.2` → …) marks a milestone improvement. **v1.0** will mark the first
"fully usable" release and a tagged GitHub release.

## [Unreleased]

### Added
- **Smart default point counts**: the speed and accel point counts now start from a heuristic that
  scales with how wide a range each axis actually sweeps — accel by log span from 1000 (2000→2 points,
  12000→5), speed by the flow envelope (~1 point per 5 mm³/s), both floored at 2. A low-accel/low-flow
  machine gets e.g. a 2×2 instead of a fixed 5×5, cutting print time for the same coverage. The counts
  re-suggest when you pick a printer/filament or enter your max flow, but stop auto-adjusting the moment
  you set a count yourself. (Heuristic, not hard data — see the tuning note in the code.)
- **Speed axis now mirrors the accel axis**: alongside "Speed points" there's a greyed **Max speed
  (mm/s)** box — back-calculated from your max *volumetric* flow (mm³/s) and the layer-height × line-width
  geometry — and an editable **Speed values to test** list, auto-spaced from the count. This resolves the
  mismatch that Orca's flow-rate test reports volumetric flow while the PA dialog takes nozzle velocity.
- **"Display speed as" radio** (Nozzle velocity / Volumetric rate) replaces the old unit dropdown, with a
  short explanation. Default is **nozzle velocity (mm/s)** because that's how Orca's PA Pattern dialog is
  configured. Switching recalculates and converts the max box and value list between the two views.
- **Multi-colour filament swatches**: the "Dual Color" formulation is renamed **Multi-Color**, and a
  Multi-Color spool's swatch is now a left→right **gradient** built from every colour named in the
  colour field, in the order you typed them (e.g. "Rainbow Purple/Pink/White" → purple → pink → white).
  Multi-word colours ("Space Grey", "Army Green") are matched correctly. Single-colour filaments are
  unchanged. Existing "Dual Color" filaments migrate automatically.
- **Symmetric point-count controls**: the recommend form now has an **Accel points** count next to the
  flow/speed **points** count. Each auto-spaces its own axis (flow/speed across the flow range; accel
  log-spaced 1000 → your printer's max) and the two are **independent**, so you can run e.g. 5 speeds ×
  3 accels. The accel value list is still editable as an override, and its count stays in sync with what
  you type. The points label reads "Speed points" or "Flow points" depending on the selected unit.
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
- **Multi-plate import**: import a large adaptive job one printed plate at a time. PA-Helper merges
  the plates into one results table, and when the matrix has gaps it prompts you to import the other
  plate(s) or fill the gaps with generated patterns ("Complete the matrix"). Added plates are checked
  against the job's PA range (with a warning if they don't fit) and overlapping combos are de-duped.
  The picker thumbnail shows every imported plate with the current object and its plate highlighted.

### Changed
- **Line width is no longer a user input** — it's derived by Orca's own method and no longer shown.
  Orca doesn't ask for line width in the PA test; it computes it as `auto_extrusion_width` for the
  perimeter role = **1.125× nozzle** (0.4 → 0.45 mm, matching real Orca g-code). Previously we
  defaulted to a made-up 1.1× (0.44) and let it be edited. Source recorded in
  `docs/orca-method-provenance.md` (`Flow.cpp`).
- **Layer height stays visible and editable**, defaulting to `0.5× nozzle` (0.4 → 0.2 mm). Unlike line
  width, Orca has no formula for it — it uses your print profile's layer height, which genuinely varies
  (0.2 standard, 0.28 draft, 0.12 fine). It feeds the flow↔speed conversion, so most users leave it but
  those calibrating at a non-default layer height can set it. The geometry hint now explains where both
  numbers come from.
- `beds.js` rebuilt as a clean, documented single-purpose data file: real per-maker models (Voron =
  Trident / V2.4 / V0 / Switchwire / Legacy), kit vendors (LDO/Formbot) dropped as makers, `[x,y]` /
  `[d]` / `null` bed scheme, newest-first, one maker block each for easy PR review.
- The Add-printer form now starts blank and fills in as you make selections (maker → parts + models,
  model → bed size).
- The picker's plate thumbnails now show the **full bed** with each object at its real position
  (instead of cropping to the pattern), drawn as its **actual first-layer pattern** (frame,
  chevrons, numbers), and plates are ordered **low → high acceleration** (as Orca lays them out)
  regardless of the order you import them.

### Changed
- **Picker plate thumbnails removed.** OrcaSlicer positions the pattern objects with its **bin-packing
  arranger** (`arrangement::arrange`, confirmed in `Plater::_calib_pa_pattern` — not a grid), so a
  block's cell can't be predicted for a not-yet-sliced job, and a position map you can't trust is worse
  than none. The picker now identifies a block the way Orca intends — by the **flow and acceleration
  printed on it** — and the header text says so. Multi-plate imports still get a "plate N of M" note in
  the title (that mapping is reliable, read from the file). This also removes a recurring source of
  layout bugs.
- **Pattern number labels now match Orca's rounding.** The picker rendered flow labels with a fixed
  3-decimal format (e.g. `12.86`), but Orca formats them by *significant figures* via
  `convert_number_to_string` — with 4-digit accels the flow prints at 3 sig figs, so `12.86` prints as
  **`12.9`** on the actual plate. We now replicate Orca's exact rule (precision driven by the block's
  `max_numbering_length`), so the rendered numbers match the physical print you're comparing against.
- **Flow↔speed conversion was ~10% off** — it used `layer_height × line_width` for the bead
  cross-section, but Orca models the extruded bead as a rounded rectangle, so the real area is
  `layer_height × (line_width − layer_height·(1−π/4))`. At 0.2 × 0.45 that's 0.0814 mm², not 0.09
  (verified against a printed .gcode: measured 0.08142 mm²). The recommended speeds were therefore
  ~10% too low for the intended volumetric flow; they now match what Orca actually extrudes. This
  feeds the max-speed box, the speed list, and the speed↔flow display.
- A remembered custom printer model no longer appears under every maker (the model dropdown no longer
  pools global custom entries).
- G-code import no longer treats the **anchor/frame** (accel 500 / speed 30) or Orca's ±1 speed pairs
  (e.g. 33/34) as real test combos. This fixes a false "duplicate combos" warning across plates and a
  wrong matrix (e.g. an anchor cell inflating the grid), and makes the picker find the right block for
  tests that don't use 50/100/150 mm/s.
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
