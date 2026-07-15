/*
 * ironing.js — Ironing Test 3MF generator.
 *
 * Produces a ready-to-open OrcaSlicer 3MF project: a grid of flat discs, one per
 * (ironing_speed, ironing_flow) combo, each carrying its own per-object print-setting
 * override. Orca still does the real slicing (no g-code generation, ever — see
 * docs/orca-method-provenance.md's "DIRECTION LOCKED" note and CHANGELOG history for why).
 *
 * The 3MF package structure, XML shape, and per-object metadata keys are reverse-engineered
 * from a real reference file (not copied — no OrcaSlicer/BambuStudio code or asset is
 * reused) and documented in docs/ironing-method-provenance.md; that file is the source of
 * truth if this ever needs revisiting (e.g. Orca changing the per-object schema).
 *
 * Deliberate deviation from the reference file: the reference's disc layout is bin-packed
 * with arbitrary per-object rotation (same arranger behavior as Orca's own PA-pattern
 * plates) and the disc itself carries no printed label, so identifying a disc only works
 * if you already know that exact file's layout. Since we generate the file ourselves, we
 * lay pads out in a plain, unrotated row x column grid instead — so "the winner was row 3,
 * column 7" is directly countable off the physical print.
 *
 * Zip note: the reference file's entries are Deflate-compressed, but the 3MF/zip spec (and
 * Orca's reader) accept Stored (uncompressed) entries too — confirmed by reading the local
 * file header method flags. So this writer only implements Store + CRC-32, no Deflate.
 */
(function () {
  var root = (typeof window !== "undefined") ? window : globalThis;

  var CONST = {
    padDiameter: 15,   // mm — matches the reference file's discs
    padHeight: 2.4,    // mm — a handful of layers of headroom before the ironed top layer
    segments: 64,      // mesh roundness (reference used ~186; way more than needed)
    gap: 3,             // mm between adjacent pad edges
    edge: 5              // mm bed-edge margin (skirt/exclusion)
  };

  // ---------------------------------------------------------------------------------
  // Small utils
  // ---------------------------------------------------------------------------------

  function fmt(n) {
    // Trim to 6 decimal places without trailing zeros/exponent notation creeping in.
    return (Math.round(n * 1e6) / 1e6).toString();
  }

  function uuid4() {
    // RFC-4122-ish v4 UUID. Not cryptographically meaningful here — Orca/BambuStudio just
    // want per-element identity that's stable within the file, so Math.random is fine.
    var hex = "0123456789abcdef", s = "";
    for (var i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) { s += "-"; continue; }
      var r = Math.floor(Math.random() * 16);
      if (i === 14) r = 4;                 // version 4
      if (i === 19) r = (r & 0x3) | 0x8;    // variant 10xx
      s += hex[r];
    }
    return s;
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---------------------------------------------------------------------------------
  // CRC-32 (needed for zip local/central file headers; Store method needs no compressor)
  // ---------------------------------------------------------------------------------

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]); }
  function u32(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }

  function dosDateTime(d) {
    d = d || new Date();
    var time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    var date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time: time, date: date };
  }

  // ---------------------------------------------------------------------------------
  // Minimal STORE-only zip writer
  // ---------------------------------------------------------------------------------

  function ZipWriter() {
    this.chunks = [];
    this.offset = 0;
    this.entries = [];
  }
  ZipWriter.prototype._push = function (u8) { this.chunks.push(u8); this.offset += u8.length; };

  ZipWriter.prototype.addFile = function (name, data) {
    var bytes = (typeof data === "string") ? new TextEncoder().encode(data) : data;
    var nameBytes = new TextEncoder().encode(name);
    var crc = crc32(bytes);
    var dt = dosDateTime();
    var flags = 0x0800; // UTF-8 filenames/comments (bit 11)
    var localOffset = this.offset;

    this._push(u32(0x04034b50));   // local file header signature
    this._push(u16(20));           // version needed to extract
    this._push(u16(flags));
    this._push(u16(0));            // compression method = store
    this._push(u16(dt.time));
    this._push(u16(dt.date));
    this._push(u32(crc));
    this._push(u32(bytes.length)); // compressed size (== uncompressed, store)
    this._push(u32(bytes.length)); // uncompressed size
    this._push(u16(nameBytes.length));
    this._push(u16(0));            // extra field length
    this._push(nameBytes);
    this._push(bytes);

    this.entries.push({ name: nameBytes, crc: crc, size: bytes.length, offset: localOffset, flags: flags, dt: dt });
  };

  ZipWriter.prototype.finish = function () {
    var cdStart = this.offset;
    for (var i = 0; i < this.entries.length; i++) {
      var e = this.entries[i];
      this._push(u32(0x02014b50));  // central directory file header signature
      this._push(u16(20));          // version made by
      this._push(u16(20));          // version needed to extract
      this._push(u16(e.flags));
      this._push(u16(0));           // method = store
      this._push(u16(e.dt.time));
      this._push(u16(e.dt.date));
      this._push(u32(e.crc));
      this._push(u32(e.size));
      this._push(u32(e.size));
      this._push(u16(e.name.length));
      this._push(u16(0));           // extra field length
      this._push(u16(0));           // file comment length
      this._push(u16(0));           // disk number start
      this._push(u16(0));           // internal file attributes
      this._push(u32(0));           // external file attributes
      this._push(u32(e.offset));    // relative offset of local header
      this._push(e.name);
    }
    var cdSize = this.offset - cdStart;
    this._push(u32(0x06054b50));    // end of central directory signature
    this._push(u16(0));             // disk number
    this._push(u16(0));             // disk with start of CD
    this._push(u16(this.entries.length));
    this._push(u16(this.entries.length));
    this._push(u32(cdSize));
    this._push(u32(cdStart));
    this._push(u16(0));             // comment length

    var out = new Uint8Array(this.offset), pos = 0;
    for (var j = 0; j < this.chunks.length; j++) { out.set(this.chunks[j], pos); pos += this.chunks[j].length; }
    return out;
  };

  // ---------------------------------------------------------------------------------
  // Disc mesh (flat cylinder, shared by every instance; positioned via build-item transforms)
  // ---------------------------------------------------------------------------------

  function discMesh(radius, height, segments) {
    segments = segments || CONST.segments;
    var verts = [], tris = [], topRing = [], botRing = [];
    for (var i = 0; i < segments; i++) {
      var a = (i / segments) * Math.PI * 2, x = radius * Math.cos(a), y = radius * Math.sin(a);
      botRing.push(verts.length); verts.push([x, y, 0]);
      topRing.push(verts.length); verts.push([x, y, height]);
    }
    var botCenter = verts.length; verts.push([0, 0, 0]);
    var topCenter = verts.length; verts.push([0, 0, height]);

    for (var s = 0; s < segments; s++) {
      var n = (s + 1) % segments;
      tris.push([botRing[s], botRing[n], topRing[n]]);   // side wall, 2 tris per segment,
      tris.push([botRing[s], topRing[n], topRing[s]]);   // outward-facing (CCW from outside)
      tris.push([botCenter, botRing[n], botRing[s]]);    // bottom cap, normal -Z
      tris.push([topCenter, topRing[s], topRing[n]]);    // top cap, normal +Z
    }
    return { vertices: verts, triangles: tris };
  }

  // ---------------------------------------------------------------------------------
  // Grid layout — plain row (flow) x column (speed) grid, no rotation, no bin-packing.
  // Single-plate only for now; if it doesn't fit, fits:false with a plain-English reason
  // (multi-plate splitting is a follow-up, not implemented yet).
  // ---------------------------------------------------------------------------------

  function planGrid(opts) {
    opts = opts || {};
    var gap = opts.gap != null ? opts.gap : CONST.gap;
    var edge = opts.edge != null ? opts.edge : CONST.edge;
    var padDiameter = opts.padDiameter || CONST.padDiameter;
    var speeds = opts.speeds || [];   // X axis (columns)
    var flows = opts.flows || [];     // Y axis (rows)
    var cols = speeds.length, rows = flows.length;
    var objW = padDiameter, objH = padDiameter;
    var gridW = cols > 0 ? cols * objW + (cols - 1) * gap : 0;
    var gridH = rows > 0 ? rows * objH + (rows - 1) * gap : 0;

    var bed = opts.bed || {};
    var ux, uy;
    if (bed.shape === "round") { var d = bed.diameter || 0; ux = uy = Math.max(0, d / Math.SQRT2 - 2 * edge); }
    else { ux = Math.max(0, (bed.x || 0) - 2 * edge); uy = Math.max(0, (bed.y || 0) - 2 * edge); }

    var fits = cols > 0 && rows > 0 && gridW <= ux && gridH <= uy;

    // Corner-origin beds anchor at (edge, edge); center-origin beds (and round beds) center
    // the grid on (0, 0) — same origin convention beds.js/planPlates() already use.
    var originIsCenter = bed.origin === "center" || bed.shape === "round";
    var startX = originIsCenter ? -gridW / 2 + objW / 2 : edge + objW / 2;
    var startY = originIsCenter ? -gridH / 2 + objH / 2 : edge + objH / 2;

    var items = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        items.push({ row: r, col: c, speed: speeds[c], flow: flows[r],
          x: startX + c * (objW + gap), y: startY + r * (objH + gap) });
      }
    }
    return { cols: cols, rows: rows, objW: objW, objH: objH, gridW: gridW, gridH: gridH, ux: ux, uy: uy, fits: fits, items: items };
  }

  // ---------------------------------------------------------------------------------
  // XML builders — see docs/ironing-method-provenance.md for what each field means and
  // where it was reverse-engineered from.
  // ---------------------------------------------------------------------------------

  var XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
  var MODEL_NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ' +
                 'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';

  function buildDiscModelXml(mesh) {
    var v = "", t = "";
    for (var i = 0; i < mesh.vertices.length; i++) {
      var p = mesh.vertices[i];
      v += '<vertex x="' + fmt(p[0]) + '" y="' + fmt(p[1]) + '" z="' + fmt(p[2]) + '"/>';
    }
    for (var j = 0; j < mesh.triangles.length; j++) {
      var tr = mesh.triangles[j];
      t += '<triangle v1="' + tr[0] + '" v2="' + tr[1] + '" v3="' + tr[2] + '"/>';
    }
    return XML_HEADER +
      '<model unit="millimeter" xml:lang="en-US" ' + MODEL_NS + '>\n' +
      ' <resources>\n' +
      '  <object id="1" p:UUID="' + uuid4() + '" type="model">\n' +
      '   <mesh>\n' +
      '    <vertices>' + v + '</vertices>\n' +
      '    <triangles>' + t + '</triangles>\n' +
      '   </mesh>\n' +
      '  </object>\n' +
      ' </resources>\n' +
      ' <build/>\n' +
      '</model>\n';
  }

  function buildTopModelXml(instances) {
    var res = "", build = "";
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      res += '  <object id="' + inst.id + '" p:UUID="' + uuid4() + '" type="model">\n' +
        '   <components>\n' +
        '    <component p:path="/3D/Objects/Disc_1.model" objectid="1" p:UUID="' + uuid4() + '" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n' +
        '   </components>\n' +
        '  </object>\n';
      build += '  <item objectid="' + inst.id + '" p:UUID="' + uuid4() + '" transform="1 0 0 0 1 0 0 0 1 ' +
        fmt(inst.x) + ' ' + fmt(inst.y) + ' 0" printable="1"/>\n';
    }
    return XML_HEADER +
      '<model unit="millimeter" xml:lang="en-US" ' + MODEL_NS + '>\n' +
      ' <metadata name="Application">PA-Helper</metadata>\n' +
      ' <resources>\n' + res + ' </resources>\n' +
      ' <build p:UUID="' + uuid4() + '">\n' + build + ' </build>\n' +
      '</model>\n';
  }

  function buildModelRelsXml(instances) {
    var rels = "";
    for (var i = 0; i < instances.length; i++) {
      rels += ' <Relationship Target="/3D/Objects/Disc_1.model" Id="rel-' + (i + 1) + '" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n';
    }
    return XML_HEADER + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' + rels + '</Relationships>\n';
  }

  function buildRootRelsXml() {
    return XML_HEADER +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
      '</Relationships>\n';
  }

  function buildContentTypesXml() {
    return XML_HEADER +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
      '</Types>\n';
  }

  function buildSettingsXml(instances) {
    var objs = "";
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      objs += '  <object id="' + inst.id + '">\n' +
        '   <metadata key="name" value="Disc"/>\n' +
        '   <metadata key="extruder" value="1"/>\n' +
        '   <metadata key="ironing_type" value="top"/>\n' +
        '   <metadata key="ironing_speed" value="' + esc(inst.speed) + '"/>\n' +
        '   <metadata key="ironing_flow" value="' + esc(inst.flow) + '%"/>\n' +
        '   <metadata key="brim_type" value="outer_only"/>\n' +
        '   <metadata key="brim_object_gap" value="0"/>\n' +
        '   <part id="1" subtype="normal_part">\n' +
        '    <metadata key="name" value="Disc"/>\n' +
        '    <metadata key="matrix" value="1 0 0 0 1 0 0 0 1 0 0 0"/>\n' +
        '   </part>\n' +
        '  </object>\n';
    }
    return XML_HEADER + '<config>\n' + objs + '</config>\n';
  }

  // ---------------------------------------------------------------------------------
  // Top-level entry point
  // ---------------------------------------------------------------------------------

  // params: { speeds:[10,20,...], flows:[10,20,...], bed:{shape,x,y,diameter,origin},
  //           padDiameter, padHeight, segments, gap, edge }
  function build3mf(params) {
    params = params || {};
    var grid = planGrid(params);
    if (!grid.fits) {
      return {
        ok: false, grid: grid,
        error: "Grid (" + grid.cols + "x" + grid.rows + ", " + grid.gridW.toFixed(1) + "x" + grid.gridH.toFixed(1) +
          "mm) doesn't fit the bed's usable area (" + grid.ux.toFixed(1) + "x" + grid.uy.toFixed(1) +
          "mm). Multi-plate splitting isn't implemented yet — reduce grid density, shrink pad size/gap, or pick a bigger bed."
      };
    }

    var padDiameter = params.padDiameter || CONST.padDiameter;
    var padHeight = params.padHeight || CONST.padHeight;
    var mesh = discMesh(padDiameter / 2, padHeight, params.segments || CONST.segments);

    var instances = grid.items.map(function (it, i) {
      return { id: 2 + i, x: it.x, y: it.y, speed: it.speed, flow: it.flow, row: it.row, col: it.col };
    });

    var zip = new ZipWriter();
    zip.addFile("[Content_Types].xml", buildContentTypesXml());
    zip.addFile("_rels/.rels", buildRootRelsXml());
    zip.addFile("3D/3dmodel.model", buildTopModelXml(instances));
    zip.addFile("3D/_rels/3dmodel.model.rels", buildModelRelsXml(instances));
    zip.addFile("3D/Objects/Disc_1.model", buildDiscModelXml(mesh));
    zip.addFile("Metadata/model_settings.config", buildSettingsXml(instances));

    return { ok: true, bytes: zip.finish(), grid: grid, instances: instances };
  }

  function toBlob(bytes) {
    if (typeof Blob === "undefined") throw new Error("Blob is not available in this environment");
    return new Blob([bytes], { type: "model/3mf" });
  }

  root.PAIroning = {
    CONST: CONST, discMesh: discMesh, planGrid: planGrid, build3mf: build3mf, toBlob: toBlob,
    // exposed for the verify harness / unit tests:
    _internal: { crc32: crc32, ZipWriter: ZipWriter, buildDiscModelXml: buildDiscModelXml, buildTopModelXml: buildTopModelXml,
      buildModelRelsXml: buildModelRelsXml, buildRootRelsXml: buildRootRelsXml, buildContentTypesXml: buildContentTypesXml,
      buildSettingsXml: buildSettingsXml, uuid4: uuid4 }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PAIroning;
})();
