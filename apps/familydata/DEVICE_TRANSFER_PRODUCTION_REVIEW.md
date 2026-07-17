# Device Transfer – Production Integration Review

**Rolle:** Senior React Native / Mobile Security  
**Scope:** Verdrahtung Phase 2–4C (`useProductionTransferFlow` + UI)  
**Stand:** nach Merge #56  
**Regel:** Review only – **keine Codeänderungen** in diesem Dokument/PR

---

## Executive Summary

Die Verdrahtung bildet den Happy Path weitgehend korrekt ab: SAS → Connect → Host Meta → Host Docs → Join Cutover (gated) → Keep/Wipe. Service-seitige Guards (Staging committed, Mapping, `running`) sind stark.

**Freigabe-Empfehlung:** **Conditional Go** für Family-Beta nach Behebung der **High**-Findings (Error-Pfad Auto-Cleanup vs. Spec, Cutover-Crash-Hygiene, Unmount-State-Updates). Medium-Items vor Broad Release.

Es gibt **keine Critical**-Lücke, die einen Master-Key-Leak oder ungeschützten Cutover-Button ohne Service-Guard bedeutet.

---

## 1. Flow State Machine

### Ist-Zustand (effektiv)

```
pairing → sas_confirmed → connecting → metadata_* → documents_*
  → cutover_ready (docs ready_for_4c) → cutover_running → completed
  → host: awaiting_sender_choice → keep|wipe
```

Orchestrierung: `useProductionTransferFlow.ts`  
UI-Gates: `SecureChannelPanel.tsx` (`canRunCutover`)  
Service-Gates: `VaultCutoverService.runCutoverInternal`, `DocumentTransferService.sendAllEncryptedDocuments`

### Prüfungen

| Frage | Urteil | Notes |
| --- | --- | --- |
| Zustand überspringbar? | **Weitgehend nein** | Docs nur bei `migration.phase === 'committed'`; Cutover UI nur bei Meta committed + Docs `ready_for_4c` + connected; Service prüft Staging/`mapping` erneut |
| Doppelte Aktionen? | **Größtenteils geschützt** | `metaStarted` / `docsStarted` / `connectStarted` Refs; Cutover `running` Flag |
| Race Conditions? | **Ja, begrenzt** | siehe P1–P3 |
| Host+Join gleichzeitig kritische Aktionen? | **Nein (by design)** | Host sendet Meta/Docs; Join empfängt; Cutover nur Join |

### State-Machine Findings

| ID | Severity | Datei | Problem | Fix-Empfehlung |
| --- | --- | --- | --- | --- |
| P1 | **Medium** | `useProductionTransferFlow.ts` | Connect-Effect-Cleanup setzt `connectStarted=false`, solange Status ≠ `connected`. Remount/Strict-Mode kann zweiten `connect()` starten, während der erste noch `connecting` (Host listen) ist → Port-/Race-Risiko. | Cleanup nur `cancelled=true`; `connectStarted` erst bei `error`/`closed` oder explizitem `clear` zurücksetzen. Optional Generation-Token. |
| P2 | **Medium** | `useProductionTransferFlow.ts` | Join-Retry (~20×1s): bei anhaltendem Host-Verzug endet Flow in Fehler, obwohl Host noch auf SAS/Listen wartet. | Längeres Retry-Fenster oder Retry solange Pairing-Session nicht expired; klarer Hint „Warte auf altes Gerät“. |
| P3 | **Low** | `useProductionTransferFlow.ts` | Wenn `getTransportConnectParams()` beim ersten Effect-Lauf `null` ist, startet Connect nie erneut (kein Status-Dep). | Effect zusätzlich an `sasConfirmed`/Snapshot `updatedAt` koppeln oder kurzes Polling bis Params da. |
| P4 | **Low** | State model | Keine explizite UI-State-Machine; Phasen sind über 4 Service-Snapshots verteilt → schwerer zu testen. | Optional (später) abgeleitete `TransferFlowPhase` nur lesend – keine Architekturpflicht für Beta. |

**Doppelte Migration:** Host-Meta/Docs durch Refs + Phase-Guards ausreichend gegen Doppelstart geschützt. Cutover: UI `disabled={!canRunCutover}` + Service `if (this.running)`.

---

## 2. React Lifecycle

| ID | Severity | Datei | Problem | Fix-Empfehlung |
| --- | --- | --- | --- | --- |
| L1 | **High** | `useProductionTransferFlow.ts` | `setFlowError` in Meta/Docs-`.catch` ohne Mount-Guard → Update after unmount möglich (Navigation weg während Send). | `let mounted = true` / `Abort`/`cancelled` Flag analog Connect; oder `restartFlow`/`setFlowError` nur wenn mounted. |
| L2 | **Medium** | `useProductionTransferFlow.ts` | Connect-Cleanup + Remount (siehe P1) | siehe P1 |
| L3 | **Low** | `useProductionTransferFlow.ts` | `restartFlow()` wird exportiert, von `SecureChannelPanel` aber nicht genutzt (Panel nutzt `resetTransferSession` + Hub). | Dead API entfernen oder Panel darauf umstellen – Konsistenz. |
| L4 | **Info** | Migration/Document/Cutover Services | `handlerAttached` wird in `reset()` **nicht** zurückgesetzt – absichtlich ein Prozess-langer Handler. React-`subscribe` Listener werden korrekt entfernt. | Kein Fix nötig; dokumentieren dass Handler Singleton sind. |
| L5 | **Info** | `SecureChannelPanel.tsx` | Hooks laufen vor `if (!paired) return null` – korrekt. Bei `paired=false` setzt Effect Refs zurück. | OK |

**Subscribe/Unsubscribe:** `useSyncExternalStore` + Service-`subscribe` – kein offensichtliches Listener-Leak bei normalem Unmount.

**Memory:** `TransportManager.lastReceived` hält letzte Message inkl. Payload in RAM bis `close`/`clear` – nicht in Produkt-UI angezeigt. Akzeptabel; bei Lock/`clear` wird geschlossen.

---

## 3. Button Guards

Aktuell: Connect / Meta / Docs sind **automatisiert** (keine CTAs mehr). Verbleibende CTAs:

| CTA | Guard | Urteil |
| --- | --- | --- |
| Join „Einrichtung starten“ | `disabled={!canRunCutover}` | **Gut**; Doppel-Tap: Service `running` |
| Host Keep | keiner | **Low** – doppeltes `markSenderKept` harmlos |
| Host Secure Delete | Confirm-Dialog, aber Button nicht `disabled` während Wipe | **Medium** – Doppel-Wipe/Race |
| Abbrechen (Host/Join) | `requestAbortTransfer` bei aktivem Transfer | **Gut** |
| Neu starten (Fehler) | clear + Hub | **Gut** |
| SAS bestätigen | kein Busy-Disable | **Low** |

| ID | Severity | Datei | Problem | Fix-Empfehlung |
| --- | --- | --- | --- | --- |
| B1 | **Medium** | `SecureChannelPanel.tsx` | Secure Delete / Cutover-Start: kein lokales `busy`/`disabled` während async | `useState` busy → Buttons disable bis settled |
| B2 | **Low** | `host.tsx` / `join.tsx` | SAS-CTAs ohne Disable während Sync-Call | optional Disable on press |

---

## 4. Fehlerpfade

### Soll (Review-Auftrag)

1. `friendlyTransferError()`  
2. Status UI  
3. `TransferSessionManager.clear()`  
4. Navigation Transfer-Hub  

### Ist

| Fehlerfall | friendly | Status UI | auto clear | auto Hub |
| --- | --- | --- | --- | --- |
| Connect/Timeout (Join) | ja | danger + Neu starten | **nur nach Tap** | **nur nach Tap** |
| TCP disconnect | ja (transport.error) | danger + Neu starten | nur Tap | nur Tap |
| AEAD/Decrypt | ja (Copy-Mapping) | danger + Neu starten | nur Tap | nur Tap |
| Storage voll | ja | danger + Neu starten | nur Tap | nur Tap |
| Cutover fail | ja (Alert + phase failed) | danger + Neu starten | nur Tap | nur Tap |
| Abbrechen / SAS mismatch | ja | – | ja | ja |

| ID | Severity | Datei | Problem | Fix-Empfehlung |
| --- | --- | --- | --- | --- |
| E1 | **High** | `SecureChannelPanel.tsx` / Flow | Spec verlangt bei **jedem** Fehler clear + Hub. Ist: manueller Recovery-CTA. Session/TCP können nach Fehler weiter „connecting/half-open“ bleiben, bis Nutzer tippt. | Policy festlegen: (A) Soft-Recovery beibehalten **oder** (B) bei `hasHardFailure` automatisch `clear()` + Hub nach kurzem Delay. Spec-konform = B. |
| E2 | **Medium** | `SecureChannelPanel.tsx` | Cutover-Fehler: zusätzlich `Alert` – Nutzer sieht Alert + Banner; clear nicht gekoppelt an Alert-Dismiss | Einheitlicher Fehlerkanal; nach Fail optional auto-reset |
| E3 | **Low** | `hasHardFailure` | `Boolean(displayError)` behandelt jede Error-String als Hard-Fail – i. d. R. OK | Nur `phase===failed` / `status==='error'` als Hard-Fail werten |

---

## 5. App Lifecycle

| Szenario | Verhalten | Urteil |
| --- | --- | --- |
| Hintergrund / Auto-Lock | `securityStore.lock` → `TransferSessionManager.clear()` (close + staging wipe + service reset) | **Gut** – kein stilles Resume |
| Resume ohne Lock (Suppress nur Kamera/Bio/kurzer Commit) | Transfer-Screens **ohne** Dauer-Suppress → Lock während langer Docs wahrscheinlich | **Beabsichtigt** (Security); UX-Hinweis „App geöffnet lassen“ vorhanden |
| Force Close | RAM-Session weg; Boot: `wipeOrphanTransferStaging()` | Staging: **Gut** |
| Force Close mitten im Cutover | Staging ggf. gewiped; **`migration.db` / `familydata-encrypted-migration` / `.pre-cutover`** nicht durch Boot-Wipe abgedeckt | **High** Residual |

| ID | Severity | Datei | Problem | Fix-Empfehlung |
| --- | --- | --- | --- | --- |
| A1 | **High** | `wipeOrphanStaging.ts` / `_layout.tsx` | Halber Cutover nach Crash: Boot wischt nur Staging, nicht Migrations-Artefakte / Backup-Dirs | Boot-Hygiene erweitern: `MIGRATION_VAULT_DB_NAME`, `familydata-encrypted-migration`, `*.pre-cutover` best-effort löschen (nur wenn kein aktiver unlocked Cutover – nach Process Death immer safe) |
| A2 | **Info** | `AUTOLOCK_SECURITY.md` | Kein Transfer-Resume by design | OK – in Review als erfüllt markieren |

---

## 6. Cutover Safety

| Check | Status |
| --- | --- |
| UI vor Meta/Docs committed | Button nicht gerendert / `disabled` |
| Service: Staging `committed` | ja |
| Service: Mapping validated vs. fileRefs | ja |
| Service: Dateien existieren | ja |
| Service: Kanal connected (DocWrap) | ja |
| Service: Unlock required | ja |
| Doppel-`runCutover` | `running` Guard |

| ID | Severity | Datei | Problem | Fix-Empfehlung |
| --- | --- | --- | --- | --- |
| C1 | **Low** | `SecureChannelPanel.tsx` | Zwischen Alert „Starten“ und `runCutover` kann Phase theoretisch kippen | Vor Aufruf `canRunCutover` erneut prüfen |
| C2 | **Info** | – | Kein direkter ungesicherter Button-Pfad gefunden | OK |

---

## 7. UI Snapshot Mapping

Timeline mappt auf: connected / family / documents / setup (+ failed). Produkt-Copy gefiltert über `friendlyProgressLine` / `formatDocumentTransferDetail` / `friendlyTransferError`.

| ID | Severity | Datei | Problem | Fix-Empfehlung |
| --- | --- | --- | --- | --- |
| U1 | **Low** | Services → UI | Roh-`progress` enthält teils „Phase 4C“, „Staging“, „SQLCipher“, „Master Key“ – **meist** gefiltert; Randfälle wenn Regex nicht greift | TECH_PROGRESS um `Phase`, `Manifest`, `Chunk` erweitern (UI-only) |
| U2 | **Info** | `TransportManager.pushLog` | Interne Logs mit „AEAD“, Port – **nicht** mehr in SecureChannelPanel gerendert | OK solange Log-Panel nicht zurückkehrt |
| U3 | **Low** | Document progress | `documentId.slice(0,8)` in Service-Progress; Timeline nutzt bevorzugt Zähler-Formatter | Beibehalten; Formatter als einzige Detail-Quelle lassen |

Keine AEAD/HKDF/SQLCipher-Strings in sichtbaren SecureChannelPanel-Labels gefunden (nach Filter).

---

## 8. Logging Review

| Quelle | Inhalt | Risiko |
| --- | --- | --- |
| `TransportManager.pushLog` | Typ + Payload-**Länge**, Status, Port | **Niedrig** – kein Payload-Inhalt; Jargon intern |
| `lastReceived` | volle Message in RAM | **Medium** bis clear – nicht disk; UI zeigt nicht |
| Migration/Document `progress` | Zähler, ID-Prefix, technische Phasenworte | **Niedrig** in UI durch Filter |
| Kein `console.log` von Keys in geprüften Transfer-Pfaden | – | OK |

| ID | Severity | Datei | Problem | Fix-Empfehlung |
| --- | --- | --- | --- | --- |
| G1 | **Medium** | `TransportManager.ts` | `lastReceived` speichert kompletten Payload im Snapshot (auch wenn UI es nicht rendert) | Snapshot nur `type` + length exposen; Payload nicht in `getSnapshot` |
| G2 | **Low** | `pushLog` | „directional AEAD…“ in Ring-Buffer | Log-Texte entschärfen falls jemals Debug-UI |

**Erlaubt (Ist):** Phasenwechsel indirekt über Snapshots, Dokument-Anzahlen in Progress/Summary.  
**Nicht erlaubt:** Keys/Personendaten/Inhalte – nicht in Produkt-UI; Payload nicht geloggt (nur Länge).

---

## Severity Übersicht

| Severity | Count | IDs |
| --- | --- | --- |
| Critical | 0 | – |
| High | 3 | L1, E1, A1 |
| Medium | 6 | P1, P2, B1, E2, G1, (+ L2≈P1) |
| Low | 7 | P3, P4, L3, B2, E3, U1, U3, C1, G2 |
| Info | 3 | L4, L5, A2, U2, C2 |

---

## Empfohlene Fix-Reihenfolge (bei Freigabe)

1. **A1** Boot-Cleanup Cutover-Artefakte  
2. **E1** Fehlerpolitik Spec vs. Soft-Recovery entscheiden und vereinheitlichen  
3. **L1** setState-after-unmount absichern  
4. **P1** Connect-Effect Remount-Race  
5. **B1** Busy-Disable Wipe/Cutover  
6. **G1** Snapshot ohne Payload  

---

## Fazit

Die Production-Integration ist für einen **kontrollierten Beta-Test** tragfähig: Happy Path ist verdrahtet, Cutover ist service-seitig hart abgesichert, Lock räumt Transfer-Session.  
Vor **Broad Production**: High-Items A1/E1/L1 schließen; Medium-Races und Busy-Guards nachziehen.

**Keine Codeänderungen ohne explizite Freigabe** (dieses Deliverable ist Review-only).
