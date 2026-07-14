#!/usr/bin/env bash
# Export the Expo Bautagebuch app (same codebase as KCLK08/Bautagebuch) for GitHub Pages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/bautagebuch"
BASE="${EXPO_WEB_BASE:-/MeineProjekte/apps/bautagebuch}"

echo "Expo web export → $APP/dist (base=$BASE)"
cd "$APP"
rm -rf dist

# Ensure COI helper is present for SQLite on GitHub Pages
mkdir -p public
if [ ! -f public/coi-serviceworker.min.js ]; then
  curl -fsSL -o public/coi-serviceworker.min.js \
    https://cdn.jsdelivr.net/npm/coi-serviceworker@0.1.7/coi-serviceworker.min.js
fi

EXPO_WEB_BASE="$BASE" npx expo export --platform web

# Absolute script src may become "//coi..." if BASE is used wrongly in +html;
# normalize HTML script tags to the Pages base path.
python3 - <<'PY'
from pathlib import Path
import os
base = os.environ.get("EXPO_WEB_BASE", "/MeineProjekte/apps/bautagebuch").rstrip("/")
dist = Path("dist")
for html in dist.rglob("*.html"):
    text = html.read_text(encoding="utf-8")
    fixed = text.replace('src="/coi-serviceworker.min.js"', f'src="{base}/coi-serviceworker.min.js"')
    fixed = fixed.replace('src="//coi-serviceworker.min.js"', f'src="{base}/coi-serviceworker.min.js"')
    if "coi-serviceworker.min.js" not in fixed:
        fixed = fixed.replace("</head>", f'<script src="{base}/coi-serviceworker.min.js"></script></head>', 1)
    if fixed != text:
        html.write_text(fixed, encoding="utf-8")
        print("patched", html)
PY

touch dist/.nojekyll
test -f dist/coi-serviceworker.min.js || cp public/coi-serviceworker.min.js dist/
echo "Bautagebuch Expo web dist bereit: $APP/dist"
