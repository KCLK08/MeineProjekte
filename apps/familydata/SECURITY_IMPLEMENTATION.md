# FamilyData – Security Implementation

## Architecture overview

```
                 Android Keystore / iOS Keychain
                              |
                     Master Encryption Key
                     (expo-secure-store)
                              |
              ----------------+----------------
              |                               |
              v                               v
     SQLCipher (expo-sqlite)          AES-256-GCM (@noble/ciphers)
     familydata.vault.db              familydata-encrypted/*.dat
```

FamilyData is a **local vault**: no cloud, no accounts, no app-owned password database.
On supported builds (Dev Client / APK), **vault mode is mandatory** – no plaintext operation and no disable path.
Unlock uses **native biometrics** with the **system device passcode** as fallback (`expo-local-authentication`).
The master key is stored with `requireAuthentication: true` (Keystore / Keychain).

| Layer | Mechanism |
| --- | --- |
| AuthN | Face ID / fingerprint / device PIN (OS) |
| Key storage | Keychain / Keystore via `expo-secure-store` |
| Database | SQLCipher (`expo-sqlite` + `useSQLCipher: true`) |
| Files | AES-256-GCM, random 12-byte IV, opaque `.dat` names |
| Session | In-memory key only while unlocked; wiped on lock |

## Libraries

- `expo-local-authentication` – biometrics + device credential
- `expo-secure-store` – device-bound master key
- `expo-crypto` – CSPRNG / digests
- `expo-sqlite` with SQLCipher – encrypted DB (Dev Build / APK only)
- `@noble/ciphers` – AES-256-GCM for documents
- `expo-file-system` – encrypted blob storage

## Threat model (brief)

**In scope / mitigated**

- Offline extraction of `familydata.vault.db` without the Keystore-backed key
- Casual access when the app is backgrounded (auto-lock + UI memory wipe)
- Document files stored as opaque ciphertext under `familydata-encrypted/`

**Out of scope / residual**

- Compromised unlocked device while the vault session is open
- Advanced attackers with OS-level privileges / unlocked Keystore
- JS cannot guarantee physical zeroization of key bytes after use (best-effort wipe)
- Expo Go cannot provide SQLCipher (see below)

## Expo Go vs Development Build

| Feature | Expo Go | Dev Client / Release APK |
| --- | --- | --- |
| Biometrics | Yes | Yes |
| SecureStore key | Yes | Yes |
| AES file encryption | Yes | Yes |
| SQLCipher DB | **No** | **Yes** |

SQLCipher is enabled in `app.json`:

```json
["expo-sqlite", { "useSQLCipher": true, "enableFTS": true }]
```

After changing this plugin, run:

```bash
cd apps/familydata
npx expo prebuild
npx expo run:android
# or EAS Build / existing APK workflow
```

## Module map

```
src/security/
  SecurityManager.ts          Orchestration (vault init/lock/unlock; disable blocked)
  KeyStoreService.ts          Auth-bound master key create/get/delete
  BiometricService.ts         Native auth
  EncryptionService.ts        AES-256-GCM bytes
  DocumentEncryptionService.ts File encrypt/decrypt/temp wipe
  MigrationService.ts         Plain → vault migration
  previewSession.ts           Preview wipe listeners on lock
  settingsFlags.ts            Non-secret flags in SecureStore
  access.ts                   UI gate for Identifikation
src/store/securityStore.ts    Zustand: locked / wipeToken / auto-lock
src/components/AppLockGate.tsx Full-screen lock UI
```

See also `SECURITY_HARDENING_REPORT.md` for audit remediations.

## Install / build steps

1. Install deps (already in `package.json`): `expo-crypto`, `@noble/ciphers`, SQLCipher plugin, `expo-screen-capture`, `expo-build-properties`.
2. Use a **development build** or CI APK (not Expo Go) for vault mode.
3. First unlock creates the vault (or migrates legacy plaintext).
4. Existing plaintext DB/files are migrated; originals are removed after encryption.

## Runtime behaviour

- **Locked:** DB connection closed, session key wiped, decrypted temp files deleted, Zustand people/documents cleared, preview/PDF/WebView state wiped (`wipeToken`).
- **Unlocked:** `PRAGMA key = x'<hex>'` on `familydata.vault.db`, documents decrypted to a temp path only for preview/export.
- **Auto-lock:** immediate (default) / 1 / 5 / 15 minutes after backgrounding (AppState).
- **Screen:** `FLAG_SECURE` via `expo-screen-capture`; Android backup disabled.

## Test plan

1. Fresh install on Dev Build → vault setup on first unlock (no plaintext mode).
2. Legacy plaintext install → migrate → vault only.
3. Kill app → relaunch → lock screen → unlock with biometrics/device code → data visible.
4. Background (immediate auto-lock) → lock → memory/preview cleared.
5. Add document → file under `familydata-encrypted/*.dat` only.
6. Preview/export works; after lock, temp decrypt folder empty and PDF HTML gone.
7. Disable security is rejected (error).
8. Expo Go: blocked with Dev Build message.
9. Screenshots / recent apps blank (Android FLAG_SECURE).
10. No secrets in logs (avoid logging key material / plaintext file contents).

## Explicit non-goals (by design)

- No custom PIN/password verifier in the app
- No cloud backup / account recovery
- No shipping raw keys in source, AsyncStorage, or shared preferences plaintext
