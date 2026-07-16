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
Unlock uses **native biometrics** with the **system device passcode** as fallback (`expo-local-authentication`).

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
  SecurityManager.ts          Orchestration (enable/disable/lock/unlock)
  KeyStoreService.ts          Master key create/get/delete
  BiometricService.ts         Native auth
  EncryptionService.ts        AES-256-GCM bytes
  DocumentEncryptionService.ts File encrypt/decrypt/temp wipe
  MigrationService.ts         Plain ↔ vault migration
  settingsFlags.ts            Non-secret flags in SecureStore
  access.ts                   UI gate for Identifikation
src/store/securityStore.ts    Zustand: enabled / locked / auto-lock
src/components/AppLockGate.tsx Full-screen lock UI
```

## Install / build steps

1. Install deps (already in `package.json`): `expo-crypto`, `@noble/ciphers`, SQLCipher plugin.
2. Use a **development build** or CI APK (not Expo Go) for full vault mode.
3. On device: Settings → Sicherheit → enable protection (native auth prompt).
4. Existing plaintext DB/files are migrated; originals are removed after encryption.

## Runtime behaviour

- **Locked:** DB connection closed, session key wiped, decrypted temp files deleted, Zustand people/documents cleared.
- **Unlocked:** `PRAGMA key = x'<hex>'` on `familydata.vault.db`, documents decrypted to a temp path only for preview/export.
- **Auto-lock:** immediate / 1 / 5 / 15 minutes after backgrounding (AppState).

## Test plan

1. Fresh install without security → app works on plaintext DB.
2. Enable security on Dev Build → auth prompt → status “Geschützt”.
3. Kill app → relaunch → lock screen → unlock with biometrics/device code → data visible.
4. Background longer than auto-lock → lock → memory cleared.
5. Add document → file appears under `familydata-encrypted/*.dat`, not plaintext.
6. Preview/export works; after lock, temp decrypt folder is empty.
7. Disable security (confirm) → data readable again, master key deleted.
8. Expo Go: enabling security shows clear “Dev Build required” for SQLCipher.
9. Identifikation still requires auth when session is not already unlocked.
10. No secrets in logs (avoid logging key material / plaintext file contents).

## Explicit non-goals (by design)

- No custom PIN/password verifier in the app
- No cloud backup / account recovery
- No shipping raw keys in source, AsyncStorage, or shared preferences plaintext
