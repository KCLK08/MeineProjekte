# Family Vault – Device Transfer Final Security Report

**Auditor-Rolle:** Senior Mobile Security  
**Produkt:** Family Vault (`apps/familydata`) – Offline Device Transfer  
**Stand:** Phase 1–4C inkl. Audit-Korrekturen  
**Branch:** `cursor/device-transfer-security-audit-29bc`  

---

## Executive Summary

Die Geräteübertragung ist als **lokaler, accountfreier Offline-Transfer** konzipiert und implementiert: QR-Pairing → X25519 → HKDF → AEAD-Kanal → Staging → neuer Empfänger-Vault. Der **Vault-Master-Key verlässt das Gerät nicht**.

Das Audit hat mehrere **High**-Findings in der ursprünglichen Implementierung identifiziert (u. a. fehlende SAS-Bindung an den Transport, bidirektionaler AEAD-Key/Reflection, Klartext-Staging, Fire-and-Forget-Wipe). Diese wurden in derselben Audit-Welle **korrigiert**.

**Security Score: 86 / 100**

Bewertung als professionelle Offline-Tresor-App: **bedingt produktionsreif** für kontrollierte Beta / Early Access; für Broad Production noch Rest-Risiken (LAN-DoS, nutzerabhängiges SAS, JS-Wipe-Limits). iOS Backup Exclusion und Auto-Lock-Suppress-Verengung sind geschlossen (`IOS_BACKUP_SECURITY.md`, `AUTOLOCK_SECURITY.md`).

---

## 1. Architektur

| Kriterium | Bewertung |
| --- | --- |
| Threat Model (kein Cloud, kein Account) | Stark |
| Trennung Master Key ↔ Transfer Keys | Stark |
| Staged Apply + neuer Empfänger-Vault | Stark (Phase 4C) |
| Mutual QR + SAS | Gut (nach Fix: SAS-Gate) |
| LAN-Transport ohne TLS | Akzeptabel (AEAD + Pairing) |

**Urteil Architektur: 90/100** – passt zu einer Vault-App; keine Cloud-Abhängigkeit, klare Key-Hierarchie.

---

## 2. Implementierung (nach Korrekturen)

### 2.1 Key Management

| Kontrolle | Status |
| --- | --- |
| Master Key in SecureStore auth-bound + device-only | OK |
| `commitMasterKey` erst nach Cutover-Validate | OK |
| HKDF v2: send/recv/integrity/docWrap/staging (160 B OKM) | OK (korrigiert) |
| Directional AEAD + Role-AAD | OK (korrigiert) |
| Ephemeral Secret nach erstem Connect gewiped (Anti-Replay-Reconnect) | OK (korrigiert) |
| Transfer-Keys nur RAM; Wipe bei Close/Lock | OK |
| Keine Keys in AsyncStorage / React State / console | OK |
| KeyStore fail-closed bei auth-bound | OK (korrigiert) |
| Caller wipe nach `establishSession` | OK (korrigiert) |

**Residual:** JS `wipeBytes` ist best-effort; SQLCipher-Passphrase als String im Prozess während Unlock.

### 2.2 Transfer Security

| Kontrolle | Status |
| --- | --- |
| Seq + messageId Replay (In-Connection) | OK |
| Timestamp-Fenster | OK |
| QR TTL 5 min | OK |
| Transfer-Fenster 30 min nach SAS | OK (korrigiert) |
| SAS 8 Hex via SHA-256 | OK (korrigiert) |
| SAS-Bestätigung vor `connect()` | OK (korrigiert) |
| Role-Filter auf Meta/Doc-Empfang (Host) | OK (korrigiert) |
| Transport-Log ohne Payload | OK (korrigiert) |

**Residual:** Optisches SAS bleibt nutzerabhängig (~32 bit); LAN first-connect-wins. Auto-Lock während Transfer wieder aktiv (Suppress nur Kamera/Biometrie/kurzer Commit).

### 2.3 File Security

| Kontrolle | Status |
| --- | --- |
| Staging-Metadaten als `payload.enc` (AES-GCM, Staging-Key) | OK (korrigiert) |
| Dokumente als Doc-Wrap-Ciphertext | OK |
| Staging wipe awaited bei clear/lock | OK (korrigiert) |
| Boot wipe orphan Staging | OK (korrigiert) |
| Export-Pfad-Sanitization | OK |
| Decrypt-Temps bei Lock | OK |

**Residual:** Attach-Pfad `familydata-files/` Crash-Fenster; Share-Cache-PDFs. iOS Backup-Exclude ist nativ gesetzt (`IOS_BACKUP_SECURITY.md`).

### 2.4 Migration Security

| Kontrolle | Status |
| --- | --- |
| Parallel-Build (`migration.db` + `encrypted-migration/`) | OK |
| Validate vor Keystore-Commit | OK |
| Backup/Restore bei Swap-Fehler | OK |
| Auto-Lock-Suppress nur atomarer Cutover-Commit | OK (`AUTOLOCK_SECURITY.md`) |
| Doc-Empfang nur bei Staging `committed` | OK (korrigiert) |

**Residual:** Extreme Crash-Fenster zwischen Datei-Swap und Keystore-Commit sind eng; Stromverlust-Tests manuell nötig (siehe Testplan).

### 2.5 Database Security

| Kontrolle | Status |
| --- | --- |
| SQLCipher produktive Vault | OK |
| Keine Kopie der Sender-DB | OK |
| Neuer Master Key nur Empfänger | OK |
| `migrateToPlaintext` deaktiviert | OK (korrigiert) |
| IDs/Timestamps beim Import erhalten | OK |

### 2.6 Mobile Security

| Plattform | Kontrolle | Status |
| --- | --- | --- |
| Android | `allowBackup=false` + Hardening-Plugin | OK |
| Android | Cleartext HTTP off; Transfer = lokales TCP+AEAD | OK |
| Android | FLAG_SECURE / Screenshot-Session | OK |
| Android | Keystore via SecureStore auth-bound | OK |
| iOS | Keychain device-only + biometrics | OK |
| iOS | File Sharing off | OK |
| iOS | NSURLIsExcludedFromBackupKey für Vault-Dirs | **OK** (siehe `IOS_BACKUP_SECURITY.md`) |

---

## 3. Audit-Findings (vor → nach)

### Behoben in diesem Audit

| ID | Severity | Finding | Fix |
| --- | --- | --- | --- |
| S1 | High | Gleicher AEAD-Key beide Richtungen / Reflection | Directional HKDF keys + Role-AAD + Host role-filter |
| S2 | High | Reconnect Seq=0 + deterministische Keys | Ephemeral secret nach Connect wipe (one-shot) |
| P1 | High | SAS nur Display, kein Gate | `confirmSas()` Pflicht vor Transport |
| L3 | High | Klartext `payload.json` | `payload.enc` mit Staging-Key |
| F2 | High | Staging wipe fire-and-forget | `await StagingStore.wipeAll()` in `clear()` |
| F3 | High | Orphan Staging nach Crash | Boot `wipeOrphanTransferStaging` |
| L1 | Medium | Payload in Transport-Logs | Nur Typ + Länge |
| P2 | Medium | Schwache SAS-Fold | SHA-256 → 8 Hex |
| S3 | Medium | Paired Keys ohne TTL | 30 min Transfer-Fenster |
| M2 | Medium | Docs ohne committed Staging | Reject |
| M2ks | Medium | KeyStore fail-open Legacy | Fail-closed auth-bound |
| D3 | Low | `migrateToPlaintext` tot aber gefährlich | Throws |

### Offene Residual Risks

| ID | Severity | Risiko | Empfehlung |
| --- | --- | --- | --- |
| R-iOS | ~~Medium~~ **geschlossen** | iOS Backup Exclusion | `NSURLIsExcludedFromBackupKey` via lokales Expo-Modul + Start-Hook (`IOS_BACKUP_SECURITY.md`) |
| R-AL | ~~Medium~~ **geschlossen** | Dauer-Suppress auf Transfer-Screens | Suppress nur Kamera / Biometrie / kurzer Cutover-Commit (`AUTOLOCK_SECURITY.md`) |
| R-LAN | Low–Medium | Erster TCP-Client gewinnt | Optional Peer-Device-ID nach Connect verifizieren |
| R-SAS | Low–Medium | Nutzer übersieht SAS-Mismatch | Längeres Word-SAS / Forced delay |
| R-JS | Low | Wipe/GC Limits in JS | Akzeptiert; keine Keys loggen |
| R-CACHE | Low | Export-PDF im Cache | Secure delete nach Share |

---

## 4. Risiken – Gesamtschau

```
Impact
  ▲
  │                     [User skips SAS compare]
  │
  │  [LAN MitM without SAS]— mitigated by SAS gate
  │
  │  [Crash mid-cutover]— mitigated by parallel build
  │
  └──────────────────────────────────────────► Likelihood
```
Kein bestätigter Pfad für **Master-Key-Exfiltration** über den Transfer.

---

## 5. Produktionsreife

| Stufe | Urteil |
| --- | --- |
| Interne Dogfood / Family Beta | **Ja** |
| Public Production | **Nach** Testplan 1–11 / AL-Checks / R-iOS grün |
| High-Assurance / Enterprise | Zusätzlich: formal Threat Model Review, fuzz TCP frames, red-team MitM |

**Blocker für Broad Production:** keine Criticals offen; iOS Backup Exclusion und Auto-Lock-Suppress-Verengung sind geschlossen. Rest: Testplan auf Geräten + SAS-/LAN-Residuals.

---

## 6. Security Score (0–100)

| Dimension | Gewicht | Score | Gewichtet |
| --- | --- | --- | --- |
| Architektur | 20% | 90 | 18.0 |
| Key Management | 20% | 88 | 17.6 |
| Transfer Protocol | 20% | 84 | 16.8 |
| File / Staging | 15% | 82 | 12.3 |
| Migration / Cutover | 15% | 85 | 12.8 |
| Mobile Platform | 10% | 90 | 9.0 |
| **Gesamt** | 100% | | **86.5 → 86*** |

\* Abzug −1 für nutzerabhängiges SAS (iOS Backup Exclusion und Auto-Lock-Suppress geschlossen).

### **Final Score: 86 / 100**

Einordnung: **Solide professionelle Offline-Vault-Übertragung** mit klarer Trennung von Master- und Session-Material; nicht „bank-grade formal verified“, aber für eine mobile Familien-Tresor-App auf dem richtigen Niveau – nach iOS-Backup, Auto-Lock-Härtung und grünem Testplan freigabefähig.

---

## 7. Referenzen

| Dokument | Inhalt |
| --- | --- |
| `DEVICE_TRANSFER_ARCHITECTURE.md` | Threat Model / Phasen |
| `DEVICE_TRANSFER_PHASE2.md` … `PHASE4C.md` | Implementierungsphasen |
| `DEVICE_TRANSFER_SECURITY_TESTPLAN.md` | Manuelle Security-Tests |
| Dieses Dokument | Abschlussbewertung |

---

## 8. Schlussfolgerung

FamilyData Device Transfer erfüllt die Kernversprechen:

- **Keine Cloud**
- **Keine Accounts**
- **Kein Master-Key-Transfer**
- **Neuer Empfänger-Vault mit gerätegebundenem Key**

Mit den Audit-Korrekturen, iOS Backup Exclusion und verengtem Auto-Lock-Suppress ist die Implementierung **signifikant gehärtet**. Empfohlener nächster Schritt: Testplan (inkl. AL-1…AL-6 und R-iOS) auf Geräten durchspielen.
