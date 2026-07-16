# Changelog

All notable changes to PA-Helper are recorded here.

**Versioning:** `v<major.minor>.<build>` (currently `0.2`). The build number increments on each
stamped build (`node tools/stamp.js`) and resets to `1` when the minor version rolls; a minor bump
marks a milestone. Commits are made **locally**; when a feature reaches a stable state we **push and
release** — `git push origin main`, then `bash tools/release.sh` builds a `dist/pa-helper-v<version>.zip`
(everything needed to run locally, plus a reminder link to the hosted build) to attach to a GitHub
release. See [`RELEASING.md`](RELEASING.md). Release codenames are tracked in
[`RELEASES.md`](RELEASES.md). **v1.0** will mark the first "fully usable" release.

## [Unreleased]

### Added
- **`tools/smoke.js` jsdom smoke test** (~228 assertions over the whole app), carried over from
  dev tooling and reconciled with current behavior: fixed references to the removed Select
  buttons, the retired PA in-progress section, the Results→PA/Iron button split, and the
  temporarily-disabled Basic mode dropdown option.
- **Ironing Test attribution.** README now documents the Ironing Test feature (it had no
  section at all) and both README and the in-app Ironing tab credit
  [LeoganPro's Top Surface Ironing Test](https://www.printables.com/model/1247198) (CC0) as
  the model this feature is built on.
- **Deleting a printer, nozzle, or filament now cleans up its saved/planned runs.** Previously a
  run referencing a deleted printer/nozzle/filament just sat in `pa_data.json` forever, invisible
  from the UI. Removing a printer or nozzle now warns with a count when it would delete
  associated filament tests; removing any of the three cascades to prune matching PA and Ironing
  runs immediately. `pa_data.json`'s `migrate()` step also sweeps any run already orphaned this
  way (e.g. from an older export or a hand-edited file) on every load.
- **Filament tab: Scope control for the PA/Iron buttons.** A new "Scope" dropdown (This printer +
  nozzle / This printer, any nozzle / All printers) decides how much of the current selection a
  run has to match to count toward a filament's PA/Iron button color and count. Filaments always
  show both buttons now — grey when nothing matches at the current Scope, orange while a matching
  run is in progress, blue with a count once done — instead of hiding the button entirely when
  there was nothing to show. Defaults to the tightest scope (this exact printer + nozzle).

### Changed
- **Export filename now includes the time** (`pa_data_YYYY-MM-DD_HHMM.json`, was date-only) —
  multiple exports on the same day no longer look identical in Downloads.
- **`pa_data.json` no longer stores picker geometry (`formatVersion: "2.0"`).** `gcodeCache` was
  ~96% of a typical export's real data (~267 KB/run) — machine-only noise in a file meant to be
  human-readable. Picker geometry is fully reproducible from a run's stored settings
  (`js/pattern.js`), so it's now regenerated on demand when a saved run is reopened, for both
  "recommended" and imported-from-gcode runs. Old-format files (has `gcodeCache`, or missing
  `formatVersion: "2.0"`) migrate automatically on load/import/connect — dropped cache, stamped
  version, no data loss, connected files rewrite to disk immediately.

### Fixed
- **Resuming a run could crash instead of scrolling** — `entrySec.scrollIntoView()` was called
  unconditionally; environments that don't implement it (older browsers, embedded webviews, and
  jsdom) throw instead of no-op'ing. Now guarded like the app's three other `scrollIntoView`
  call sites. Caught by the new smoke test.

## [0.2.32] "Put a hot rock on it" — 2026-07-15
Ironing Test joins PA Test as a full calibration workflow, and filament cards get a shared,
clearer in-progress/done pattern for both.

### Added
- **Ironing Test tab.** Generates a grid of flat pads (speed × flow sweep) as an OrcaSlicer 3MF
  project — geometry only, Orca still does the real slicing (consistent with the "no g-code
  generation" rule). Pad diameter/gap are configurable, the plan fits your printer's real bed, and
  precise brim-width instructions are computed rather than embedding Orca's full 654-key
  `project_settings.config` (which silently overwrites a tuned profile on an empty plate — a
  known Orca footgun).
- **Ironing results entry: a picker, not typing in cell coordinates.** A real-scale grid of
  circles matching the physical print — click a sample to name it (Glossy/Matte/Other + your own
  text). The naming popover appears on whichever half of the grid keeps your clicked sample
  visible, sized to its own content, no scrollbars under any window size.
- **Filament cards show separate PA and Iron buttons** (previously one combined "Results"
  button). Each turns **orange** while that test is in-flight (printed, no results yet) and
  clicking it jumps straight to the open run instead of a history view. A small legend under
  "+ Add a filament" explains orange = in progress, blue = done.
- **Abandon button on the Ironing tab** — previously there was no way to cancel an in-progress
  ironing run once you'd saved its settings.
- **Click anywhere on a filament, printer, or nozzle card to select it** (blue border) — the
  dedicated Select button is gone.
- Only one **incomplete** run is ever allowed per printer+filament combo (PA or Iron); multiple
  **completed** runs are kept as history, each showing full date and time (not just date) since
  more than one can share a day.

### Changed
- PA's pinned "in progress" section is gone — retired in favor of the same pattern Iron uses
  (orange button, jump straight to the run, shared explainer modal).
- **Abandoning a run now permanently deletes it** rather than soft-flagging `status: "abandoned"`
  — an abandoned run was never recoverable anyway, so there was no reason to keep the record
  around.
- Resuming a run now scrolls straight to its actual data-entry section instead of leaving you at
  the top of the tab. This also surfaced and fixed a real bug: a stray `hidden` attribute meant
  basic-mode PA result entry was permanently unreachable.
- The "Use it now, here" hosted-build link moved from the app's own header into README — it
  never made sense to show inside the app you're already using.

### Notes
- Basic PA test mode is temporarily hidden (advanced-only) pending dedicated testing on a future
  branch; the underlying code is untouched.

## [0.2.31] "Clean Slate" — 2026-07-15
Saving a run now returns you to the Filament page and leaves a clean PA bench.

- **Saving a completed run returns to the Filament page and resets the PA tab** — after "Save
  completed run", the app switches back to the Filament tab (the run appears under its filament)
  and blanks the PA test tab, with no confirmation popup.
- **Saving a planned run returns to the Filament page and resets the PA tab** — after "Save as
  planned run" the app goes back to the Filament tab and blanks the PA test tab (empty grid,
  cleared analysis/export, re-gated max flow) so the next run starts fresh — no confirmation popup
  (the run is visible pinned under its filament).

## [0.2.27] "Grimoire" — 2026-07-15
First tagged release. Everything up to this point, headlined by saved runs & the Results view.

### Added
- **Optional filament name** (nickname), like the printer name — shown as the card title / label when set.

### Changed
- **"Save as planned run" is orange** — matching the "planned" badge on the filament screen.
- **Modal + Export polish.** The run-delete control is now a red trashcan icon placed to the right of Close.
  Rerunning a saved run clears the stale per-row warning flags (blank grid = no warnings). The Analyze and
  Export sections show only their button until there's output — no more empty boxes. Modal section headings
  are blue again, and the title-bar colour swatch is vertically centred with the filament name.
- **Results modal reworked.** Fixed title bar at the top (filament name + colour swatch; the "Results —"
  prefix is gone) and a fixed button bar at the bottom that stays put while the body scrolls. Printer,
  Filament and Test-settings are now collapsible sections (collapsed by default, right-side ▶/▼ triangle);
  the Results section is always open. Section titles read "Printer - [name]" / "Filament - [name]", and the
  lists now show maker + model / maker + material instead of repeating the name. The run-clone button is
  "Rerun with these settings"; Close is right-justified. The adaptive-PA export shows as a plain text block
  (with a copy icon), not an input-style box.
- **Remove is a red trashcan icon** on printer and filament cards, and **filament cards now have a uniform
  width** (like printer cards) sized so Select / Edit / Clone / Results / Remove sit on one row.
- **Results modal tidy-up.** Section heading is now just "Results" (the "paste into Orca" cue already
  sits on the block label right below it), and the adaptive PA model shows as a wrapping text block
  with a copy icon instead of a `<textarea>` — so it no longer gets its own inner scrollbar.
- **Selected-item tab subtitles restacked with a leading icon.** The Printer tab now shows the maker
  favicon on the left (vertically centred), the printer name on the first line and the selected nozzle
  on the second. The Filament tab mirrors it: a square colour swatch on the left (solid or gradient,
  same fill as the card band), maker + material on the first line, characteristics + colour on the second.
- **Printer cards are a uniform width**, sized so Select / Edit / Clone / Remove sit on one row without
  wrapping.
- **Saved runs are now a per-filament "Results" modal** (replaces the global "Completed runs" list and
  the read-only PA-tab view). Each filament card/row with completed runs gets a **Results** button
  (count badge when >1). It opens a large modal over a dimmed backdrop showing the full **printer** and
  **filament** parameters, the **test settings** (mode, PA range, max flow, layer × line width, accel &
  speed lists), and the **results to paste into Orca** — the adaptive PA model and each Orca-bound value
  with **Copy** buttons. A filament with multiple runs shows the newest by default with a **dropdown** to
  pick another. **Clone** starts a fresh editable run with the same settings; **Delete** removes the run
  (with confirm), from inside the modal.

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
- **Lowest test flow raised (3 → 5 mm³/s).** Like low acceleration, very low flow barely builds
  pressure, so PA reads there are noise (real ABS run: the ~4 mm³/s column was junk while 8+ was clean).
  `adaptive.minFlow` now floors at 5.
- **Default accel sweep now floors at ~2000, not 1000.** Real PLA runs showed the ~1000 mm/s² row
  barely discriminates — the corner velocity change is too gentle to build pressure, so every PA looks
  clean and the "best" just pins to a range edge. The auto sweep starts at `adaptive.accelFloor` (2000)
  instead, saving plastic and time. Low values are still allowed if you type them into the accel list.

### Changed
- **Explicit favicon URL per maker** (`js/beds.js` now has a `favicon` field). Each vendor's icon URL
  was found from their homepage's `<link rel="icon">` (prefer PNG/SVG over .ico), falling back to
  `<domain>/favicon.ico` where no tag exists. At runtime, if the stored URL fails to load (e.g. 404),
  the card automatically retries `<domain>/favicon.ico`, and shows nothing if that also fails. (We can't
  re-parse the vendor's `<link>` at runtime — cross-origin HTML reads are CORS-blocked — so the runtime
  fallback is the domain default favicon.)

### Added
- **Max volumetric speed is now gated (advanced mode).** Max flow is treated as a property of the exact
  printer+nozzle+filament combo: selecting a combo **prefills** it from a prior run for that combo (or
  **blanks** it if there's none), and the whole test form below is **hidden** until you press
  **Confirm** — so it's obvious the only thing to do is enter/confirm the volumetric rate (rather than a
  dimmed, "why is everything disabled?" state). Editing the value hides it again until you re-confirm.
  Closing a saved-run view also re-prefills the max flow for the combo. Since max flow drives the entire
  speed↔flow conversion, this stops a stale or blank value from silently poisoning the recommendation.
  Basic mode (which needs no flow) and the read-only run view are never gated.
- **Read-only view for completed runs.** Opening a saved run from the Completed list now shows it
  **locked** — every field is `disabled` (no entries possible) and every in-form **button is hidden**,
  so the only actions are the view bar's **Clone / Delete / Close**. The **plot is auto-drawn**, and the
  **Orca export text is stored with the run and shown** in its box (read-only but still selectable, so you
  can copy the PA model back into Orca — e.g. after wiping a slicer config). **Clone** starts a fresh
  editable run with the same settings and blank results (a re-run); **Delete** removes it with a confirm,
  from inside the view. Fixes the old behaviour where opening a completed run treated it as the current
  editable job, and "Abandon" silently deleted it from history.
- **Outlier flag on results.** A Best-PA cell that's out of line with its neighbours (same accel row or
  same flow column) — not just globally — gets a red ◆ marker; the tooltip suggests re-checking that
  block. Because the PA surface has a real trend, this uses a neighbour median + MAD with a ~2-step
  floor, so a local mispick (e.g. one cell reading 0.04 when its neighbours sit at 0–0.01) is caught
  while genuine gradients aren't. Confirmed against a real ABS run.
- **Export is harder to get stale/confused.** The download is now dated (`pa_data_YYYY-MM-DD.json`) so
  repeated exports don't overwrite/collide in Downloads; each file carries an `exportedAt` timestamp; the
  data-status line shows when you last exported and turns amber ("⚠ newer than your last export") once
  you've saved changes since. And PA-Helper now **syncs across browser tabs** (a `storage` listener) — a
  second tab picks up saves from another, so it can't export a stale in-memory copy. (Root-causes the
  "my completed run wasn't in the export" confusion, alongside the v0.1.33 fix.)
- **Range-edge warning on results.** If a row's Best PA lands on the tested range's floor or ceiling, a
  ⚠ appears in the cell — the true optimum probably lies beyond the range, so an edge value shouldn't be
  mistaken for the answer. The tooltip says which end to extend and re-test.

### Fixed
- **Read-only view bar stayed on screen after closing a run (CSS bug).** The `.viewbar` rule set
  `display:flex`, which overrode the `hidden` attribute (author styles beat the UA `[hidden]` rule), so
  the view bar was effectively always visible on the PA tab — making a fresh tab look like the read-only
  view. Added `.viewbar[hidden]{display:none}` (the same guard `.modal` already had). jsdom doesn't
  compute CSS display, which is why the smoke tests missed it.
- **After closing a run view, the config stayed locked.** The full reset blanked max flow and then
  re-ran the max-flow gate, which left `#gatedBody` `inert` (browser-dimmed / non-interactive) — reading
  as "all form controls disabled." (jsdom ignores `inert`, so the smoke didn't catch it.) A freshly reset
  tab is now left **editable**; the max-flow gate re-engages when you enter a max flow or select a
  filament to set up a new test.
- **Closing a saved-run view left stale data on the PA tab.** After viewing a run and clicking Close,
  reopening the PA tab still showed that run's data/config. Close now does a **full reset** of the PA
  tab — results, plot, analysis, Orca export box, max flow, basic fields, AND the recommend/provide
  config (accel & speed lists, point counts, provided values) plus any imported g-code — then returns to
  the Filament tab, so the next run starts completely clean.
- **Saving a second planned job could delete the first (data loss).** After you saved a job for later,
  `currentRunId` still pointed at it; setting up a *different* printer/filament job and saving reused that
  id and overwrote the first saved run instead of creating a new one. `collectRun` now detects when the
  in-progress job's printer/filament/nozzle differs from the run `currentRunId` points at and mints a
  fresh id, so each distinct job is saved as its own planned run. (Re-saving the *same* combo still
  updates its existing run, as before.)

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
