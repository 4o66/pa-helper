# PA-Helper

Prefer the always-current hosted version? Use it now, here: **[4o66.github.io/pa-helper](https://4o66.github.io/pa-helper/)**

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
Two tabs — Printer and Filament — plus system/light/dark theming and a Settings modal (gear
icon: theme, and date/time display preferences for run history):

1. **Printers** — a library of your machines. A printer's identity is its maker/model,
   toolhead, **extruder + drive (direct/bowden)** and **hotend** — the things that
   dominate PA — so swapping any of those means a new printer. Add/select/remove
   (remove confirms; it can't be undone). A **"multiple copies of this machine"** toggle
   reveals per-unit tracking by serial/asset ID for print farms; home users never see
   it. All fields remember and offer *Custom…*.
2. **Filaments** — a library of spools (maker/material/formulation/color/diameter). Each
   filament card shows separate **PA** and **Iron** buttons: grey when nothing matches your
   current selection, orange while a run is in progress (click to resume), blue once one's
   done (click for saved results, with a count). A **Scope** dropdown controls how strictly
   "matching" is judged — this printer + nozzle, this printer any nozzle, or all printers.
3. **PA Test** — click a filament's PA button to open it as a modal: set the per-run
   **nozzle** (swaps often, so it's per run), then choose **Advanced** (adaptive PA across a
   flow × accel grid — recommended) or **Basic** (a single PA value, via one of three
   methods — **Tower**, **Pattern**, or **Line**). Each Basic method gets its own recommend
   card (material-specific PA range, flagged when it differs from Orca's own stock dialog
   default) and an inline picker that mirrors the real OrcaSlicer geometry exactly — a
   traced isometric tower, the chevron pattern, or stacked speed-transition lines with their
   printed PA labels — so you click the cleanest result straight into Best PA, no measuring
   ambiguity or guessing which one's which. Advanced recommends a PA range + test points
   (per material and drive, bowden scaled up), or you can **provide the settings you already
   ran**. Enter results in flow (mm³/s) *or* speed (mm/s — what you type into Orca;
   converted via layer height × line width). It plots, fits a trend (two-variable when
   multiple accels are present), flags outliers, and exports the Orca adaptive-PA model
   text (or the single PA for Basic).
4. **Ironing Test** — click a filament's Iron button to open it as a modal: sweep
   **ironing speed** (mm/s) and **ironing flow** (%) across a grid, and generate an
   OrcaSlicer **3MF project** (not g-code — Orca still does the real slicing) with per-pad
   overrides already set, sized and brimmed to fit your printer's real bed. Print it, then
   **name each pad** (Glossy/Matte/Other) in a picker matching the physical grid — no
   measuring or guessing which pad is which. Based on
   [LeoganPro](https://www.printables.com/@LeoganPro)'s
   [Top Surface Ironing Test](https://www.printables.com/model/1247198) (CC0) — this
   feature exists because of that model; PA-Helper only automates generating and
   reading it for your own printer/filament library.

**Run lifecycle:** save a **planned** run before you print, come back later, its filament's
PA/Iron button shows **orange** — click it to **resume**, enter results, and save it
**complete** (button turns blue). Only one in-flight run is allowed per
printer+nozzle+filament combo, for both PA and Ironing. Every run is stored in
`pa_data.json`; your last printer/filament/nozzle are pre-selected.

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

## Done
Shipped, in the order they were completed:

1. **Visual line picker (advanced).** The adaptive pattern picker renders each PA tile (labeled with
   its known PA — no OCR) and is two-way bound to the results table. (The *basic* single-value pickers
   are still open — see Roadmap.)
2. **View / reuse a completed run's data.** A filament with completed runs shows a **Results** button
   that opens a per-filament modal: view all printer/filament/test parameters and the Orca-bound
   results (with copy buttons), **Rerun with these settings** (clone into a fresh run), or delete a
   saved run — for re-running a job or recovering PA value(s) to re-enter in Orca after wiping the
   slicer config.
3. **Save & return.** Saving a run (planned or complete) returns you to the Filament page instead
   of a confirmation popup — the run shows up right where you'd expect it, under its filament —
   and the PA Test tab resets for the next run.
4. **Ironing Test**, as a full second calibration workflow alongside PA — see "What it does" above.
   Filament cards got a shared grey/orange/blue PA/Iron button pattern (nothing to show / in
   progress / done with a count), replacing the old pinned-runs list.
5. **PA/Ironing tests became modals opened from the Filament tab, not their own nav tabs.** The
   nav is down to Printer + Filament; a filament's PA/Iron button is always clickable and takes
   you straight to a fresh test, the in-progress one, or saved results. Added alongside it: a
   Scope control for how strictly a run has to match your current printer+nozzle to count, one
   in-flight run actually enforced per printer+nozzle+filament combo (PA and Ironing), and a
   Settings modal consolidating Theme/debug-clear plus date/time display preferences.
6. **Saved-results views rebuilt for both PA and Ironing** — read-only Data table and Plot &
   Analysis sections, Results moved to the top, two-row printer/nozzle + filament titles matching
   the nav tabs. A run now stores the actual Single PA result (raw values) instead of a baked
   rendering of it, and dead scratch-math fields were dropped from storage entirely.
7. **Basic mode complete — Tower, Pattern, and Line.** Each method gets a recommend card (the
   material-specific PA range, flagged as PA-Helper's own vs. Orca's stock dialog default) and an
   inline picker matching the real OrcaSlicer print geometry exactly: a schematic isometric tower
   traced from a real Orca export (not a guessed box) with a measured-height input and shown-work
   `PA = start + step × height`; the real chevron pattern; and stacked speed-transition test lines
   with the real printed every-other-row PA labels. Click the cleanest result straight into Best
   PA — no OCR, no guessing which one's which.

## Roadmap
Ordered by priority.

1. **"Tuning runs" — one-click follow-up jobs.** From a finished run, offer buttons to spawn a
   follow-up test that either (a) **extends the range** when the best PA landed on the range top/bottom
   edge (home in past the clipped optimum), or (b) **reduces the step** to fine-tune around the found
   value. These should be created and labelled as **tuning runs** (distinct from a fresh test), so the
   in-progress/history list shows they descend from an earlier run. Pairs with the range now shown on
   the in-progress cards and the range-edge ⚠ flag (both already done).
2. **`paRanges` are heuristic, not sourced.** The per-material PA sweep ranges in `js/presets.js`
   (`paRanges`, e.g. PLA `0.010–0.070`) were hand-picked to bracket typical direct-drive optima, not
   taken from a dataset. Real run data (e.g. the PLA run: true optima ~0.045–0.065) confirms they're
   roughly right but should eventually be sourced from OrcaSlicer's own filament-profile default
   `pressure_advance` values and/or the Phase-B community dataset, then bracketed around those.
3. **g-code ingest — refine.** First pass done: "Settings I already printed" has an Import .gcode
   button that best-effort-parses PA range, accelerations and speeds from the file's
   commands (heuristic; not a stable Orca format — needs tuning against real files).
4. **Custom line-width override.** Line width is currently locked to Orca's derived value
   (`auto_extrusion_width` = 1.125× nozzle) because it isn't a PA-test input. A user whose Orca
   profile overrides `line_width` off auto prints at a different width, so a later "advanced override"
   toggle could let them enter their profile's real line width (feeds the speed↔flow conversion and
   generated geometry; ignored on imported g-code, where true flow is read from the extrusion).
5. **Normal vs Expert modes.** *Normal* walks you through each step — where to click in
   Orca, what to enter, in order. *Expert* shows minimal guidance with the advanced
   options tucked behind dropdowns.
6. **Phase B backend** — PocketBase (self-hosted; MIT, so AGPLv3-compatible) for
   accounts via social OAuth and an opt-in, anonymized community dataset keyed on the
   hardware profile ("others with this extruder+hotend+filament landed near PA X").
   Community profile keys include toolhead / extruder (+drive) / hotend / nozzle.
7. **Local ↔ server bridge (Phase B).** The hosted version's front page should import
   from a local `pa_data.json` and export back out, so offline/local runs move cleanly in
   and out of an account. (The community opt-in prompt also lives at first login, not before.)
8. **Community-driven defaults (Phase B).** Each saved printer already carries a random
   per-*printer* GUID (never per-user). With opt-in on first login, printer configs would
   seed a public dataset so the most common real-world combo per maker/model becomes the
   default for new users. (The offline app just stores the GUID for now.)
9. **Phase C — full guided calibration.** Grow from PA-only into the whole
   filament-calibration sequence, in Orca's menu order (temp tower → flow rate →
   pressure advance → retraction → max volumetric speed → …), proposing values from
   your history where available. PA is just the first module.

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
