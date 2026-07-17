# Device Transfer – Production Hardening P1

Behebt die Findings **P1**, **P2**, **B1** und **G1** aus dem Production Review.

---

## P1 – Connect Race

**Problem:** `connectStarted` wurde im Effect-Cleanup zurückgesetzt, während `connect()` noch lief → erneuter Start möglich (Race).

**Fix (`useProductionTransferFlow.ts`):**

- `connectStarted` bleibt `true` während `connecting` / `listening` / `retrying`
- Reset nur bei: `connected`, `error`, oder `clear()`
- Effect-Cleanup setzt `connectStarted` **nicht** mehr zurück
- Optional: **Generation-Token** – veraltete async-Callbacks nach Cleanup/Clear werden ignoriert
- Host: nach `listen()` wartet die Orchestrierung auf `connected` (nicht sofort `transferring`), damit der Race mit Status-Updates vermieden wird

---

## P2 – Join Retry

**Problem:** Fester Retry-Timeout (~20s) konnte abbrechen, obwohl Pairing noch gültig war.

**Fix:**

- Join retryt, solange das Pairing gültig ist (`expiresAt` / Session nicht expired)
- Kein endloser Retry: Abbruch wenn Pairing abgelaufen oder Session expired
- UI-Hinweis: **„Warte auf das alte Gerät…“** (`JOIN_WAITING_FOR_PEER_HINT`) während connecting / listening / retrying auf dem Join-Gerät

---

## B1 – Async Button Guards

**Problem:** Doppel-Tap / parallele Secure-Delete- oder Cutover-Aktionen möglich.

**Fix (`SecureChannelPanel.tsx`):**

| Aktion | Guard |
|--------|--------|
| Secure Delete / Keep | `senderActionBusy` → Buttons `disabled` |
| Cutover starten | `cutoverBusy` → Button `disabled` |

Verhindert Doppel-Tap, parallelen Wipe und parallelen Cutover.

---

## G1 – Snapshot Hardening

**Problem:** Transport-Snapshot enthielt `lastReceived.payload` (sensible Bytes in Debug/State).

**Fix (`TransportManager.ts`):**

Snapshot `lastReceived` nur noch Metadaten:

```ts
{ type, length, timestamp }
```

- Vollständige Message intern als `lastReceivedMessage` (nur für Handler / `receiveMessage()`)
- Payload wird **nicht** geloggt und **nicht** im Snapshot exponiert
- Export: `TransportLastReceivedMeta`

---

## Ergebnis

| Finding | Status |
|---------|--------|
| P1 Connect Race | behoben |
| P2 Join Retry | behoben |
| B1 Busy Guards | behoben |
| G1 Snapshot Payload | behoben |

---

## Nicht geändert

- Crypto / Security-Architektur
- Transfer-Protokoll
- DB-Schema
- Design-System / Navigation
