# Family Vault – Device Transfer Phase 2 (Pairing)

**Status:** Pairing-Prototyp implementiert  
**Scope:** Nur sicheres QR-Pairing – **keine** Datenübertragung, **keine** DB-/Dokument-Migration  

---

## Ziel dieser Phase

Beide Geräte können sich lokal koppeln:

1. **Altes Gerät:** Einstellungen → Sicherheit → Geräteübertragung → **Neues Gerät verbinden** → Biometrie → QR-Angebot
2. **Neues Gerät:** Geräteübertragung → **Daten übernehmen** → QR scannen → Antwort-QR anzeigen
3. **Altes Gerät:** Antwort-QR scannen → beiderseits Status **Sicher gekoppelt** (+ gleicher Bestätigungscode)

---

## Implementierte Komponenten

| Modul | Pfad | Aufgabe |
| --- | --- | --- |
| Types | `src/deviceTransfer/types.ts` | Protokollversion, Payloads, Session-Status |
| Bytes | `src/deviceTransfer/bytes.ts` | Hex + Wipe (ohne Key-Logging) |
| DeviceIdentityService | `src/deviceTransfer/DeviceIdentityService.ts` | Temporäre Session-/Geräte-IDs (RAM) |
| EphemeralKeyService | `src/deviceTransfer/EphemeralKeyService.ts` | X25519-Schlüsselpaar; Secret nur RAM |
| QRCodeService | `src/deviceTransfer/QRCodeService.ts` | Encode/Parse/Expiry der QR-Payloads |
| PairingService | `src/deviceTransfer/PairingService.ts` | Offer/Accept/Complete-Logik |
| TransferSessionManager | `src/deviceTransfer/TransferSessionManager.ts` | In-Memory-Session, TTL, Wipe |
| Hook | `src/deviceTransfer/useTransferSession.ts` | UI-Subscription |
| UI Hub | `app/settings/transfer/index.tsx` | Einstieg |
| UI Host | `app/settings/transfer/host.tsx` | Sender-Flow |
| UI Join | `app/settings/transfer/join.tsx` | Empfänger-Flow |
| QR Display | `src/components/PairingQrDisplay.tsx` | QR-Anzeige |
| QR Scanner | `src/components/PairingQrScanner.tsx` | Kamera-Scan |

**Anbindung**

- Sicherheitsscreen: Link „Geräteübertragung“
- Stack-Routen in `app/_layout.tsx`
- Bei Vault-`lock()`: `TransferSessionManager.clear()` (Secrets weg)
- Auto-Lock während Transfer-Screens unterdrückt (`beginAutoLockSuppress`)

---

## Verwendete Libraries

| Library | Zweck |
| --- | --- |
| `@noble/curves` (x25519) | Ephemere Schlüsselpaare / Shared-Secret nur zur Bestätigungscode-Ableitung |
| `expo-camera` | QR scannen |
| `react-native-qrcode-svg` + `react-native-svg` | QR anzeigen |
| `expo-crypto` | CSPRNG für IDs/Seeds |
| `zod` | Payload-Validierung (bereits vorhanden) |

Bereits vorhanden und **nicht** für Pairing-Persistenz missbraucht: `expo-secure-store` (Master Key), SQLCipher, AES-GCM-Dokumentcrypto.

---

## QR-Inhalt (erlaubt)

JSON-Felder:

- `v` – Protokollversion (`1`)
- `t` – `fv-pair-offer` oder `fv-pair-accept`
- `sid` – Session-ID
- `did` – temporäre Gerätekennung
- `pk` – öffentlicher X25519-Schlüssel (Hex)
- `exp` – Ablaufzeit (Unix ms)

**Nicht** im QR: Master Key, private Keys, Personen-/Dokumentdaten, Vault-Inhalte.

TTL: **5 Minuten** (`SESSION_TTL_MS`).

---

## Ablauf

```
Host (alt)                         Joiner (neu)
─────────                          ────────────
Biometrie
Session + Keypair (RAM)
Offer-QR anzeigen  ──────────────► Offer scannen
                                   Keypair (RAM)
                                   Accept-QR + Code
Accept scannen    ◄──────────────  Accept-QR zeigen
ECDH → Code (wipe shared)
Status: paired                     Status: paired (bestätigen)
```

Der Bestätigungscode entsteht aus dem X25519-Shared-Secret und wird angezeigt; das Shared Secret wird danach gewipet. **Keine** Datenkanal-Verschlüsselung in Phase 2.

---

## Sicherheitsregeln (eingehalten)

- Private Keys nur im RAM; Wipe bei Clear/Expiry/Lock
- Keine Persistenz von Pairing-Secrets in SecureStore/DB
- Keine Logs mit Key-Material
- Keine PII im Pairing-Protokoll
- Session-Expiry mit Timer
- Sender-Start nur nach `requireSecureAccess(..., { force: true })`

---

## Bewusst nicht implementiert (Phase 3+)

- WLAN-/TCP-Transport
- Chunked Vault-Export / Import
- Neuverschlüsselung mit neuem Master Key auf dem Empfänger
- Staging/Commit/Rollback der Migration
- Änderung der Vault-/Dokument-Pipeline
- Endgültige Produktentscheidung „Sender nach Erfolg wipe/soft-lock“

---

## Offene Punkte für Phase 3

1. Lokaler verschlüsselter Transport (TLS/Noise über WLAN/Hotspot)
2. Manifest + AEAD-Chunks für DB-Snapshot und Dokumentdateien
3. Empfänger: Staging → neuer Master Key → SQLCipher/AES Neuverschlüsselung → Commit
4. Empfänger ohne vorzeitige leere Vault-Erzeugung (Unlock-Pfad heute kann Vault anlegen)
5. SAS/Bestätigungscode an Transport-Handshake anbinden
6. UX Hotspot vs. gleiches WLAN
7. Transfer-Security-Events (ohne PII)
8. Native Rebuild wegen `expo-camera` Config Plugin

---

## Manueller Test (zwei Geräte / Dev Builds)

1. Beide Apps entsperren (Dev Client / APK)
2. Alt: Sicherheit → Geräteübertragung → Neues Gerät verbinden
3. Neu: Daten übernehmen → Offer-QR scannen
4. Alt: Antwort-QR scannen
5. Codes vergleichen → „Sicher gekoppelt“
6. Abbruch/Lock: Session muss geleert sein (erneutes Pairing nötig)

---

*Phase 2 endet mit dem Pairing-Prototyp. Keine Migrationslogik.*
