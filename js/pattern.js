/*
 * pattern.js — synthetic OrcaSlicer PA-Pattern AND PA-Line geometry generator.
 *
 * synthBlock() produces the same block shape buildPaBlocks() yields from real g-code, so
 * renderRealPattern() can draw a GENERATED (no-g-code) Pattern that matches what actually prints —
 * chevrons, the anchoring frame, the filled number tab, the seven-segment PA / flow / acceleration
 * digits, and the small registration square — all in MODEL space (mm). synthLineBlock() does the
 * same for the Line method: stacked speed-transition test lines, the prime/anchor walls, and the
 * printed every-other-row PA labels. Both share the same seven-segment digit-glyph engine below —
 * Pattern draws its digits stacked bottom-to-top, Line draws them left-to-right (both are real,
 * distinct orientations in the Orca source, not a stylistic choice made here).
 *
 * The METHOD is a from-scratch JavaScript re-implementation of OrcaSlicer's
 * CalibPressureAdvancePattern and CalibPressureAdvanceLine (SoftFever/OrcaSlicer,
 * src/libslic3r/calib.{cpp,hpp}, AGPL-3.0). No OrcaSlicer code is copied; PA-Helper is likewise
 * AGPLv3. The exact Orca functions/constants this mirrors are catalogued in
 * docs/orca-method-provenance.md (the monthly-tripwire checklist).
 *
 * Orca constants live in ONE object (CONST) so a version-keyed map can be slotted in if they change.
 */
(function () {
  var root = (typeof window !== "undefined") ? window : globalThis;

  // --- Orca constants (calib.hpp) ---
  var CONST = {
    wallSideLength: 30.0,       // m_wall_side_length
    cornerAngle: 90,            // m_corner_angle
    patternSpacing: 2,          // m_pattern_spacing
    wallCount: 3,               // default wall_loops
    digitSegmentLen: 2,         // m_digit_segment_len
    digitGapLen: 1,             // m_digit_gap_len   (number_spacing = seg + gap = 3)
    maxNumberLen: 5,            // m_max_number_len
    glyphPadV: 1,               // m_glyph_padding_vertical
    glyphPadH: 1,               // m_glyph_padding_horizontal
    squareSide: 3.4,            // per-block registration square (measured from real Orca output; an
                                // external anchor, not in the pattern generator — see provenance doc)
    lineSpaceY: 3.5,            // m_space_y (CalibPressureAdvanceLine) — fixed row pitch, mm
    lineLengthShort: 20.0,      // m_length_short — each of the two slow-speed segments per row
    lineLengthLong: 40.0        // m_length_long — the fast-speed segment per row (≥120mm-bed case;
                                // Orca shrinks this on narrow beds, not modeled here — see provenance doc)
  };
  var HALF = CONST.cornerAngle / 2;
  var rad = function (d) { return d * Math.PI / 180; };
  var SIN = Math.sin(rad(HALF)), COS = Math.cos(rad(HALF));

  function derive(p) {
    p = p || {};
    var nozzle = p.nozzle || 0.4;
    var lineWidth = (p.lineWidth != null && p.lineWidth > 0) ? p.lineWidth : +(nozzle * 1.1).toFixed(3);
    var layerH = (p.layerHeight != null && p.layerHeight > 0) ? p.layerHeight : +(nozzle * 0.5).toFixed(3);
    var walls = p.wallLoops || CONST.wallCount;
    // Orca: line_spacing = line_width - layer_height*(1 - PI/4); line_spacing_angle = spacing/sin(45)
    var lineSpacing = lineWidth - layerH * (1 - Math.PI / 4);
    var lsa = lineSpacing / SIN;
    var armDX = CONST.wallSideLength * COS;   // 21.213
    var halfH = CONST.wallSideLength * SIN;   // 21.213
    var fullH = 2 * halfH;                    // 42.426 = frame_size_y
    var rowPitch = (walls - 1) * lsa + lineWidth + CONST.patternSpacing;
    var patternShift = (walls - 1) * lineSpacing + lineWidth + CONST.glyphPadH;
    var numberSpacing = CONST.digitSegmentLen + CONST.digitGapLen; // 3
    var glyphLenX = lineWidth + 2 * CONST.digitSegmentLen;         // glyph_length_x
    return { nozzle: nozzle, lineWidth: lineWidth, layerH: layerH, walls: walls, lineSpacing: lineSpacing,
      lsa: lsa, armDX: armDX, halfH: halfH, fullH: fullH, rowPitch: rowPitch, patternShift: patternShift,
      numberSpacing: numberSpacing, glyphLenX: glyphLenX };
  }

  function paValues(start, end, step) {
    if (start == null || end == null || !step) return [];
    var n = Math.round((end - start) / step) + 1;
    if (!(n > 0)) return [];
    n = Math.min(n, 200);
    var v = []; for (var i = 0; i < n; i++) v.push(+(start + i * step).toFixed(5));
    return v;
  }

  // Orca CalibPressureAdvance::convert_number_to_string — SIGNIFICANT-figure formatting
  // (C++ std::defaultfloat). With precision p it uses setprecision(num >= 1000 ? p : p-1),
  // so a sub-1000 value spends one digit on the decimal separator. precision 0/undefined →
  // ostringstream's default of 6 sig figs (used only to MEASURE label lengths). Capped at
  // maxNumberLen glyphs. e.g. p=4 → flow 12.86 prints "12.9" (3 sig figs), matching the print.
  function orcaNumStr(v, precision) {
    var sig = precision ? (v >= 1000 ? precision : precision - 1) : 6;
    if (sig < 1) sig = 1;
    var s = String(+(+v).toPrecision(sig));
    return s.slice(0, CONST.maxNumberLen);
  }

  // --- ported draw_digit: seven-segment glyph, BOTH real Orca orientations ---
  // Same abstract 6-point + 2-gap-point topology in both modes (calib.cpp's draw_digit switches on
  // DrawDigitMode but reuses one glyph-segment table); only the (x,y) formulas for those named
  // points differ. Pattern uses Bottom_To_Top (digits stack upward); Line uses Left_To_Right
  // (digits run left-to-right at a fixed Y) — Line's own constructor never overrides the base
  // class's default mode, confirmed in calib.hpp.
  //
  // Bottom_To_Top points (len = digit segment length, gap = line_width/2):
  //   p0(sx,sy) p1(sx,sy+len) p2(sx+len,sy+len) p3(sx+len,sy) p4(sx+2len,sy) p5(sx+2len,sy+len)
  //   p0_5(sx,sy+len/2)  p4_5(sx+2len,sy+len/2)
  var DIGIT = {
    "0": [[0, 1], [1, 5], [5, 4], [4, "g03"]],
    "1": [[6, 7]],
    "2": [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    "3": [[0, 1], [1, 5], [5, 4], ["g23", 3]],
    "4": [[0, 3], [3, 2], [1, 5]],
    "5": [[1, 0], [0, 3], [3, 2], [2, 5], [5, 4]],
    "6": [[1, 0], [0, 4], [4, 5], [5, 2], [2, 3]],
    "7": [[0, 1], [1, 5]],
    "8": [[2, 3], [3, 4], [4, 5], [5, 1], [1, 0], [0, 3]],
    "9": [[5, 1], [1, 0], [0, 3], [3, 2]],
    ".": [[7, "dot"]]
  };
  function digitPointsBTT(sx, sy, lineWidth) {
    var L = CONST.digitSegmentLen, gap = lineWidth / 2;
    return {
      0: [sx, sy], 1: [sx, sy + L], 2: [sx + L, sy + L], 3: [sx + L, sy],
      4: [sx + 2 * L, sy], 5: [sx + 2 * L, sy + L], 6: [sx, sy + L / 2], 7: [sx + 2 * L, sy + L / 2],
      g03: [sx + gap, sy], g23: [sx + L, sy + L + gap], dot: [sx + 2 * L - L / 2, sy + L / 2]
    };
  }
  // Left_To_Right points (calib.cpp draw_digit's else-branch) — a 2-segment-tall box growing
  // DOWNWARD from (sx,sy) as characters advance in +X, matching how Line's per-row label sits
  // beside a horizontal test line. '1' and '.' don't have a literal p6/p7 in this orientation (the
  // C++ reuses p0_5/p4_5 for those), so this table maps them to the same named points directly.
  function digitPointsLTR(sx, sy, lineWidth) {
    var L = CONST.digitSegmentLen, gap = lineWidth / 2;
    return {
      0: [sx, sy], 1: [sx + L, sy], 2: [sx + L, sy - L], 3: [sx, sy - L],
      4: [sx, sy - 2 * L], 5: [sx + L, sy - 2 * L], 6: [sx + L / 2, sy], 7: [sx + L / 2, sy - 2 * L],
      g03: [sx, sy - gap], g23: [sx + L - gap, sy - L], dot: [sx + L / 2, sy - 1.5 * L]
    };
  }
  function drawDigit(sx, sy, ch, lineWidth, mode) {
    var P = (mode === "ltr") ? digitPointsLTR(sx, sy, lineWidth) : digitPointsBTT(sx, sy, lineWidth);
    var spec = DIGIT[ch]; if (!spec) return [];
    return spec.map(function (pr) { var a = P[pr[0]], b = P[pr[1]]; return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; });
  }
  // A number is a run of digits along the block's own "grows" axis: Bottom_To_Top stacks upward
  // (char i at sy + i*numberSpacing, fixed sx), Left_To_Right runs rightward (char i at
  // sx + i*numberSpacing, fixed sy) — matching draw_number()'s own mode switch in calib.cpp.
  // numberLen sets both the print precision (significant figures) and the max glyph count.
  function drawNumber(sx, sy, value, lineWidth, numberSpacing, numberLen, mode) {
    var s = orcaNumStr(value, numberLen), out = [];
    for (var i = 0; i < s.length && i < numberLen; i++) {
      var gx = (mode === "ltr") ? sx + i * numberSpacing : sx, gy = (mode === "ltr") ? sy : sy + i * numberSpacing;
      out = out.concat(drawDigit(gx, gy, s[i], lineWidth, mode));
    }
    return out;
  }

  function nestedRect(x0, y0, x1, y1, walls, step) {
    var segs = [];
    for (var w = 0; w < walls; w++) {
      var a = x0 + w * step, b = y0 + w * step, c = x1 - w * step, e = y1 - w * step;
      if (c <= a || e <= b) break;
      segs.push({ x1: a, y1: b, x2: c, y2: b }, { x1: c, y1: b, x2: c, y2: e },
                { x1: c, y1: e, x2: a, y2: e }, { x1: a, y1: e, x2: a, y2: b });
    }
    return segs;
  }

  // glyph_start_x: centers the glyph column on pattern i (Orca glyph_start_x()).
  function glyphStartX(i, d) { return d.patternShift + i * d.rowPitch + d.walls * d.lsa / 2 - d.glyphLenX / 2; }

  function synthBlock(p) {
    var d = derive(p);
    var vals = paValues(p.paStart, p.paEnd, p.paStep);
    if (!vals.length) return { bbox: [0, 0, 0, 0], rbox: [0, 0, 0, 0], byPa: {}, bg: [], fills: [], text: [], meta: d };
    var num = vals.length;

    // chevrons (byPa) — start at pattern_shift, apex +X, walls perimeters offset by lsa
    var byPa = {};
    vals.forEach(function (pa, i) {
      var x0 = d.patternShift + i * d.rowPitch, segs = [];
      for (var w = 0; w < d.walls; w++) {
        var dx = x0 + w * d.lsa;
        segs.push({ x1: dx, y1: 0, x2: dx + d.armDX, y2: d.halfH });
        segs.push({ x1: dx + d.armDX, y1: d.halfH, x2: dx, y2: d.fullH });
      }
      byPa[pa] = segs;
    });

    var flow = (p.flow != null && p.flow !== "" && isFinite(+p.flow)) ? +p.flow : null;
    var accel = (p.accel != null && p.accel !== "" && isFinite(+p.accel)) ? +p.accel : null;

    // Orca max_numbering_length: widest of the shown PA labels and the accel label (NOT flow —
    // Orca prints "as many fractional digits as fit"), capped at maxNumberLen. This one value sets
    // both the digit precision for EVERY label and the number-tab depth. So 4-digit accels →
    // numberLen 4 → flow at 3 sig figs (12.86 → "12.9"); a 5-digit accel bumps it and the block grows.
    var numberLen = 1;
    for (var jj = 0; jj < num; jj += 2) numberLen = Math.max(numberLen, orcaNumStr(vals[jj]).length);
    if (accel != null) numberLen = Math.max(numberLen, orcaNumStr(accel).length);
    numberLen = Math.min(numberLen, CONST.maxNumberLen);

    // digits: PA every other pattern, flow at num+2, accel at num+4 (all below/beside the frame)
    var digitY = d.fullH + CONST.glyphPadV + d.lineWidth;
    var text = [];
    for (var j = 0; j < num; j += 2) text = text.concat(drawNumber(glyphStartX(j, d), digitY, vals[j], d.lineWidth, d.numberSpacing, numberLen));
    if (flow != null) text = text.concat(drawNumber(glyphStartX(num + 2, d), digitY, flow, d.lineWidth, d.numberSpacing, numberLen));
    if (accel != null) text = text.concat(drawNumber(glyphStartX(num + 4, d), digitY, accel, d.lineWidth, d.numberSpacing, numberLen));

    // block width: chevrons plus any flow/accel glyph columns that stick out past them.
    var allX = [d.patternShift + (num - 1) * d.rowPitch + d.armDX + d.walls * d.lsa];
    text.forEach(function (s) { allX.push(s.x1, s.x2); });
    var printSizeX = Math.max.apply(null, allX) + CONST.glyphPadH;

    // tab DEPTH = max_numbering_height, driven by numberLen (a 5-char accel like 12000 makes the
    // tab deeper, enlarging the whole block — exactly as it prints).
    var numHeight = numberLen * CONST.digitSegmentLen + (numberLen - 1) * CONST.digitGapLen;
    var tabY0 = d.fullH + d.lineSpacing;
    var tabMaxY = tabY0 + numHeight + d.lineSpacing + CONST.glyphPadV * 2;

    // anchoring frame around the chevrons AND a matching frame around the number tab — same X
    // extent [0, printSizeX] so their edges line up into one continuous border.
    var bg = nestedRect(0, 0, printSizeX, d.fullH, d.walls, d.lsa)
      .concat(nestedRect(0, tabY0, printSizeX, tabMaxY, d.walls, d.lsa));
    // per-block registration square, fused to the frame's near wall (the bar just "above" it in the
    // picker) with no gap, centered on the frame height — as it prints.
    var sq = CONST.squareSide, scx = (d.walls - 1) * d.lsa + sq / 2, scy = d.fullH / 2;
    bg = bg.concat(nestedRect(scx - sq / 2, scy - sq / 2, scx + sq / 2, scy + sq / 2, 1, d.lsa));

    // fills: the solid number-tab background, and the (filled) registration square
    var fills = [
      [{ x: 0, y: tabY0 }, { x: printSizeX, y: tabY0 }, { x: printSizeX, y: tabMaxY }, { x: 0, y: tabMaxY }],
      [{ x: scx - sq / 2, y: scy - sq / 2 }, { x: scx + sq / 2, y: scy - sq / 2 }, { x: scx + sq / 2, y: scy + sq / 2 }, { x: scx - sq / 2, y: scy + sq / 2 }]
    ];

    // bbox = chevrons; rbox = everything
    var cx = [], cy = [];
    Object.keys(byPa).forEach(function (k) { byPa[k].forEach(function (s) { cx.push(s.x1, s.x2); cy.push(s.y1, s.y2); }); });
    var bbox = [Math.min.apply(null, cx), Math.min.apply(null, cy), Math.max.apply(null, cx), Math.max.apply(null, cy)];
    var xs = [], ys = [];
    [bg, text].forEach(function (arr) { arr.forEach(function (s) { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); }); });
    fills[0].forEach(function (pt) { xs.push(pt.x); ys.push(pt.y); });
    xs = xs.concat(cx); ys = ys.concat(cy);
    var rbox = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];

    return { bbox: bbox, rbox: rbox, byPa: byPa, bg: bg, fills: fills, text: text, meta: d };
  }

  function objectSize(p) {
    var b = synthBlock(p);
    return { x: b.rbox[2] - b.rbox[0], y: b.rbox[3] - b.rbox[1] };
  }

  // ---- plate-fit / layout engine ----
  // Pack the N pattern objects (one per accel x speed combo) onto plates for the given bed.
  // opts: { bed:{shape,x,y,diameter}, combos:[{accel,flow}], paStart,paEnd,paStep, nozzle,
  //         lineWidth, layerHeight, wallLoops, gap, edge }
  // Returns { count, plates, perPlate, cols, rows, objW, objH, fits, items:[{combo,plate,col,row,x,y}] }.
  function planPlates(opts) {
    opts = opts || {};
    var gap = opts.gap != null ? opts.gap : 4;      // spacing between objects (mm)
    var edge = opts.edge != null ? opts.edge : 5;   // bed edge margin (skirt/exclusion) (mm)
    var combos = opts.combos || [];
    var n = combos.length;
    // per-object footprint: take the MAX across combos (accel/flow label widths differ), so all fit
    var maxW = 0, maxH = 0;
    combos.forEach(function (c) {
      var s = objectSize({ paStart: opts.paStart, paEnd: opts.paEnd, paStep: opts.paStep, nozzle: opts.nozzle,
        lineWidth: opts.lineWidth, layerHeight: opts.layerHeight, wallLoops: opts.wallLoops, accel: c.accel, flow: c.flow });
      if (s.x > maxW) maxW = s.x; if (s.y > maxH) maxH = s.y;
    });
    // usable bed area (round bed → inscribed square)
    var ux, uy;
    if (opts.bed && opts.bed.shape === "round") { var d = opts.bed.diameter || 0; ux = uy = Math.max(0, d / Math.SQRT2 - 2 * edge); }
    else { ux = Math.max(0, ((opts.bed && opts.bed.x) || 0) - 2 * edge); uy = Math.max(0, ((opts.bed && opts.bed.y) || 0) - 2 * edge); }
    // grid packing, no rotation
    var cols = maxW > 0 ? Math.floor((ux + gap) / (maxW + gap)) : 0;
    var rows = maxH > 0 ? Math.floor((uy + gap) / (maxH + gap)) : 0;
    var fits = cols >= 1 && rows >= 1;
    var perPlate = fits ? cols * rows : 0;
    var plates = (fits && n > 0) ? Math.ceil(n / perPlate) : (n > 0 ? Infinity : 0);
    var items = [];
    if (fits) {
      for (var i = 0; i < n; i++) {
        var plate = Math.floor(i / perPlate), idx = i % perPlate, col = idx % cols, row = Math.floor(idx / cols);
        items.push({ combo: combos[i], plate: plate, col: col, row: row, x: edge + col * (maxW + gap), y: edge + row * (maxH + gap) });
      }
    }
    return { count: n, plates: plates, perPlate: perPlate, cols: cols, rows: rows, objW: maxW, objH: maxH, fits: fits, items: items };
  }

  // ---- Basic — Line: CalibPressureAdvanceLine geometry (calib.cpp/calib.hpp) ----
  // One block = a prime wall, then N stacked rows (each a short/long/short speed-transition test
  // line at a distinct PA value, all sharing the same X columns so the two speed-transition points
  // line up vertically across rows), an anchor wall printed once after row 0, and a filled number
  // tab to the right printing every other row's PA value. Returns row/wall/tab geometry in MODEL
  // space (mm), local-origin at the prime wall / row 0 — the caller positions/scales for display.
  function synthLineBlock(p) {
    p = p || {};
    var nozzle = p.nozzle || 0.4;
    // m_line_width: Line's OWN formula — distinct from Pattern/Tower's 1.125x-nozzle wall width.
    var lineWidth = (p.lineWidth != null && p.lineWidth > 0) ? p.lineWidth
      : (nozzle < 0.51 ? +(nozzle * 1.5).toFixed(3) : +(nozzle * 1.05).toFixed(3));
    // m_number_line_width = m_thin_line_width = bare nozzle diameter (prime/anchor walls + labels).
    var thinLineWidth = nozzle;
    var spaceY = CONST.lineSpaceY, shortLen = CONST.lineLengthShort, longLen = CONST.lineLengthLong;
    var vals = paValues(p.paStart, p.paEnd, p.paStep);
    if (!vals.length) return { rbox: [0, 0, 0, 0], rows: [], primeWall: null, anchorWall: null, tab: null, labels: [], meta: {} };
    var num = vals.length;

    // three-segment row: short(slow) / long(fast) / short(slow), same X columns every row.
    var x0 = 0, x1 = shortLen, x2 = shortLen + longLen, x3 = shortLen + longLen + shortLen;
    var rows = vals.map(function (pa, i) {
      var y = i * spaceY;
      return { pa: pa, y: y, segs: [
        { x1: x0, y1: y, x2: x1, y2: y, speed: "slow" },
        { x1: x1, y1: y, x2: x2, y2: y, speed: "fast" },
        { x1: x2, y1: y, x2: x3, y2: y, speed: "slow" }
      ] };
    });

    // prime wall (once, before any row, PA=0 — pure flow-priming, not judged) and anchor wall (once,
    // right after row 0, PA=0 — a bracing feature, also not judged) — both full-height verticals.
    var wallY0 = 0, wallY1 = num * spaceY;
    var primeWall = { x: x0, y1: wallY0, y2: wallY1 };
    var anchorWall = { x: x3, y1: wallY0, y2: wallY1 };

    // number tab: filled box beside the rows, printing every-other-row's PA at FIXED precision —
    // Line's CalibPressureAdvanceLine::generate_test() never reassigns m_number_len, so it always
    // uses the base class default (5), i.e. 4 significant figures (see provenance doc).
    var numberLen = CONST.maxNumberLen;
    var numberSpacing = CONST.digitSegmentLen + CONST.digitGapLen;
    var tabX0 = x3 + lineWidth, tabX1 = tabX0 + numberSpacing * 8;
    var tabY0 = -spaceY, tabY1 = tabY0 + (num + 1) * spaceY;
    var labelStartX = tabX0 + 3 + lineWidth;
    var labels = [];
    rows.forEach(function (r, i) {
      if (i % 2 !== 0) return;
      labels = labels.concat(drawNumber(labelStartX, r.y + spaceY / 2, r.pa, thinLineWidth, numberSpacing, numberLen, "ltr"));
    });

    var xs = [x0, x3, tabX1], ys = [wallY0, wallY1, tabY0, tabY1];
    rows.forEach(function (r) { r.segs.forEach(function (s) { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); }); });
    labels.forEach(function (s) { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); });
    var rbox = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];

    return { rbox: rbox, rows: rows, primeWall: primeWall, anchorWall: anchorWall,
      tab: { x0: tabX0, y0: tabY0, x1: tabX1, y1: tabY1 }, labels: labels,
      meta: { nozzle: nozzle, lineWidth: lineWidth, thinLineWidth: thinLineWidth, spaceY: spaceY,
        shortLen: shortLen, longLen: longLen, numberLen: numberLen } };
  }

  root.PAPattern = { synthBlock: synthBlock, synthLineBlock: synthLineBlock, objectSize: objectSize, planPlates: planPlates, derive: derive, paValues: paValues, drawDigit: drawDigit, numStr: orcaNumStr, CONST: CONST };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PAPattern;
})();
