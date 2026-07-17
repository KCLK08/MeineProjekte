# Family Vault – Device Transfer Phase 4C (Finaler Vault-Cutover)

**Status:** Staging → neue gerätegebundene Vault  
**Scope:** Neuer Master Key, neue SQLCipher-DB, Dokument-Rekey, atomarer Commit  
**Nicht:** Cloud, Accounts, Master-Key-Transfer, automatisches Löschen auf dem Sender  

---

## Ziel

Aus dem validierten Staging (Phase 4A Metadaten + Phase 4B Doc-Wrap-Dateien) entsteht auf dem Empfänger eine **vollständig neue** FamilyData Vault:

- eigener Master Key (Android Keystore / iOS Keychain)
- eigene SQLCipher-Datenbank
- eigene `familydata-encrypted/`-Struktur

Der alte Master Key des Senders wird **niemals** verwendet, abgeleitet oder übertragen.

---

## Finaler Migrationsablauf

```
Staging (committed + mapping validated)
        ↓
MigrationTransaction: prepared
        ↓
neuen Master Key in RAM erzeugen (noch nicht Keystore)
        ↓
MigrationTransaction: building
        ↓
neue SQLCipher-DB (familydata.vault.migration.db)
Metadaten importieren (Personen, ID-Einträge, Dokument-Meta, Relationen, Settings)
        ↓
Staging UUID.dat (Doc-Wrap) → Rekey → familydata-encrypted-migration/
Referenzen in der neuen DB aktualisieren
        ↓
MigrationTransaction: validated
Integrität: Anzahlen, Hashes, Dateien, DB öffnet mit neuem Key
        ↓
Atomic Cutover (Swap DB + encrypted dir)
Keystore: commitMasterKey(newKey)
Session adoptieren
Staging wipe
        ↓
MigrationTransaction: committed
cutover_complete → Sender
        ↓
Transfer erfolgreich
```

Bei Fehler in jedem Schritt: **Rollback** auf den vorherigen produktiven Zustand (Keystore unverändert, solange Commit nicht gelungen ist).

---

## Key Management

### HKDF (Session, 96 Byte OKM)

```
X25519 shared secret
    ↓ HKDF-SHA256
transportKey (32)  → SecureChannel AEAD
integrityKey (32)  → HMAC Manifests / Docs
docWrapKey (32)    → Dokument-Rekey während Transfer/Cutover
```

### Empfänger-Master-Key

| Schritt | Speicherort |
| --- | --- |
| `generateMasterKeyBytes()` | nur RAM |
| Build + Validate | nur RAM |
| `commitMasterKey()` | Keystore / Keychain (auth-bound) |
| `adoptCommittedMasterKey()` | App-Session |

**Verboten:**

- Ableitung aus QR / Session / Transfer
- Import des Sender-Master-Keys
- Persistenz des neuen Keys vor `validated`

### Dokument-Rekey (kein persistenter Klartext)

```
Sender:  vault.dat --(master decrypt RAM)--> wrap.dat --(docWrapKey)--> Kanal
Empfänger Staging: wrap.dat
4C:      wrap.dat --(docWrapKey decrypt RAM)--> new.dat --(neuer Master)--> familydata-encrypted/
```

Klartext existiert nur transient im Speicher und wird sofort gewiped. Keine Klartext-Dateien auf Disk.

---

## MigrationTransaction

Datei: `familydata-transfer-staging/<transferId>/migration.json`

| Status | Bedeutung |
| --- | --- |
| `prepared` | Staging geprüft, Counts erfasst |
| `building` | Neue DB + Rekey läuft |
| `validated` | Integritätschecks OK |
| `committed` | Swap + Keystore-Commit erfolgreich |
| `failed` / `rolled_back` | Abbruch; Artefakte entfernt |

---

## Commit-Prozess (Atomarität)

1. Produktive `familydata-encrypted/` → `.pre-cutover` verschieben  
2. `familydata-encrypted-migration/` → `familydata-encrypted/`  
3. Vault-DB → `.pre-cutover`; Migrations-DB → `familydata.vault.db`  
4. Öffnen der neuen DB mit neuem Key prüfen  
5. `KeyStoreService.commitMasterKey`  
6. Session adoptieren  
7. Backups löschen, Staging wipe  

**Bei Fehler nach Schritt 1–4:** Backups zurückspielen, Migrationsartefakte löschen, alter Keystore-Key bleibt gültig.

---

## Sicherheitsprüfungen vor Commit

- Personenanzahl = Payload  
- Dokumentanzahl = Payload  
- Alle Staging-Hashes stimmen  
- Alle finalen `.dat`-Dateien existieren unter `familydata-encrypted-migration/`  
- Neue SQLCipher-DB lässt sich mit dem neuen Key öffnen  

---

## Alter Sender nach Erfolg

Kein automatisches Löschen.

Nachricht an den Nutzer:

> Übertragung abgeschlossen.  
> Möchten Sie die Daten auf diesem Gerät behalten oder entfernen?

| Option | Wirkung |
| --- | --- |
| **Behalten** | Vault unverändert |
| **Sicher löschen** | User-Tabellen + `familydata-encrypted/` wipe; Master Key bleibt gerätegebunden |

Signal: Message-Type `cutover_complete` / `cutover_ack`.

---

## Sicherheitsgrenzen

| Erlaubt | Nicht erlaubt |
| --- | --- |
| Neuer Keystore-Key auf Empfänger | Master-Key-Transfer |
| Doc-Wrap über Session-HKDF | Cloud / Accounts |
| Atomarer lokaler Cutover | Kopie der alten SQLCipher-DB |
| Optionales Sender-Wipe | Automatisches Sender-Löschen |
| Staging nur lokal | Persistenter Klartext |

---

## Module

| Modul | Rolle |
| --- | --- |
| `VaultCutoverService` | Orchestrierung prepared→committed |
| `MigrationTransaction` | Statusmaschine |
| `VaultMetadataApplyService` | SQL-Import mit stabilen IDs |
| `DocumentTransferWrap` | Wrap / Rekey |
| `KeyStoreService.commitMasterKey` | Keystore-Commit |
| `SecurityManager.secureWipeVaultContents` | Sender-Wipe |

---

## Ende der Geräteübertragung

Phase 4C schließt den Offline-Transfer ab:

**Keine Cloud. Keine Accounts. Kein Master-Key-Transfer.**
