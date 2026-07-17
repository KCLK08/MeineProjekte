# Family Vault – Auto-Lock Security (Device Transfer)

**Scope:** Auto-Lock-Unterdrückung während Geräteübertragung  
**Status:** Gehärtet – keine dauerhafte Suppress auf Transfer-Screens  

---

## Altes Verhalten

| Ort | Verhalten |
| --- | --- |
| `settings/transfer/index` | `beginAutoLockSuppress()` für die gesamte Screen-Lebensdauer |
| `settings/transfer/host` | ebenso – dauerhaft während Pairing **und** Datenübertragung |
| `settings/transfer/join` | ebenso |
| `VaultCutoverService.runCutover` | Suppress über den gesamten Cutover (prepare → build → validate → commit) |

**Problem**

- App konnte während langer Transfers (Metadaten-Chunks, Dokument-Streams) im Hintergrund bleiben, ohne zu sperren.
- Ephemere Transfer-Keys, Staging und entsperrter Vault blieben länger als nötig im RAM.
- Widerspricht dem Vault-Modell: Unattended Device → Lock → Session wipe.

---

## Neues Verhalten

### Suppress nur bei

| Situation | Mechanismus |
| --- | --- |
| Aktive Kamera-QR-Erfassung | `PairingQrScanner` – Suppress nur solange Live-Preview (`permission` + nicht `disabled` + nicht post-scan `locked`) |
| Aktiver Biometrie-/OS-Auth-Prompt | `requireSecureAccess` / `unlock` via `withAutoLockSuppressed` |
| Kurzer atomarer Cutover-Commit | `VaultCutoverService` – Suppress **nur** um `commitSwap` (Datei-Swap + Keystore), nicht prepare/build/validate |

### Normaler Auto-Lock (kein Suppress)

- Transfer-Hub
- QR anzeigen (ohne Kamera)
- SAS bestätigen
- Secure Channel öffnen / verbunden
- Metadaten-Transfer (4A)
- Dokument-Chunk-Transfer (4B)
- Staging
- Cutover prepare / building / validated

### Bei Lock

Unverändert über `securityStore.lock()` → `TransferSessionManager.clear()`:

1. Vault-Session wipe (`SecurityManager.lockApp`)
2. Transport close + Key wipe (`TransportManager.close`)
3. Staging cleanup (`StagingStore.wipeAll`, awaited)
4. Transfer-/Migration-/Document-/Cutover-Services reset
5. Ephemere Pairing-Secrets dispose

Transfer ist danach **nicht** resumierbar – erneutes Pairing nötig.

---

## Security Begründung

1. **Least privilege für Unlock-Fenster**  
   Suppress existiert nur, wo das OS sonst fälschlich `inactive`/`background` auslöst (Kamera, Biometrie) oder wo ein atomarer Datei-/Keystore-Swap nicht mitten im Lock abbrechen darf.

2. **Transfer ist kein Dauer-Unlock**  
   Lange LAN-Übertragungen erhöhen das Diebstahl-/Unattended-Risiko. Auto-Lock muss greifen und Secrets räumen.

3. **Staging & Keys sind ephemer**  
   Lock = intentional abort. Verschlüsseltes Staging und Session-Keys gehören nicht in einen ungesperrten Hintergrundzustand.

4. **Cutover-Atomizität bleibt gewahrt**  
   Der kurze Commit-Suppress verhindert genau das Fenster, in dem ein Mid-Swap-Lock inkonsistente Vault-Dateien hinterlassen könnte. Prepare/Build dürfen unter Auto-Lock abbrechen (Rollback-Artefakte, Keystore unverändert).

5. **Kamera-Scope eng**  
   Nach Scan (`locked=true`) endet Suppress sofort – kein „Erneut scannen“-Zustand mit dauerhaftem Unlock.

---

## Manuelle Checks

| ID | Aktion | Erwartung |
| --- | --- | --- |
| AL-1 | Transfer-Hub öffnen, App in Hintergrund (Auto-Lock sofort) | Vault sperrt; zurück → Lock-Gate |
| AL-2 | Während 4A/4B-Übertragung Hintergrund | Lock + Staging weg + Kanal zu |
| AL-3 | Live-QR-Scan, OS-Kamera-UI | Kein Sofort-Lock nur wegen Camera-Session |
| AL-4 | Biometrie bei „Geräteübertragung freigeben“ | Kein Lock mitten im Prompt |
| AL-5 | Cutover Commit (kurz) | Kein Mid-Commit-Lock; danach Auto-Lock wieder normal |
| AL-6 | Nach Lock erneut Transfer | Neues Pairing erforderlich |

---

## Dateien

| Datei | Änderung |
| --- | --- |
| `app/settings/transfer/index.tsx` | Screen-Suppress entfernt |
| `app/settings/transfer/host.tsx` | Screen-Suppress entfernt |
| `app/settings/transfer/join.tsx` | Screen-Suppress entfernt |
| `components/PairingQrScanner.tsx` | Suppress nur bei Live-Kamera |
| `migration/VaultCutoverService.ts` | Suppress nur `commitSwap` |
| `security/autoLockSuppress.ts` | Policy-Kommentar aktualisiert |
