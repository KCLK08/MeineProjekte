#!/usr/bin/env bash
# Create GitHub repo KCLK08/FamilyVault (private) and push the extracted history.
# Requires a personal token with `repo` scope (GitHub App tokens cannot create repos).
set -euo pipefail
OWNER="${OWNER:-KCLK08}"
NAME="${NAME:-FamilyVault}"
BUNDLE="${1:-FamilyVault.bundle}"
if [[ ! -f "$BUNDLE" ]]; then
  echo "Usage: $0 path/to/FamilyVault.bundle"
  exit 1
fi
if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  echo "Set GH_TOKEN or GITHUB_TOKEN with repo-create permissions."
  exit 1
fi
TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
curl -fsS -X POST \
  -H "Authorization: token ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/user/repos" \
  -d "{\"name\":\"${NAME}\",\"private\":true,\"description\":\"Family Vault – private offline family vault\"}" \
  >/dev/null || echo "(repo may already exist – continuing)"
TMP=$(mktemp -d)
git clone "$BUNDLE" "$TMP/FamilyVault"
cd "$TMP/FamilyVault"
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:${TOKEN}@github.com/${OWNER}/${NAME}.git"
git push -u origin main
echo "Pushed to https://github.com/${OWNER}/${NAME}"
