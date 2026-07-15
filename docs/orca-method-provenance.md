# OrcaSlicer method provenance

PA-Helper reproduces the geometry of OrcaSlicer's **PA Pattern** calibration so the picker matches
what physically prints. We do **not** copy OrcaSlicer code; `js/pattern.js` is an original
re-implementation of the *method*. OrcaSlicer and PA-Helper are both **AGPL-3.0**, so this is
license-compatible; attribution is preserved here and in `js/pattern.js`.

This file is the **checklist for the monthly upstream tripwire**: each month, diff the OrcaSlicer
`main` **and** `dev` branches for changes to the items below. Any change here means our replica may
need updating.

Upstream source: `SoftFever/OrcaSlicer` — `src/libslic3r/calib.cpp` and `src/libslic3r/calib.hpp`.
Last reviewed against `main`: **2026-07-14**. Geometry has been stable since the pattern was
introduced (2023-07-22, commit `777c7c68f9`).

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
