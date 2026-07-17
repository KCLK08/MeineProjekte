# Device Transfer – UX Review

**Rolle:** Senior Mobile UX / Product Design  
**Produkt:** FamilyData Geräteübertragung  
**Stand:** produktive UI (Hub, Host, Join, SecureChannelPanel, TransferTimeline, friendly errors)  
**Scope:** Analyse + kleine Verbesserungsvorschläge. Keine Service-, Security- oder Architekturänderungen.

---

## 1. Gesamtbewertung

**Note: B+ / gut für Early Access**

Die Oberfläche ist klar von der Labor-UI weggerückt: Rollen („senden“ vs. „empfangen“), Sicherheitscode und Timeline sind für Laien verständlich. Ein durchschnittlicher Nutzer kommt durch den Happy Path, **solange beide Geräte verfügbar sind und die manuell getriggerten Schritte in der richtigen Reihenfolge getippt werden**.

Die größte UX-Schwäche ist nicht die Copy, sondern **Zustandsklarheit bei Zwischenphasen**: Oft ist unklar, ob der Nutzer *handeln* oder *warten* soll – besonders nach dem Pairing, wenn Host und Join jeweils eigene Buttons brauchen („Verbindung herstellen“, „Familiendaten senden“, „Dokumente senden“, „Einrichtung starten“). Das fühlt sich noch wie ein geführter Wizard an, nicht wie ein durchlaufender Transfer.

| Dimension | Urteil |
| --- | --- |
| Rollenwahl (Hub) | Stark |
| Pairing / QR | Gut |
| Sicherheitscode | Stark |
| Fortschritt (Timeline) | Gut, Labels teils ungenau |
| Warten vs. Handeln | Mittel – größtes Rest-Risiko |
| Fehler → nächster Schritt | Gut bis mittel |
| Abschluss (Keep / Wipe / Ready) | Gut |

**Fazit:** Für Dogfood / Family Beta freigabefähig. Vor Broad Production die High-Items zu Warte-/Handlungszuständen und Abbruchschutz schließen (reine UI/Copy, ohne Service-Umbau).

---

## 2. Gute UX-Entscheidungen

1. **Hub mit zwei klaren Jobs** – „Neues Gerät verbinden“ vs. „Daten übernehmen“ mit CTA und Kurzbeschreibung; Nutzer muss keine Rollen-Technik kennen.
2. **Datenschutz-Anspruch ohne Jargon** – „Deine Daten verlassen niemals deine Geräte“ + Hinweis, dass der Tresor-Schlüssel auf dem jeweiligen Gerät bleibt.
3. **SAS groß und vergleichbar** – Format `ABCD 1234`, CTA „Code stimmt überein“, Hinweis „auf beiden Geräten“.
4. **TransferTimeline** – Sequenz Verbindung → Familie → Dokumente → Einrichtung ist mental modellierbar; Statusbadges (Erledigt / Läuft / Wartet / Fehler) helfen.
5. **Freundliche Fehler** – `friendlyTransferError` mappt technische Strings (AEAD, expired, …) auf handlungsnahe deutsche Sätze.
6. **Sender-Abschluss mit Bestätigung** – „Sicher löschen“ ist sekundär (ghost) und hinter einem Bestätigungsdialog; „Behalten“ ist der sichere Default-Pfad.
7. **Empfänger-Abschluss** – „FamilyData ist bereit“ + „Zur Familie“ schließt den Job emotional und navigiert sinnvoll.
8. **Biometrie vor Host-Start** – „Gerät vorbereiten / Biometrie erforderlich“ setzt Erwartung und schützt den Sender-Vault sichtbar.

---

## 3. Probleme nach Priorität

### Critical

*Keine Criticals in der aktuellen Copy/Struktur.*  
(Kein Zustand, der Nutzer systematisch in irreversible Datenverluste ohne Warnung führt; Wipe hat Confirm.)

---

### High

| ID | Thema | Problem | Wirkung |
| --- | --- | --- | --- |
| H1 | **Handeln vs. Warten nach Pairing** | Host muss nacheinander tippen: Verbindung → Familiendaten → Dokumente. Join tippt „Auf Verbindung warten“ (klingt passiv, ist aber ein Button) und später „Einrichtung starten“. Timeline zeigt oft „Wartet“, ohne zu sagen *worauf* (z. B. „Tippe auf dem alten Gerät …“). | Nutzer stecken fest oder tippen zu früh/zu spät; Support-Last. |
| H2 | **Abbrechen ohne Schutz während Transfer** | Host/Join zeigen dauerhaft „Abbrechen“ (ghost) auch mitten in Übertragung/Einrichtung – ohne Confirm. | Versehentlicher Abbruch + verwaiste Session; Frust, Neustart nötig. |
| H3 | **Kein „Codes stimmen nicht“** | Nur positiver CTA „Code stimmt überein“. Bei Abweichung fehlt expliziter Abbruch/Hinweis („Nicht übereinstimmend – neu starten“). | Nutzer bestätigt trotzdem oder weiß nicht, was tun. |
| H4 | **Join: Ablauf/Fehler ohne „Neu starten“** | Bei `expired`/`error` nur „Abbrechen“; Scanner erscheint wieder, aber ohne klaren Recovery-CTA wie beim Host. | Unklarer Recovery-Pfad auf dem neuen Gerät. |

---

### Medium

| ID | Thema | Problem | Wirkung |
| --- | --- | --- | --- |
| M1 | **Schrittnummern inkonsistent** | Host zeigt „1.“ und „2.“, springt nach Pairing zu „3.“ / „4.“ – kein durchgängiger Stepper. Join hat keine nummerierte Führung. | Orientierung „wo bin ich?“ schwächer. |
| M2 | **Timeline-Label „Einrichtung abgeschlossen“** | Label klingt final, Status ist oft noch „Wartet“/„Läuft…“. | Kognitive Dissonanz. |
| M3 | **Peer-Kontext fehlt** | Kaum Text wie „Am anderen Gerät: Code anzeigen“ / „Am anderen Gerät: Scannen“. | Paar-Geräte-Flows brauchen immer den zweiten Bildschirm im Kopf. |
| M4 | **Join: „leeres Gerät“ / Ersetzen** | Nicht explizit, dass dieses Gerät die Daten *übernimmt* und lokale Empfänger-Daten ersetzt (nur im Cutover-Alert kurz). | Unsicherheit vor Start; Überraschung beim Alert. |
| M5 | **Große Dokumentmengen** | Timeline zeigt ggf. `docs.progress`, sonst nur „Übertragung läuft…“. Keine Dauer-/Größenerwartung. | Nutzer denken an Freeze bei langen Transfers. |
| M6 | **QR-Wartephase Host** | Nach Anzeigen des Offer-QR ist unklar, *wann* „Antwort scannen“ dran ist (nachdem neues Gerät gescannt und Antwort-QR zeigt). | Frühes Scannen → Fehleralerts. |
| M7 | **Fehler ohne nächsten Schritt** | z. B. Speicher voll: Meldung ohne „Speicher freigeben und erneut versuchen“. WLAN: kein „beide Geräte im gleichen WLAN?“. | Nutzer wissen *dass* es scheiterte, nicht *wie* weiter. |
| M8 | **Hub-Wort „Vault“** | In Join-Card: „FamilyData-Vault“ – leicht technisch neben sonst alltagssprachlicher Copy. | Kleine Einstiegshürde. |

---

### Low

| ID | Thema | Problem |
| --- | --- | --- |
| L1 | StatusBadge „QR bereit“ | Intern klar, für Laien weniger als „Code anzeigen“. |
| L2 | Doppelte SAS-Titel Host | SectionTitle + „3. Sicherheitscode…“ redundant. |
| L3 | LoadingBlock in Panel | `flex-1`-Loading kann Layout in kurzen Panels unruhig machen. |
| L4 | Erfolgs-Timeline unter dem Success-Panel | Nützlich zum Nachlesen, kann als „noch nicht fertig“ wirken. |
| L5 | Sicherheitspanel nur im Hub | Während Join/Transfer nicht wiederholt – Master-Key-Botschaft leicht vergessen. |

---

## 4. Konkrete UI-Verbesserungen

Nur Copy / kleine Zustandsanzeigen. **Keine** Service-Orchestrierung, **keine** Security-Änderungen.

### Sofort (High, wenig Aufwand)

1. **Aktionszeile unter der Timeline** (beide Rollen)  
   Eine Zeile, immer sichtbar, z. B.:  
   - Host: „Als Nächstes: Familiendaten senden“ / „Warte: neues Gerät richtet ein…“  
   - Join: „Warte: altes Gerät startet die Verbindung“ / „Als Nächstes: Einrichtung starten“  
   → löst H1/M3 ohne Auto-Pipeline.

2. **Button-Label Join umbenennen**  
   „Auf Verbindung warten“ → „Verbindung annehmen“ oder „Mit altem Gerät verbinden“ (wenn Tippen nötig bleibt).

3. **Abbrechen-Confirm** wenn Transfer aktiv (`connected` oder Phasen ≠ idle)  
   Dialog: „Übertragung abbrechen? Du kannst danach neu starten.“

4. **SAS negativer Pfad**  
   Ghost-Button „Codes stimmen nicht überein“ → kurze Erklärung + Session clear / zurück zum Hub.

5. **Join Recovery**  
   Bei abgelaufen/Fehler: „Neu starten“ analog Host + eine Zeile „Starte auch auf dem alten Gerät neu.“

### Kurzfristig (Medium)

6. **Timeline-Label** „Einrichtung abgeschlossen“ → „Einrichtung“ (Statusbadge trägt „Erledigt“).

7. **Join Intro** vor Scanner:  
   „Dieses Gerät übernimmt deine FamilyData-Daten vom alten Gerät.“  
   Optional ein Satz: „Ein neuer Schutz auf diesem Gerät wird eingerichtet – der Schlüssel des alten Geräts wird nicht kopiert.“ (alltagssprachlich, Hub-Sicherheitspanel spiegeln).

8. **Host QR-Hilfe** unter Offer-QR:  
   „1. Neues Gerät scannt diesen Code. 2. Danach tippst du hier auf Antwort scannen.“

9. **Fehler-Copy anreichern** (nur `transferUiCopy.ts`):  
   - Speicher: „… Speicher freigeben und erneut versuchen.“  
   - Verbindung: „… Prüfe, ob beide Geräte im gleichen WLAN sind.“

10. **Dokument-Detail** in Timeline: wenn Progress-String fehlt, Fallback „Das kann bei vielen Dateien einige Minuten dauern.“

11. **Hub Join-Card** „Vault“ → „Daten“ / „Familie und Dokumente“, falls Spez-Text nicht fix ist.

### Optional (Low)

12. Einheitlicher Mini-Stepper (1–5) auf Host und Join.  
13. Success-Screen: Timeline einklappbar („Details anzeigen“).  
14. StatusBadge-Texte alltagssprachlicher („Code sichtbar“ statt „QR bereit“).

---

## 5. Flow-Checklisten (Audit-Detail)

### 5.1 Host – Altes Gerät sendet

| Phase | Was der Nutzer sieht | Klarheit |
| --- | --- | --- |
| Vor QR | „Gerät vorbereiten“, Biometrie, Loading | Gut – was tun: bestätigen |
| QR anzeigen | Schritt 2, großer QR, Hinweis „auf neuem Gerät scannen“ | Gut – was anderes Gerät tut: scannen |
| Antwort scannen | Kamera + Hinweis | Gut; *wann* wechseln: nur mittel (M6) |
| SAS | Großer Code + Vergleichshinweis | Gut |
| Transfer | Timeline + manuelle CTAs | Mittel – Handeln/Warten (H1) |
| Warten Cutover | „Neues Gerät wird eingerichtet“ | Gut genug |
| Fehler abgelaufen | Meldung + Neu starten / Abbrechen | Gut |
| Erfolg | Behalten / Sicher löschen + Confirm | Gut |

**Kann der Nutzer immer erkennen…**

- was er tun muss? → Meist ja; nach Pairing oft nur nach Button-Labels.  
- was das andere Gerät macht? → Teilweise; Peer-Texte fehlen.  
- wann er warten muss? → Teilweise; Join-Wartephasen besser als Host-Zwischenklicks.

### 5.2 Join – Neues Gerät übernimmt

| Frage | Antwort |
| --- | --- |
| Klar, dass Gerät „leer“/empfängt? | Nur indirekt („Daten übernehmen“) – verbessern (M4) |
| Klar, dass Daten übernommen werden? | Ja im Hub/Titel |
| Klar, dass alter Master-Key nicht übertragen wird? | Nur Hub-Sicherheitspanel – während Flow schwach (L5); UX-Formulierung möglich ohne Technik |

### 5.3 Fortschritt (TransferTimeline)

- Reihenfolge: verständlich.  
- Zwischenzustände: fehlen Peer-Hinweise und „bereit zum Tippen“.  
- Prozent: nice-to-have bei Docs; nicht zwingend, wenn Zeit-/Mengenerwartung (M5/10) steht.  
- Große Dokumentmengen: Risiko „hängt?“ – Copy + Progress-Detail.

### 5.4 Wartezustände

| Situation | Warum sichtbar? | Was kann Nutzer tun? |
| --- | --- | --- |
| Warten auf QR-Scan (Host zeigt QR) | Mittel – „zeige dem neuen Gerät“ | Warten; optional Antwort scannen (Timing unklar) |
| Warten auf anderes Gerät (Join nach Connect) | „Warte auf Daten“ | Nur warten – gut |
| Dokumenttransfer | Timeline aktiv + Loading | Warten; Abbrechen riskant (H2) |
| Cutover | „Neues Gerät wird eingerichtet“ / Join Loading | Warten; Join vorher aktiver CTA „Einrichtung starten“ |

### 5.5 Fehlerzustände

| Fall | UX heute | Nächste Schritte klar? |
| --- | --- | --- |
| QR abgelaufen | Friendly Copy; Host Neu starten | Host ja / Join mittel (H4) |
| WLAN getrennt | Verbindungs-Copy | Teilweise – WLAN-Hinweis fehlt (M7) |
| Speicher voll | Kurze Meldung | Nein – Aktion fehlt (M7) |
| App beendet | Kein spezieller Recovery-Screen | Nein – generischer Neustart erwartet |
| Sicherheitscode „falsch“ | Kein dedizierter Pfad | Nein (H3) |
| Transfer abgebrochen | Abbrechen soft | Zu leicht; danach Hub – OK wenn Confirm (H2) |

### 5.6 Abschluss

**Sender:** Keep/Wipe verständlich; Wipe mit Dialog geschützt; versehentliche Klicks durch ghost+confirm gemildert. Stärkere Formulierung „kann nicht rückgängig gemacht werden“ wäre Medium-Plus.

**Empfänger:** „FamilyData ist bereit“ kommuniziert Abschluss klar; „Zur Familie“ schließt den Job.

---

## 6. Empfohlene Reihenfolge (nur UI)

1. H1 Aktionszeile „Als Nächstes / Warte…“  
2. H2 Abbrechen-Confirm bei aktivem Transfer  
3. H3 SAS „stimmt nicht“  
4. H4 Join Neu starten  
5. M2/M4/M6/M7 Copy-Feinschliff  

Damit bleibt die bestehende Architektur unangetastet und die Nutzerführung erreicht „Broad Beta“-Niveau.

---

## 7. Referenz (geprüfte Dateien)

- `app/settings/transfer/index.tsx`
- `app/settings/transfer/host.tsx`
- `app/settings/transfer/join.tsx`
- `src/components/SecureChannelPanel.tsx`
- `src/components/TransferTimeline.tsx`
- `src/deviceTransfer/transferUiCopy.ts`
- `DEVICE_TRANSFER_UI_IMPLEMENTATION.md`
