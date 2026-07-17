# Family Vault – Device Transfer Phase 4B (Dokumenttransfer)

**Status:** Verschlüsselte `.dat`-Dateien streamen in Staging  
**Scope:** Ciphertext-Dokumente + Hashes + Mapping – **kein** Vault-Cutover, **kein** Löschen auf dem Sender, **kein** Master Key  

---

## Ziel

Über den bestehenden SecureChannel die Dateien aus `familydata-encrypted/*.dat` übertragen und auf dem Empfänger **nur** unter Staging ablegen:

`familydata-transfer-staging/<transferId>/documents/`

---

## Dokumentfluss

```
Sender (Vault entsperrt)
  listDocuments() → nur .dat-Pfade
        ↓
  Datei als opaque Bytes lesen (kein Decrypt)
        ↓
  SHA-256(file) + HMAC(integrityKey, fv-doc-v1)
        ↓
  document_start → document_chunk* → document_end
        ↓
Empfänger
  temporäre Chunk-Liste im RAM
        ↓
  Chunk-Hash prüfen (Reihenfolge strikt)
        ↓
  Assemble → File-Hash + HMAC prüfen
        ↓
  Schreiben als neue UUID.dat
        ↓
  mapping.json: documentId → localFileName
        ↓
  bereit für Phase 4C
```

**Nicht:** Schreiben nach `familydata-encrypted/` der produktiven App, keine SQLCipher-Änderungen.

---

## Chunk-Protokoll

Message-Types (AEAD-geschützt wie Phase 3):

| Type | Inhalt |
| --- | --- |
| `document_start` | transferId, documentId, sourceRelativePath, totalBytes, totalChunks, fileSha256, integrity |
| `document_chunk` | documentId, index, total, size, chunkSha256, data (Base64 der Ciphertext-Bytes) |
| `document_end` | documentId, fileSha256 |
| `document_ack` | stage: `doc_ok` \| `all_done` |
| `document_reject` | Fehlertext |

Regeln:

- Chunks in strikter Reihenfolge (`index == received`)
- Jeder Chunk: Größen- und SHA-256-Check
- Nach Assemble: Gesamt-Hash + Integrity-HMAC
- Bei Fehler: Dokument-Artefakte entfernen, kein beschädigtes `.dat` behalten

Chunk-Rohgröße: ~2400 Bytes (Base64 bleibt unter dem Payload-Limit).

---

## Sicherheitsmodell

### HKDF-Schlüsseltrennung

```
X25519 shared secret
    ↓ HKDF-SHA256 (64 Byte OKM)
transportKey (32)  → SecureChannel AES-256-GCM
integrityKey (32)  → HMAC für Manifests (4A) und Dokumente (4B)
```

- Keine eigene Dokument-Verschlüsselung zusätzlich – `.dat` bleibt Vault-Ciphertext
- Kein Klartext, kein Master Key, kein Keystore-Export
- Absolute Gerätepfade werden nicht übernommen; Empfänger erzeugt `UUID.dat`

### Mapping

```json
{
  "version": 1,
  "transferId": "…",
  "documents": [
    {
      "documentId": "doc_…",
      "localFileName": "<uuid>.dat",
      "sourceRelativePath": "familydata-encrypted/….dat",
      "sha256": "…",
      "byteLength": 12345,
      "status": "validated"
    }
  ]
}
```

---

## Fehlerfälle

| Fall | Reaktion |
| --- | --- |
| Verbindung verloren | Transport fail + Key wipe; laufender Empfang abort + Artefakte löschen |
| Fehlende / doppelte Chunks | reject + Dokument entfernen |
| Falsche Reihenfolge | reject |
| Chunk-/File-Hash Fehler | reject + Cleanup |
| Integrity-HMAC falsch | reject |
| Speicherplatz fehlt | Abbruch vor Start (`getFreeDiskStorageAsync`) |
| App Lock | Staging wipe + DocumentTransfer reset |

---

## Module

| Modul | Rolle |
| --- | --- |
| `DocumentTransferService` | Senden/Empfangen/Orchestrierung |
| `DocumentFileTransferIO` | .dat lesen, hashen, chunking |
| `StagingStore` | `documents/`, `mapping.json`, Cleanup |
| `SessionKeyService` | transport + integrity Keys |
| `IntegrityService` | HMAC Domain `fv-doc-v1` |

UI: nach erfolgreicher Phase 4A → **Dokumente senden (Staging)**.

---

## Vorbereitung Phase 4C

Phase 4C soll aus Staging:

1. Neuen Master Key auf dem Empfänger erzeugen  
2. SQLCipher-Vault aus Metadaten-Payload aufbauen  
3. Staging-`UUID.dat` nach `familydata-encrypted/` übernehmen (oder re-wrap)  
4. `filePath` in DB auf neue Pfade mappen  
5. Atomarer Cutover + optionales Sender-Wipe  

**Noch nicht in 4B.**

---

*Phase 4B endet mit validierten Ciphertext-Dateien im Staging. Keine produktive Migration.*
