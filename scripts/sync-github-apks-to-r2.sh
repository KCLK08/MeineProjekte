#!/usr/bin/env bash
# Download private GitHub Release APKs (via GITHUB_TOKEN) and upload to R2.
# Usage: scripts/sync-github-apks-to-r2.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${GITHUB_TOKEN:?GITHUB_TOKEN required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID required}"

OWNER="${GITHUB_REPOSITORY_OWNER:-KCLK08}"
REPO_NAME="${GITHUB_REPOSITORY##*/}"
REPO_NAME="${REPO_NAME:-MeineProjekte}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# slug|tag|filename
APKS=(
  "bautagebuch|bautagebuch-apk-latest|Bautagebuch.apk"
  "buew-toolbox|buew-toolbox-apk-latest|BuewToolbox.apk"
  "ds-datenbank|ds-datenbank-apk-latest|DSDatenbank.apk"
  "elifba|elifba-apk-latest|Elifba.apk"
  "familydata|familydata-apk-latest|FamilyVault.apk"
)

API="https://api.github.com/repos/${OWNER}/${REPO_NAME}"

for entry in "${APKS[@]}"; do
  IFS='|' read -r slug tag file <<<"$entry"
  echo "== ${slug}: ${tag} / ${file}"
  meta="$(curl -fsSL \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "${API}/releases/tags/${tag}" 2>/dev/null || true)"
  if [[ -z "$meta" ]]; then
    echo "  skip: no release ${tag}"
    continue
  fi
  asset_url="$(node -e '
    const d = JSON.parse(process.argv[1]);
    const want = process.argv[2];
    const a = (d.assets || []).find((x) => x.name === want)
      || (d.assets || []).find((x) => x.name.endsWith(".apk"));
    if (!a) process.exit(2);
    process.stdout.write(a.url);
  ' "$meta" "$file" 2>/dev/null || true)"
  if [[ -z "$asset_url" ]]; then
    echo "  skip: no APK asset"
    continue
  fi
  out="${TMP}/${file}"
  curl -fsSL \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/octet-stream" \
    -o "$out" \
    "$asset_url"
  bash scripts/upload-apk-r2.sh "$out" "$file"
done

echo "Sync fertig."
