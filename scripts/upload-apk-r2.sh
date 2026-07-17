#!/usr/bin/env bash
# Upload one APK to the Cloudflare R2 bucket used by Worker kclk08.
# Usage: scripts/upload-apk-r2.sh <local-apk-path> <object-key.apk>
set -euo pipefail

FILE="${1:?local APK path required}"
KEY="${2:?object key required, e.g. FamilyVault.apk}"
BUCKET="${R2_APK_BUCKET:-kclk08-apks}"

if [[ ! -f "$FILE" ]]; then
  echo "APK not found: $FILE" >&2
  exit 1
fi

if [[ "$KEY" == *"/"* || "$KEY" != *.apk ]]; then
  echo "Invalid object key: $KEY" >&2
  exit 1
fi

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID required}"

echo "Uploading $FILE → r2://$BUCKET/$KEY"
npx --yes wrangler@4 r2 object put "${BUCKET}/${KEY}" \
  --file="$FILE" \
  --remote \
  --content-type="application/vnd.android.package-archive"
echo "OK: /apks/${KEY}"
