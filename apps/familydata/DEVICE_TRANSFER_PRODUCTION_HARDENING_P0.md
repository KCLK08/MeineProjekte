# Device Transfer – Production Hardening P0

**Scope:** Nur High Findings A1, E1, L1 aus `DEVICE_TRANSFER_PRODUCTION_REVIEW.md`  
**Keine API-/Crypto-/Protokoll-/DB-/Design-System-Änderungen**

---

## Änderungen

### A1 – Crash Cleanup Cutover-Artefakte

**Datei:** `src/deviceTransfer/wipeOrphanStaging.ts`  
**Aufruf:** unverändert über `_layout.tsx` Boot-Hook

Nach Process Restart (kein RAM-Transfer möglich):

| Entfernt (best effort) | Nicht angefasst |
| --- | --- |
| Transfer-Staging (`StagingStore.wipeAll`) | `familydata.vault.db` |
| `familydata.vault.migration.db` | `familydata-encrypted/` |
| `familydata-encrypted-migration/` | |
| `familydata-encrypted.pre-cutover/` | |
| `*.pre-cutover` neben Vault-DB-Kandidaten | |

Logging: nur `orphan migration cleanup completed` (keine Pfade/Daten).

`deleteDatabaseFile()` wird **nicht** genutzt (würde produktive DB-Connection schließen) – Migration-DB per `SQLite.deleteDatabaseAsync` + File-Kandidaten.

---

### E1 – Fehler Recovery Policy

**Dateien:** `useProductionTransferFlow.ts`, `SecureChannelPanel.tsx`

**Hard Failures** (auto):

- `flowError` (Connect / Meta / Docs Orchestrierung)
- `transport.status === 'error'`
- `migration|docs|cutover.phase === 'failed'`

**Ablauf:**

1. `friendlyTransferError` → UI danger status + Kurztext  
2. kurz anzeigen (~350 ms)  
3. `TransferSessionManager.clear()` (schließt Transport + Staging wipe)  
4. nach ~1,4 s → `router.replace('/settings/transfer')`

Recovery wird nach Start **nicht** durch `paired→false` abgebrochen.

**Nicht auto** (unverändert User-Action):

- SAS „Codes stimmen nicht überein“
- Abbrechen / `requestAbortTransfer`

---

### L1 – React Lifecycle Safety

**Datei:** `useProductionTransferFlow.ts`

- `mountedRef` für Component-Lifetime
- `active` Flag pro Async-Effect (Connect / Metadata / Documents)
- `safeSetFlowError` / Catch-Pfade: `if (!active || !mountedRef.current) return` vor `setFlowError`

---

## Getestete Szenarien (manuell / logisch)

| Szenario | Erwartung |
| --- | --- |
| Cold start nach abgebrochenem Cutover | Orphan migration DB/dirs/`pre-cutover` weg; produktive Vault/encrypted bleiben; Log-Zeile einmal |
| TCP disconnect während Transfer | Fehlertext → clear → Hub |
| Meta/Docs/Cutover `failed` | dito |
| Connect-Timeout Join | `flowError` → clear → Hub |
| SAS mismatch | Alert + clear/Hub wie bisher, **ohne** Hard-Fail-Automationspfad des Panels |
| User Abbrechen | Confirm → clear/Hub, kein Hard-Fail-Automationsloop |
| Unmount während Meta-Send | kein `setFlowError` nach Unmount |

Automatisierte Device-E2E in dieser Umgebung nicht ausgeführt (kein Dual-Device). Typecheck: `tsc --noEmit` grün.

---

## Keine API-Änderungen

- TransferSessionManager / Transport / Migration / Document / Cutover Public APIs unverändert  
- Routing-Struktur unverändert (nur bestehendes `replace` zum Hub)  
- Crypto / Security-Architektur unverändert  
- Design System / Farben unverändert  
