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
- `line_spacing_angle() = line_spacing / sin(corner/2)`.
- `frame_size_y() = 2 · sin(corner/2) · wall_side_length` (= 42.426 mm at 90°/30).
- row pitch = `(walls−1)·line_spacing_angle + line_width + pattern_spacing` (from `glyph_start_x`).
- `pattern_shift() = (walls−1)·line_spacing_first_layer + line_width_first_layer + glyph_padding_horizontal`.
- `glyph_start_x(i)` — centers the glyph column on pattern *i*.
- `glyph_length_x() = line_width + 2·digit_segment_len`.
- `max_numbering_length()` — includes the **accel** string, so a wide accel (`12000`) enlarges the
  number tab (and thus the block).

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
