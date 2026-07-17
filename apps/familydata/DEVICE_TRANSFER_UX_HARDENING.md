# Device Transfer – UX Hardening

**Scope:** Nur UI / Texte / Dialoge / Statusanzeigen  
**Nicht geändert:** Transfer Services, Security, Crypto, Navigation, DB, State-Architektur

---

## Geänderte Dateien

| Datei | Änderung |
| --- | --- |
| `app/settings/transfer/host.tsx` | Action hints, SAS-Negativpfad, Abort-Confirm, Peer-Hinweise, Recovery-Labels |
| `app/settings/transfer/join.tsx` | Action hints, SAS-Negativpfad, Abort-Confirm, Join Recovery (Neu starten / Zurück) |
| `src/components/SecureChannelPanel.tsx` | Action Hint unter Timeline, Timeline-Label, Wipe-Dialog, Connect-Button-Copy |
| `src/components/TransferActionHint.tsx` | **Neu** – Statuszeile „Als Nächstes…“ / „Warte…“ |
| `src/deviceTransfer/transferUiActions.ts` | **Neu** – Abort-Guard + Action-Hint-Ableitung aus bestehendem Snapshot |
| `src/deviceTransfer/transferUiCopy.ts` | Freundlichere Speicher-/Verbindungs-Meldungen |
| `DEVICE_TRANSFER_UX_HARDENING.md` | Dieses Dokument |

---

## Audit Findings behoben

| ID | Finding | Fix |
| --- | --- | --- |
| **H1** | Handeln vs. Warten unklar | `TransferActionHint` unter Timeline (+ Pairing-Hinweise auf Host/Join) |
| **H2** | Abbrechen ohne Schutz | `requestAbortTransfer` – Confirm-Dialog bei aktivem Transfer |
| **H3** | Kein negativer SAS-Pfad | Button „Codes stimmen nicht überein“ → Erklärung → Session clear → Hub |
| **H4** | Join Recovery schwach | Primary „Neu starten“, Secondary „Zurück“, Hinweis altes Gerät neu starten |

Zusätzlich (Audit Medium, spezifiziert):

- Timeline-Label „Einrichtung“ (statt „Einrichtung abgeschlossen“)
- Peer-Hinweise am Host-QR / Antwort-Scan / Join-Scanner
- Stärkerer Wipe-Dialog am Sender
- Copy: Speicher voll + WLAN-Hinweis

---

## UI Änderungen (Kurz)

### Action Hint

Abgeleitet aus Transport-/Migration-/Docs-/Cutover-Snapshots (keine neue globale State-Logik).

Beispiele:

- Host: „Als Nächstes: Familiendaten senden“ / „Warte: Das neue Gerät richtet die Daten ein.“
- Join: „Als Nächstes: Einrichtung starten“ / „Warte: Das alte Gerät sendet die Daten.“

### Abort

Titel: „Übertragung abbrechen?“  
Text: „Die aktuelle Übertragung wird beendet. Du kannst danach erneut starten.“  
Buttons: „Abbrechen“ / „Übertragung beenden“  
Idle/Pairing ohne aktiven Kanal: kein Dialog.

### SAS Mismatch

Freundliche Erklärung, Session beenden, zurück zum Transfer-Hub.

### Join Recovery

Bei expired / pairing error / connection failed: Recovery-Panel mit „Neu starten“ + „Zurück“ + Peer-Hinweis.

---

## Keine Backend-Änderungen

- Keine Änderungen an `TransferSessionManager`, `TransportManager`, Migration/Document/Cutover Services
- Keine Crypto-/Security-Änderungen
- Keine Routing-/Store-Architektur-Änderungen
- Bestehende `clear()`-Flows werden nur aus der UI heraus aufgerufen
