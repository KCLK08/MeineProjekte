# Family Vault – Release Security Check

Stand: 2026-07-16 · Scope: produktionsnahe Konfiguration (Expo / EAS)

## Android

| Check | Status | Evidence |
| --- | --- | --- |
| Release / production profile | ✅ | `eas.json` → `build.production` (APK) |
| Signing | ⚠️ Process | EAS managed credentials erforderlich; kein Debug-Keystore in Repo |
| Debug flags | ✅ | Keine `__DEV__`-Bypässe für Vault; Klartextbetrieb blockiert |
| Cleartext traffic | ✅ | `expo-build-properties` → `usesCleartextTraffic: false` |
| Backup | ✅ | `android.allowBackup: false` + `withAndroidHardening.js` |
| FLAG_SECURE | ✅ | `expo-screen-capture` `preventScreenCaptureAsync` at runtime |
| SQLCipher plugin | ✅ | `expo-sqlite` `useSQLCipher: true` |
| Permissions | ✅ | Camera / media / biometric only – no internet permission required by app config |
| Secrets in repo | ✅ | Keine Keystore-Passwörter / API-Keys im App-Code |

### Release-Build Empfehlung (Android)

```bash
cd apps/familydata
npx eas-cli build --platform android --profile production
```

Vor Store/APK-Verteilung:

1. Installations-Check: Unlock → Vault DB vorhanden
2. `adb shell dumpsys package de.meineprojekte.familydata | grep -i backup` → Backup nicht erlaubt
3. Screenshot versuchen → blockiert / schwarz
4. Recent Apps → leere/geschützte Vorschau

## iOS

| Check | Status | Evidence |
| --- | --- | --- |
| Release configuration | ⚠️ Process | EAS/`expo run:ios --configuration Release`; Signing via Apple Team |
| Entitlements | ✅ Design | Keine iCloud / Keychain-Sharing-Gruppen für Fremd-Apps konfiguriert |
| Keychain | ✅ | `WHEN_UNLOCKED_THIS_DEVICE_ONLY` + `requireAuthentication` |
| Face ID usage string | ✅ | `NSFaceIDUsageDescription` in `app.json` |
| File sharing | ✅ | `UIFileSharingEnabled: false`, `LSSupportsOpeningDocumentsInPlace: false` |
| Screen protection | ✅ | `preventScreenCaptureAsync` + `enableAppSwitcherProtectionAsync` |
| Backup / Files app | ✅ | File sharing off; keine Cloud-Dokumente |

### Release-Build Empfehlung (iOS)

```bash
cd apps/familydata
npx eas-cli build --platform ios --profile production
```

## Gemeinsame Checks

| Check | Status |
| --- | --- |
| Expo Go nicht als Produktionsziel | ✅ UI blockiert Vault |
| PDF offline (kein CDN) | ✅ `assets/pdfjs/*` |
| Keine Cloud-API in `extra` | ✅ |
| Auto-Lock Default sofort | ✅ |
| Disable-Security entfernt | ✅ wirft Fehler |
| Export-Warnung | ✅ Dialog + Nachricht |

## Offene Prozesspunkte (nicht Code)

1. **Signing Secrets** nur in EAS / CI Secrets halten – nie committen.
2. **Play App Signing / Apple Distribution** vor öffentlicher Verteilung verifizieren.
3. **ProGuard/R8** / Bitcode: Expo managed defaults akzeptabel; bei Custom Native Modules erneut prüfen.
4. Geräte-Smoke-Test auf physischem Gerät vor „production ready“-Freigabe.

## Ergebnis

Konfigurationsseite ist für eine Offline-Vault-App **release-fähig**, sofern EAS-Signing und Geräte-Smoke-Tests abgeschlossen sind. Keine debug-only Security-Bypässe im Produktcode gefunden.
