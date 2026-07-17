# Device Transfer – Production Flow Integration

**Scope:** UI ↔ Service Verdrahtung für Phase 2–4C  
**Nicht geändert:** Navigation, Design System, Security/Crypto, DB, Stores, Routing, Transfer-Service-Implementierung

---

## Geänderte Dateien

| Datei | Rolle |
| --- | --- |
| `src/deviceTransfer/useProductionTransferFlow.ts` | **Neu** – Orchestrierung nach SAS: Connect → Meta → Docs |
| `src/components/SecureChannelPanel.tsx` | Nutzt Orchestrierung; Snapshots aus Services; Fehler-Recovery |
| `src/deviceTransfer/transferUiActions.ts` | Action-Hints an Auto-Flow angepasst |

Pairing-Screens (`host.tsx` / `join.tsx`) waren bereits an `TransferSessionManager` angebunden – unverändert in der Struktur.

---

## Produktions-Flow

```
QR Pairing (Host/Join UI)
  → SAS confirmSas()
  → SecureChannelPanel (paired)
  → useProductionTransferFlow
       Host: TransportManager.connect (listen)
       Join: TransportManager.connect (retry)
       Host: MigrationTransferService.sendMetadataTransfer()
       Join: auto-receive via Message-Handler (subscribe)
       Host: DocumentTransferService.sendAllEncryptedDocuments()
       Join: auto-receive docs via Message-Handler
  → Join: Button „Einrichtung starten“ → VaultCutoverService.runCutover()
  → Join: familyStore.bootstrap() + Erfolg-UI → /(tabs)
  → Host: cutover_complete → Keep / Secure Delete
```

### Exakte Service-APIs (bestehend)

- `MigrationTransferService.sendMetadataTransfer()` (kein `sendMetadata`)
- `DocumentTransferService.sendAllEncryptedDocuments()` (kein `sendDocuments`)
- `VaultCutoverService.runCutover(transferId)` (kein `execute`)
- Empfang Meta/Docs: **keine** öffentlichen receive-Methoden – Handler über `subscribe()`

### Fehler-Recovery

`TransferSessionManager.clear()` schließt bereits:

1. `TransportManager.close()`
2. `StagingStore.wipeAll()`
3. Migration/Document/Cutover `reset()`

UI: `StatusBadge` danger + **Neu starten** → clear + zurück zum Transfer-Hub.

---

## Was die UI anzeigt (Service-Snapshots)

| Zustand | Timeline |
| --- | --- |
| connecting / idle channel | Geräte verbunden → aktiv/wartet |
| migration sending/receiving | Familieninformationen |
| docs sending/receiving | Dokumente (+ echte Zähler wenn vorhanden) |
| cutover building… | Einrichtung |
| committed / awaiting_sender_choice | Fertig / Keep-Wipe |

---

## Security

- Keine Keys in AsyncStorage / React-Persistenz
- Keine Master-Key-Übertragung
- Nur bestehende Service-Aufrufe; Orchestrierung ist UI-seitig

---

## Manuelle Testfälle

1. Host QR erstellen  
2. Join QR scannen + Kopplung bestätigen  
3. SAS beiderseits bestätigen (identisch)  
4. SecureChannel verbindet automatisch  
5. Metadaten laufen automatisch  
6. Dokumente laufen automatisch  
7. Join: Einrichtung starten → Cutover  
8. Empfänger öffnet FamilyData (`bootstrap` + tabs)  
9. Sender: Keep / Secure Delete  

Negativ: SAS mismatch, QR expired, WLAN weg, App geschlossen, Speicher voll → freundliche Fehler + Neu starten.
