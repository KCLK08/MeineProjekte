# FamilyData – Security Implementation

## Architecture overview

```
                 Android Keystore / iOS Keychain
                              |
                     Master Encryption Key
                     (expo-secure-store, requireAuthentication)
                              |
              ----------------+----------------
              |                               |
              v                               v
     SQLCipher (expo-sqlite)          AES-256-GCM (@noble/ciphers)
     familydata.vault.db              familydata-encrypted/*.dat
```

FamilyData is a **local offline vault**: no cloud, no accounts, no app-owned password database.
On supported builds (Dev Client / APK), **vault mode is mandatory** – no plaintext operation and no disable path.
Unlock uses **native biometrics** with the **system device passcode** as fallback (`expo-local-authentication`).
The master key is stored with `requireAuthentication: true` (Keystore / Keychain).

| Layer | Mechanism |
| --- | --- |
| AuthN | Face ID / fingerprint / device PIN (OS) |
| Key storage | Keychain / Keystore via `expo-secure-store` |
| Database | SQLCipher (`expo-sqlite` + `useSQLCipher: true`) |
| Files | AES-256-GCM, random IV, opaque `.dat` names |
| Session | In-memory key only while unlocked; wiped on lock |
| Screen | `FLAG_SECURE` / screen-capture prevention |
| Backup | Android `allowBackup=false`; iOS file sharing off |

## Encryption

- **Database:** SQLCipher on `familydata.vault.db`. Key is hex-derived from the 256-bit master key for the unlocked session only.
- **Documents:** AES-256-GCM (`@noble/ciphers`). Ciphertext lives under `familydata-encrypted/*.dat`. Preview/export uses short-lived files in `familydata-decrypt-tmp/` (cleared on lock).
- **Inbound attachments:** `persistAttachment` encrypts when the vault is unlocked; plaintext staging is not retained on success.

## Key management

1. First setup creates a 32-byte key via `expo-crypto` CSPRNG.
2. Stored in SecureStore with `requireAuthentication: true` and `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
3. Meta flag `auth-bound-v2` marks binding; legacy unbound keys are re-wrapped once.
4. Unlock: LocalAuthentication → SecureStore auth prompt → session key in memory → SQLCipher `PRAGMA key`.
5. Lock: wipe session bytes, close DB, clear decrypt temps, wipe UI/preview state.

**Without successful OS authentication the master key is not readable.**

## Threat model

**In scope / mitigated**

- Offline extraction of the vault DB without the Keystore-backed key
- Casual access when the app is backgrounded (auto-lock + memory wipe)
- Screenshots / recent-apps previews (`FLAG_SECURE`)
- Cloud/device backup of app data (backup disabled)
- Accidental plaintext document retention (self-test + migration)

**Out of scope / residual**

- Compromised unlocked device while the vault session is open
- OS-level attackers with unlocked Keystore / root
- Best-effort JS memory wipe (no guaranteed physical zeroization)
- User-initiated exports that intentionally leave the vault as plaintext files

## Export behaviour

Export is intentional and leaves the vault:

1. Warning dialog before share/save
2. Decrypted PDF written to app cache and shared via the system share sheet
3. Post-export reminder to delete the file after use
4. Metadata-only `export_history` in the SQLCipher DB (timestamp, document id, type – **no contents**)
5. Security event `export_performed` (no document names)

## Gerätewechsel (device transfer)

Encryption is **device-bound**. Losing the device or moving to a new phone without the original Keystore/Keychain material means data **cannot** be recovered. There is **no** cloud restore by design. Settings → Sicherheit explains this clearly.

## Backup behaviour

- Android: `android.allowBackup: false` + `plugins/withAndroidHardening.js`
- iOS: `UIFileSharingEnabled` / `LSSupportsOpeningDocumentsInPlace` = false
- No cloud sync, no account backup

## Auto-lock

- Default: **immediate** (recommended)
- Options: immediate / 1 / 5 / 15 minutes
- After first vault activation, a one-time prompt asks for the preferred delay

## Local security tooling

- `SecurityAuditService` – offline self-test (Einstellungen → Sicherheit → Sicherheitsprüfung)
- `SecurityEventLog` – encrypted/local event trail (unlock/lock/auth fail/export/…)
- `ExportHistory` – metadata-only export audit

## Expo Go vs Development Build

| Feature | Expo Go | Dev Client / Release APK |
| --- | --- | --- |
| Biometrics | Yes | Yes |
| SecureStore key | Yes | Yes |
| AES file encryption | Yes | Yes |
| SQLCipher DB | **No** | **Yes** |

Vault UI blocks Expo Go. Production requires Dev Client / EAS APK.

## Module map

```
src/security/
  SecurityManager.ts           Vault orchestration
  KeyStoreService.ts           Auth-bound master key
  BiometricService.ts          Native auth
  EncryptionService.ts         AES-256-GCM
  DocumentEncryptionService.ts File encrypt/decrypt/temps
  MigrationService.ts          Plain → vault
  SecurityAuditService.ts      Local self-test
  SecurityEventLog.ts          Event trail
  ExportHistory.ts             Export metadata
  previewSession.ts            Preview wipe on lock
  autoLockPrompt.ts            First-setup auto-lock UX
  runtimeHardening.ts          FLAG_SECURE runtime flag
  settingsFlags.ts             Non-secret SecureStore flags
```

See also `SECURITY_HARDENING_REPORT.md`, `RELEASE_SECURITY_CHECK.md`, `FINAL_SECURITY_REPORT.md`.

## Explicit non-goals

- No custom PIN/password verifier in the app
- No cloud backup / account recovery
- No shipping raw keys in source, AsyncStorage, or shared preferences plaintext
- No telemetry that leaves the device
