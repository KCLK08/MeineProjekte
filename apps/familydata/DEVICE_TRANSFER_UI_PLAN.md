# Family Vault – Device Transfer UI Integration Plan

**Status:** Analyse only (keine UI-Codeänderungen in diesem Schritt)  
**Basis:** bestehende Expo-Router-App + implementierte Transfer-Security (Phase 2–4C)  
**Prinzip:** bestehendes Design System, Navigation und Patterns beibehalten  

---

## 1. Bestehende UI-Struktur

### 1.1 App-Shell

| Ebene | Ort | Rolle |
| --- | --- | --- |
| Root Stack | `app/_layout.tsx` | Stack + `AppLockGate` über allen Routen |
| Tabs | `app/(tabs)/` | **Familie**, **Dokumente**; Settings-Tab versteckt (`href: null`) |
| Settings Hub | `app/settings/index.tsx` | Einstieg über Icon aus Tab-Screens |
| Security | `app/settings/security.tsx` | Sperre, Screenshots, **Geräteübertragung**-Einstieg |
| Transfer | `app/settings/transfer/*` | Hub + Host + Join (bereits vorhanden) |

### 1.2 Bereits vorhandene Transfer-Routen

| Route | Header-Titel | Datei |
| --- | --- | --- |
| `/settings/transfer` | Geräteübertragung | `transfer/index.tsx` |
| `/settings/transfer/host` | Neues Gerät verbinden | `transfer/host.tsx` |
| `/settings/transfer/join` | Daten übernehmen | `transfer/join.tsx` |

Einstieg (bestehend und empfohlen):

```
Einstellungen → Sicherheit → Geräteübertragung
```

`security.tsx`: Section **Geräteübertragung**, Button **Geräteübertragung** → `/settings/transfer`.

### 1.3 Design-System (nicht ändern)

- Fonts: Display (Fraunces) + Sans (DM Sans)
- Farben: Pine / Canvas / Ink / Mute (Light + Dark)
- Layout: `Screen` + `ScrollView` + `Panel` + `SectionTitle`
- CTAs: `PrimaryButton` (`primary` / `soft` / `ghost` / `danger`)
- Status: `StatusBadge` (`ok` / `warn` / `danger` / `neutral`)
- Dialoge: `Alert.alert` (kein separates Dialog-System)
- Loading: `LoadingBlock`

---

## 2. Empfohlene Screens

Keine neuen Stack-Zweige. Die drei bestehenden Screens reichen; die Lab-Oberfläche in `SecureChannelPanel` wird später zur produktiven Fortschritts-UI umgebaut (separater Implementierungsschritt).

### 2.1 Transfer-Hub (`transfer/index`)

**Zweck:** Rollenwahl und Sicherheitskurzhinweis.

| UI-Element | Inhalt |
| --- | --- |
| Titel | Geräteübertragung |
| Option A | **Neues Gerät verbinden** (Sender) |
| Option B | **Daten übernehmen** (Empfänger) |
| Hinweis | Master Key verlässt das Gerät nicht; WLAN lokal |

**Anpassung später (kein Redesign):** Copy „Nur Pairing / Phase 2–4B“ durch produktive Kurztexte ersetzen; Badge entfernen oder durch Status ersetzen.

### 2.2 Sender – Pairing (`transfer/host`)

| Schritt | UI |
| --- | --- |
| Boot | `LoadingBlock` + Biometrie (`requireSecureAccess`) |
| Offer-QR | `PairingQrDisplay` |
| Accept scannen | `PairingQrScanner` |
| SAS | Code groß + **Code stimmt überein** |
| Danach | Transfer-Fortschritt (heute: `SecureChannelPanel`) |

### 2.3 Empfänger – Pairing (`transfer/join`)

| Schritt | UI |
| --- | --- |
| Offer scannen | `PairingQrScanner` |
| Accept-QR | `PairingQrDisplay` + **Kopplung bestätigen** |
| SAS | **Code stimmt überein** |
| Danach | Transfer-Fortschritt |

### 2.4 Transfer-Fortschritt (innerhalb host/join nach SAS)

Empfohlen als **eine** geführte Sequenz (bestehende Hooks), statt getrennter Debug-Sektionen:

| Phase | Sender (Host) | Empfänger (Joiner) |
| --- | --- | --- |
| Kanal | Primäraktion „Verbinden“ | „Verbinden“ (nach Host) |
| Metadaten | „Daten senden“ | Fortschritt / Warten |
| Dokumente | „Dokumente senden“ | Fortschritt / Warten |
| Cutover | Warten auf Abschluss | „Migration starten“ |
| Erfolg | Behalten / Sicher löschen | Vault bereit |

### 2.5 Erfolgs- / Fehlerzustände

| Zustand | Empfohlene UI (bestehende Patterns) |
| --- | --- |
| Erfolg Empfänger | `Panel` + `StatusBadge` ok + CTA zurück zu Familie |
| Erfolg Sender | bestehender Keep/Wipe-Dialog (`Alert` / Panel-Buttons) |
| Abgelaufen / Fehler | `StatusBadge` danger + **Neu starten** / **Abbrechen** |
| Lock während Transfer | `AppLockGate`; Session bereits gewiped |

Keine neuen Fullscreen-Success-Routen nötig, sofern die Panels klar genug sind.

---

## 3. Routing

### 3.1 Zielbaum (unverändert)

```
/(tabs)  →  /settings  →  /settings/security  →  /settings/transfer
                                                    ├─ /host
                                                    └─ /join
```

### 3.2 Stack-Optionen (bereits in `_layout.tsx`)

- `presentation: 'card'`
- Header sichtbar mit bestehenden Titeln

### 3.3 Guards

| Guard | Bestehend |
| --- | --- |
| Vault gesperrt | `AppLockGate`; Hub/Security-Buttons `disabled={isLocked}` |
| Host-Start | Biometrie `force: true` |
| Transfer-Session | `TransferSessionManager.clear()` beim Hub-Einstieg in host/join |

### 3.4 Nicht empfohlen

- Transfer nicht in die Tab-Bar legen
- Keinen parallelen Stack unter Familie/Dokumente
- Keine Deep-Links außerhalb Settings → Sicherheit

---

## 4. Wiederverwendbare Komponenten

### 4.1 Aus `src/components/ui.tsx`

| Komponente | Transfer-Nutzung |
| --- | --- |
| `Screen` | Alle Transfer-Screens |
| `Panel` | Blöcke für QR, SAS, Fortschritt, Erfolg |
| `SectionTitle` | Abschnitte |
| `PrimaryButton` | CTAs inkl. soft/ghost/danger |
| `StatusBadge` | Pairing-/Kanal-/Phasenstatus |
| `LoadingBlock` | Auth / Session-Start |
| `EmptyState` | Optional bei „kein aktiver Transfer“ |

### 4.2 Transfer-spezifisch (bereits vorhanden)

| Komponente | Nutzung |
| --- | --- |
| `PairingQrDisplay` | Offer-/Accept-QR |
| `PairingQrScanner` | QR-Erfassung |
| `SecureChannelPanel` | Post-SAS Transport + 4A/4B/4C (aktuell Lab-UI) |

### 4.3 System-Dialoge

| Pattern | Nutzung |
| --- | --- |
| `Alert.alert` | Fehler, Cutover-Bestätigung, Sender Keep/Wipe |
| `Modal` (Security Auto-Lock) | Vorbild für optionale Auswahl-Listen – Transfer braucht das aktuell nicht |

### 4.4 Empfohlene spätere Aufteilung (ohne neues Design)

`SecureChannelPanel` intern in klar benannte Abschnitte gliedern (weiterhin gleiche Komponenten):

1. Kanal-Status  
2. Übertragungsfortschritt (Metadaten + Docs)  
3. Migration / Abschluss  

Debug-Elemente (Test-String, Roh-Log, „Phase 3/4A…“-Titel) in der Produkt-UI entfernen oder hinter Dev-Flag.

---

## 5. State Management

### 5.1 Bestehende Architektur

| Store / Hook | Verantwortung |
| --- | --- |
| `securityStore` | Lock, Auto-Lock, Screenshot-Session; `lock()` löscht Transfer-Session |
| `familyStore` | Vault-Daten; nach Cutover/`secureWipe` → `bootstrap()` |
| `useTransferSession` | Pairing, SAS, Rolle, Endpoint |
| `useTransportSession` | Kanalstatus, Fehler, Log |
| `useMigrationTransfer` | 4A Phase, Counts, Progress, `transferId` |
| `useDocumentTransfer` | 4B Phase, Counts, Progress |
| `useVaultCutover` | 4C Phase, Counts, Sender-Choice |

Services (`TransferSessionManager`, `TransportManager`, Migration/Document/Cutover) bleiben Single Source of Truth; UI nur über Hooks/`useSyncExternalStore`.

### 5.2 Wo soll Transfer-UI-State liegen?

| State | Ort | Begründung |
| --- | --- | --- |
| Pairing / SAS | `TransferSessionManager` + `useTransferSession` | Bereits RAM-only, wipe on lock |
| Kanal / Chunk / Cutover | jeweilige Services + Hooks | Bereits vorhanden |
| Lokaler Wizard-Schritt (welcher UI-Schritt sichtbar) | **lokaler React-State** in `host.tsx` / `join.tsx` | Wie heutiges `step` auf Host |
| Persistente App-Daten | `familyStore` / SQLCipher | Erst nach erfolgreichem Cutover |

**Nicht** in `securityStore` oder `familyStore` ablegen: ephemere Transfer-Phasen, Keys, Staging-Flags.

### 5.3 Abgeleiteter UI-Status (Empfehlung)

Eine dünne View-Model-Funktion (später, kein Store):

```
pairing → channel → metadata → documents → cutover → done | failed
```

aus den bestehenden Hook-Snapshots ableiten – ohne neue globale State-Library.

---

## 6. User Flow

### 6.1 Sender (altes Gerät)

```
Einstellungen → Sicherheit → Geräteübertragung
  → Neues Gerät verbinden
  → Biometrie
  → Offer-QR anzeigen
  → Accept-QR scannen
  → SAS prüfen → „Code stimmt überein“
  → Kanal öffnen
  → Metadaten senden
  → Dokumente senden
  → Warten auf Empfänger-Cutover
  → Behalten | Sicher löschen
  → Fertig → Hub / Familie
```

### 6.2 Empfänger (neues Gerät)

```
Einstellungen → Sicherheit → Geräteübertragung
  → Daten übernehmen
  → Offer-QR scannen
  → Accept-QR zeigen → „Kopplung bestätigen“
  → SAS prüfen → „Code stimmt überein“
  → Kanal öffnen (nach Host)
  → Metadaten/Docs empfangen (Staging)
  → Migration starten
  → Erfolg → Familie (bootstrap)
```

### 6.3 Mapping Integrationspunkte ↔ Security-Architektur

| UX-Schritt | Security-Baustein |
| --- | --- |
| QR Scan / Anzeige | Pairing (Phase 2), ephemere Keys |
| Sicherheitscode | SAS-Gate vor Transport |
| Transfer-Fortschritt | Secure Channel + 4A/4B Staging |
| Migration | Phase 4C Cutover |
| Sender-Abschluss | Keep / Secure Wipe |
| Fehler / Abbruch / Lock | Session wipe, Transport close, Staging cleanup |

### 6.4 UX-Constraints (Security, nicht Design)

- Während Metadaten-/Dokumenttransfer: normaler Auto-Lock (Suppress nur Kamera / Biometrie / kurzer Commit – siehe `AUTOLOCK_SECURITY.md` sofern gemerged).
- Lock während Transfer = harter Abbruch; kein Resume ohne neues Pairing.
- Keine Cloud-Accounts, kein Master-Key-Hinweis als „Export“.

---

## 7. Integrations-Reihenfolge (nur Planung)

1. **Copy & Hub** – produktive Texte, Badge „Nur Pairing“ entfernen  
2. **SecureChannelPanel → Guided Progress** – gleiche Komponenten, geführte Schritte, Debug ausblenden  
3. **Erfolgs-Panels** – Empfänger „Vault bereit“, Sender Keep/Wipe prominenter  
4. **Fehler-Texte** – einheitliche `Alert`-/Badge-Sprache  
5. Optional: Empfänger-Biometrie-Parity zum Host  

Keine neuen Screens, keine neue Navigation, keine neue Farbwelt.

---

## 8. Kurzfazit

Die UI-Integration ist **strukturell bereits vorbereitet**:

- Routing unter **Einstellungen → Sicherheit → Geräteübertragung** existiert.
- Pairing-Komponenten und Post-SAS-Panel sind verdrahtet.
- State liegt korrekt in Transfer-Services/Hooks, nicht im Family-Store.

Offen ist vor allem die **produktive UX-Schicht** über dem Lab-Panel (`SecureChannelPanel`): geführter Fortschritt, Abschlusszustände und Copy – ohne Redesign.
