# Family Vault – Device Transfer Phase 4A (Vault-Metadaten)

**Status:** Metadaten-Transfer über den sicheren Kanal (Staging + Validierung)  
**Scope:** Tabellenstruktur, Einstellungen, Dokument-Metadaten – **keine** Dokumentdateien, **kein** Master Key, **keine** produktive Vault-Übernahme  

---

## Ziel

Testweise Vault-Informationen vom entsperrten Sender über den Phase-3-Kanal zum Empfänger übertragen:

1. Export kleiner Metadaten-Paket aus der SQLCipher-Vault (lesend)
2. Transfer als chunked AEAD-Nachrichten
3. Empfänger: Temporary Staging → Validierung → Staging-Commit
4. Bei Fehler: Rollback (Staging löschen)

---

## Was wird exportiert / was nicht

### Sicher exportierbar (Phase 4A)

| Inhalt | Quelle | Hinweis |
| --- | --- | --- |
| Schema-/DB-Version | `schemaVersion` / Manifest `databaseVersion` | aktuell `4` |
| Tabellenliste | Manifest `tables` | people, id_entries, documents, document_people, app_meta |
| Einstellungen / App-Meta | `app_meta` / `family` | Familienname, setup_complete |
| Personen | `people` | PII – nur über AEAD-Kanal |
| ID-Einträge | `id_entries` | PII |
| Dokument-Metadaten | `documents` + personIds | inkl. `fileRef.relativePath` |
| Verknüpfungen | implizit über `personIds` | |

**Hinweis „Kategorien“:** Es gibt keine Kategorie-Tabelle mehr (entfernt in Schema v2). Die Tabellenliste ersetzt die Struktur-Information.

### Niemals übertragen

| Inhalt | Begründung |
| --- | --- |
| Master Key / Keystore | Gerätegebunden, SecureStore |
| SQLCipher-PRAGMA-Key | = Master Key |
| Ephemeral private Keys | RAM-only Pairing |
| Dokument-`.dat`-Bytes | Phase 4B |
| Absolute `file://`-Pfade | Geräte-Leak |
| Klartext-Dokumentdateien | verboten |

Der SQLCipher-Key des alten Geräts wird **nicht** exportiert. Der Empfänger behält/erzeugt später (Phase 4B+) einen **eigenen** Master Key.

---

## Datenfluss

```
Sender (Vault entsperrt)
  VaultExportService.exportMetadataPackage()
        ↓
  MigrationManifest (checksum + HMAC)
        ↓
  meta_manifest → meta_chunk* → meta_done   (SecureChannel AEAD)
        ↓
Empfänger
  StagingStore (familydata-transfer-staging/<id>/)
        ↓
  Integrity prüfen (checksum + HMAC mit Session-Key)
        ↓
  status: validated → committed (Staging-Commit)
        ↓
  meta_ack an Sender
```

**Nicht:** Schreiben in `familydata.vault.db` auf dem Empfänger.

---

## Manifest

```json
{
  "version": 1,
  "timestamp": 1710000000000,
  "databaseVersion": 4,
  "tables": ["people", "id_entries", "documents", "document_people", "app_meta"],
  "documentCount": 3,
  "checksum": "<sha256 hex of payload JSON>",
  "integrity": "<hmac-sha256 hex over checksum with session key>",
  "payloadBytes": 12345,
  "chunkCount": 6
}
```

Vor Import/Staging-Commit:

1. Payload zusammenbauen  
2. `checksum` neu berechnen und vergleichen  
3. `integrity` mit Session-Key verifizieren  
4. `documentCount` vs. Payload prüfen  

---

## Staging-Konzept

Pfad: `{documentDirectory}/familydata-transfer-staging/<transferId>/`

| Datei | Inhalt |
| --- | --- |
| `manifest.json` | Manifest |
| `payload.json` | Metadaten-JSON |
| `status.json` | receiving → staged → validated → committed / failed / rolled_back |

- **Rollback:** Verzeichnis löschen  
- **App-Lock / Pairing-Clear:** `StagingStore.wipeAll()`  
- **Commit (4A):** nur Status `committed` – bereit für spätere Vault-Apply-Phase  

---

## Module

`src/deviceTransfer/migration/`

| Modul | Aufgabe |
| --- | --- |
| `VaultExportService` | Lesen aus entsperrter Vault |
| `VaultImportService` | Staging schreiben, validieren, committen |
| `MigrationManifest` | Manifest bauen/parsen/verifizieren |
| `IntegrityService` | SHA-256 + HMAC-SHA256 |
| `StagingStore` | Temp-Dateisystem |
| `MigrationTransferService` | Chunk-Protokoll über `TransportManager` |

Neue Message-Types: `meta_manifest`, `meta_chunk`, `meta_done`, `meta_ack`, `meta_reject`.

---

## Sicherheitsmodell

- Vertraulichkeit/Integrität der Frames: bestehendes AES-256-GCM (Phase 3)
- Zusätzliche Payload-Integrität: SHA-256 + HMAC mit **Transfer-Session-Key** (nicht Master Key)
- Keine Persistenz von Session-/Master-Keys
- Staging enthält PII → Wipe bei Lock/Fehler
- Export-Guard gegen absolute Pfade in JSON

---

## UI-Test

Nach Pairing + Kanal:

1. Host: **Metadaten-Test senden**
2. Joiner: empfängt automatisch → Staging → Validierung → Commit
3. Host erhält `meta_ack` mit Personen-/Dokument-Zählern

---

## Offene Punkte für Dokumenttransfer (Phase 4B)

1. Übertragung der `.dat`-Ciphertexte (oder Re-Encrypt-Pipeline)
2. Mapping `fileRef.relativePath` → neue lokale Pfade
3. Apply Staging → neue SQLCipher-Vault mit **neuem** Master Key
4. Atomarer Cutover + optional Sender-Wipe
5. Fortschritts-UI für große Dateimengen
6. Entscheidung: `security_events` / `export_history` migrieren?
7. Größenlimits / Streaming statt JSON-Chunks für große Familien

---

*Phase 4A endet mit validiertem Metadaten-Staging. Keine Dokumentdateien. Keine finale Geräte-Migration.*
