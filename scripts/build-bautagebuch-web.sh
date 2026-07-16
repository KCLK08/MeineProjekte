#!/usr/bin/env bash
# Export the Expo Bautagebuch app (same codebase as KCLK08/Bautagebuch) for static hosting.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/bautagebuch"
BASE="${EXPO_WEB_BASE:-/apps/bautagebuch}"

echo "Expo web export → $APP/dist (base=$BASE)"
cd "$APP"
rm -rf dist

# Ensure COI helper is present for SQLite in the browser
mkdir -p public
if [ ! -f public/coi-serviceworker.min.js ]; then
  curl -fsSL -o public/coi-serviceworker.min.js \
    https://cdn.jsdelivr.net/npm/coi-serviceworker@0.1.7/coi-serviceworker.min.js
fi

EXPO_WEB_BASE="$BASE" npx expo export --platform web

# Absolute root assets need the site base path (favicon/icons + COI).
python3 - <<'PY'
from pathlib import Path
import os

base = os.environ.get("EXPO_WEB_BASE", "/apps/bautagebuch").rstrip("/")
dist = Path("dist")

replacements = [
    ('src="/coi-serviceworker.min.js"', f'src="{base}/coi-serviceworker.min.js"'),
    ('src="//coi-serviceworker.min.js"', f'src="{base}/coi-serviceworker.min.js"'),
    ('href="/app-icon.png"', f'href="{base}/app-icon.png"'),
    ('href="/apple-touch-icon.png"', f'href="{base}/apple-touch-icon.png"'),
    ('href="/manifest.webmanifest"', f'href="{base}/manifest.webmanifest"'),
    ('href="/favicon.ico"', f'href="{base}/favicon.ico"'),
    ('href="/icon-192.png"', f'href="{base}/icon-192.png"'),
    ('href="/icon-512.png"', f'href="{base}/icon-512.png"'),
]

for html in dist.rglob("*.html"):
    text = html.read_text(encoding="utf-8")
    fixed = text
    for old, new in replacements:
        fixed = fixed.replace(old, new)
    if "coi-serviceworker.min.js" not in fixed:
        fixed = fixed.replace("</head>", f'<script src="{base}/coi-serviceworker.min.js"></script></head>', 1)
    if 'rel="icon"' not in fixed:
        fixed = fixed.replace(
            "</head>",
            f'<link rel="icon" type="image/png" href="{base}/app-icon.png" />'
            f'<link rel="apple-touch-icon" href="{base}/apple-touch-icon.png" />'
            f'<link rel="manifest" href="{base}/manifest.webmanifest" /></head>',
            1,
        )
    if fixed != text:
        html.write_text(fixed, encoding="utf-8")
        print("patched", html)

# Keep manifest icon paths relative (resolve from app base URL).
manifest = dist / "manifest.webmanifest"
if manifest.exists():
    print("manifest present")
PY

touch dist/.nojekyll
test -f dist/coi-serviceworker.min.js || cp public/coi-serviceworker.min.js dist/
# Ensure logo-based web icons shipped even if Expo skips some public files
for f in app-icon.png apple-touch-icon.png icon-192.png icon-512.png manifest.webmanifest favicon.ico; do
  if [ -f "public/$f" ]; then
    cp "public/$f" "dist/$f"
  fi
done
echo "Bautagebuch Expo web dist bereit: $APP/dist"
