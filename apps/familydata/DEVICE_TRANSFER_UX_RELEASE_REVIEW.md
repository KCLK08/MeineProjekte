# Device Transfer – UX Release Review

**Rolle:** Senior Mobile Product Design / RN UX  
**Stand:** Release-Polish nach Hardening (H1–H4)  
**Scope:** UI-Darstellung, Texte, Animation, Fortschritt, Accessibility – **keine** Service-/Security-/Crypto-/Nav-/DB-Änderungen

---

## 1. Änderungen

| Datei | Inhalt |
| --- | --- |
| `src/components/TransferTimeline.tsx` | Puls-Animation für aktiven Schritt, Screenreader-Labels (Status nicht nur Farbe) |
| `src/components/SecureChannelPanel.tsx` | Dokument-Detail, Keep-open-Hinweis, Empfänger-Zusammenfassung, Abschluss-Copy Sender/Empfänger |
| `src/components/TransferActionHint.tsx` | a11y Label, Dark-Mode-Tokens unverändert |
| `src/deviceTransfer/transferUiCopy.ts` | `formatDocumentTransferDetail`, `friendlyProgressLine`, `KEEP_APP_OPEN_HINT` |
| `src/components/PairingQrScanner.tsx` | Freundlichere Copy, Kamera-a11y |
| `src/components/ui.tsx` | Optional `accessibilityLabel` / `accessibilityState` an `PrimaryButton`; Badge a11y |
| `app/settings/transfer/index.tsx` | „Vault“ / „Tresor-Schlüssel“ aus Hub-Copy entfernt |
| `DEVICE_TRANSFER_UX_RELEASE_REVIEW.md` | Dieses Dokument |

---

## 2. UX Verbesserungen

### Fortschritt Dokumente

- Zeigt echte Zähler, wenn verfügbar: „12 von 45 Dokumenten“ (aus Progress-String oder Counts + `documentCount`).
- **Keine** erfundenen MB-/Prozentwerte (Services liefern keine Bytes in der UI-Snapshot).
- Fallback: Dauer-Hinweis bei vielen Dokumenten.

### Animation

- Dezentes Opacity-Pulse am aktiven Timeline-Punkt (`Animated` aus React Native, keine neue Library).

### Zusammenfassung Empfänger

- Panel „Übertragung abgeschlossen“ mit ✓ Familieninformationen / Dokumente / Einstellungen.
- Dokument-/Personen-Zeilen nur bei echten Counts (`cutover` / Migration-Snapshot).

### Lange Transfers

- Hinweis: **„Bitte lasse die App geöffnet…“** – korrekt, weil Auto-Lock während des Dokumenttransfers **nicht** dauerhaft unterdrückt wird (`AUTOLOCK_SECURITY.md`). Kein falsches Hintergrund-Versprechen.

### Abschluss

- Empfänger: „Deine Daten sind bereit“ / „Die Übertragung wurde erfolgreich abgeschlossen.“ / CTA „Zu FamilyData“.
- Sender: „Übertragung erfolgreich“ / „Das neue Gerät wurde eingerichtet.“ → Keep/Wipe.

### Copy

- Hub ohne „Vault“; Sicherheitshinweis ohne „Tresor-Schlüssel“.
- Technische Progress-Strings werden gefiltert (`friendlyProgressLine`).

---

## 3. Accessibility Check

| Kontrolle | Status |
| --- | --- |
| Buttons: `accessibilityRole="button"` + Label | OK (`PrimaryButton`) |
| Disabled-State für Screenreader | OK (`accessibilityState`) |
| Timeline: Status als Text + Label, nicht nur Farbe | OK (Badge + Mark + a11y Satz) |
| Aktiver Puls: vom Screenreader ausgeblendet, Parent trägt Status | OK |
| QR-Scanner: Kamera-Bereich beschriftet; „Kamera erlauben“ / „Erneut scannen“ | OK |
| Fehler: `accessibilityRole="alert"` | OK |
| Touch-Ziele Buttons ≥ 48 px | OK (bestehend) |
| Textgrößen Body ≥ 13–15 px | OK |

---

## 4. Dark Mode Check

| Komponente | Tokens | Urteil |
| --- | --- | --- |
| `TransferActionHint` | `border-line`, `bg-paper`, `text-ink` + dark: Varianten | OK |
| `TransferTimeline` / Panel / Badge | Bestehende pine/mute/danger Tokens | OK |
| Success / Recovery / Summary Panels | Gleiche Panel-Primitives | OK |
| Pulse-Mark | `colors.pine` aus Theme | OK |
| Keine neuen Hex-Farben außerhalb Design-System | – | OK |

---

## 5. Release Empfehlung

**Empfehlung: Go für Family-Beta / Early Access**, sofern:

1. Manueller Happy-Path Host + Join auf zwei Geräten (WLAN) grün.
2. Dokumenttransfer mit mehreren Dateien: Zähler oder Fallback-Hinweis sichtbar.
3. App während Doku-Transfer im Vordergrund lassen (Auto-Lock-Hinweis verstanden).
4. SAS-Mismatch, Abort-Confirm, Join-Recovery einmal manuell geprüft (bereits Hardening).

**Nicht blockierend für Beta:**

- Fehlende Byte-Progress-Anzeige (keine Datenquelle in UI-Snapshots).
- Keine automatisierte E2E-Suite für Screenreader.

**Broad Store-Release:** nach gerätegebundenem Testplan (Security + UX AL/Recovery) und grünem Dokument-Last-Test.
