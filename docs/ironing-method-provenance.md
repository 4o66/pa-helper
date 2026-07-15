# Ironing Test — 3MF method provenance

PA-Helper's Ironing Test tab generates a 3MF project (geometry + per-object print-setting
overrides), not g-code — same posture as the PA Pattern picker: OrcaSlicer always does the
real slicing, PA-Helper only builds inputs for it. Unlike PA Pattern, Orca has **no native
calibration wizard** for ironing, so there is no Orca *source code* to port here — instead
this file documents what a real, working reference 3MF looks like, reverse-engineered by
unzipping one, so our generator produces a file Orca opens and treats identically.

Reference file: `Ironing test v3` from printables.com/model/1247198 ("Top Surface Ironing
Test" by LeoganPro, CC0/public domain), downloaded and inspected 2026-07-14. Produced by
BambuStudio 2.3.0 (`<metadata name="Application">` in `3dmodel.model`) — Orca reads
BambuStudio-flavored 3MF project files, so this is the right reference despite the tool
name. This is a **method** reverse-engineering (structure/keys/format), not copied file
content — no OrcaSlicer/BambuStudio source or asset is reused.

⚠ **Tripwire:** if a future Orca/BambuStudio version changes these keys, their value
format, or the package layout, generated files could silently fail to apply the swept
settings. Re-check by exporting a fresh reference 3MF (any per-object-override project)
and diffing its `Metadata/model_settings.config` against the table below.

## Package layout (OPC/3MF container)

A `.3mf` is a zip with these parts. All entries in the reference file are **Deflate**-
compressed, but the 3MF/zip spec allows **Stored** (uncompressed) entries too, and Orca's
reader accepts them — confirmed by reading the local header method flags. So PA-Helper's
writer only needs zip framing + CRC-32, not a Deflate implementation.

```
[Content_Types].xml              — Default Extension->ContentType map (rels, model, png)
_rels/.rels                      — root relationship -> /3D/3dmodel.model (thumbnails optional)
3D/3dmodel.model                 — resources (wrapper objects + build placement)
3D/_rels/3dmodel.model.rels      — one relationship per wrapper object -> its mesh part
3D/Objects/<Mesh>.model           — the actual mesh geometry (can be shared by many wrappers)
Metadata/model_settings.config   — per-object print-setting overrides (THE PAYLOAD)
Metadata/plate_1.json             — plate/bed metadata (bbox, nozzle_diameter, etc.) — optional, Orca regenerates
Metadata/slice_info.config        — trivial client-identifying header — optional
Metadata/*.png                    — thumbnails — optional, skip these
```

`[Content_Types].xml`, `_rels/.rels`, and `3D/_rels/3dmodel.model.rels` are boilerplate;
exact contents captured from the reference file below.

`[Content_Types].xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
```
(dropped the `png`/`gcode` Default entries — we aren't emitting thumbnails or embedded gcode.)

`_rels/.rels` (thumbnails omitted — just the required model relationship):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
```

`3D/_rels/3dmodel.model.rels`: one `<Relationship>` per wrapper object in `3dmodel.model`,
each pointing at the mesh part it wraps (Target `/3D/Objects/<Mesh>.model`, same target
reused for every instance sharing that mesh, `Id` just needs to be unique — `rel-1..rel-N`).
The reference file has exactly 100 of these (one per disc instance), all targeting the same
`Disc_1.model`.

## Mesh (`3D/Objects/Disc_1.model`)

One shared mesh, referenced by every disc instance. In the reference file: a flat cylinder,
radius 7.5mm (15mm diameter pad), 0.2mm thick as authored (`z` from -0.1 to +0.1), 374
vertices / 745 triangles, centered at the origin, **no embossed text or markings** — plain
geometry only. Build item transforms (below) then Z-scale it up (×3 in the reference =
0.6mm printed height) rather than authoring at final height; PA-Helper's generator can just
author the mesh at the desired thickness directly and skip that indirection.

Since it's unmarked, physical identification of "which pad is which" comes entirely from
*position on the plate*, not anything printed on the object — see layout note below.

## Instancing + placement (`3D/3dmodel.model`)

Two-level indirection, standard for repeated-geometry parts:

1. **`<resources>`**: one `<object id="N" type="model">` per disc *instance*, each wrapping
   a `<component p:path="/3D/Objects/Disc_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`
   (identity transform — the component itself carries no offset).
2. **`<build>`**: one `<item objectid="N" transform="..." printable="1"/>` per instance,
   where `transform` is the 3MF 4×3 matrix (12 floats: 3×3 linear part + translation) that
   actually places it on the bed.

**Layout decision (deviates from the reference file, deliberately):** the reference file's
`<build>` items carry an arbitrary rotation per disc (BambuStudio's bin-packing arranger,
same behavior as Orca's PA-pattern plate arranger — see `orca-method-provenance.md`'s note
on `arrangement::arrange`), packing them densely at odd angles. Combined with the mesh
having no printed label, that only works because the *file's own layout* is the map. PA-Helper
generates its own file, so instead we lay pads out in a **plain, unrotated row × column
grid** (identity rotation, translation only) — so "the winner was row 3, column 7" is
directly countable off the physical print, no lookup needed. This is a deliberate
deviation from the reference file's approach, not an oversight.

## Per-object settings (`Metadata/model_settings.config`) — the payload

```xml
<object id="70">
  <metadata key="name" value="Disc"/>
  <metadata key="brim_object_gap" value="0"/>
  <metadata key="brim_type" value="outer_only"/>
  <metadata key="extruder" value="1"/>
  <metadata key="ironing_flow" value="90%"/>
  <metadata key="ironing_speed" value="90"/>
  <metadata key="ironing_type" value="top"/>
  <part id="1" subtype="normal_part">
    <metadata key="name" value="Disc"/>
    <metadata key="matrix" value="1 0 0 0 1 0 0 0 1 0 0 0"/>
    <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
  </part>
</object>
```

Confirmed value formats (grepped all 100 objects in the reference file):
- `ironing_speed`: plain integer string, **no unit** (mm/s implied) — `"10"` .. `"100"`.
- `ironing_flow`: integer string **with a trailing `%`** — `"10%"` .. `"100%"`.
- `ironing_type`: constant `"top"` on every object.
- `extruder`: `"1"` (single-extruder assumption; fine for now).
- `brim_type` / `brim_object_gap`: `"outer_only"` / `"0"` on every object — carried over
  from the source file's need to join 100 discs with one brim; PA-Helper's grid will likely
  want the same (a shared brim keeps a 100-object plate from becoming 100 separate prints
  needing 100 individual first-layer adhesion checks).
- `source_object_id` / `source_volume_id` / `source_offset_*` and the `<part>`'s
  `mesh_stat` block are BambuStudio's own edit-history bookkeeping (undo/redo, mesh-repair
  stats) — not required for Orca to accept the file on import; safe to omit or zero.

`Metadata/plate_1.json` and `Metadata/slice_info.config` are auxiliary (plate bbox/nozzle
hint, client-identifying header) — Orca regenerates/ignores stale values on open, so
PA-Helper's writer can skip both.

## Summary for the generator

- Zip: Stored entries only, correct CRC-32, standard OPC layout above.
- One shared mesh (flat pad, sized off nozzle line width per the existing `derive()`
  pattern in `pattern.js`), instanced N times via `<component>` + `<build><item>`.
- Plain grid layout (no rotation), unlike the reference file's bin-packed original.
- Per-object `model_settings.config` entries: `ironing_speed` (int, no unit), `ironing_flow`
  (int + `%`), `ironing_type="top"`, `extruder="1"`, `brim_type="outer_only"`,
  `brim_object_gap="0"`, `name`.
- Skip thumbnails, skip `plate_1.json`/`slice_info.config`, skip mesh-repair bookkeeping.
