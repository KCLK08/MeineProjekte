#!/usr/bin/env bash
# Build static landing + web apps into _site/ for Cloudflare Pages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Bautagebuch (Expo static web) → /apps/bautagebuch/
EXPO_WEB_BASE=/apps/bautagebuch bash scripts/build-bautagebuch-web.sh

# Elifba (static)
node scripts/prepare-elifba.mjs

# DS-Datenbank (Vite)
npm install --prefix apps/ds-datenbank/web
VITE_BASE=/apps/ds-datenbank/ npm run build --prefix apps/ds-datenbank/web

# BÜW Toolbox
npm install --prefix apps/buew-toolbox/web
npm install --prefix apps/buew-toolbox/web/sitereport
npm install --prefix apps/buew-toolbox/web/bautagebuch-v2
BTB_WEB_BASE=/apps/buew-toolbox/bautagebuch \
  npm run build --prefix apps/buew-toolbox/web/bautagebuch-v2
npm run build --prefix apps/buew-toolbox/web/sitereport
node scripts/assemble-buew-toolbox.mjs

rm -rf _site
mkdir -p \
  _site/apps/bautagebuch \
  _site/apps/elifba \
  _site/apps/ds-datenbank \
  _site/apps/buew-toolbox

cp -R website/. _site/
cp -R apps/bautagebuch/dist/. _site/apps/bautagebuch/
cp -R apps/elifba/web/dist/. _site/apps/elifba/
cp -R apps/ds-datenbank/web/dist/. _site/apps/ds-datenbank/
cp -R apps/buew-toolbox/web/dist/. _site/apps/buew-toolbox/

echo "Cloudflare site bereit: $ROOT/_site"
