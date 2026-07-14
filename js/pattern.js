/*
 * pattern.js — synthetic OrcaSlicer PA-Pattern geometry generator.
 *
 * Produces the same block shape buildPaBlocks() yields from real g-code, so renderRealPattern()
 * can draw a GENERATED (no-g-code) pattern that matches what actually prints — chevrons, the
 * anchoring frame, the filled number tab, the seven-segment PA / flow / acceleration digits, and
 * the small registration square — all in MODEL space (mm).
 *
 * The METHOD is a from-scratch JavaScript re-implementation of OrcaSlicer's
 * CalibPressureAdvancePattern (SoftFever/OrcaSlicer, src/libslic3r/calib.{cpp,hpp}, AGPL-3.0).
 * No OrcaSlicer code is copied; PA-Helper is likewise AGPLv3. The exact Orca functions/constants
 * this mirrors are catalogued in docs/orca-method-provenance.md (the monthly-tripwire checklist).
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
    squareSide: 3.4             // per-block registration square (measured from real Orca output; an
                                // external anchor, not in the pattern generator — see provenance doc)
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

  // Orca convert_number_to_string: short decimal, capped at maxNumberLen glyphs.
  function numStr(v) {
    var s;
    if (Math.abs(v) >= 1000 || Number.isInteger(v)) s = String(Math.round(v));
    else s = String(+(+v).toFixed(3));
    return s.slice(0, CONST.maxNumberLen);
  }

  // --- ported draw_digit: seven-segment glyph in Bottom_To_Top orientation ---
  // Points (len = digit segment length, gap = line_width/2):
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
  function drawDigit(sx, sy, ch, lineWidth) {
    var L = CONST.digitSegmentLen, gap = lineWidth / 2;
    var P = {
      0: [sx, sy], 1: [sx, sy + L], 2: [sx + L, sy + L], 3: [sx + L, sy],
      4: [sx + 2 * L, sy], 5: [sx + 2 * L, sy + L], 6: [sx, sy + L / 2], 7: [sx + 2 * L, sy + L / 2],
      g03: [sx + gap, sy], g23: [sx + L, sy + L + gap], dot: [sx + 2 * L - L / 2, sy + L / 2]
    };
    var spec = DIGIT[ch]; if (!spec) return [];
    return spec.map(function (pr) { var a = P[pr[0]], b = P[pr[1]]; return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; });
  }
  // A number = stacked digits (Bottom_To_Top): char i at (sx, sy + i*number_spacing).
  function drawNumber(sx, sy, value, d) {
    var s = numStr(value), out = [];
    for (var i = 0; i < s.length && i < CONST.maxNumberLen; i++) {
      out = out.concat(drawDigit(sx, sy + i * d.numberSpacing, s[i], d.lineWidth));
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

    // digits: PA every other pattern, flow at num+2, accel at num+4 (all below/beside the frame)
    var digitY = d.fullH + CONST.glyphPadV + d.lineWidth;
    var text = [];
    for (var j = 0; j < num; j += 2) text = text.concat(drawNumber(glyphStartX(j, d), digitY, vals[j], d));
    var flow = (p.flow != null && p.flow !== "" && isFinite(+p.flow)) ? +p.flow : null;
    var accel = (p.accel != null && p.accel !== "" && isFinite(+p.accel)) ? +p.accel : null;
    if (flow != null) text = text.concat(drawNumber(glyphStartX(num + 2, d), digitY, flow, d));
    if (accel != null) text = text.concat(drawNumber(glyphStartX(num + 4, d), digitY, accel, d));

    // block width: chevrons plus any flow/accel glyph columns that stick out past them.
    var allX = [d.patternShift + (num - 1) * d.rowPitch + d.armDX + d.walls * d.lsa];
    text.forEach(function (s) { allX.push(s.x1, s.x2); });
    var printSizeX = Math.max.apply(null, allX) + CONST.glyphPadH;

    // tab DEPTH grows with the longest number printed (incl. accel) — Orca max_numbering_length.
    // A 5-char accel (e.g. 12000) makes the tab deeper, enlarging the whole block.
    var strs = []; for (var jj = 0; jj < num; jj += 2) strs.push(numStr(vals[jj]));
    if (flow != null) strs.push(numStr(flow));
    if (accel != null) strs.push(numStr(accel));
    var maxChars = Math.min(strs.reduce(function (m, s) { return Math.max(m, s.length); }, 1), CONST.maxNumberLen);
    var numHeight = maxChars * CONST.digitSegmentLen + (maxChars - 1) * CONST.digitGapLen; // max_numbering_height
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

  root.PAPattern = { synthBlock: synthBlock, objectSize: objectSize, derive: derive, paValues: paValues, drawDigit: drawDigit, CONST: CONST };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PAPattern;
})();
