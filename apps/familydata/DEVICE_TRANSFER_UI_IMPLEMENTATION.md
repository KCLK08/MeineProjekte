# Device Transfer UI – Product Implementation

## Ziel

Die Labor-/Test-Oberfläche der Geräteübertragung wurde in eine produktive Nutzerführung überführt – **nur UI-Layer und Texte**. Navigation, Design System, Security- und Transfer-Services bleiben unverändert.

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `app/settings/transfer/index.tsx` | Hub mit produktiven Titeln, Erklärung, zwei Aktions-Cards |
| `app/settings/transfer/host.tsx` | Schrittführung: vorbereiten → QR → Sicherheitscode → Übertragung → Fertig |
| `app/settings/transfer/join.tsx` | Scan → Kopplung → Sicherheitscode → Fortschritt → „FamilyData ist bereit“ |
| `src/components/SecureChannelPanel.tsx` | Debug/Test entfernt; `TransferTimeline` + geführte Aktionen |
| `src/components/TransferTimeline.tsx` | **Neu** – Fortschrittsliste (✓ / ● / ○) mit bestehenden UI-Komponenten |
| `src/deviceTransfer/transferUiCopy.ts` | **Neu** – freundliche Fehlermeldungen + SAS-Formatierung |

## Verwendete Komponenten (bestehend)

- `Screen`, `Panel`, `PrimaryButton`, `StatusBadge`, `LoadingBlock`, `SectionTitle`
- `PairingQrDisplay`, `PairingQrScanner`
- Services/Hooks unverändert: `TransferSessionManager`, `TransportManager`, Migration/Document/Cutover Services + Hooks

## User Flow

### Hub (`/settings/transfer`)

1. Titel **Geräteübertragung**
2. Kurze Erklärung (Daten bleiben auf den Geräten)
3. **Neues Gerät verbinden** → Host-Flow
4. **Daten übernehmen** → Join-Flow

### Host (Sender)

1. **Gerät vorbereiten** – Biometrie / Gerätecode
2. **Neues Gerät verbinden** – eigener QR, danach Antwort scannen
3. **Sicherheitscode vergleichen** – große Darstellung (`ABCD 1234`), „Code stimmt überein“
4. **Übertragung** – Timeline + Aktionen (Verbindung → Familiendaten → Dokumente → Einrichtung)
5. **Fertig** – „Auf diesem Gerät behalten“ / „Sicher löschen“

### Join (Empfänger)

1. QR vom alten Gerät scannen
2. **Kopplung bestätigen** (Antwort-QR)
3. **Gleicher Sicherheitscode?** → „Code stimmt überein“
4. Fortschritt (warten / empfangen / einrichten)
5. **FamilyData ist bereit** → **Zur Familie** (`/(tabs)`)

### SecureChannelPanel

Timeline-Schritte:

1. Geräte verbunden  
2. Familieninformationen  
3. Dokumente  
4. Einrichtung abgeschlossen  

Keine Testnachrichten, keine Debug-Logs, keine Phasen-Namen (Phase 3/4A/4B/4C), keine Krypto-/Transport-Jargon in der UI.

## Fehler-UX

Technische Meldungen werden über `friendlyTransferError()` gemappt, z. B.:

| Intern | Nutzer |
|--------|--------|
| AEAD / Entschlüsselung | Die sichere Verbindung konnte nicht hergestellt werden. |
| expired / abgelaufen | Die Verbindung ist abgelaufen. Bitte starte die Übertragung erneut. |

## Offene Punkte

- Fortschrittsschritte beim Host/Join sind weiterhin **manuell getriggert** (gleiche Service-API wie zuvor); Auto-Pipeline wäre ein Service-/Orchestrierungs-Thema.
- Auto-Lock-Suppress bleibt screen-weit auf Host/Join (wie vor dieser UI-Arbeit); engere Suppress-Scopes sind ein separates Security-Thema.
- Keine neuen E2E-/Snapshot-Tests für die produktive Copy hinzugefügt.
- „Vault“ erscheint nur dort, wo die Spezifikation es verlangt (Join-Card-Beschreibung).

## Nicht geändert

- Routing / Navigation-Struktur
- Design Tokens, Farben, Fonts, globale UI-Primitives
- Security Services, Transfer Services, State-Architektur
