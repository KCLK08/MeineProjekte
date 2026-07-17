# Family Vault – iOS Backup Security

**API:** `NSURLIsExcludedFromBackupKey`  
**Modul:** `apps/familydata/modules/ios-backup-exclusion`  
**Aufruf:** App-Start (`app/_layout.tsx` → `IosBackupExclusionService.ensureExcludedAtStartup`)  

---

## Ziel

Sensible Vault-Daten dürfen **nicht** in iCloud- oder iTunes-/Finder-Backups landen.  
Android bleibt unverändert (`allowBackup=false` + Hardening-Plugin).

---

## Implementierte Verzeichnisse

Alle Pfade liegen unter dem App-`Documents`-Sandbox-Root (`FileSystem.documentDirectory`).  
Relative Namen (keine absoluten Pfade in Logs):

| Relatives Verzeichnis | Inhalt |
| --- | --- |
| `SQLite` | SQLCipher Vault (`familydata.vault.db`) |
| `familydata-encrypted` | AES-GCM Dokument-Ciphertexts (`.dat`) |
| `familydata-transfer-staging` | Device-Transfer Staging (`payload.enc`, Wrap-Docs) |
| `familydata-encrypted-migration` | Phase-4C Parallel-Build |
| `familydata-encrypted.pre-cutover` | Phase-4C Rollback-Backup |
| `familydata-decrypt-tmp` | Kurzlebige Klartext-Previews |
| `familydata-files` | Attach-Staging vor Verschlüsselung |

Zusätzlich bleibt in `Info.plist` (bereits vorhanden):

- `UIFileSharingEnabled = false`
- `LSSupportsOpeningDocumentsInPlace = false`

---

## Technische Umsetzung

### Native Schicht (iOS)

Lokales Expo-Modul `IosBackupExclusion`:

```swift
url.setResourceValue(true, forKey: .isExcludedFromBackupKey)
url.getResourceValue(&value, forKey: .isExcludedFromBackupKey)
```

- Keine Pfad-Strings in Exceptions/Logs (nur Fehlercodes)
- Android-Stub: No-Op (JS ruft Exclusion nur unter `Platform.OS === 'ios'` auf)

### JS-Orchestrierung

`IosBackupExclusionService.ensureExcludedAtStartup()`:

1. Nur iOS
2. Native Modul laden
3. Jedes Verzeichnis anlegen (falls fehlend)
4. Flag lesen → fehlende Flags setzen
5. Erneut verifizieren
6. Aggregiertes Ergebnis **ohne Pfade** zurückgeben

### App-Start

In `app/_layout.tsx` (neben Screenshot-Schutz / Staging-Wipe):

```ts
IosBackupExclusionService.ensureExcludedAtStartup()
```

### Security Audit

`SecurityAuditService` → Check `backup_protection` auf iOS prüft:

- File Sharing aus **und**
- alle Exclude-Verzeichnisse mit gesetztem Flag

---

## Testanleitung (R-iOS)

**Voraussetzung:** iOS Development- oder Release-Build (nicht Expo Go).

### A. Automatisiert in der App

1. App starten (kalt)
2. Einstellungen → Sicherheit → Security-Check ausführen
3. Check **„Backup-Schutz aktiv“** muss OK sein  
   Detail enthält: `NSURLIsExcludedFromBackupKey (N Verzeichnisse)`

### B. Manuell mit Xcode / Simulator (ohne Pfade loggen)

1. App einmal starten, damit Verzeichnisse angelegt und geflaggt werden
2. In Xcode → Device / Container → App-Documents prüfen **oder** kleines Debug-Snippet (nur lokal, nicht committen):

```swift
var value: AnyObject?
(url as NSURL).getResourceValue(&value, forKey: .isExcludedFromBackupKey, error: nil)
// expect (value as? NSNumber)?.boolValue == true
```

3. Optional: iCloud-Backup-Simulation – App-Daten sollten nicht in Backup-Schätzungen für Documents erscheinen (OS-abhängig schwer zu visualisieren; Resource-Value ist der belastbare Nachweis).

### C. Regression

| ID | Check | Erwartung |
| --- | --- | --- |
| **R-iOS** | Nach App-Start Exclude-Flags | Alle 7 Verzeichnisse `isExcludedFromBackup == true` |
| R-iOS-2 | Android unverändert | `allowBackup=false`, kein neues Android-Verhalten |
| R-iOS-3 | Logs | Keine absoluten Pfade in console / Crash-Reports aus diesem Modul |
| R-iOS-4 | Expo Go | Audit meldet Modul fehlt (erwartbar); Dev/Release Build erforderlich |

---

## Grenzen

- Keychain-Items folgen eigenen Backup-Regeln (`WHEN_UNLOCKED_THIS_DEVICE_ONLY` bereits gesetzt).
- Cache-/tmp-Systemordner außerhalb von Documents sind nicht Teil dieser Liste.
- Flag muss nach Neu-Anlegen von Verzeichnissen erneut gesetzt werden – deshalb Prüfung bei **jedem** App-Start.

---

## Dateien

| Pfad | Rolle |
| --- | --- |
| `modules/ios-backup-exclusion/` | Native Expo-Modul |
| `src/security/IosBackupExclusionService.ts` | Orchestrierung |
| `app/_layout.tsx` | Start-Hook |
| `src/security/SecurityAuditService.ts` | Audit-Check |
