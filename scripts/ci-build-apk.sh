#!/usr/bin/env bash
# Build an Expo Android APK for one monorepo app.
# Usage: scripts/ci-build-apk.sh <app-path> <apk-name>
set -euo pipefail

APP_PATH="${1:?app-path required}"
APK_NAME="${2:?apk-name required}"

cd "$APP_PATH"

if [ -n "${EXPO_TOKEN:-}" ] && command -v eas >/dev/null 2>&1; then
  echo "Trying EAS cloud build…"
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
  echo "EXPO_TOKEN or eas missing – local Gradle build"
fi

npx expo prebuild --platform android --no-install
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon
cp app/build/outputs/apk/release/app-release.apk "../$APK_NAME"
echo "Local APK ready: $APP_PATH/$APK_NAME"
