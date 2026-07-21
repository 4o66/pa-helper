# OrcaSlicer method provenance

PA-Helper reproduces the behavior of OrcaSlicer's **PA Pattern**, **PA Line**, and **PA Tower**
calibrations so what we show the user matches what physically prints. We do **not** copy
OrcaSlicer code; `js/pattern.js` (Pattern, Line) and the Tower recommendation/read-back logic are
original re-implementations of the *method*. OrcaSlicer and PA-Helper are both **AGPL-3.0**, so
this is license-compatible; attribution is preserved here and in the relevant source files.

This file is the **checklist for the monthly upstream tripwire**: each month, diff the OrcaSlicer
`main` **and** `dev` branches for changes to the items below. Any change here means our replica may
need updating.

Upstream source: `SoftFever/OrcaSlicer` (mirrored at `OrcaSlicer/OrcaSlicer`) —
`src/libslic3r/calib.cpp`/`.hpp` (Pattern, Line), `src/slic3r/GUI/Plater.cpp`,
`src/libslic3r/GCode.cpp`, `src/libslic3r/GCodeWriter.cpp`, and `src/slic3r/GUI/calib_dlg.cpp`
(Tower). `Plater.cpp` and `GCode.cpp` are too large for a direct raw fetch (truncates at ~94KB,
well short of the calibration functions near line 5467/13823) — when a direct fetch won't reach
far enough, cross-check via `grep.app` (code search across GitHub mirrors, no size limit) and
GitHub's own file/PR view (via browser, not `web_fetch`) instead of assuming the truncated content
is the whole file.
Pattern last reviewed against `main`: **2026-07-18** — geometry has been stable since the pattern
was introduced (2023-07-22, commit `777c7c68f9`); this pass added the Basic (single-block) mode
section below, covering `calib_dlg.cpp`'s dialog behavior for blank accel/speed fields. Tower last
reviewed against `main`: **2026-07-17**. Line last reviewed against `main`: **2026-07-21** — see
the "2026-07-21 upstream review" note at the end of the Line method section below.

## Derived line width (`src/libslic3r/Flow.cpp`)

Line width is **not** a PA-test input in Orca — Orca derives it — so PA-Helper derives it the same
way and does not let the user set it. `Flow::auto_extrusion_width(role, nozzle)` returns the auto
extrusion width; `opt_key_to_flow_role("line_width")` → `frPerimeter`, which falls into the default
case = **`1.125 × nozzle_diameter`** (0.4 → 0.45). This matches real Orca g-code. (A user profile can
override `line_width` off auto; we assume the auto/default. `frSupportMaterial` / `frTopSolidInfill`
use `1.0×`, but those roles don't apply to the PA pattern.) `js/presets.js: lineWidthFactor = 1.125`.
Monthly tripwire: confirm `auto_extrusion_width` still returns `1.125×` for the perimeter role.

## Constants we mirror (`calib.hpp`)

| Orca symbol | Value | Used for |
|---|---|---|
| `m_wall_side_length` | `30.0` mm | chevron arm length |
| `m_corner_angle` | `90` | chevron corner (±45° arms) |
| `m_pattern_spacing` | `2` | gap between PA patterns |
| `m_digit_segment_len` | `2` | glyph segment length |
| `m_digit_gap_len` | `1` | `number_spacing = seg + gap = 3` |
| `m_max_number_len` | `5` | max glyphs per number |
| `m_glyph_padding_vertical` / `_horizontal` | `1` | number placement / pattern_shift |
| default `wall_loops` | `3` | nested perimeters ("3 lines") |

## Formulas we mirror

- `get_num_patterns() = ceil((end − start) / step + 1)` — chevron count.
- `line_spacing() = line_width − layer_height · (1 − π/4)`.
- **Bead cross-section (flow↔speed):** `area = layer_height · line_spacing = layer_height · (line_width − layer_height·(1−π/4))`. Orca/Slic3r model the extruded bead as a rounded rectangle, so volumetric flow = nozzle_speed · area — **not** `layer_height · line_width`. Verified against real Orca g-code: 0.2 mm × 0.45 mm → measured 0.08142 mm² (n=702 walls), matching the formula to 5 digits; the naive product (0.09) overstates flow ≈10%. `js/app.js: beadArea()`.
- `line_spacing_angle() = line_spacing / sin(corner/2)`.
- `frame_size_y() = 2 · sin(corner/2) · wall_side_length` (= 42.426 mm at 90°/30).
- row pitch = `(walls−1)·line_spacing_angle + line_width + pattern_spacing` (from `glyph_start_x`).
- `pattern_shift() = (walls−1)·line_spacing_first_layer + line_width_first_layer + glyph_padding_horizontal`.
- `glyph_start_x(i)` — centers the glyph column on pattern *i*.
- `glyph_length_x() = line_width + 2·digit_segment_len`.
- `max_numbering_length()` — the widest of the shown **PA** labels and the **accel** label (flow is
  NOT measured), capped at `m_max_number_len`. A wide accel (`12000`) enlarges the number tab (and
  the block). This length also sets the **print precision** for every label (see below).
- `flow_val() = speed · Flow(line_width, layer_height, nozzle).mm3_per_mm() · flow_ratio` — the flow
  label is the **volumetric flow** (rounded-bead `mm3_per_mm`, matching `beadArea()`), not the speed.
- `convert_number_to_string(num, precision)` — **significant-figure** formatting (C++
  `std::defaultfloat`): `setprecision(num >= 1000 ? precision : precision − 1)`, i.e. a sub-1000 value
  loses one digit to the decimal point. `draw_number` passes `m_number_len = max_numbering_length()`.
  So with 4-char accels (`1000/2000/5000`) `m_number_len = 4` and the flow prints at **3 sig figs**
  (`12.86 → "12.9"`); a 5-digit accel makes it 4 sig figs. **We must match this exactly** or the
  picker's rendered numbers won't match the physical print. `js/pattern.js: orcaNumStr()`.
  ⚠ **Monthly tripwire:** if Orca changes `convert_number_to_string` precision, the default
  `ostringstream` precision (6), or which value (`flow_val` vs speed) is drawn, our labels drift.

## Structure we mirror (`calib.cpp` `generate` / helpers)

- **Anchoring frame**: `draw_box(start, print_size_x, frame_size_y)` (outline).
- **Number tab**: filled `draw_box` below the frame — the solid fill behind the digits.
- **Chevrons**: per-pattern walls, `cos/sin(45)·side_length` arms, apex +X.
- **Numbers**: `draw_number` → `draw_digit` seven-segment glyphs; PA every other pattern, **flow**
  at index `num+2`, **accel** at index `num+4`; drawn Bottom-To-Top.

## Reproduced but NOT from the pattern generator

- **Per-block registration square** (~3.4 mm, left-center of the frame): prints in reality but is
  *not* produced by `CalibPressureAdvancePattern`. Its size/offset were **measured** from real Orca
  output. If Orca ever formalizes it, replace the measured value with the real formula.
- **Multi-object plate arrangement = bin-packing, NOT a grid (authoritative).** Source:
  `src/slic3r/GUI/Plater.cpp` → `Plater::calib_pa` (case `Calib_PA_Pattern`) → `Plater::_calib_pa_pattern`.
  Orca builds N identical reference rectangles (one cube scaled to `pa_pattern.print_size_x()+4` ×
  `print_size_y()+4`) and calls **`arrangement::arrange(arranged_items, bedpts, ap)`** — its standard
  nesting/bin-packing arranger, the same one used by plate auto-arrange. Each object's final position is
  `cur_plate->get_origin() + {ai.translation(X), ai.translation(Y)} + pa_pattern.handle_pos_offset()`.
  There is **no starting corner, no row/col spacing constant, and no fill-direction math** — positions
  are whatever the nester assigns to polygon index `test_idx`.
  - Combo → index order: `tspd = speeds[test_idx % speeds.size()]`, `tacc = accels[test_idx / speeds.size()]`
    → **speed is the inner (fast) axis, accel the outer (slow) axis**; the first combo is `speeds[0]×accels[0]`.
  - Tiles are named `pa_pattern_<int speed>_<int accel>` and carry per-object `outer_wall_speed` /
    `outer_wall_acceleration` overrides. **Orca identifies a tile by this name/label, not by position.**
  - ⟹ **We cannot reliably predict exact plate positions for a generated (not-yet-sliced) job** — that
    would require re-implementing Orca's arranger. The picker must therefore identify blocks by their
    **printed flow/accel/PA labels** (which we render), not by a synthetic plate map. Imported g-code is
    fine — it carries the real positions. ⚠ Monthly tripwire: if `_calib_pa_pattern` stops using
    `arrangement::arrange`, or the `test_idx` speed/accel decomposition flips, revisit this.

## Basic (single-block) Pattern — PA-Helper's own simplification

Orca itself has **no distinct "Basic Pattern" mode** to mirror — verified in `calib_dlg.cpp`:
the accel/speed list fields (`m_tiBMAccels`/`m_tiBMSpeeds`) are always shown and always enabled for
Pattern (`reset_params()`, case 2), never gated behind an advanced/simple toggle. `on_start()` just
does `ParseStringValues(m_tiBMAccels->GetTextCtrl()->GetValue().ToStdString(), m_params.accelerations)`
— if the field was left blank, that's an empty vector, and `_calib_pa_pattern` applies no
per-object `outer_wall_speed`/`outer_wall_acceleration` override at all in that case (the override
only happens via the multi-object bin-packing path documented above, which needs a non-empty combo
list). So "leave the fields blank" in real Orca means: print one block at whatever the active
profile's speed/acceleration already are — nothing for Orca (or PA-Helper) to invent.

PA-Helper's Basic — Pattern reuses `CalibPressureAdvancePattern`'s exact chevron/frame/PA-label
geometry (`js/pattern.js: synthBlock()`) with `flow`/`accel` explicitly passed as null, which
already skips drawing those two label rows entirely — matching what a real blank-fields print would
actually show (PA labels only, no flow/accel numbers, since there's no meaningful override value to
print). No new geometry, no invented single flow/accel point.

## Tower method (`CalibMode::Calib_PA_Tower`)

Unlike Pattern, Tower has **no bespoke geometry-generating class** — `calib.hpp` only declares
`CalibPressureAdvanceLine` and `CalibPressureAdvancePattern`. Verified by reading
`Plater::_calib_pa_tower()` (`src/slic3r/GUI/Plater.cpp`, ~line 13823) and the `Calib_PA_Tower`
case in `GCode::change_layer` (`src/libslic3r/GCode.cpp`, ~line 5467) verbatim, in full, not just a
summary.

**What prints.** A single fixed mesh, `resources/calib/pressure_advance/tower_with_seam.drc`
(Draco-compressed geometry, no embedded config — confirmed via `src/libslic3r/Format/DRC.cpp`),
cropped with `cut_horizontal(0, 0, new_height, KeepLower)` to:

`tower_height_mm = ceil((end − start) / step) + 1`

Fixed object/print overrides alongside the crop: 2 perimeters (`wall_loops`), 0% infill, no
top/bottom shells, seam forced to rear, brim type "ears," `max_volumetric_extrusion_rate_slope`
disabled, `slow_down_layer_time` forced to `1.0`. One tower, one object — not a matrix, not
multiple copies, not multiple plates.

**The tower's real cross-section is not a box.** `tower_with_seam.drc` is Draco-compressed
geometry — not fetchable/decodable through this project's available tooling (raw GitHub content
is blocked by the sandbox's network allowlist, and the Draco format needs a real decoder, not a
text-oriented fetch). So the actual shape was confirmed the reliable way: parsing Sean's own
sliced g-code (`tower_with_seam_0.2mm_ASA_..._19m48s.gcode`, OrcaSlicer 2.4.0, Start=0/End=0.1/
Step=0.002, `tower_height_mm=51`, 255 layers) and extracting the outer-wall toolpath directly. Two
widely separated layers (an early layer and layer 200) produced byte-identical footprint
coordinates, confirming a constant vertical prism (no taper, no per-layer rotation):

```
140.200 209.551   140.200 175.083   175.000 140.283
209.800 175.083   209.800 209.551   175.246 209.798
```

That's a pentagon, not a rectangle: one flat edge, one straight side, and two diagonals meeting at
a single sharp point at the opposite side (bounding box ≈ 69.6 × 69.4 mm). The single asymmetric
point most likely serves as the seam/orientation marker the mesh's filename references — a plain
box would have four indistinguishable corners, this shape doesn't. `js/app.js`'s `buildTowerBands()`
uses this exact traced footprint (recentered, rotated 90° for the schematic's fixed viewpoint) run
through a true isometric projection, not a rectangular-box approximation.

**How PA actually ramps.** There is no per-height config override (no `layer_config_ranges`
usage — checked directly) and nothing is drawn on the model (no digit/number glyphs, unlike
Pattern/Line). Every layer change, `GCode::change_layer` emits a **live firmware PA command**,
recomputed from the current print height:

```cpp
case CalibMode::Calib_PA_Tower:
    gcode += writer().set_pressure_advance(print.calib_params().start
             + static_cast<int>(print_z) * print.calib_params().step);
    break;
```

`GCodeWriter::set_pressure_advance()` (`src/libslic3r/GCodeWriter.cpp`, ~line 419) then flavors
this per firmware: `M900 K<pa> L1000 M10` (Bambu), `SET_PRESSURE_ADVANCE ADVANCE=<pa>` (Klipper),
`M572 D0 S<pa>` (RepRapFirmware), `M233 X<pa> Y<pa>` (Repetier), or `M900 K<pa>` (default/Marlin).
The `static_cast<int>(print_z)` truncation means **each band is always exactly 1 whole mm**,
unconditionally, regardless of the numeric PA step chosen — a coarser step shortens the tower for
a given start/end range, it does not thicken the bands. The identical per-layer-gcode-by-mode
pattern is used for Orca's other calibration towers (Temp, VFA, Volumetric Speed, Retraction) —
this is the general tower mechanism, not something PA-specific.

**Formula for reading a result:** `PA = start + step × measured_height_mm`, where
`measured_height_mm` must be a whole number in `[0, tower_height_mm − 1]`. There is no printed
scale or label on the tower — the user measures physically (ruler/calipers) and finds the
best-quality transition by eye. The OrcaSlicer wiki's worked example (`0 + 0.002 × 8 = 0.016`)
matches this formula exactly.

**Orca's own dialog defaults** (`PA_Calibration_Dlg::reset_params()`,
`src/slic3r/GUI/calib_dlg.cpp`) — direct-drive: start `0.0`, end `0.1`, step `0.002`; Bowden: end
`1.0`, step `0.02` (Pattern's own Bowden step is `0.05`, for comparison). **PA-Helper does not
reuse these flat defaults** — the existing per-material `paRanges` table (`js/presets.js`) already
gives better-tuned `[start, end, step]` triples (already bowden-scaled via `bowdenScale`), and
Tower's recommendation reuses that table directly rather than introducing Tower-specific numbers.

**This must be visible to the user, not just documented here.** Anyone who's read the OrcaSlicer
wiki or used Orca's own Tower dialog will expect the stock `0 / 0.1 / 0.002` (direct-drive)
defaults; PA-Helper's per-material range will usually differ (e.g. PLA comes out `0.010 / 0.070 /
0.005`). The Tower UI needs its own explicit callout — not just a tooltip buried elsewhere — that
these are PA-Helper's own recommended range, not Orca's stock default, so a user comparing against
the wiki doesn't think something's wrong. Carry this into the mockup.

⚠ **Monthly tripwire:** if `_calib_pa_tower()` starts touching `layer_config_ranges` or per-object
config instead of a fixed mesh + live per-layer firmware command, or if `GCode::change_layer`'s
`Calib_PA_Tower` case changes its formula or truncation, this section is stale.

## Line method (`CalibPressureAdvanceLine`)

Unlike Tower, Line **does** have a bespoke geometry-generating class — `CalibPressureAdvanceLine`
in `calib.cpp`/`.hpp`, both fetched in full. It prints a stack of short/long/short speed-transition
test lines, one per PA value, bracketed by two priming/anchoring walls, with a filled number tab
printing every other row's PA value.

**Constructor overrides** (the header's own defaults are placeholders, immediately replaced in the
constructor body):

- `m_line_width = nozzle_diameter < 0.51 ? nozzle_diameter × 1.5 : nozzle_diameter × 1.05` — Line's
  **own** formula, distinct from Pattern/Tower's `1.125 × nozzle` wall width.
- `m_number_line_width = m_thin_line_width = nozzle_diameter` — the bare nozzle diameter (not a
  derived factor) for the prime/anchor walls and the printed number glyphs.
- `m_height_layer = config.initial_layer_print_height` — not modeled here; PA-Helper's schematic is
  2D geometry only, no extrusion/layer math needed for a picker.

**Row geometry** — `m_space_y{3.5}` (fixed row pitch, mm), `m_length_short{20.0}`,
`m_length_long{40.0}`. Each row is three collinear segments at the **same X columns across every
row** — short(slow) / long(fast) / short(slow) — so the two speed-transition points line up in
vertical columns across all rows; that alignment is the actual feature being visually judged
(blob/gap at either transition). `m_length_long` bed-width-adaptively shrinks (`40 + min(w−120, 0)`)
on beds narrower than 120 mm; PA-Helper's schematic assumes the ≥120 mm-bed case (fixed 40 mm) as a
documented simplification — `js/pattern.js: CONST.lineLengthLong`.

`set_speed(fast=100.0, slow=20.0)` (mm/s), `speed_adjust(speed) = speed × 60` for the gcode F-value.
Not modeled in the 2D schematic (only the X columns matter for the picker, not the speeds
themselves). Not fully verified whether `Plater.cpp` ever overrides these defaults before calling
`generate_test()` — flagged as an open uncertainty, not chased further given `Plater.cpp`'s fetch-
size constraints (868 KB / 19,867 lines; the tool truncates well before this function).

**Prime wall**: one full-height vertical stroke at `x = start_x` (the same X every row starts at),
spanning `y ∈ [start_y, start_y + num·m_space_y]`, printed **once** before any row, at PA=0, heavily
over-extruded (`e_per_mm × m_space_y × num × 1.2`) — a pure flow-priming feature, not meant to be
visually judged.

**Anchor wall**: a second full-height vertical stroke at `x = start_x + m_length_short +
m_length_long + m_length_short` (= 80 mm with defaults), printed **once** immediately after row
`i==0`'s three segments (same loop iteration), also at PA=0 — a bracing/anchoring feature (same
spirit as Pattern's anchoring frame), also not meant to be judged.

**Numbers** (`m_draw_numbers{true}` by default — in real Orca's dialog this is user-toggleable for
Line specifically, unlike Pattern where it's forced-on with a disabled checkbox; PA-Helper's picker
always draws them, since the picker needs them to identify rows the same way the print does):
printed on the **second** layer, using the base class's default `Left_To_Right` digit-glyph mode —
`CalibPressureAdvanceLine` never overrides `DrawDigitMode`, unlike Pattern's explicit
`Bottom_To_Top`. Digits print for **every other row** (`i % 2 === 0`).

Box/label position formulas: `box_start_x = start_x + short + long + short + line_width`;
`number_spacing() = digit_segment_len + digit_gap_len = 3`; tab width = `number_spacing() × 8 = 24`
mm; tab Y spans `[start_y − m_space_y, start_y − m_space_y + (num+1)·m_space_y]` (= `[start_y −
m_space_y, start_y + num·m_space_y]` — one row-pitch below row 0, up to `num·m_space_y` above).
Each row `i`'s label draws at `(box_start_x + 3 + line_width, y_pos + m_space_y/2)` — vertically
centered in the gap after that row.

**Fixed label precision — the one non-obvious quirk here.** `CalibPressureAdvanceLine::generate_test()`
**never reassigns `m_number_len`** (unlike Pattern's `max_numbering_length()`), so it always uses
the base class's default (`m_max_number_len = 5`). Per `convert_number_to_string`'s significant-
figure formula (`precision ? (v ≥ 1000 ? precision : precision − 1) : 6`), and since PA values are
always < 1000, Line's printed labels are **always** formatted at 4 significant figures, regardless
of range. `js/pattern.js: synthLineBlock()` hard-codes `numberLen = CONST.maxNumberLen` for exactly
this reason — do not let it inherit Pattern's dynamic `max_numbering_length()` logic if this file is
ever refactored to share more code between the two methods.

**Left_To_Right `draw_digit` point layout** (verified from the actual C++ `else` branch — the same
abstract 6-point + 2-gap-point segment topology as Pattern's `Bottom_To_Top` table, just different
`(x,y)` formulas): `p0=(sx,sy)`, `p0_5=(sx+L/2,sy)`, `p1=(sx+L,sy)`, `p2=(sx+L,sy−L)`,
`p3=(sx,sy−L)`, `p4=(sx,sy−2L)`, `p4_5=(sx+L/2,sy−2L)`, `p5=(sx+L,sy−2L)` — a box growing
**downward** from `(sx,sy)` as characters advance in `+X` (vs. Pattern's box growing **upward** as
characters stack in `+Y`). Confirmed the same abstract `DIGIT` segment-index table (which point-
pairs form each digit 0–9/`.`) applies unchanged to both orientations by reusing it against this
new point layout in a throwaway Node script and visually inspecting the resulting glyph strokes —
`js/pattern.js: digitPointsBTT()` / `digitPointsLTR()` share one `DIGIT` table.

⚠ **Monthly tripwire:** if `CalibPressureAdvanceLine`'s constructor formulas, `m_space_y` /
`m_length_short` / `m_length_long`, the prime/anchor wall mechanism, or the never-reassigned
`m_number_len` change, `js/pattern.js: synthLineBlock()` needs updating to match.

### 2026-07-21 upstream review — no impact

Triggered by an OrcaSlicer app update. Found the relevant recent change: PR
[#14440](https://github.com/OrcaSlicer/OrcaSlicer/pull/14440) "PA_Line Calibration QOL
improvements and tweaks" (merged into `OrcaSlicer/OrcaSlicer:main`). It does three things, none of
which touch the geometry PA-Helper replicates:

- Constrains Line's bed-placement bounding box to the actual calibration geometry instead of the
  full bed (fewer mesh-bed-leveling probe points) — a new `CalibPressureAdvanceLine::print_extents()`
  mirrors `generate_test()`'s own math purely for *where Orca places the object on the bed*, not
  the object's own shape.
- Adds `;TYPE:`/`;HEIGHT:`/`;LAYER_CHANGE` GCodeProcessor reserved-tag comments to Line and Pattern
  segments, fixing a gcode-viewer bug (wrong Z-height reported when a purge line precedes the
  calibration, and Line's numbers appearing on the wrong layer in the viewer). Cosmetic/metadata
  only — doesn't change any coordinate, constant, or formula.
- Skips `EXCLUDE_OBJECT_DEFINE` for Line mode (a Prusa-firmware compatibility fix, unrelated to
  geometry).

Re-verified against the current source that everything PA-Helper mirrors is unchanged:
`m_space_y=3.5`, `m_length_short=20`/`m_length_long=40`, the line-width formula, `m_number_line_width`/
`m_thin_line_width = nozzle`, both digit point layouts (`Bottom_To_Top`/`Left_To_Right`),
`auto_extrusion_width = 1.125×nozzle`, and the per-firmware `set_pressure_advance()` command
strings all match this doc exactly. No PA-Helper code change needed.

Two small things noticed in passing, not acted on (neither affects PA-Helper today):

- `GCodeWriter::set_pressure_advance()` now has `if (pa < 0) return "";` — silently no-ops for
  negative PA. Doesn't affect us; our ranges never go negative.
- `CalibMode` gained `Calib_Auto_PA_Line`, `Calib_Cornering`, `Calib_Input_shaping_freq/damp` — new
  calibration types. `Calib_Auto_PA_Line` sounds like it could be a sensor-driven automatic Line
  variant; not investigated, since it's a different calibration mode from the manual
  `Calib_PA_Line` this doc covers.
