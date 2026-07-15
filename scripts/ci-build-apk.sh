#!/usr/bin/env bash
# Build an Expo Android APK for one monorepo app.
# Usage: scripts/ci-build-apk.sh <app-path> <apk-name>
#
# GitHub Actions defaults to a local Gradle build (predictable, ~15–30 min).
# Set USE_EAS_BUILD=1 to wait on Expo cloud builds instead (can take hours).
set -euo pipefail

APP_PATH="${1:?app-path required}"
APK_NAME="${2:?apk-name required}"

cd "$APP_PATH"

use_eas=false
if [ "${USE_EAS_BUILD:-0}" = "1" ] && [ -n "${EXPO_TOKEN:-}" ] && command -v eas >/dev/null 2>&1; then
  use_eas=true
fi

if [ "$use_eas" = true ]; then
  echo "Trying EAS cloud build (USE_EAS_BUILD=1)…"
  if eas build --platform android --profile preview --non-interactive --json --wait | tee eas-result.json; then
    URL=$(node -e "
      const fs = require('fs');
      const lines = fs.readFileSync('eas-result.json','utf8').trim().split(/\n/).filter(Boolean);
      const raw = lines[lines.length - 1] || '{}';
      let r;
      try { r = JSON.parse(raw); } catch { r = {}; }
      const b = Array.isArray(r) ? r[0] : r;
      process.stdout.write(b?.artifacts?.buildUrl || b?.applicationArchiveUrl || '');
    ")
    if [ -n "$URL" ]; then
      curl -fsSL "$URL" -o "$APK_NAME"
      echo "EAS APK ready: $APP_PATH/$APK_NAME"
      exit 0
    fi
    echo "EAS finished but no artifact URL – falling back to local build"
  else
    echo "EAS build failed – falling back to local build"
  fi
else
  if [ -n "${EXPO_TOKEN:-}" ]; then
    echo "EXPO_TOKEN is set, but CI uses local Gradle (set USE_EAS_BUILD=1 for EAS)."
  else
    echo "Local Gradle build (no EXPO_TOKEN / EAS not requested)"
  fi
fi

npx expo prebuild --platform android --no-install
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon
cp app/build/outputs/apk/release/app-release.apk "../$APK_NAME"
echo "Local APK ready: $APP_PATH/$APK_NAME"
