# PA-Helper

> ⚠️ **EARLY BETA — PROCEED WITH CAUTION.**
> This is unfinished, largely untested software under active development. Features may break or
> change without notice, and results may be wrong. **Verify every output against your own judgment
> before trusting it on a real print.** No warranty of any kind (see [LICENSE](LICENSE)).

A calibration companion for **OrcaSlicer Pressure Advance** tuning — it takes the
tedium out of the *after-print* step: recommend the right test settings, capture
which line looked best, plot the results, flag the outliers, and hand you the exact
text to paste back into Orca. Adaptive PA (PA-vs-flow/accel) is the primary workflow.

Runs entirely in your browser. No account needed, no data leaves your machine, no AI
in the loop — all logic is local JavaScript.

## Status
Phase A (this repo): fully client-side, offline, single-user, local `pa_data.json`.
Phase B (planned): optional self-hosted backend for accounts (social login) and an
**opt-in, anonymized community PA dataset**. See [Roadmap](#roadmap).

## What it does (Phase A)
Three tabs, plus system/light/dark theming:

1. **Printers** — a library of your machines. A printer's identity is its maker/model,
   toolhead, **extruder + drive (direct/bowden)** and **hotend** — the things that
   dominate PA — so swapping any of those means a new printer. Add/select/remove
   (remove confirms; it can't be undone). A **"multiple copies of this machine"** toggle
   reveals per-unit tracking by serial/asset ID for print farms; home users never see
   it. All fields remember and offer *Custom…*.
2. **Filaments** — a library of spools (maker/material/formulation/color/diameter).
   Runs you've started but not finished are **pinned at the top** to resume or abandon
   (abandoning keeps the filament).
3. **PA Test** — pick a printer + filament, set the per-run **nozzle** (swaps often, so
   it's per run), then choose **Advanced** (adaptive PA across a flow × accel grid —
   recommended) or **Basic** (a single PA value via a **tower** — recommended — or
   **line** test). It recommends a PA range + test points (per material and drive,
   bowden scaled up), or you can **provide the settings you already ran**. Enter results
   in flow (mm³/s) *or* speed (mm/s — what you type into Orca; converted via layer
   height × line width). It plots, fits a trend (two-variable when multiple accels are
   present), flags outliers, and exports the Orca adaptive-PA model text (or the single
   PA for Basic).

**Run lifecycle:** save a **planned** run before you print, come back later, find it
pinned under Filaments, **Resume** it, enter results, and save it **complete**. Every
run is stored in `pa_data.json`; your last printer/filament/nozzle are pre-selected.

## Running it
- **Easiest:** host the folder as a static site (GitHub Pages, or any static server)
  and open it. On a secure origin (https/localhost) it can read+write a real
  `pa_data.json` you pick, via the File System Access API (Chrome/Edge/Brave).
- **Opened as a local file:** works too, using in-browser storage + the Import/Export
  JSON buttons (the direct-file feature needs https/localhost).

No build step, no dependencies.

## Data
Everything is stored in a single human-readable `pa_data.json` (schema documented in
[`docs/pa_data.schema.md`](docs/pa_data.schema.md)). It holds your saved profile
options, your last-used profile, and the full history of runs. You can hand-edit it,
version it, or delete it.

## Roadmap
- **g-code ingest** — first pass done: "Settings I already printed" has an Import .gcode
  button that best-effort-parses PA range, accelerations and speeds from the file's
  commands (heuristic; not a stable Orca format — needs tuning against real files).
- **Visual line picker** — render each PA line's toolpath (labeled with its known PA,
  no OCR needed) and click the best one; two-way bound to the table.
- **Basic PA Pattern / Line pickers** — the basic (single accel/speed) methods currently only
  capture one best-PA value; they have no visual picker yet. Before building this, **search first**
  for documentation of people actually running basic single-value PA pattern/line calibrations (how
  they do it, whether they use Orca's Line method's `generate_test` at all), so we match real
  practice rather than guessing. Advanced (adaptive) already has the full pattern picker.
- **Custom line-width override.** Line width is currently locked to Orca's derived value
  (`auto_extrusion_width` = 1.125× nozzle) because it isn't a PA-test input. A user whose Orca
  profile overrides `line_width` off auto prints at a different width, so a later "advanced override"
  toggle could let them enter their profile's real line width (feeds the speed↔flow conversion and
  generated geometry; ignored on imported g-code, where true flow is read from the extrusion).
- **Phase B backend** — PocketBase (self-hosted; MIT, so AGPLv3-compatible) for
  accounts via social OAuth and an opt-in, anonymized community dataset keyed on the
  hardware profile ("others with this extruder+hotend+filament landed near PA X").
  Community profile keys include toolhead / extruder (+drive) / hotend / nozzle.
- **Local ↔ server bridge (Phase B).** The hosted version's front page should import
  from a local `pa_data.json` and export back out, so offline/local runs move cleanly in
  and out of an account. (The community opt-in prompt also lives at first login, not before.)
- **Community-driven defaults (Phase B).** Each saved printer already carries a random
  per-*printer* GUID (never per-user). With opt-in on first login, printer configs would
  seed a public dataset so the most common real-world combo per maker/model becomes the
  default for new users. (The offline app just stores the GUID for now.)
- **Phase C — full guided calibration.** Grow from PA-only into the whole
  filament-calibration sequence, in Orca's menu order (temp tower → flow rate →
  pressure advance → retraction → max volumetric speed → …), proposing values from
  your history where available. PA is just the first module.
- **Normal vs Expert modes.** *Normal* walks you through each step — where to click in
  Orca, what to enter, in order. *Expert* shows minimal guidance with the advanced
  options tucked behind dropdowns.

## Contributing & reporting bugs
This is an early **testing preview**, so feedback is exactly what it needs right now.

**Found a bug or something confusing?** Open an issue:
<https://github.com/4o66/pa-helper/issues>. It helps a lot if you include:
- Your **browser + OS**, and the **build hash** shown at the bottom of the app.
- What you did, what you expected, and what happened instead — a screenshot if it's visual.
- For calibration or g-code import problems: the OrcaSlicer **`.gcode`** you imported, plus
  your extruder/drive, hotend, nozzle and filament.

You can also attach an **Export** of your `pa_data.json` to reproduce a state — it only holds
your printer/filament/run data (no accounts, no secrets), but skim it first if you'd rather
not share hardware names.

**Code contributions** are welcome via pull request. It's deliberately plain
HTML/CSS/vanilla‑JS with **no build step and no dependencies** — please keep it that way.
By submitting a PR you agree your contribution is licensed under **AGPLv3**.

## License
GNU **AGPLv3** — open, attribution preserved, share-alike, and (unlike GPL) any
*hosted* modified version must also offer its source. See [`LICENSE`](LICENSE). A
"Source" link in the app footer points back here to satisfy AGPL §13.

Not affiliated with OrcaSlicer or any hardware vendor.
