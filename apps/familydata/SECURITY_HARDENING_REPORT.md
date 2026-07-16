# Family Vault – Security Hardening Report

**Audit-Baseline:** 66/100 (`SECURITY_AUDIT_REPORT`)  
**Nach Hardening (Code-Review / Design):** **88/100**  
**Datum:** 2026-07-16  
**Scope:** Nur Security Hardening – keine Produkt-Features.

---

## 1. Umgesetzte Änderungen

### 1.1 Default Security Mode (C1)

| Vorher | Nachher |
| --- | --- |
| Sicherheit opt-in; Klartext-DB möglich | Vault **verpflichtend** auf SQLCipher-Builds |
| `disableSecurity()` entschlüsselte Daten | `disableSecurity()` wirft – Klartextbetrieb verboten |
| Neue Installationen starteten offen | Setup erzeugt Master Key + SQLCipher-Vault + Dokumentverschlüsselung |

- `SecurityManager.isSecurityEnabled()` → immer `true` wenn SQLCipher verfügbar
- `ensureVaultInitialized()` für Neuinstallation und Klartext → Vault Migration
- `persistAttachment()` speichert Anhänge **nur** verschlüsselt (kein Klartext-Fallback)
- Expo Go: App bleibt gesperrt mit Hinweis auf Dev Build / APK

### 1.2 Master Key Security (H1)

| Vorher | Nachher |
| --- | --- |
| Key konnte ohne Auth gelesen werden (`requireAuthentication` optional / Fallback) | Neue Keys immer mit `requireAuthentication: true` |
| `hasMasterKey()` lud ggf. Material | Meta-Flag only – kein Key-Load |
| Legacy unbound Keys blieben schwach | Einmalige Re-Wrap auf auth-bound Storage |

- Bindung an **Biometrie / Gerätecode** über Android Keystore / iOS Keychain (`expo-secure-store`)
- Unlock-Pfad: `LocalAuthentication` → auth-bound `getMasterKey()`
- Ohne erfolgreiche OS-Auth: kein Key, keine DB-Session

**Hinweis zu expo-secure-store:** Auth-Binding ist plattformseitig ausreichend für „ohne Auth kein Key“. Zusätzliche native Keystore-JNI-Schicht wurde nicht nötig; Meta-Flag `auth-bound-v2` dokumentiert den Zustand.

### 1.3 Document Preview Cleanup (H2)

Beim Lock (`securityStore.lock` → `SecurityManager.lockApp`):

- Session-Key wird gewiped
- SQLCipher-DB geschlossen, Key aus PRAGMA entfernt
- `DocumentEncryptionService.clearDecryptedTemps()` löscht Temporärdateien
- Family-Store (Personen/Dokumente) geleert
- `wipeToken` + `previewSession.wipeAllPreviews()`:
  - PDF Base64 / HTML in `FilePreview` entfernt
  - WebView neu gemountet (`key`)
  - Image Memory/Disk Cache geleert
- Dokument-Screen setzt `readableUri` / `doc` zurück

React Query: in Family Vault **nicht** im Einsatz – entfällt.

### 1.4 Screenshot-Schutz (H3)

- `expo-screen-capture` → `preventScreenCaptureAsync('familydata-vault')` (Android **FLAG_SECURE**)
- iOS: zusätzlich `enableAppSwitcherProtectionAsync`
- Plugin in `app.json`

### 1.5 Backup-Schutz (H4)

- `android.allowBackup: false` in `app.json`
- Config Plugin `plugins/withAndroidHardening.js` setzt Manifest-Flags hart
- iOS: `UIFileSharingEnabled` / `LSSupportsOpeningDocumentsInPlace` = false

### 1.6 PDF Security (H5)

| Vorher | Nachher |
| --- | --- |
| PDF.js von CDN | Vendored lokal: `assets/pdfjs/pdf.min.txt` + Worker |
| Online-Abhängigkeit | Offline über Bundle + `pdfPreview.ts` |

Metro: `.txt` als Asset-Extension für die gebündelten Quellen.

---

## 2. Verifikation (Checkliste)

| Anforderung | Status | Nachweis |
| --- | --- | --- |
| Key ohne Auth nicht erreichbar | ✅ Design | `KeyStoreService` + `requireAuthentication: true` |
| DB ohne Key nicht lesbar | ✅ Design | SQLCipher nur mit Session-Hex nach Unlock |
| Dokumente verschlüsselt | ✅ Design | AES-GCM `.dat`; `persistAttachment` erzwingt Encryption |
| Lock entfernt Preview/Temps/UI | ✅ Design | `lockApp` + `wipeToken` + preview wipe |
| Screenshot blockiert | ✅ Code | `ScreenCapture.preventScreenCaptureAsync` |
| Backup deaktiviert | ✅ Config | `allowBackup: false` + Manifest-Plugin |

**Geräte-Tests** (APK / Dev Build) empfohlen vor Release: Biometrie-Prompt, Migration Legacy-DB, Recent-Apps blank, `adb backup` abgelehnt.

---

## 3. Score vorher / nachher

| Kategorie | Vorher | Nachher | Kommentar |
| --- | --- | --- | --- |
| Default Secure | 4/15 | 14/15 | Vault mandatory; Expo Go bleibt Blocker |
| Key Binding | 8/15 | 14/15 | Auth-bound + Legacy-Migration |
| Memory / Lock Wipe | 7/15 | 13/15 | Preview + Temps + Store |
| Screenshot / Recent | 0/10 | 9/10 | FLAG_SECURE; iOS Overlay |
| Backup | 2/10 | 9/10 | Manifest + Plugin |
| Offline PDF | 3/10 | 9/10 | Lokales Bundle |
| Tests / Docs | 6/10 | 8/10 | Dieser Report + bestehende Implementation-Docs |
| **Gesamt** | **66** | **~88** | +22 |

---

## 4. Offene Risiken

1. **Entsperrte Session:** Bei entsperrtem Gerät mit geöffnetem Vault liegen Key und ggf. Preview-Temps im Prozessspeicher – erwartet für lokale Vault-Apps; Auto-Lock (Default: sofort) begrenzt das Fenster.
2. **JS Memory Wipe:** `Uint8Array.fill(0)` ist best-effort; GC/Kopien können Residuen hinterlassen (keine native Secure Enclave Zeroization).
3. **Expo Go:** Kein produktiver Betrieb – SQLCipher fehlt; UI blockiert bewusst.
4. **Export / Share:** „Als PDF speichern“ erzeugt bewusst entschlüsselte Export-Dateien außerhalb des Vaults (User-Aktion).
5. **Root / Compromised OS:** Keystore-Bypass und Memory-Dump bleiben außerhalb des Bedrohungsmodells.
6. **Legacy Meta fehlend:** Sehr alte Keys ohne Meta werden beim ersten erfolgreichen Auth-Read umgebunden; bis dahin ggf. doppelter Prompt.

---

## 5. Geänderte Kernpfade

```
apps/familydata/src/security/KeyStoreService.ts
apps/familydata/src/security/SecurityManager.ts
apps/familydata/src/security/DocumentEncryptionService.ts
apps/familydata/src/security/previewSession.ts
apps/familydata/src/store/securityStore.ts
apps/familydata/src/components/AppLockGate.tsx
apps/familydata/src/components/FilePreview.tsx
apps/familydata/src/utils/pdfPreview.ts
apps/familydata/src/utils/files.ts
apps/familydata/app/_layout.tsx
apps/familydata/app/settings/security.tsx
apps/familydata/app/document/[id].tsx
apps/familydata/app.json
apps/familydata/plugins/withAndroidHardening.js
apps/familydata/assets/pdfjs/*
apps/familydata/metro.config.js
```
