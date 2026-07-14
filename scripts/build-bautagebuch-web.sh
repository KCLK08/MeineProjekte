#!/usr/bin/env bash
# Build Bautagebuch web (Svelte) for GitHub Pages at /MeineProjekte/apps/bautagebuch/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/apps/buew-toolbox/web/bautagebuch-v2"
OUT="$ROOT/apps/bautagebuch/web/dist"
BASE="${BTB_WEB_BASE:-/MeineProjekte/apps/bautagebuch}"

echo "Building Bautagebuch web → $OUT (base=$BASE)"
rm -rf "$OUT" "$SRC/build"
mkdir -p "$OUT"

(
  cd "$SRC"
  if [ ! -d node_modules ]; then
    npm install
  fi
  BTB_WEB_BASE="$BASE" npm run build
)

cp -R "$SRC/build/." "$OUT/"
touch "$OUT/.nojekyll"
echo "Bautagebuch web dist bereit: $OUT"
