# FamilyData / Family Vault – Sichere Geräte-zu-Gerät-Migration

**Status:** Architekturanalyse (keine Implementierung)  
**App:** `apps/familydata` (Produktname: Family Vault)  
**Stand der Codebasis:** Expo SDK 54, Development Build / Release-APK, SQLCipher, gerätegebundener Master Key  

---

# 1. Ziel

Eine **sichere, lokale Geräte-zu-Gerät-Migration** soll es dem Benutzer ermöglichen, den gesamten Family-Vault-Tresor von einem alten Smartphone auf ein neues Smartphone zu übertragen.

## Funktionale Ziele

- Vollständige Übertragung von Familiendaten, Identifikationsdaten und Dokumenten (Metadaten + Dateiinhalte).
- Beide Geräte (Sender = altes Gerät, Empfänger = neues Gerät) laufen offline und ohne Cloud, Accounts oder Server.
- Nach erfolgreicher Migration ist der Tresor auf dem **neuen Gerät** nutzbar und mit einem **neuen, gerätegebundenen Master Key** geschützt.
- Der Benutzer steuert den Prozess bewusst (Biometrie auf dem Sender, Bestätigung auf beiden Geräten).
- Fehlschläge dürfen weder Datenverlust auf dem Sender noch einen halb-importierten, unsicheren Zustand auf dem Empfänger hinterlassen.

## Nicht-Ziele (diese Phase / Produktprinzip)

- Keine Cloud-Synchronisation, kein Account, kein Remote-Backup.
- Der **bestehende gerätegebundene Master Key darf das Gerät niemals verlassen** (weder im Klartext noch als exportierbares Keystore-Objekt).
- Keine permanente „Wiederherstellung ohne Besitz beider Geräte“.
- Keine Änderung der bestehenden Vault-Architektur in dieser Dokumentationsphase.

## Erfolgskriterium

Migration ist erfolgreich, wenn auf dem Empfänger:

1. ein neuer Master Key im Keystore/Keychain liegt,
2. eine SQLCipher-Datenbank mit allen übertragenen Datensätzen existiert,
3. alle Dokumentdateien mit dem **neuen** Schlüssel (AES-256-GCM) neu verschlüsselt vorliegen,
4. Integrität geprüft ist,
5. der Sender optional als „migriert / Quellgerät“ markiert oder unverändert belassen werden kann (Produktentscheidung, siehe Kap. 11).

---

# 2. Bestehende Architektur

## 2.1 Projektstruktur

Family Vault liegt im Monorepo unter `apps/familydata` und ist weitgehend **self-contained** (kein gemeinsames Vault-Package).

| Bereich | Pfad | Rolle |
| --- | --- | --- |
| Screens (Expo Router) | `app/` | UI, Navigation |
| Security | `src/security/` | Master Key, Auth, Encryption, Audit |
| Datenbank | `src/db/` | SQLCipher-Repository, Schema |
| State | `src/store/` | `securityStore`, `familyStore` |
| Dateien / Preview | `src/utils/`, `src/components/FilePreview.tsx` | Attachments, Offline-PDF |
| Native Härtung | `plugins/withAndroidHardening.js`, `app.json` | `allowBackup=false`, SQLCipher-Plugin |
| Bestehende Security-Docs | `SECURITY_IMPLEMENTATION.md`, `FINAL_SECURITY_REPORT.md`, … | Threat Model, Gerätewechsel als Non-Recovery |

## 2.2 Navigation

- **Expo Router** mit Root-`Stack` in `app/_layout.tsx`.
- Tabs: Familie, Dokumente, Einstellungen (Settings leiten auf `app/settings/*`).
- Setup-Modal `app/setup.tsx` nach Erstentsperrung, wenn `setup_complete` fehlt.
- Sensible Screens: Personenprofil, Identifikation, Dokumentvorschau (zusätzliche Biometrie-Gates).
- **AppLockGate:** Vollbild-Sperre, solange `securityEnabled && isLocked`.
- Einstellungen → Sicherheit: Status, Auto-Sperre, Session-Screenshots, **statischer Hinweis „Gerätewechsel / keine Wiederherstellung“** – **keine Transfer-UI**.

## 2.3 Security-Architektur (Ist)

```
         Android Keystore / iOS Keychain
                      │
           Master Key (32 Byte, SecureStore)
           requireAuthentication + THIS_DEVICE_ONLY
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
  SQLCipher vault DB         AES-256-GCM Dateien
  familydata.vault.db        familydata-encrypted/*.dat
```

Zentrale Bausteine:

| Baustein | Implementierung |
| --- | --- |
| Master Key | `KeyStoreService` – CSPRNG via `expo-crypto`, Speicherung `expo-secure-store`, Meta `auth-bound-v2` |
| Session | In-Memory-Key nur bei entsperrtem Tresor; Wipe bei Lock |
| DB | `expo-sqlite` mit `useSQLCipher: true`, `PRAGMA key` aus Master Key |
| Dateien | `@noble/ciphers` AES-256-GCM (`EncryptionService` / `DocumentEncryptionService`) |
| Auth | OS-Biometrie / Gerätecode (`expo-local-authentication` + SecureStore-Auth) |
| Auto-Lock | AppState + Timer (`immediate` / 1 / 5 / 15 Min.) |
| Screenshots | `expo-screen-capture`; Session-Freigabe nur nach Biometrie |
| Audit | `security_events`, `export_history` (nur Metadaten) |

**Wichtig:** `MigrationService` bedeutet heute **Klartext → Vault auf demselben Gerät**, nicht Geräte-zu-Gerät.

## 2.4 Datenbank (Ist)

Schema-Version 4 (Auszug):

- `people`, `id_entries`, `identification` (Legacy)
- `documents`, `document_people`
- `app_meta` (u. a. `family_name`, `setup_complete`, `schema_version`)
- `security_events`, `export_history`

Die gesamte Vault-DB ist bei aktivem Tresor mit SQLCipher verschlüsselt. Pfade zu Dokumentdateien liegen als Strings in der DB und zeigen auf `.dat`-Ciphertexte.

## 2.5 Dokumentenspeicherung (Ist)

1. Picker → Staging unter `familydata-files/`
2. Bei entsperrtem Vault → AES-GCM → `familydata-encrypted/<random>.<ext>.dat`
3. Vorschau: Entschlüsselung in kurzlebige Temps unter `familydata-decrypt-tmp/`
4. Lock: Temps löschen, Session-Key wipen, UI/Preview wipe

## 2.6 Vorhandene Expo-/Native-Module (relevant)

**Vorhanden und genutzt:** `expo-secure-store`, `expo-local-authentication`, `expo-crypto`, `expo-sqlite` (SQLCipher), `expo-file-system`, `expo-screen-capture`, `expo-document-picker`, `expo-image-picker`, `expo-sharing`, `@noble/ciphers`, WebView/PDF.js (offline Preview).

**Nicht vorhanden (für Transfer relevant):** QR-/Barcode-Scanner-API als Pairing-Modul, TCP/UDP-Server, Nearby Connections, Bluetooth/BLE-Stack, Wi-Fi Direct / Multipeer Connectivity, ECDH/PAKE-Protokollschicht, Transfer-State-Machine, Import-/Re-Key-Pipeline.

Kamera-Permissions existieren nur für Dokumentfotos, nicht für QR-Pairing.

## 2.7 Produkt-/Threat-Model-Spannung

`SECURITY_IMPLEMENTATION.md` und die UI unter „Gerätewechsel“ definieren heute: **Geräteverlust = Datenverlust by design**. Eine sichere Migration ist daher eine **bewusste Erweiterung** des Produktmodells (kontrollierter Besitztransfer mit beiden Geräten), keine Cloud-Wiederherstellung.

---

# 3. Anforderungen

## 3.1 Sicherheitsanforderungen

1. **Master Key bleibt gerätegebunden:** Der Keystore-/Keychain-Master-Key des Senders wird nie exportiert, kopiert oder über den Kanal gesendet.
2. **Ende-zu-Ende-Verschlüsselung** der Transfer-Payload zwischen den beiden Geräten; kein Klartext über WLAN/Bluetooth.
3. **Gegenseitige Authentifizierung / Binding** der Session (Schutz gegen MitM in lokalen Netzen).
4. **Sender-Authentifizierung:** Freigabe nur nach erfolgreicher Biometrie/Gerätecode auf dem Quellgerät.
5. **Empfänger-Bindung:** Neuer Master Key wird nur lokal im Secure Enclave-/Keystore-Kontext des Zielgeräts erzeugt.
6. **Integrität:** kryptographische Prüfung (Hash/MAC) über Manifest + Chunks vor Commit.
7. **Atomarität / Rollback:** Empfänger commitet den neuen Vault erst nach erfolgreicher Verifikation; sonst Cleanup.
8. **Session-Schlüssel ephemer:** Transfer-Keys leben nur für die Sitzung und werden danach gewipet.
9. **Offline-only:** Kein Server, keine Telemetrie-Pflicht, kein Account.
10. **Least privilege:** Transfer-Modus unterdrückt Auto-Lock nicht unkontrolliert; sensible Screens bleiben gesperrt, außer dem geführten Transfer-Flow.
11. **Kein Downgrade:** Empfänger akzeptiert nur Protokollversionen und Signaturen gemäß Whitelist.

## 3.2 Daten, die übertragen werden dürfen

| Kategorie | Inhalt | Anmerkung |
| --- | --- | --- |
| Stammdaten | Personen, Rollen, Geburtsdaten, ID-Einträge | aus SQLCipher-Export (entschlüsselt nur im Sender-Prozess) |
| Dokument-Metadaten | Name, Zuordnungen, Pfad-Referenzen (logisch) | Pfade werden auf Empfänger neu vergeben |
| Dokument-Inhalte | Klartext-Bytes nur **ephemer** im Sender, dann **mit Transfer-Session-Key** verpackt | niemals unverschlüsselt auf dem Medium |
| App-Meta | Familienname, Setup-Flags, Schema-Version | nötig für konsistenten Import |
| Transfer-Manifest | Dateiliste, Größen, Hashes, Schema-Version, App-Build | für Integrität |

## 3.3 Daten, die niemals übertragen werden dürfen

| Kategorie | Begründung |
| --- | --- |
| Gerätegrbundener Master Key (SecureStore-Inhalt) | Kern-Invariante |
| Keystore-/Keychain-Wrapped-Blobs als „portable backup“ | umgeht Gerätebindung |
| Unverschlüsselte Dokumente auf Shared Storage / Clipboard / Screenshots | Leak-Oberfläche |
| Session-Key des laufenden Vaults als persistenter Export | würde Unlock ohne OS-Auth ermöglichen |
| Biometrie-Templates / OS-Credentials | gehören dem OS, nicht der App |
| Fremde SecureStore-Items (Theme-Prefs etc. optional; Secrets nie) | Scope begrenzen |
| Export-History-/Event-Log-Inhalte mit potenziell sensiblen Details – **Entscheidung nötig** | siehe Kap. 11; Default: Events nicht migrieren oder nur aggregiert |

---

# 4. Vergleich möglicher Lösungen

Gemeinsame Annahme für alle Varianten: **QR-Code trägt nur Pairing-/Auth-Material** (kurze, öffentliche Parameter + Authenticator), **niemals den Master Key** und möglichst keine großen Nutzdaten.

Bewertungsskala: **Hoch / Mittel / Niedrig** (relativ zueinander).

## 4.1 QR-Code + Lokales WLAN

**Idee:** Beide Geräte im selben LAN (Heim-WLAN oder Hotspot eines Geräts). QR enthält z. B. Rolle, Protokollversion, IP/Port oder Discovery-Hint, öffentlichen ECDH-Share und Short Authentication String (SAS). Nutzdaten laufen über TLS/Noise über TCP.

| Kriterium | Bewertung | Begründung |
| --- | --- | --- |
| Sicherheit | **Hoch** (mit korrektem Binding) | Visuelles Pairing + SAS/PAKE erschwert MitM; Payload E2E. Risiko: kompromittiertes LAN ohne Binding – deshalb Binding Pflicht. |
| Geschwindigkeit | **Hoch** | WLAN-Durchsatz reicht für viele/große PDFs. |
| Android | **Hoch** | Local Network / Hotspot üblich; Cleartext-Traffic ist in der App derzeit deaktiviert → TLS oder klar definierte Ausnahme nur für Loopback/P2P nötig. |
| iOS | **Mittel–Hoch** | Local Network Permission; Hotspot/Join-Verhalten UX-sensibel; Machbarkeit gegeben. |
| Expo-Kompatibilität | **Mittel** | QR via Camera/Barcode-Modul + Config Plugin; TCP-Server braucht Community-Native-Modul / Expo Module (kein Stock-Expo-API). Dev Client vorhanden → machbar. |
| Wartbarkeit | **Mittel–Hoch** | Protokoll und UX in JS kontrollierbar; Netzwerk-Edge-Cases (AP-Isolation, IPv6, VPN) müssen getestet werden. |

## 4.2 QR-Code + Nearby Connections

**Idee:** Google Nearby Connections (Android) für Discovery + Payload; QR nur für Out-of-Band-Auth.

| Kriterium | Bewertung | Begründung |
| --- | --- | --- |
| Sicherheit | **Hoch** (Android) | Framework liefert verschlüsselte Payloads; zusätzlich App-Level-E2E empfohlen. |
| Geschwindigkeit | **Hoch** | Für große Dateien ausgelegt. |
| Android | **Hoch** | Native Stärke. |
| iOS | **Niedrig** | Kein gleichwertiges Google-Nearby; iOS bräuchte Multipeer – **zwei Stacks**. |
| Expo-Kompatibilität | **Niedrig** | Kein offizielles Expo-Modul; Custom Native Modules + Wartung. |
| Wartbarkeit | **Niedrig** | Plattformspaltung, schwer testbar, hohe Native-Komplexität. |

## 4.3 QR-Code + Bluetooth

**Idee:** BLE/Classic für Kanal; QR für Pairing-Secret.

| Kriterium | Bewertung | Begründung |
| --- | --- | --- |
| Sicherheit | **Mittel–Hoch** | Mit App-E2E ok; BLE-Pairing allein reicht nicht als Vertrauensanker. |
| Geschwindigkeit | **Niedrig–Mittel** | BLE-MTU/Throughput ungeeignet für viele große Dokumente; Classic BT auf iOS eingeschränkt. |
| Android | **Mittel–Hoch** | BLE verfügbar. |
| iOS | **Mittel** | BLE ok, Classic eingeschränkt; Hintergrundlimits. |
| Expo-Kompatibilität | **Mittel** | z. B. `react-native-ble-plx` o. Ä. + Config Plugin; nicht trivial. |
| Wartbarkeit | **Mittel** | Viele Geräte-/OS-Sonderfälle; langsame Transfers → schlechte UX und Timeout-Risiken. |

## 4.4 QR-Code + Wi-Fi Direct

**Idee:** Peer-to-Peer-WLAN ohne gemeinsames Heimnetz; QR für Auth.

| Kriterium | Bewertung | Begründung |
| --- | --- | --- |
| Sicherheit | **Hoch** (mit Binding) | Direkte Verbindung reduziert Fremdnetz-Risiken; Binding bleibt Pflicht. |
| Geschwindigkeit | **Hoch** | Vergleichbar mit WLAN. |
| Android | **Hoch** | Wi-Fi Direct / Nearby-ähnlich nutzbar. |
| iOS | **Niedrig** | Kein klassisches Wi-Fi Direct; Apple nutzt AWDL/Multipeer – anderer Stack. |
| Expo-Kompatibilität | **Niedrig** | Stark native, kaum einheitliche Expo-Lösung. |
| Wartbarkeit | **Niedrig** | Zwei Plattformimplementierungen, fragile Systemdialoge. |

## 4.5 Kurzfazit Vergleich

| Variante | Cross-Platform | Expo-Fit | Große Dateien | Empfohlen? |
| --- | --- | --- | --- | --- |
| QR + Lokales WLAN | Ja | Am ehesten | Ja | **Ja (Primär)** |
| QR + Nearby | Nein (praktisch) | Schlecht | Ja | Nein als alleinige Architektur |
| QR + Bluetooth | Eingeschränkt | Mittel | Nein | Nur als Fallback-Kanal für Mikro-Payloads |
| QR + Wi-Fi Direct | Nein | Schlecht | Ja | Nein als alleinige Architektur |

---

# 5. Empfehlung

## Empfohlene Architektur

**QR-Code-authentisiertes Pairing + verschlüsselter Transfer über lokales IP-Netz (WLAN oder Soft-AP/Hotspot) mit ephemerem Sitzungsschlüssel und Neuverschlüsselung auf dem Empfänger.**

### Warum genau diese Variante?

1. **Ein Protokoll für Android und iOS** – im Gegensatz zu Nearby/Wi-Fi Direct.
2. **Ausreichender Durchsatz** für Dokumentbestände – im Gegensatz zu BLE.
3. **Passt zum vorhandenen Development Build:** Config Plugins und Native Modules sind bereits Teil der Delivery-Pipeline (SQLCipher, Hardening).
4. **Hält die Kern-Invariante:** Master Key bleibt im Keystore; übertragen werden nur mit Transfer-Key geschützte Vault-Artefakte; Empfänger erzeugt **neuen** Master Key und verschlüsselt neu.
5. **Visuelles Pairing** (QR + kurze Bestätigungszeichenfolge) adressiert MitM in offenen/heimischen Netzen besser als „IP eingeben und hoffen“.
6. **Wartbarkeit:** Kernlogik (Manifest, Chunking, Crypto, State Machine) kann in TypeScript liegen; nur Transport und QR sind native-nah.

### Bewusste Einschränkungen der Empfehlung

- Soft-AP/Hotspot-UX und Local-Network-Permissions müssen sorgfältig designed werden.
- `usesCleartextTraffic: false` bleibt; der Kanal muss TLS oder ein äquivalentes Noise-/AEAD-Protokoll verwenden (kein Klartext-HTTP).
- Später optional: plattformspezifischer P2P-Turbo (Nearby/Multipeer) als **Transport-Plugin** hinter demselben Protokoll – nicht als Ersatz für das Sicherheitsmodell.

### Produktmodell

Die Migration ist ein **expliziter Besitztransfer mit zwei Geräten**, kein Cloud-Recovery. Die bestehende Einstellungstexte („keine Wiederherstellung“) müssen später auf „nur mit beiden Geräten über sichere Migration“ angepasst werden – das ist eine Produkt-/Copy-Änderung, keine Crypto-Kehrtwende.

---

# 6. Pairing-Prozess

Ablauf **ohne** Implementierungsdetails:

1. **Empfänger (neues Gerät):** App frisch installiert / leerer Vault. Benutzer wählt „Daten von anderem Gerät empfangen“. Empfänger erzeugt Pairing-Material und zeigt einen **QR-Code** (und optional einen kurzen Code).
2. **Sender (altes Gerät):** Vault entsperren (Biometrie). Benutzer wählt „Auf neues Gerät übertragen“ und bestätigt Risiken (Sender bleibt vorerst erhalten oder wird nach Erfolg gesperrt – Produktentscheidung).
3. **Scannen:** Sender scannt den QR des Empfängers (oder umgekehrt – empfohlen: Empfänger zeigt, Sender scannt, weil Sender die Daten freigibt).
4. **Netz-Join:** UI führt beide Geräte ins gleiche erreichbare IP-Netz (gemeinsames WLAN oder Hotspot eines Geräts). Discovery über im QR enthaltene Verbindungsparameter bzw. kurze Bestätigung der angezeigten Adresse.
5. **Kryptographisches Binding:** Beide Geräte leiten aus QR-Parametern + Key Agreement einen **Sitzungsschlüssel** ab und zeigen einen **Short Authentication String** (z. B. 6 Zeichen / Wörter). Benutzer vergleicht und bestätigt auf **beiden** Geräten.
6. **Rollen-Handshake:** Protokollversion, Vault-Schema-Version, ungefähre Datenmenge, freier Speicher auf Empfänger werden ausgetauscht und geprüft.
7. **Verbindung steht:** Erst danach beginnt der Datentransfer. Abbruch bis hierhin hinterlässt keinen Vault auf dem Empfänger.

---

# 7. Datenfluss

```
Altes Gerät
    ↓
Authentifizierung (Biometrie / Gerätecode → Vault-Unlock)
    ↓
QR-Code (Pairing / Binding-Parameter, kein Master Key)
    ↓
Pairing (Key Agreement + SAS-Bestätigung auf beiden Geräten)
    ↓
Verbindung (verschlüsselter lokaler Kanal)
    ↓
Übertragung (Manifest + DB-Snapshot-Artefakte + Dokument-Chunks)
    ↓
Integritätsprüfung (Hashes/MAC, Vollständigkeit, Schema)
    ↓
Neuer Master Key (nur auf dem Empfänger im Keystore/Keychain)
    ↓
Neuverschlüsselung (SQLCipher-DB + AES-GCM-Dateien mit neuem Key)
    ↓
Abschluss (Commit auf Empfänger, Wipe der Transfer-Keys, Audit-Events)
```

### Sender-Perspektive (kurz)

1. Unlock → Vault lesbar.
2. Export-Pipeline erzeugt ein **ephemeres Transfer-Paket**: logischer DB-Dump + Dateiinhalte, verpackt und AEAD-geschützt mit dem Sitzungsschlüssel (Master Key selbst nie im Paket).
3. Chunked Upload über den gesicherten Kanal.
4. Wartet auf ACK „Import verifiziert“.
5. Wipe temporärer Export-Dateien; optional UI „Migration abgeschlossen“.

### Empfänger-Perspektive (kurz)

1. Leerer Zustand / Transfer-Staging-Bereich.
2. Empfang in Staging (noch nicht finaler Vault).
3. Integritätsprüfung.
4. `createMasterKey` lokal (auth-bound).
5. Aufbau von `familydata.vault.db` + Neuverschlüsselung aller Dokumente unter `familydata-encrypted/`.
6. Atomarer Commit (Staging → live); bei Fehler vollständiges Löschen des Staging.
7. Erste Entsperrung / Setup-Flags konsistent setzen.

---

# 8. Sicherheitsmodell

## 8.1 Ende-zu-Ende-Verschlüsselung

- Nutzdaten sind auf dem Kanal nur als Ciphertext sichtbar.
- Selbst bei Mitlesen des lokalen Netzes ohne Session-Key keine Vertraulichkeitverletzung.
- Anwendungs-E2E ist unabhängig davon, ob der Transport zusätzlich TLS nutzt (Defense in Depth).

## 8.2 Temporärer Sitzungsschlüssel

- Wird pro Migration neu ausgehandelt (Key Agreement).
- Liegt nur im RAM beider Geräte während der Session.
- Nach Abschluss/Abbruch: Wipe; kein SecureStore-Persistieren des Transfer-Keys.

## 8.3 Schutz gegen Man-in-the-Middle

- QR als Out-of-Band-Kanal für öffentliche Parameter / Commitment.
- Short Authentication String (visueller Vergleich) oder äquivalentes PAKE-Binding.
- Ohne Bestätigung kein Datentransfer.
- Protokoll lehnt Verbindungen ohne erfolgreiches Binding ab.

## 8.4 Integritätsprüfung

- Manifest mit Dateigrößen und kryptographischen Digests.
- AEAD-Tags pro Chunk/Paket.
- Schema- und Versionschecks vor Import.
- Speicherplatz-Check vor Start großer Transfers.

## 8.5 Rollback bei Fehlern

- Empfänger arbeitet in einem **Staging-Bereich**; der produktive Vault entsteht erst nach Verifikation.
- Fehler → löschen Staging, kein Master Key behalten oder Key wieder entfernen, UI „fehlgeschlagen, erneut versuchen“.
- Sender-Vault bleibt unangetastet (kein destruktives Löschen als Default).
- Transfer-Temps auf beiden Seiten werden analog zum bestehenden Lock-Wipe-Muster bereinigt.

## 8.6 Beziehung zum bestehenden Vault-Modell

| Bestehend | Transfer |
| --- | --- |
| Master Key device-bound | bleibt; neuer Key nur lokal auf Empfänger |
| SQLCipher + AES-GCM | bleiben die Ruheverschlüsselung nach Import |
| Biometrie-Gates | Sender-Start und ggf. kritische Schritte |
| Kein Cloud-Backup | bleibt gültig |

---

# 9. Benötigte Libraries

Zusätzlich zur heutigen Dependency-Liste (Konzept – **noch nicht installieren**):

| Library / Modul (Kandidaten) | Zweck | Warum benötigt | Plattform |
| --- | --- | --- | --- |
| `expo-camera` (Barcode/QR) oder vergleichbares QR-Modul | QR scannen | Pairing Out-of-Band | Android + iOS (Expo Config Plugin) |
| `expo-network` (oder gleichwertig) | Netzstatus / Erreichbarkeit | UX-Hinweise vor Transfer | Android + iOS |
| TCP/TLS-fähiges Native-Modul (z. B. Community `react-native-tcp-socket` o. eigenes Expo Module) | Lokaler verschlüsselter Datentransport | Expo hat keinen eingebauten Peer-TCP-Server | Android + iOS, Dev Client |
| `@noble/curves` (oder bereits abgedecktes Äquivalent) | ECDH Key Agreement | Sitzungsschlüssel ohne Master-Key-Export | JS, cross-platform |
| Bestehendes `@noble/ciphers` | AEAD für Transfer-Chunks | Bereits vorhanden – wiederverwenden | JS |
| Bestehendes `expo-crypto` | CSPRNG, Digests | Bereits vorhanden | Android + iOS |
| Optional: Hotspot-/Connectivity-Helfer (plattformspezifisch) | Soft-AP / Join-Hinweise | Robustheit ohne gemeinsames Heim-WLAN | stark plattformabhängig |
| **Nicht empfohlen als Primärstack:** Google Nearby / Wi-Fi Direct / Multipeer-only Libraries | P2P | Hohe Fragmentierung, schlechter Expo-Fit | uneven |

**Bereits vorhanden und wiederzuverwenden (keine Neuinstallation nötig für Kern-Crypto-at-Rest):**  
`expo-secure-store`, `expo-local-authentication`, `expo-sqlite`+SQLCipher, `expo-file-system`, `@noble/ciphers`, `expo-crypto`.

---

# 10. Risiken

1. **Local-Network-Isolation / AP-Client-Isolation:** Geräte sehen sich im Hotel-/Gast-WLAN nicht → Transfer scheitert ohne Hotspot-Fallback.
2. **iOS Local Network Permission / Hotspot-UX:** Benutzerverständnis und Ablehnung der Permission blockieren Pairing.
3. **Große Payloads / Speicherdruck:** Doppelter Platzbedarf (Staging + final) auf dem Empfänger.
4. **Auto-Lock während Transfer:** Bestehende „immediate“-Defaults können laufende Sessions abbrechen → Transfer-Flow braucht kontrollierte, zeitlich begrenzte Suppress-Policy (analog Pickern) ohne Sicherheitsloch.
5. **Cleartext-Traffic-Policy:** Fehlkonfiguration könnte verbotenen Klartext-HTTP einführen.
6. **Unvollständiger Import:** Ohne striktes Staging/Commit entstehen inkonsistente Vaults.
7. **Protokoll-Downgrade / gefälschte QR-Codes:** Ohne Versionspinning und SAS-Vergleich MitM möglich.
8. **JS-Memory-Wipe-Grenzen:** Wie im bestehenden Threat Model – Residualrisiko bei entsperrtem Sender während Export.
9. **Produktkommunikation:** Widerspruch zur heutigen „keine Wiederherstellung“-Copy, wenn Migration wie Cloud-Backup missverstanden wird.
10. **Zwei-Geräte-Voraussetzung:** Verlust des alten Geräts ohne vorherige Migration bleibt unlösbar – das muss klar bleiben.
11. **Expo-Modul-Wartung:** TCP/QR-Plugins müssen über Expo-/RN-Upgrades gepflegt werden.
12. **Rechtliche/UX-Fehlbedienung:** Migration starten, aber Sender danach weiter nutzen und divergieren (Split-Brain) – Prozessregeln nötig (Kap. 11).

---

# 11. Offene Fragen

1. **Sender nach Erfolg:** Vault auf dem alten Gerät belassen, soft-lock („migriert“), oder sicheres Wipe anbieten?
2. **Einmaligkeit:** Darf dasselbe Quellgerät mehrfach migrieren (z. B. fehlgeschlagenes Zielgerät)?
3. **Audit-Daten:** `security_events` / `export_history` migrieren oder bewusst neu beginnen?
4. **Teilmigration:** Nur Metadaten ohne Dokumente – gewünscht oder bewusst ausgeschlossen?
5. **Rollen im QR:** Empfänger zeigt QR (empfohlen) vs. Sender zeigt QR – finale UX-Entscheidung.
6. **Hotspot-Pflicht vs. gleiches WLAN:** Soll Soft-AP der Default-Pfad sein?
7. **Mindestversionen:** Ab welchem App-/Schema-Stand ist Transfer erlaubt?
8. **Concurrent edits:** Sperre Schreiboperationen auf dem Sender während der Session?
9. **Transport-Plugin später:** Nearby/Multipeer als optionales Performance-Backend hinter demselben Manifest-Protokoll?
10. **UI-Ort:** Einstellungen → Sicherheit (statt des heutigen Non-Recovery-only-Texts) oder separater Assistent beim Erststart des neuen Geräts?
11. **Teststrategie:** Wie werden Cross-Device-Tests in CI abgebildet (Simulator-Limits)?
12. **Namensklärung:** `MigrationService` existiert bereits für Same-Device-Klartext→Vault – neuer Name z. B. `DeviceTransferService` nötig, um Verwechslung zu vermeiden.

---

# Architektur-Urteil (Zusammenfassung)

**Kann die Funktion mit der aktuellen FamilyData-/Family-Vault-Architektur sinnvoll und sicher umgesetzt werden?**

**Ja – als additive Erweiterung, ohne den bestehenden Vault-Kern zu ersetzen.**

| Aussage | Bewertung |
| --- | --- |
| Bestehende Ruheverschlüsselung (SQLCipher + AES-GCM + Keystore-Master-Key) | **Geeignet als Fundament** |
| Invariante „Master Key verlässt Gerät nie“ | **Einhaltbar**, wenn Transfer nur Klartext-ephemer im Sender verarbeitet und Empfänger neu verschlüsselt |
| Transport / Pairing / Re-Key-Pipeline | **Heute nicht vorhanden** – muss neu gebaut werden |
| Expo Go | **Ungeeignet** (wie bisher); nur Development Build / Release |
| Grundlegende Crypto-Architektur ersetzen? | **Nein** |
| Grundlegende Produkt-/Threat-Model-Anpassung? | **Ja (Copy + expliziter Transfer-Flow)** – aber kein Widerspruch zur Offline-Tresor-Idee, sofern klar von Cloud-Recovery getrennt |
| Empfohlener Weg | **QR-authentisiertes Pairing + lokales IP/WLAN (TLS/Noise) + neuer Master Key + Neuverschlüsselung** |

**Nicht erforderlich:** Wechsel auf Cloud-Accounts, Aufgabe der Gerätebindung, oder Ersatz von SQLCipher/AES-GCM.  
**Erforderlich:** neues Transfer-Protokoll, QR + lokaler Netztransport (zusätzliche Libraries/Config Plugins), Staging/Commit-Import, UX- und Policy-Entscheidungen aus Kap. 11.

---

*Ende der Architektur-Dokumentation. Keine Implementierung in dieser Phase.*
