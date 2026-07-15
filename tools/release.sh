#!/usr/bin/env bash
# Build a distributable zip of PA-Helper — everything needed to run it locally,
# plus a RUN_ME note pointing at the hosted GitHub Pages version.
#
#   Usage:  bash tools/release.sh
#   Output: dist/pa-helper-v<version>.zip   (dist/ is gitignored)
#
# Run `node tools/stamp.js` first so js/version.js carries the version you're releasing.
set -euo pipefail
cd "$(dirname "$0")/.."

PAGES_URL="https://4o66.github.io/pa-helper/"

VERSION=$(sed -n 's/.*version:[[:space:]]*"\([^"]*\)".*/\1/p' js/version.js | head -1)
if [ -z "${VERSION:-}" ]; then
  echo "Could not read version from js/version.js — run 'node tools/stamp.js' first." >&2
  exit 1
fi

STAGE=$(mktemp -d)
PKG="$STAGE/pa-helper"
mkdir -p "$PKG"

# Files needed to run the app locally.
cp -R index.html css js docs README.md LICENSE CHANGELOG.md "$PKG"/

# Short run note + reminder link to the always-current hosted build.
cat > "$PKG/RUN_ME.txt" <<EOF
PA-Helper v$VERSION
===================

Prefer the always-current hosted version? Use it now, here:
  $PAGES_URL

To run this copy locally:
  - Easiest: open index.html in your browser (Chrome / Edge / Brave / Firefox).
    In-browser storage plus the Import/Export JSON buttons keep your data.
  - Or serve this folder as a static site for the "Connect file..." direct
    pa_data.json feature (that needs https or localhost).

No build step, no dependencies, no account, no data leaves your machine.
Source & issues: https://github.com/4o66/pa-helper    GNU AGPLv3
EOF

mkdir -p dist
OUT="dist/pa-helper-v$VERSION.zip"
rm -f "$OUT"
( cd "$STAGE" && zip -rq pa-helper.zip pa-helper )
mv "$STAGE/pa-helper.zip" "$OUT"
rm -rf "$STAGE"

echo "Built $OUT"
unzip -l "$OUT"
