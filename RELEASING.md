# Releasing PA-Helper

Development is **commit-locally**. We cut a **release** only when a feature reaches a
stable state — at which point we push and publish a downloadable build.

## Day to day
- Make changes, run `node tools/stamp.js` (bumps the build number in `js/version.js`), commit.
- Keep the jsdom smoke test green before committing.
- These commits stay **local** — no push per commit.

## Cutting a release (a feature is stable)
1. Make sure `main` is green and stamped (`node tools/stamp.js` if you haven't since the last edit).
2. Push: `git push origin main`. The hosted build tracks `main`, so
   <https://4o66.github.io/pa-helper/> updates on push.
3. Build the archive: `bash tools/release.sh` → `dist/pa-helper-v<version>.zip`.
   It contains everything needed to run locally (`index.html`, `css/`, `js/`, `docs/`,
   `README.md`, `LICENSE`, `CHANGELOG.md`) plus a `RUN_ME.txt` reminder that links to the
   hosted version. `dist/` is gitignored.
4. Create a GitHub release for the version and attach the zip.

## Versioning
`v<MAJOR_MINOR>.<build>` — `MAJOR_MINOR` is set in `tools/stamp.js`. The build number
auto-increments on each `node tools/stamp.js` and resets to `1` when `MAJOR_MINOR` rolls
(a minor bump marks a milestone). A release is simply a stable, pushed build with a zip
attached; **v1.0** will mark the first "fully usable" release.
