# Family Vault – Device Transfer Phase 3 (Secure Transport)

**Status:** Sicherer Kommunikationskanal implementiert  
**Scope:** Ende-zu-Ende verschlüsselte Testnachrichten nach Pairing – **keine** Vault-/Dokument-Migration  

---

## Ziel

Nach erfolgreichem QR-Pairing (Phase 2) einen lokalen, E2E-verschlüsselten Kanal öffnen und die feste Testnachricht austauschen:

`FamilyData Transfer Test`

---

## Transportentscheidung

Verglichene Optionen:

| Option | Android | iOS | Stabilität | Sicherheit | Wartbarkeit | Fazit |
| --- | --- | --- | --- | --- | --- | --- |
| Lokaler HTTPS/TLS-Server | Mittel | Mittel | Mittel | Hoch *wenn* Zertifikate/Pinning korrekt | **Niedrig** (Zertifikatsverteilung auf Geräten, Expo-Hürden) | Verworfen für Phase 3 |
| Verschlüsselter WebSocket | Mittel | Mittel | Mittel | Abhängig von TLS + App-Crypto | Mittel (zusätzlicher HTTP-Stack) | Unnötig komplex |
| **TCP + AEAD-Layer** | **Hoch** (Dev Client) | **Hoch** (Dev Client) | **Hoch** für LAN | **Hoch** (App-E2E aus Pairing) | **Hoch** | **Gewählt** |

### Begründung der Wahl: TCP + eigener AEAD-Layer

1. Das Pairing liefert bereits ein authentisiertes X25519-Material → HKDF → Session-Key. Vertraulichkeit und Integrität liegen in der **Anwendungsschicht** (AES-256-GCM), unabhängig vom TCP-Klartext auf dem Kabel.
2. `react-native-tcp-socket` ist in Expo **Development Builds** etabliert (Server + Client, Android/iOS).
3. Lokales HTTPS ohne belastbare Zertifikatskette oder Pinning bringt wenig Mehrwert und viel Betriebsaufwand.
4. WebSockets würden denselben Peer-Server brauchen, plus HTTP-Framing – ohne Vorteil gegenüber Length-Prefixed-TCP.
5. Defense-in-Depth bleibt möglich (später optional TLS); Phase 3 priorisiert einen wartbaren, prüfbaren AEAD-Kanal.

**Nicht** geändert: `usesCleartextTraffic: false` (betrifft HTTP). Der Kanal ist Raw-TCP, keine HTTP-Cleartext-API.

---

## Sicherheitsmodell

```
X25519 Shared Secret (ephemeral, aus Pairing)
        ↓
HKDF-SHA256 (salt = sessionId, info = familydata-transfer-session-v1)
        ↓
32-Byte Session Encryption Key (nur RAM)
        ↓
AES-256-GCM Frames (AAD = sessionId || seq)
```

- Session-Key: nur während der Transfer-Session, nur RAM, Wipe bei `close` / Fehler / App-Lock / Pairing-Clear
- Keine eigene Primitive: `@noble/curves` (X25519), `@noble/hashes` (HKDF), `@noble/ciphers` (AES-GCM)
- Private Keys und Session-Key werden nicht geloggt und nicht persistiert
- Offer-QR v2 enthält zusätzlich `host`/`port` (öffentliche Verbindungsparameter, keine Secrets)

### Nachrichtenformat

Klartext (vor AEAD):

```json
{
  "messageId": "<32 hex>",
  "timestamp": 1710000000000,
  "type": "test" | "ping" | "pong" | "ack" | "close",
  "seq": 1,
  "payload": "FamilyData Transfer Test"
}
```

Wire-Frame:

```
[4 BE length][version(1) | seq(4 BE) | iv(12) | ciphertext+tag]
```

Schutz:

- **Authenticated Encryption:** AES-256-GCM
- **Integrität:** GCM-Tag + AAD (`sessionId`, `seq`)
- **Replay:** monotone `seq` + `messageId`-Seen-Set + Timestamp-Fenster (±5 Min.)

---

## Datenfluss

```
Gerät A (Host)                         Gerät B (Joiner)
Pairing (Phase 2)  ←―― QR Offer/Accept ――→  Pairing
Kanal öffnen (listen)                   Kanal öffnen (connect)
HKDF(sessionKey)                        HKDF(sessionKey)
sendMessage(test, "FamilyData…")  ──AEAD──►  receive / UI zeigt Text
close() → wipe keys                     close() → wipe keys
```

API (`TransportManager`):

- `connect()`
- `sendMessage()` / `sendTestMessage()`
- `receiveMessage()`
- `close()`

Module unter `src/deviceTransfer/transport/`:

| Modul | Rolle |
| --- | --- |
| `TransportManager` | Orchestrierung, Status, Wipe |
| `ConnectionService` | TCP listen/connect, Length-Prefix |
| `SecureChannel` | AEAD seal/open, Replay |
| `MessageProtocol` | Nachrichtenschema |
| `SessionKeyService` | X25519 → HKDF |

---

## Verwendete Libraries

| Library | Zweck |
| --- | --- |
| `react-native-tcp-socket` | TCP Server/Client (Dev Build) |
| `expo-network` | Lokale IPv4 für Offer-QR |
| `@noble/hashes` | HKDF-SHA256 |
| `@noble/curves` | X25519 (bestehend) |
| `@noble/ciphers` | AES-256-GCM (bestehend) |
| `expo-crypto` | Nonces / IDs |

---

## Fehlerbehandlung

| Fall | Verhalten |
| --- | --- |
| Verbindung verloren | Status `error`, Secrets wipe, Socket close |
| Falscher Session-Key / Manipulation | Decrypt schlägt fehl → fail + wipe |
| Timeout (Client) | connect reject nach 15s |
| Replay / Zeitfenster | Nachricht abgelehnt → fail + wipe |
| Abbruch / Fertig | `TransportManager.close()` + Pairing-Clear |
| App Lock | `TransferSessionManager.clear()` schließt Transport und wischt Keys |

---

## UI

Nach „Sicher gekoppelt“: Panel **Sicherer Kanal (Phase 3)**

1. Host: **Kanal öffnen** (listen)
2. Joiner: **Kanal öffnen** (connect)
3. **Test senden: "FamilyData Transfer Test"**
4. Gegenstelle zeigt empfangenen Klartext (nach AEAD-Decrypt)

---

## Offene Punkte für Phase 4

1. Chunked Vault-/Dokument-Transfer über denselben Kanal (`type` erweitern)
2. Staging/Commit + Neuverschlüsselung mit neuem Master Key auf dem Empfänger
3. Optional: TLS als zusätzliche Transportschicht (nicht Ersatz für AEAD)
4. Robustere LAN-Discovery (Hotspot-UX, IPv6, AP-Isolation)
5. Automatisches `listen` direkt nach Host-Pairing (weniger Tipps in der UI)
6. Bandbreiten-/Progress-UI für große Payloads
7. Native Rebuild inkl. `react-native-tcp-socket` + Local-Network-Permission

---

## Hinweis Builds

Phase 3 benötigt einen **neuen Development Build / APK** (native TCP-Modul). Expo Go reicht nicht.

---

*Phase 3 endet mit dem sicheren Testkanal. Keine Migrationslogik.*
