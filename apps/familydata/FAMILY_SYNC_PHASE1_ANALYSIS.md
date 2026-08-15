# Family Sync – Phase 1: Bestehende Architektur analysieren

**Status:** Analyse only – keine Codeänderungen, keine Schema-Migrationen, keine Dependencies.  
**Scope:** `apps/familydata` (Family Vault)  
**Datum:** 2026-08-15  
**Zielbild (Kontext, nicht Entscheidung):** Mehrere eigenständige Vaults pro Familienmitglied, QR-Beitritt, spätere LAN-Dokument-Replikation ohne Cloud/Server; **kein Remote Delete**.

---

## Executive Summary (Kurz)

| # | Antwort |
|---|--------|
| **1. Was haben wir bereits?** | Ein gerätegebundener Einzel-Vault (SQLCipher + AES-GCM-Dateien + Biometrie), lokale „Familie“ als Anzeigename + Personenliste, vollständiger **Device-Transfer** (QR → X25519 → HKDF → AEAD/TCP → Staging → Cutover mit neuem Master Key). |
| **2. Was wiederverwenden?** | Crypto-Primitive (X25519, HKDF, HMAC, AES-GCM), QR-Schemas, TCP-Framing, Doc-Wrap (`docWrapKey` ohne Master-Key-Export), Staging-/Wipe-Muster, Integrity-Domains, Service-Snapshot/Subscribe. |
| **3. Was fehlt?** | Family-ID, stabile Member-/Device-/Vault-Identitäten, ACL/Share-Modell, Versions-/Tombstone-/Conflict-Felder, Discovery, inkrementelles Sync-Protokoll, persistente Device Auth, Background-Sync-fähiges Lock-Modell, automatisierte Tests. |
| **4. Größte Risiken?** | Threat-Model-Konflikt Lock↔Background-Sync; Cutover ≠ Sync; `people` ≠ Sync-Member; ID-Kollisionen bei Multi-Writer; versehentliches Remote-Delete durch CASCADE; Key-Design ohne Master-Key-Transfer. |
| **5. Nächste 5 Entscheidungen** | siehe Abschnitt 9 am Ende. |

---

## 1. Produkt-Istzustand (kurz)

Family Vault ist ein **cloudless, local-only** Vault auf iOS/Android:

- Ein Vault pro Installation/Gerät
- Master Key in Keychain/Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY` + Biometrie)
- Device Transfer verschiebt einen Vault **einmalig** auf ein neues Gerät – **kein** Multi-Peer-Sync

Quellen: `README.md`, `SECURITY_IMPLEMENTATION.md`, `DEVICE_TRANSFER_*`.

---

## A. Familienmodell

### A.1 Family ID

**Nein – es gibt keine Family ID.**

Kein Feld `family_id` / `familyId` in Schema, Stores oder Transfer-Typen.

### A.2 Wie wird „Familie“ gespeichert?

| Information | Speicherort | Setzen |
|-------------|-------------|--------|
| Anzeigename | `app_meta.key = 'family_name'` | `completeFamilySetup` / `setFamilyName` in `src/db/repository.ts` |
| Setup-Flag | `app_meta.key = 'setup_complete'` (`'1'`) | Setup-Flow; ggf. inferiert wenn Personen + Name existieren |
| Schema | `app_meta.key = 'schema_version'` (`'4'`) | `ensureSchema` |

Implizite Familienidentität = **dieser lokale Vault** + Anzeigename + lokale `people`-Zeilen.

### A.3 Mitglieder-Identifikation

| Aspekt | Ist-Zustand |
|--------|-------------|
| Entität | Tabelle `people` |
| PK | `id TEXT` |
| ID-Generator | `createId('person')` → ``person_${Date.now().toString(36)}_${Math.random()…}`` in `src/utils/helpers.ts` L4–6 |
| Rolle | `people.rolle` als UI-Enum `FamilyRole`: `vater` \| `mutter` \| `kind` \| `sonstiges` (`src/types/models.ts`) |
| Bedeutung von Rolle | **UI-Label**, keine Auth-/ACL-Identität |
| Stabilität | Stabil **innerhalb eines Vaults** und bei Device Transfer (IDs werden übernommen); **nicht** für unabhängige Multi-Writer-Vaults ausgelegt |

`document_people` verknüpft Dokumente mit lokalen Personen (M:N) – das ist **lokale Zuordnung**, kein Share-ACL zu Remote-Vaults.

### A.4 Stores

- **`useFamilyStore`** (`src/store/familyStore.ts`): RAM-Cache (`familyName`, `people`, `documents`); Quelle der Wahrheit = SQLCipher über `repository`.
- Kein separates Family-Entity-Objekt.

### A.5 Sync-Tauglichkeit der IDs

| ID | Sync-tauglich? | Begründung |
|----|----------------|------------|
| `people.id` | **bedingt** | Lokal stabil; Kollisionsrisiko bei paralleler Erzeugung auf mehreren Geräten |
| `documents.id` | **bedingt** | gleiches Muster (`createId('doc')`) |
| `family_name` | **nein** | Display-String |
| Family UUID | **fehlt** | — |
| Member-Public-Key / Member-ID | **fehlt** | — |

### A.6 Fazit Familie

Heute: **eine Haushalts-Datenbank auf einem Gerät**.  
Geplant: **Mitgliedschaft über Vaults**.  
`people` ≠ Family Sync Member. Rolle ≠ Autorisierung.

**Referenzen:** `repository.ts` (`ensureSchema` ~L424–556, CRUD people/docs), `helpers.ts` L4–6, `familyStore.ts`, `types/models.ts`.

---

## B. Vault-Modell

### B.1 Vault-Identität

**Keine Vault-ID.** Feste Dateinamen:

| Konstante | Wert | Datei |
|-----------|------|-------|
| `VAULT_DB_NAME` | `familydata.vault.db` | `repository.ts` ~L8 |
| `PLAIN_DB_NAME` | `familydata.db` | Legacy |
| `MIGRATION_VAULT_DB_NAME` | `familydata.vault.migration.db` | Cutover |

Singleton `getDb()` + ein `encryptionKeyHex` – **ein** offener Vault.

### B.2 Master Key

| Schritt | Wo |
|---------|----|
| Erzeugung | `KeyStoreService.createMasterKey` – 32 Byte (`expo-crypto`) |
| Speicherung | SecureStore Item `familydata.vault.masterKey.v1` |
| Bindung | `WHEN_UNLOCKED_THIS_DEVICE_ONLY` + `requireAuthentication: true` |
| Meta | `familydata.vault.masterKey.meta` (`auth-bound-v2` / legacy) |
| Session | RAM-Kopie in `SecurityManager` nur solange unlocked |
| Wipe | bei Lock; Transfer exportiert den Key **nie** |

Referenz: `src/security/KeyStoreService.ts` L10–88, L95+; `SecurityManager.ts` (`ensureVaultInitialized`, `establishSession`, `lockApp`).

### B.3 Annahmen „ein lokaler Vault“

1. Ein DB-Dateiname / ein Open-Handle  
2. Ein SecureStore-Slot für den Master Key  
3. Ein `familyStore` / ein UI-Vault  
4. Cutover **ersetzt** den Vault auf dem Empfänger (`VaultCutoverService`)  
5. Dokumente unter einem Root `familydata-encrypted/`

### B.4 Für verbundene Multi-Vaults später relevant (nur Analyse)

- Pro Gerät/Mitglied eigene Vault-Identität (fehlt)  
- Key-Modell ohne Master-Key-Sharing (Transfer zeigt nur **einmaliges** Re-Wrap)  
- ACL „Dokument sichtbar für Member X“ (fehlt)  
- Kein Cutover bei laufendem Sync

---

## C. Device Identity

### C.1 Persistente Geräte-ID?

**Nein.**

`DeviceIdentityService` (`src/deviceTransfer/DeviceIdentityService.ts` L6–20):

> Temporary transfer device identity – random per session, never persisted.

| Methode | Verhalten |
|---------|-----------|
| `createTemporaryDeviceId()` | 16 Zufallsbytes → Hex, **nicht** persistiert |
| `createSessionId()` | analog für Session |

### C.2 Nutzung im Device Transfer

- QR-Feld `did` in Offer/Accept (`PairingService`)  
- `TransferSessionManager.localDeviceId` (RAM)  
- Host lehnt Self-Scan ab, wenn `payload.did === localDeviceId`  
- **Nicht** an Vault, Familie oder Master Key gebunden  
- **Nicht** kryptografisch als langlebige Device-Identity (kein Device-Keypair persistent)

### C.3 Fazit

Für Family Sync fehlt: **persistente, autorisierte Device Identity** (Erzeugung, Speicherung, Bindung an Member, Revocation-Policy – Entscheidungen bewusst offen).

---

## D. Device Transfer (`src/deviceTransfer/`) – Bausteinbewertung

Device Transfer = **einmalige Vault-Migration** Host→Joiner, nicht Multi-Peer-Sync.

### D.1 Pairing

| | |
|--|--|
| Ablauf | Host `createHostOffer` → QR; Joiner scannt/accept; Host scannt Accept; SAS-Bestätigung |
| Dateien | `PairingService.ts`, `TransferSessionManager.ts`, `types.ts` |
| TTL | Offer `SESSION_TTL_MS` (5 min); nach SAS `TRANSFER_SESSION_TTL_MS` (30 min) |
| **Bewertung** | **erweiterbar** – Handshake-Gerüst nutzbar; Rollen/Semantik für Family-Join neu |

### D.2 QR

| | |
|--|--|
| Inhalt | Öffentliche Felder (`v`, `t`, `sid`, `did`, Pubkey, Host-IP/Port, Expiry) – keine Secrets |
| Validierung | Zod in `QRCodeService.ts` |
| UI | `PairingQrDisplay.tsx`, `PairingQrScanner.tsx` |
| **Bewertung** | **wiederverwendbar** |

### D.3 X25519

| | |
|--|--|
| Service | `EphemeralKeyService.ts` – Keypair, Shared Secret, SAS, Dispose |
| **Bewertung** | **wiederverwendbar** |

### D.4 HKDF

| | |
|--|--|
| Service | `SessionKeyService.deriveSessionKeys` |
| OKM | 5×32B: send \| recv \| integrity \| **docWrap** \| staging |
| Info | `familydata-transfer-session-v2` |
| **Bewertung** | **wiederverwendbar** (Domain-Strings für Sync evtl. neu) |

### D.5 HMAC / Hashing / Integrity

| | |
|--|--|
| HMAC | `IntegrityService` – Domains `fv-meta-v1` / `fv-doc-v1` |
| Hash | SHA-256 Payload/Chunks (`IntegrityService`, `DocumentFileTransferIO`) |
| Checks | Manifest vor Import; Chunk-Order/Size; Role-Filter |
| **Bewertung** | **wiederverwendbar** |

### D.6 AEAD

| Layer | Ort | Bewertung |
|-------|-----|-----------|
| Transport-Frames | `SecureChannel.ts` (direktionale Keys + Role-AAD) | **wiederverwendbar** |
| Vault-/Staging-Bytes | `EncryptionService` | **wiederverwendbar** |
| Doc-Wrap | `DocumentTransferWrap` mit `docWrapKey` | **wiederverwendbar** – Muster „ohne Master-Key-Transfer“ |

### D.7 Session Keys

| | |
|--|--|
| Haltung | RAM in `TransportManager`; Wipe bei Close/Fail/Lock |
| **Bewertung** | **erweiterbar** – Multi-Peer / langlebige Sessions brauchen anderes Lifecycle-Modell |

### D.8 TCP / LAN

| | |
|--|--|
| Stack | `react-native-tcp-socket` via `ConnectionService` |
| Port | `TRANSFER_TCP_PORT = 27891` (`types.ts` L19–20) |
| Framing | Length-prefixed Messages |
| **Bewertung** | **erweiterbar** – Single-Peer, fester Port |

### D.9 Discovery

| | |
|--|--|
| Ist | Host-IPv4 aus `expo-network` **im QR**; kein mDNS/Bonjour |
| **Bewertung** | **ungeeignet** als Sync-Discovery – nur „Adresse im QR“ |

### D.10 Staging

| | |
|--|--|
| Service | `StagingStore` – verschlüsselte Zwischenablage Empfänger |
| Regel | Live-Vault unberührt bis Cutover |
| Cleanup | Session-Clear, Boot-`wipeOrphanTransferStaging`, Lock-Clear |
| **Bewertung** | **erweiterbar** als Buffer-Muster; kein Sync-Journal |

### D.11 Migration (Meta + Docs)

| | |
|--|--|
| Meta | `MigrationTransferService`, `VaultExportService` / `VaultImportService` – **Vollpaket** |
| Docs | `DocumentTransferService` – Chunks, Wrap, HMAC |
| **Bewertung** | **ungeeignet** für inkrementellen Sync; Teile der Doc-Pipeline **erweiterbar** |

### D.12 Cutover

| | |
|--|--|
| Service | `VaultCutoverService` – parallele Migrations-DB, Docs rekeyen, atomarer Swap, **neuer** Master Key |
| Host danach | Keep / Secure Wipe |
| **Bewertung** | **ungeeignet** für Family Sync (Ownership-Transfer ≠ Replikation) |

### D.13 Cleanup / Lock / Errors / Retry

| Thema | Bewertung | Kurz |
|-------|-----------|------|
| Cleanup/Wipe | **wiederverwendbar** | `TransferSessionManager.clear`, Staging-Wipe, Boot-Orphan |
| Lock während Transfer | **ungeeignet** für Background-Sync | Lock → `TransferSessionManager.clear()` (`securityStore.ts` ~L176–179) |
| Error Handling | **erweiterbar** | Fail-closed; keine Resume-Taxonomie |
| Retry | **erweiterbar** | nur Joiner-Connect bis Pairing-Expiry (`useProductionTransferFlow`) |

### D.14 Hinweis zu Docs

`DEVICE_TRANSFER_ARCHITECTURE.md` Statuszeile „keine Implementierung“ ist **veraltet**; Phasen 2–4C + Production-Wiring sind im Code. Pairing-Richtung in älteren Architektur-Abschnitten kann vom Code abweichen (Host zeigt Offer).

---

## E. Datenbank (SQLCipher-Schema)

Versionierung über **`app_meta.schema_version`** (aktuell `'4'`).  
**Keine** Tabelle `schema_migrations`.

### E.1 Tabellenübersicht

#### `people`
- **PK:** `id TEXT`
- **Felder:** Name, `rolle`, Kontakt, `notizen`, `createdAt`, `updatedAt`
- **FK:** —
- **Version/Soft-Delete:** nein (Hard Delete)
- **Sync-Lücken:** keine Family-/Member-Public-ID; schwache ID-Entropie; kein Tombstone

#### `id_entries`
- **PK:** `id TEXT`
- **FK:** `personId → people(id) ON DELETE CASCADE`
- **Timestamps/Version:** keine
- **Sync-Lücken:** keine `updatedAt`; CASCADE löscht bei Person-Delete

#### `documents`
- **PK:** `id TEXT`
- **Felder:** `name`, `documentNumber`, `expiryDate`, `filePath`, `notes`, `createdAt`, `updatedAt`
- **Owner/Origin/Version/ACL:** **fehlen**
- **Soft-Delete:** nein

#### `document_people`
- **PK:** `(documentId, personId)`
- **FK:** beide CASCADE
- **Bedeutung heute:** lokale Personen-Tags, **kein** Share-Ziel zu Remote-Vaults
- **Sync-Lücke:** kein ACL-Typ (`owner` / `shared_with_member`)

#### `app_meta`
- **PK:** `key`
- Bekannte Keys: `schema_version`, `family_name`, `setup_complete`
- Keine Family-/Vault-/Device-IDs

#### `security_events` / `export_history`
- Audit-Metadaten; Truncation (Events ~200, Exports ~100)
- `export_history.documentId` **ohne** FK

#### `identification` (Legacy)
- Noch in `ensureSchema` erstellt; Daten nach `id_entries` migriert (v3)

### E.2 Deletes

Überall **Hard Deletes**. `ON DELETE CASCADE` auf Junction/Entries.  
Das kollidiert potenziell mit der Sync-Regel „kein Remote Delete“, wenn Sync-Deletes naiv propagiert würden – **Entscheidung später**, aber als Risiko notiert.

### E.3 Fehlende Sync-relevante Informationen (Beobachtung)

- Family ID, Vault ID, Device ID, Member ID  
- Document origin / logical document ID / revision / content hash  
- Share/ACL-Tabelle (Member-bezogen)  
- Tombstones / sync tombstone log  
- Conflict metadata  
- `updatedAt` auf Junction/`id_entries`  
- Robustere ID-Strategie für Multi-Writer  

**Referenz Schema:** `src/db/repository.ts` `ensureSchema` L424–556.

---

## F. Dokumentdateien

### F.1 Speicherorte

| Pfad | Zweck |
|------|--------|
| `{documentDirectory}familydata-encrypted/` | Ciphertext `.dat` |
| `familydata-decrypt-tmp/` | Preview-Temps (bei Lock gelöscht) |
| `familydata-files/` | Pre-Encrypt-Staging |
| Cutover: `familydata-encrypted-migration`, `.pre-cutover` | Parallel/Rollback |

Service: `DocumentEncryptionService.ts` L7–25.

### F.2 `.dat`-Format

`EncryptionService.encryptBytes` (`EncryptionService.ts` L18–31):

```
version(1) = 1 || iv(12) || ciphertext+tag   (AES-256-GCM, @noble/ciphers)
```

- Key: Vault-Master / Session-Key (32 Byte)  
- **Kein AAD** auf Dokument-Crypto (AAD nur Transfer-`SecureChannel`)  
- Dateiname: `{32-hex-rand}.{ext}.dat`

### F.3 Transfer ohne Master-Key-Export (bereits bewiesen)

1. Vault-`.dat` lesen  
2. Mit Master entschlüsseln → transienter Plaintext nur im RAM  
3. Mit session-`docWrapKey` neu verschlüsseln (`DocumentTransferWrap.wrapVaultCiphertext`)  
4. Empfänger: Unwrap mit `docWrapKey` → Encrypt mit **neuem** lokalen Master (`rekeyToNewMaster`)

**Bewertung für Vault-zu-Vault-Replikation:** Crypto-/Wrap-Muster **wiederverwendbar**; Key-Agreement und ACL für Family Sync **fehlen** (nicht entscheiden in Phase 1).

### F.4 Hashing lokal

Kein Content-Hash in `documents`-Zeile. Integrität primär im Transfer-Pfad (SHA-256 + HMAC).

---

## G. Zustand / Stores

| Store | Persistenz | Session | Sync-Relevanz | Listener |
|-------|------------|---------|---------------|----------|
| `useFamilyStore` | nein (DB ist SoT) | UI-Cache; Wipe bei Lock | Datenquelle lokal; kein Sync-Channel | nur Zustand-Selektoren |
| `useSecurityStore` | Auto-Lock-Prefs (SecureStore) | Lock-State, Session | Lock bricht Transfer ab | AppState-Listener + Zustand |
| `useThemeStore` | Theme-Pref | Preference | gering | Zustand |
| Transfer-Manager | Staging-Dateien temporär | Snapshots RAM | Pattern für Sync-Service denkbar | `subscribe` + `useSyncExternalStore` |

`DEVICE_TRANSFER_UI_PLAN.md`: Transfer-State **nicht** in family/security Stores – gilt analog für Sync.

---

## H. Lock / Background / Lifecycle

| Thema | Verhalten | Referenz |
|-------|-----------|----------|
| `AppLockGate` | Fullscreen solange locked; Auto-Unlock-Versuch | `AppLockGate.tsx` |
| Auto-Lock | bei `background` (nicht nur `inactive`); Delays immediate/1/5/15 min | `securityStore.ts` ~L105–137 |
| Unlock | Biometrie → Master Key → DB open → `familyStore.bootstrap` | `SecurityManager.unlockApp` |
| Lock | Session-Key wipe, Temps clear, DB close, UI wipe, **`TransferSessionManager.clear()`** | `securityStore.lock` ~L173–187 |
| Master Key | Gerätgebunden persistent; RAM nur unlocked | `KeyStoreService` / `SecurityManager` |
| Termination | RAM weg; Boot wischt Transfer-Orphans | `wipeOrphanStaging.ts`, `_layout.tsx` |
| Suppress | nur QR-Kamera, Biometrie, kurzer Cutover-Commit | `autoLockSuppress.ts` |

### H.1 Background Sync – Analyse (keine Lösung)

Heute verhindert die Architektur Hintergrund-Sync weitgehend:

1. Lock = all-or-nothing inkl. Transfer-Abbruch  
2. Session-/Transport-Keys nur RAM, absichtlich nicht „überleben“  
3. Keine OS Background Tasks für Sync  
4. Threat Model: Vault geschlossen ⇒ keine Klartext-/Key-Arbeit  

**Was später diskutiert werden müsste (nicht entscheiden):** scoped unlock, Sync-Queue ohne Master Key, explizites User-Consent-Keepalive, separates Sync-Schlüsselmaterial – alles **sicherheitskritisch**.

---

## I. Tests

### I.1 Automatisierte Tests

**Keine** gefunden unter `apps/familydata` (`*.test.*` / `__tests__` / Test-Script in `package.json` fehlen).

### I.2 Vorhandene „Coverage“

| Artefakt | Art |
|----------|-----|
| `DEVICE_TRANSFER_SECURITY_TESTPLAN.md` | Manueller E2E-/Security-Plan |
| Phase-/Hardening-/Final-Security-MDs | Checklisten / Reviews |
| `SecurityAuditService` | In-App Status-Checks, keine Unit-Tests |

### I.3 Lücken für Family Sync (später zwingend)

1. Unit: HKDF-Schedule, SAS, AEAD replay/AAD, HMAC-Domains, QR-Schema  
2. Integration: Chunk-Loss/Reconnect, Resume, Multi-Peer  
3. Sync: ACL, Versionierung, Conflict, „kein Remote Delete“-Invarianten  
4. Lifecycle: Lock während Sync, Background/Foreground  
5. DB: Schema-Evolve + Dual-Writer-Sicherheit  
6. CI-Gate für Crypto/Sync  

---

## 6. Wiederverwendungs-Tabelle

| Bestandteil | Status | Wiederverwendung für Family Sync | Begründung |
|-------------|--------|-----------------------------------|------------|
| Device Identity | Temporär, nicht persistent | **ungeeignet** (als Sync-Device-ID) | Session-Zufall; kein Persistenz-/Auth-Modell |
| QR Pairing | Implementiert | **erweiterbar** | Gutes UX/Validierungsgerüst; Semantik Family-Join ≠ Vault-Transfer |
| X25519 | Implementiert | **wiederverwendbar** | Solide Ephemeral-ECDH-Primitive |
| HKDF | Implementiert | **wiederverwendbar** | Klare OKM-Aufteilung inkl. docWrap |
| AEAD | Implementiert | **wiederverwendbar** | Channel + File + Doc-Wrap |
| TCP/LAN | Single-Peer | **erweiterbar** | Framing ok; Port/1:1/Discovery limitieren Sync |
| Staging | Transfer-Buffer | **erweiterbar** | Muster gut; kein Sync-Journal/Resume |
| Hash/HMAC | Implementiert | **wiederverwendbar** | Domain-separierte Integrität |
| SQLCipher | Einzel-Vault | **erweiterbar** | Starke lokale SoT; Schema fehlt Sync-Felder |
| Document Encryption | AES-GCM `.dat` | **wiederverwendbar** | Format + Master-Key-lokal ok |
| File Transfer / Doc-Wrap | One-shot Pipeline | **erweiterbar** | Wrap-ohne-Master-Export wiederverwendbar; Voll-Migration nicht |
| Zustand/Services | Zustand + Manager-Subscribe | **erweiterbar** | Pattern ja; Sync-Store fehlt; Lock wipe konfliktär |

---

## 7. Architektur-Lücken

### Bereits vorhanden – direkt nutzbar

- AES-256-GCM Packformat (`EncryptionService`)  
- SQLCipher-Vault + gerätegebundener Master Key  
- X25519 / HKDF / HMAC / SecureChannel AEAD  
- QR-Payload-Validierung  
- Doc-Wrap-Idee (`DocumentTransferWrap` + `docWrapKey`)  
- Staging-Verschlüsselung + Wipe-Hilfen  
- Integrity-Domains und Checksum-Pipeline  
- Transfer Service-Snapshot/`subscribe`-UI-Pattern  
- Deutsche Produkt-UI + Lock-Gate  

### Muss erweitert werden

- Pairing → Family-Membership-Join (Rollen, Bestätigung autorisiertes Gerät)  
- TCP-Transport → Multi-Peer / Session-Lifecycle  
- Integrity-Domains / Message-Typen für Sync-Nachrichten  
- `documents` / Personen-Modell → Origin, Logical-ID, Share-Ziele  
- ID-Erzeugung für Multi-Writer  
- Retry über Connect hinaus (Chunks, Sync-Jobs)  
- Auto-Lock-Policy vs. kurze Sync-Fenster (Policy-Entscheidung!)  

### Fehlt vollständig

- Family ID / Membership Graph  
- Persistente Device Identity + Device↔Member Binding  
- Vault ID (logisch, über Geräte hinweg)  
- ACL: Dokument ↔ Member (nicht ↔ lokales `people`-Tag)  
- Document Revision / Version Chain  
- Sync-Protokoll (Pull/Push, Cursor, Ack)  
- LAN Discovery jenseits QR  
- Conflict Resolution  
- Tombstones / Anti-Remote-Delete-Invarianten in Schema+Protokoll  
- Background Sync / OS Tasks  
- Automatisierte Test-Suite  

### Sicherheitskritisch – vor Implementierung entscheiden

1. **Key Hierarchy:** Family Key? Document Keys? Wrapping? (Master Key darf nicht transferiert werden – bereits Soft-Constraint im Transfer)  
2. **Device Authorization:** Wer darf beitreten? Wie wird ein Gerät dauerhaft als „Mutter-Gerät“ erkannt? Revocation ohne Remote Delete von Docs?  
3. **Lock vs. Sync:** Darf Sync bei gesperrtem Vault laufen? Mit welchem Schlüsselmaterial?  
4. **Trust On First Use / SAS:** Gleiches UX wie Transfer oder strengeres Family-Join?  
5. **No Remote Delete:** Protokoll- und Schema-Invarianten, damit Deletes lokal bleiben  
6. **Threat Model Update:** Mehrere kompromittierbare Geräte in einer Familie  

---

## 8. Explizit NICHT entschieden (Phase 1)

Laut Auftrag – hier **keine** Festlegung:

- Family Key  
- Document Keys  
- Key Wrapping  
- Device Authorization Details  
- Sync-Protokoll  
- Discovery  
- Conflict Resolution  
- Background Sync  
- Push Notifications  
- Datenbankmigrationen  

---

## 9. Executive Summary – die 5 nächsten gemeinsamen Entscheidungen

1. **Identitätsmodell:** Was ist kanonisch – Family ID, Member ID, Vault ID, Device ID – und wie hängen sie zusammen (ohne Implementierung jetzt)?  
2. **Key Hierarchy:** Wie werden Dokumente vault-übergreifend geschützt, **ohne** Master Keys zu teilen?  
3. **Membership & Device Auth:** QR-Join-Flow, wer bestätigt, was persistent gespeichert wird, was bei Geräteverlust gilt.  
4. **Dokument-ACL & Versionierung:** Share-Liste pro Member; Revisionsmodell; Invariante „kein Remote Delete“.  
5. **Sync-Runtime vs. Lock:** Darf/muss Sync nur bei unlocked Vault laufen – und welche Konsequenzen hat das für LAN-Sync-UX?

---

## Anhang: Wichtige Dateipfade

| Bereich | Pfade |
|---------|--------|
| Schema/DB | `src/db/repository.ts` |
| IDs | `src/utils/helpers.ts` |
| Family UI State | `src/store/familyStore.ts` |
| Security/Lock | `src/store/securityStore.ts`, `src/security/SecurityManager.ts`, `src/security/KeyStoreService.ts` |
| Doc Crypto | `src/security/EncryptionService.ts`, `src/security/DocumentEncryptionService.ts` |
| Transfer Core | `src/deviceTransfer/PairingService.ts`, `TransferSessionManager.ts`, `DeviceIdentityService.ts`, `types.ts` |
| Transport | `src/deviceTransfer/transport/*` (`SessionKeyService`, `SecureChannel`, `TransportManager`, `ConnectionService`) |
| Migration | `src/deviceTransfer/migration/*` (`DocumentTransferWrap`, `DocumentTransferService`, `VaultCutoverService`, `StagingStore`, …) |
| Lock UI | `src/components/AppLockGate.tsx` |
| Docs | `DEVICE_TRANSFER_*.md`, `SECURITY_IMPLEMENTATION.md`, `AUTOLOCK_SECURITY.md` |

---

*Ende der Phase-1-Analyse. Keine Implementierung durchgeführt.*
