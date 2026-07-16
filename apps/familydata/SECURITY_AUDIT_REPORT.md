# FamilyData – Security Audit Report

**Audit type:** Static / architecture review (code & config)  
**Scope:** `apps/familydata` on branch with vault security (`84c3198` and equivalent)  
**Auditor role:** Senior Mobile Application Security Engineer  
**Date:** 2026-07-16  
**Constraint:** No application code changes in this engagement — findings and recommendations only.

**Runtime note:** Full on-device tests (live biometrics, physical vault.db extraction, App Switcher screenshots) could not be executed in this CI/cloud agent environment (no device, no committed `android/` / `ios/` native trees). Those phases are evaluated from **code-path analysis** and marked as *Code-derived expectation* vs *Not executed on device*.

---

# Zusammenfassung

FamilyData hat eine **nachvollziehbare Vault-Architektur** (SecureStore-Master-Key, SQLCipher-Plugin, AES-256-GCM für Dateien, App-Lock, Auto-Lock). Die Bausteine sind grundsätzlich richtig gewählt und es gibt **keine Hardcoded Secrets** und **kein AsyncStorage** für Schlüsselmaterial.

Als produktiver Offline-Tresor ist die Implementierung jedoch **noch nicht ausreichend abgesichert**, vor allem weil:

1. **Sicherheit ist optional (Default: aus)** → Klartext-DB und Klartext-Dateien sind der Normalzustand.
2. Der Master Key wird nach App-Auth **mit `requireAuthentication: false`** aus SecureStore geladen; Create kann auf ungeschützte Speicherung zurückfallen.
3. Nach Lock bleiben **entschlüsselte Preview-Inhalte** (React State / WebView / expo-image) potenziell im Speicher, obwohl der Zustand-Store geleert wird.
4. **Backup- und Screenshot-Schutz** fehlen in der Expo-Konfiguration.
5. PDF-Vorschau lädt **PDF.js von einem CDN** und bettet das gesamte Dokument als Base64 in eine WebView ein — Widerspruch zum Offline-Tresor-Anspruch und zusätzliches Leak-Risiko.

**Security Score: 66 / 100**  
**Stufe:** Verbesserungen notwendig (50–75)

Mit zwingend aktiviertem Tresor + Dev-Build (SQLCipher) wäre der Score höher (~75–80), aber der ausgelieferte Default-Pfad und die Memory/Preview-/Backup-Lücken verhindern „produktionsreif“.

---

# Phase 1 – Architekturanalyse

## Stack & Versionen

| Komponente | Nachweis |
| --- | --- |
| Expo SDK | `expo ~54.0.36` — `apps/familydata/package.json` |
| React Native | `0.81.5` — `package.json` |
| Auth | `expo-local-authentication ~17.0.8` |
| Key storage | `expo-secure-store ~15.0.7` |
| RNG | `expo-crypto ~15.0.9` |
| DB | `expo-sqlite ~16.0.10` + plugin `useSQLCipher: true` — `app.json` L36–40 |
| File crypto | `@noble/ciphers ^2.2.0` AES-GCM — `EncryptionService.ts` |
| State | Zustand (`familyStore`, `securityStore`) — kein React Query |

## Native Build

- Keine committeden `android/` / `ios/`-Ordner → Continuous Native Generation / Prebuild.
- Manifest-/Entitlement-Details sind daher nur über `app.json` / EAS ableitbar.
- SQLCipher erfordert Dev Client / APK (`SecurityManager.supportsSqlCipher()` / `Constants.appOwnership === 'expo'`).

## Storage-Layout (Soll)

| Asset | Pfad / Name | Schutz wenn Tresor an |
| --- | --- | --- |
| Plain DB | `familydata.db` | soll nach Migration entfernt werden |
| Vault DB | `familydata.vault.db` | SQLCipher `PRAGMA key` |
| Cipher docs | `familydata-encrypted/*.dat` | AES-256-GCM |
| Temp decrypt | `familydata-decrypt-tmp/` | beim Lock löschen |
| Klartext staging | `familydata-files/` | nur transient / wenn Tresor aus |

## Positive Befunde

- Kein eigenes PIN-Hash-System mehr (entfernt).
- Keine Secrets in Source (Suche nach password/api_key/private key: nur Auth-Kommentare).
- Keine `console.log` von Key-Material in Security-Modulen.
- AES-GCM mit 12-Byte-IV aus `expo-crypto` (`EncryptionService.ts` L14–16, L21–31).
- Lock schließt DB und setzt Key-Hex auf `null` (`SecurityManager.lockApp` L166–172, `repository.closeDatabase` / `configureDatabaseEncryption`).

---

# Phase 2 – Authentifizierung (Code-derived)

| Test | Erwartung | Ergebnis aus Code | Status |
| --- | --- | --- | --- |
| Start ohne Auth, Tresor **an** | keine sensiblen Daten | `securityStore.hydrate` setzt `isLocked: securityEnabled` (L64); `_layout.tsx` L51–55 bootstrapped nicht bei Lock; `AppLockGate` overlay | **PASS** (wenn enabled) |
| Start, Tresor **aus** (Default) | Vault-Anspruch: gesperrt | Bootstrap läuft sofort, Plain-DB `familydata.db`, keine Gate | **FAIL** gegen Vault-Zielbild |
| Biometrie / Gerätecode | Fallback OS-PIN | `disableDeviceFallback: false` — `BiometricService.ts` L44–48 | **PASS** |
| Bio nicht verfügbar | klarer Fehler, kein Unlock | `canAuthenticate` false → `unavailable` L35–41 | **PASS** |
| Auth fehlgeschlagen | keine Session | `unlockApp` returnt bei `!auth.ok` ohne `establishSession` — `SecurityManager.ts` L147–148 | **PASS** |
| App-Neustart | erneut Auth | `hydrate` → `isLocked: true` wenn enabled; Session-Key nur in Memory | **PASS** (wenn enabled) |

**Risiko:** App ist ohne explizites „Sicherheit aktivieren“ ein normaler lokaler Datenspeicher, kein Tresor.

---

# Phase 3 – Key Management (Code-derived)

## Wo liegt der Key?

- SecureStore Item: `familydata.vault.masterKey.v1` — `KeyStoreService.ts` L12, L54–66.
- Accessibility: `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — L17.
- Nicht in AsyncStorage (kein AsyncStorage-Import in der App).

## Ist der Key aus JS erreichbar?

**Ja — by design und zusätzlich abgeschwächt:**

1. Nach erfolgreichem `authenticateUser` lädt Unlock den Key mit **`getMasterKey(false)`** — `SecurityManager.ts` L152.
2. `createMasterKey` fällt bei Fehlern auf Speicherung **ohne** `requireAuthentication` zurück — `KeyStoreService.ts` L61–64.
3. `getMasterKey` fängt Fehler ab und liest erneut mit `requireAuthentication: false` — L72–78.
4. Während der Session: `sessionKey` in `SecurityManager` (L27–28, L186–193) und parallel `encryptionKeyHex` in `repository.ts` L15–18, L437.

## Wird der Key beim Lock entfernt?

- `wipeBytes(this.sessionKey); this.sessionKey = null` — `SecurityManager.ts` L167–168.
- `configureDatabaseEncryption(null)` — L172.
- **Einschränkung:** JS-String/`Uint8Array`-Wipe ist best-effort; GC kann Kopien behalten (auch im Report der Implementierung dokumentiert).

## Versuch Key ohne Auth

- *Nicht on-device ausgeführt.*
- Code-Pfad: Wer `KeyStoreService.getMasterKey(false)` aufrufen kann (compromised JS / Debugger) und der Key wurde ohne Keychain-Auth-Binding gespeichert → **Erwartung: SUCCESS für Angreifer** → Verstoß gegen gewünschtes FAIL.
- Wenn Key wirklich mit `requireAuthentication: true` gebunden ist und Lesen mit `false` vom OS abgelehnt wird, bleibt die App-LocalAuthentication die einzige Hürde vor dem erfolgreichen Lesen mit `true` — aber der Unlock-Code versucht bewusst `false`.

---

# Phase 4 – Datenbank (Code-derived)

| Prüfung | Befund |
| --- | --- |
| Vault-Datei ohne Key öffnen | Mit SQLCipher + gesetztem Key: Standard-SQLite sollte scheitern. *On-device nicht ausgeführt.* Code setzt `PRAGMA key = "x'<hex>'"` nur bei `encryptionKeyHex` — `repository.ts` L433–437. |
| Plain-DB Default | Ohne Security: `PLAIN_DB_NAME` ohne PRAGMA — vollständig lesbar. |
| Connection nach Lock | `closeDatabase()` + `dbPromise = null` — `repository.ts` L21–30; aufgerufen aus `lockApp`. **PASS** |
| Key in SQL-String | Key als Hex in `execAsync` Template — kurzzeitig in JS/SQL-Layer sichtbar. |

---

# Phase 5 – Dokumente (Code-derived)

| Prüfung | Befund |
| --- | --- |
| AES-256-GCM + IV | `EncryptionService.ts` — GCM, 12-Byte IV, Version-Byte-Prefix. **PASS** |
| Dateinamen | SHA256 über `Date.now()` + `Math.random()` — `DocumentEncryptionService.ts` L86–89. Nicht ratebar wie Klartextnamen, aber `Math.random()` ist kein CSPRNG. **MEDIUM** |
| Klartextreste | Staging `familydata-files/` in `files.ts` L116–122; Verschlüsselung nur wenn Security **an und unlocked** (`SecurityManager.encryptIncomingFile` L175–177). Bei Security aus: dauerhaft Klartext. |
| Temp-Dateien | `familydata-decrypt-tmp/`; `clearDecryptedTemps` on lock — L131–137 / `lockApp`. **PASS** für Disk-Temps |
| Manipulation ciphertext | `decryptBytes` wirft generische Fehler ohne Key-Leak — `EncryptionService.ts` L36–48. **PASS** |
| secureDelete | Zero-Overwrite nur wenn size &lt; 8MB — L49–55; darüber nur delete. Flash-Storage: Wipe ohnehin unsicher. **LOW** |

---

# Phase 6 – Cache & Memory (Code-derived)

| Bereich | Nach Lock? | Nachweis |
| --- | --- | --- |
| Zustand `people` / `documents` / `familyName` | geleert | `securityStore.wipeSensitiveUiState` L37–43 |
| React Query | n/a | nicht verwendet |
| Temp decrypt files | gelöscht | `clearDecryptedTemps` |
| Document Preview `useState` (`readableUri`, `pdfHtml`) | **nicht** geleert | `document/[id].tsx`, `FilePreview.tsx` L78–90 — Screen bleibt unter Overlay gemountet (`_layout.tsx` Stack + `AppLockGate`) |
| `expo-image` / WebView memory | **nicht** explizit cleared | `FilePreview.tsx` L102–137 |
| PDF Base64 in HTML-String | bleibt in Component-State | `FilePreview.tsx` L90, L128–129 |
| `encryptionKeyHex` | null gesetzt | `configureDatabaseEncryption(null)` |

**Ergebnis Phase 6:** Disk-Temps und Store OK; **UI/WebView-Memory FAIL** gegen strikte Vault-Anforderung.

---

# Phase 7 – Background / App Switcher (Code-derived)

- Auto-Lock via `AppState` — `securityStore.ts` L68–97.
- Default Auto-Lock: `'1'` (1 Minute) — L51, `settingsFlags` Default.
- Bei `immediate`: Lock auf `background`/`inactive`.
- Timer wird bei Rückkehr auf `active` gecancelt; nachträglicher Lock wenn elapsed ≥ Threshold — L86–94.
- **App Switcher / Task Preview:** Kein `FLAG_SECURE`, kein Privacy-Screen → *Erwartung: Dokumentinhalt kann im Switcher sichtbar sein* (**FAIL**, config).

---

# Phase 8 – Screenshot-Schutz

| Plattform | Erwartung | Befund |
| --- | --- | --- |
| Android `FLAG_SECURE` | gesetzt | **Nicht vorhanden** in `app.json` / kein Secure-Flag-Plugin / kein nativer Code im Repo |
| Screen recording | blockiert | nicht konfiguriert |

**Empfehlung:** Expo Config Plugin oder Dev-Client-Modul für `FLAG_SECURE` (Android) und iOS Screenshot-Notify / blur on resign active.

---

# Phase 9 – Backup Security

| Plattform | Erwartung | Befund |
| --- | --- | --- |
| Android `android:allowBackup` | `false` oder verschlüsselte Backups ausschließen | **Nicht gesetzt** in `app.json` → Default oft `true` nach Prebuild |
| iOS Backup exclusion | Files excluded from iCloud/iTunes backup | **Nicht gesetzt**; SecureStore-Keys sind device-bound, aber Vault-DB/`.dat` liegen in Documents |

**Risiko:** Unverschlüsselte Daten (Security aus) oder ciphertext+Keystore-Szenarien in Cloud-Backups — spoiler: ciphertext ohne Key ist OK, Klartext-Default nicht.

---

# Phase 10 – Root / Jailbreak

- Keine Erkennung im Code (Suche: keine Treffer).
- **Empfehlung:** Optional Play Integrity / einfache Heuristik als **Warnung**, nicht als alleinige Kontrolle. Gegenüber Root hilft vor allem Hardware-backed Keystore + keine exportierbaren Keys; das ist hier nur teilweise gegeben (Key exportierbar nach JS).
- **Nicht automatisch implementieren** (laut Auftrag).

---

# Phase 11 – Error Handling

| Fall | Verhalten | Leak? |
| --- | --- | --- |
| Key fehlt | „Kein Master-Key vorhanden.“ | nein |
| Decrypt fail | generische Meldung | nein — `EncryptionService.ts` L48 |
| Bio unavailable | Systemeinstellungen-Hinweis | nein |
| Expo Go SQLCipher | klare Dev-Build-Meldung | nein — `SecurityManager.ts` L73–76 |
| Auth errors | `result.error` String kann an UI gehen — `BiometricService.ts` L59–62 / Lock-Gate | gering (OS-Errorcodes, keine Keys) |
| PDF WebView CDN fail | UI-Fehler | nein, aber Netzabhängigkeit |

Keine Key-Logs gefunden. **Grundsätzlich OK**, mit Ausnahme der PDF-Base64-Einbettung (Datenexposition, kein Error-Leak).

---

# Gefundene Risiken

## CRITICAL

### C1 – Tresor-Schutz ist opt-in; Default unverschlüsselt
- **Beschreibung:** Ohne Nutzeraktion `securityEnabled === false`. App bootstrapped Klartext-DB und speichert Dateien unter `familydata-files/`.
- **Risiko:** Verlust/Diebstahl des Geräts oder Backup → vollständige Datenpreisgabe. Widerspricht „lokaler Tresor“-Claim.
- **Dateien:** `securityStore.ts` L48–64; `_layout.tsx` L51–55; `repository.ts` L7–8, L433–435; `files.ts` L116–122; `settings/security.tsx` (Enable-Flow).
- **Empfehlung:** Security-on-by-default nach Setup; oder First-run Force-Enable bevor Daten angelegt werden; Plain-Modus nur als expliziter Dev-Flag.
- **Aufwand:** M (1–2 Tage inkl. Migration UX)

---

## HIGH

### H1 – Master Key wird ohne SecureStore-Auth-Gate gelesen / Fallback ohne Biometrie-Binding
- **Beschreibung:** Unlock nutzt `getMasterKey(false)`. Create kann Key ohne `requireAuthentication` speichern. Fallback-Read mit `false`.
- **Risiko:** Nach Umgehung der JS-Auth-Schicht (Frida, debuggable build, XSS-ähnliche RN-Bugs) ist Key lesbar; Keystore-UserPresence wird nicht konsequent erzwungen.
- **Dateien:** `SecurityManager.ts` L85, L124, L152; `KeyStoreService.ts` L45–47, L61–64, L72–78.
- **Empfehlung:** Key immer mit `requireAuthentication: true` speichern; Lesen nur mit Auth; keinen Silent-Fallback auf `false` in Production; ideal langfristig: non-exportable Keystore keys + native crypto.
- **Aufwand:** M

### H2 – Entschlüsselte Preview überlebt App-Lock im UI-Memory
- **Beschreibung:** Lock leert Zustand-Store und Temp-Files, unmountet aber nicht Document-Screens. `FilePreview` hält PDF als Base64-HTML; Images bleiben gemountet.
- **Risiko:** Memory forensics / Accessibility / kurze Overlay-Bypass-Szenarien zeigen noch Klartext.
- **Dateien:** `AppLockGate.tsx` L19+ (Overlay only); `_layout.tsx` L96–124; `FilePreview.tsx` L78–137; `document/[id].tsx`.
- **Empfehlung:** Bei Lock Navigation reset / unmount sensitive routes; `pdfHtml`/`uri` clear; Image cache clear; optional separate privacy screen.
- **Aufwand:** S–M

### H3 – Kein Screenshot / Recents-Schutz (`FLAG_SECURE`)
- **Beschreibung:** Keine Konfiguration gefunden.
- **Risiko:** App Switcher und Screenshots exponieren Ausweise/Dokumente.
- **Dateien:** `app.json` (fehlend); kein natives Modul.
- **Empfehlung:** Android `FLAG_SECURE`; iOS blur on `resignActive`.
- **Aufwand:** S

### H4 – Backup-Policy fehlt (`allowBackup` / iOS exclusion)
- **Beschreibung:** Nicht in `app.json` gesetzt.
- **Risiko:** Auto-Backup kann Klartext-DB/Dateien erfassen wenn Security aus; auch Ciphertext-Dateien landen in Backups.
- **Dateien:** `app.json` L25–32.
- **Empfehlung:** `android.allowBackup: false` (oder gezielte exclusion); iOS `UIFileSharingEnabled`/`backup` exclusions für DB/encrypted dirs.
- **Aufwand:** S

### H5 – PDF-Preview über CDN + vollständiges Dokument in WebView
- **Beschreibung:** `pdf.js` von `cdnjs.cloudflare.com`; gesamtes PDF als Base64 in HTML; WebView mit `allowFileAccess`, `allowUniversalAccessFromFileURLs`, `originWhitelist=['*']`.
- **Risiko:** Netzbedarf, Supply-Chain/CDN, große Klartextkopie in WebView, erweiterte Angriffsfläche.
- **Dateien:** `FilePreview.tsx` L23, L50–51, L89–90, L127–137.
- **Empfehlung:** Bundled/local PDF renderer; keine CDN; WebView stark einschränken oder native Preview.
- **Aufwand:** M

---

## MEDIUM

### M1 – SQLCipher nur in Dev Build; Expo Go täuscht Teilschutz vor
- **Dateien:** `SecurityManager.ts` L30–37, L73–76; `app.json` L36–40; `SECURITY_IMPLEMENTATION.md`.
- **Empfehlung:** Store/README klar; Feature-Flag UI; CI nur SQLCipher-Builds als „Vault“.
- **Aufwand:** S

### M2 – Session-Key zusätzlich als Hex-String im DB-Modul
- **Dateien:** `repository.ts` L15–18, L437.
- **Empfehlung:** Key nur transient an `open`, danach aus Modulvariable entfernen; oder native open wrapper.
- **Aufwand:** S

### M3 – Dateinamen aus `Math.random()` abgeleitet
- **Dateien:** `DocumentEncryptionService.ts` L86–89.
- **Empfehlung:** `expo-crypto.getRandomBytesAsync` für Namen.
- **Aufwand:** XS

### M4 – Auto-Lock Default 1 Minute; `inactive` kann UX/Security tradeoff sein
- **Dateien:** `securityStore.ts` L51, L73–83.
- **Empfehlung:** Default `immediate` für Vault-Profil; dokumentieren.
- **Aufwand:** XS

### M5 – Identifikation überspringt Re-Auth in entsperrter Session
- **Dateien:** `access.ts` L9–11.
- **Empfehlung:** Optional Step-up für Identifikation (separate sensitive gate).
- **Aufwand:** S

---

## LOW

### L1 – secureDelete unvollständig auf Flash / große Dateien
- **Dateien:** `DocumentEncryptionService.ts` L41–59.
- **Empfehlung:** Akzeptieren + dokumentieren; optional file-size always unlink only.

### L2 – Legacy `identification`-Tabelle wird noch mitkopiert
- **Dateien:** `repository.copyAllTablesBetween` L76.
- **Empfehlung:** Schema bereinigen, keine parallelen PII-Tabellen.

### L3 – Keine Root/Jailbreak-Warnung
- **Empfehlung:** Optional, nicht als Primary Control.

---

# Security Score

| Kategorie | Gewicht | Note (0–10) | Beitrag |
| --- | --- | --- | --- |
| AuthN (native) | 15% | 8 | 12.0 |
| Key management | 20% | 5 | 10.0 |
| DB encryption | 15% | 7 | 10.5 |
| File encryption | 15% | 7 | 10.5 |
| Lock / session hygiene | 15% | 5 | 7.5 |
| Platform hardening (backup/screenshot) | 10% | 2 | 2.0 |
| Default secure posture | 10% | 3 | 3.0 |
| **Total** | | | **~66** |

**66 / 100 — Verbesserungen notwendig**

---

# Priorisierte Roadmap (ohne Umsetzung in diesem Audit)

1. **C1** Security by default / forced enable before data  
2. **H1** SecureStore `requireAuthentication` hard-enforce, remove `false`-fallback in prod  
3. **H2** Unmount/clear previews on lock  
4. **H3 + H4** FLAG_SECURE + allowBackup false  
5. **H5** Offline PDF preview, harden WebView  
6. M1–M5 nachziehen  

---

# Tests, die on-device noch manuell laufen sollten

1. Vault enable → Datei `familydata.vault.db` auf Desktop kopieren → mit DB Browser ohne Key öffnen → muss scheitern.  
2. Biometrie abbrechen / lockout → UI zeigt Fehler, Store leer.  
3. Dokument öffnen → Home → sofortiger Auto-Lock → Recents-Thumbnail prüfen.  
4. Screenshot während Dokumentvorschau (Android).  
5. `adb backup` / Gerätebackup nach Klartext-Session vs. Vault-Session.  

---

# Abschluss

Die Architektur ist ein **solider Entwurf** für eine Expo-basierte Vault-App, aber die **Default-Konfiguration und Session/UI-Restgefahren** verhindern eine Freigabe als produktionsreifer Tresor. Nach Behebung von C1 und H1–H5 ist ein Score im Bereich **80+** realistisch.
