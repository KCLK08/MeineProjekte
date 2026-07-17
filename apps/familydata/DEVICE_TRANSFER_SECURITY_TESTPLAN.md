# Family Vault – Device Transfer Security Testplan

**Scope:** End-to-end Offline Device Transfer (Phase 2–4C)  
**Build:** Development / Release APK with SQLCipher (nicht Expo Go)  
**Umgebung:** Zwei physische Geräte, gleiches WLAN, Vault entsperrt  

---

## Voraussetzungen

| Gerät | Rolle | Zustand |
| --- | --- | --- |
| A | Sender (Host) | Vault mit ≥1 Person, ≥1 Dokument (.dat), entsperrt |
| B | Empfänger (Joiner) | Frische oder leere Vault, entsperrt |
| Netz | LAN | Kein VPN-Tunnel der Geräte trennt; Port 27891 erreichbar |

Nach jedem Fehlertest: Vault lock → Staging muss weg sein; ggf. App neu starten.

---

## 1. Normales Pairing

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 1.1 | A: „Neues Gerät verbinden“ | Offer-QR, Countdown/Ablaufzeit |
| 1.2 | B: Offer-QR scannen | Accept-QR + SAS (8 Hex) |
| 1.3 | A: Accept-QR scannen | Status `paired`, gleicher SAS auf A und B |
| 1.4 | Beide: „Code stimmt überein“ | `sasConfirmed`; Kanal-UI sichtbar |
| 1.5 | A dann B: „Kanal öffnen“ | Status verbunden; Log ohne Payload-Inhalt |

**Pass:** SAS identisch, Kanal nur nach SAS-Bestätigung.

---

## 2. Falscher QR

| Fall | Aktion | Erwartung |
| --- | --- | --- |
| 2.1 | Beliebiger Text / URL als QR | Ablehnung, klare Fehlermeldung |
| 2.2 | Fremder Offer eines anderen Geräts | Session-ID / Schema-Fehler |
| 2.3 | Eigenen Offer auf demselben Gerät „scannen“ | Self-Device / gleiche PK abgelehnt |

**Pass:** Kein `paired`, keine Keys für Transport.

---

## 3. Abgelaufener QR

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 3.1 | Offer erzeugen, >5 min warten | Status `expired`, Secrets gewiped |
| 3.2 | Abgelaufenen Offer auf B scannen | Ablehnung |
| 3.3 | Während Scan warten bis Ablauf | UI zeigt abgelaufen; Neu starten nötig |

**Pass:** Keine Ableitung von Session-Keys nach Expiry.

---

## 4. Transfer abbrechen

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 4.1 | Nach Pairing + Kanal: „Fertig“ / Abbrechen | Transport geschlossen |
| 4.2 | Dateisystem: `familydata-transfer-staging/` | Verzeichnis leer / entfernt |
| 4.3 | Vault A und B | Unverändert nutzbar |

**Pass:** Kein Staging-Rest, produktive Vaults intakt.

---

## 5. App schließen (Force Stop)

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 5.1 | Mitten in 4A/4B App killen (beide Rollen) | Prozess tot |
| 5.2 | App neu starten | Boot wipe entfernt Staging |
| 5.3 | Vault entsperren | Normale Vault; kein halber Cutover |
| 5.4 | Transfer neu starten | Erneutes Pairing nötig (RAM-Session weg) |

**Pass:** Keine Klartext-PII in Staging nach Restart; keine korrupte Vault.

---

## 6. Akkuverlust / Stromausfall

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 6.1 | Während Cutover Gerät B ausschalten (wenn möglich) | Unterbrechung |
| 6.2 | Neu booten + entsperren | Entweder alter Zustand ODER vollständiger neuer Vault – kein Mix |
| 6.3 | `familydata.vault.migration.db` | Nicht als produktive DB übrig |
| 6.4 | `*.pre-cutover` Backups | Entfernt oder konsistent restored |

**Pass:** Atomicity – nie halb alte / halb neue Keys auf produktiven Dateien.

---

## 7. Speicher voll

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 7.1 | Speicher knapthalten (große Dateien) | `ensureFreeSpace` / OS-Fehler |
| 7.2 | Transfer starten | Abbruch mit Fehlermeldung |
| 7.3 | Staging / Migration-Artefakte | Rollback / Cleanup; produktive Vault OK |

**Pass:** Kein Commit bei unvollständigen Dateien.

---

## 8. Falscher Schlüssel / Manipulation

| Fall | Aktion | Erwartung |
| --- | --- | --- |
| 8.1 | Kanal mit anderem Pairing (anderer SAS) | AEAD-Decrypt-Fehler |
| 8.2 | TCP-Frame replay (gleiche Seq, alter Capture) | Replay erkannt oder Decrypt fail |
| 8.3 | Reflektierte Host-Frames an Host | Directional Keys / Role-Handler → kein Staging auf Host |
| 8.4 | Vault B mit falscher Biometrie | Master Key nicht freigegeben |

**Pass:** Keine stillschweigende Datenannahme.

---

## 9. Lock während Transfer

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 9.1 | Während Kanal / 4A / 4B: App in Hintergrund (Auto-Lock sofort) | Session clear, Transport zu, Staging wipe **awaited** |
| 9.2 | Erneut entsperren | Kein Transfer-Resume; Staging weg; neues Pairing nötig |
| 9.3 | Live-QR-Kamera aktiv | Kurz Suppress nur während Preview (siehe `AUTOLOCK_SECURITY.md`) |
| 9.4 | Cutover prepare/build | Auto-Lock **aktiv** (kein Screen-Suppress) |
| 9.5 | Atomarer `commitSwap` | Kurzer Suppress nur für Commit; danach wieder normal |

**Pass:** Lock räumt Transfer-Secrets und Staging; Suppress nur Kamera / Biometrie / kurzer Commit.

---

## 10. Erfolgreicher Cutover (Happy Path)

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 10.1 | 4A Metadaten senden | Empfänger Staging `committed` |
| 10.2 | 4B Dokumente senden | `ready_for_4c`, Mapping validiert |
| 10.3 | B: „Migration starten“ | prepared → building → validated → committed |
| 10.4 | B: Personen/Dokumente prüfen | Anzahlen stimmen; Dateien öffnen/preview |
| 10.5 | Keystore B | Neuer auth-bound Master Key (nicht der von A) |
| 10.6 | A: `cutover_complete` | Dialog Behalten / Sicher löschen |
| 10.7 | Staging auf B | Gewiped |

**Pass:** Vollständige neue Vault auf B; Master Key A nie auf B.

---

## 11. Sender löschen

| Schritt | Aktion | Erwartung |
| --- | --- | --- |
| 11.1 | Nach Cutover auf A: „Behalten“ | Daten unverändert |
| 11.2 | Alternativ: „Sicher löschen“ | Personen/Docs/`.dat` weg; Master Key bleibt; leere Vault öffnet |
| 11.3 | Kein Auto-Delete ohne Dialog | — |

**Pass:** Explizite Nutzerentscheidung; kein stilles Wischen.

---

## 12. Zusatzchecks (Security Regression)

| ID | Check | Erwartung |
| --- | --- | --- |
| R1 | Transport-Log | Nur Typ + Länge, keine Payload-Snippets |
| R2 | `payload.enc` während Staging | Vorhanden; kein `payload.json` Klartext |
| R3 | Ohne „Code stimmt überein“ Kanal öffnen | Blockiert |
| R4 | Zweites `connect()` ohne Re-Pair | Fehlschlag (Ephemeral Secret konsumiert) |
| R5 | Transfer >30 min nach SAS | Transfer-Fenster abgelaufen |
| R6 | Dokument vor 4A-Commit senden | Empfänger lehnt ab |
| R7 | Android Backup | `allowBackup=false` |
| R8 | Screenshot-Schutz | FLAG_SECURE / preventScreenCapture aktiv |

---

## Ergebnisvorlage

```
Test ID | Ergebnis (Pass/Fail) | Gerät/Build | Notizen
--------|----------------------|-------------|--------
1       |                      |             |
…
```

**Freigabe-Kriterium:** Alle Tests 1–11 Pass; Regression R1–R8 Pass auf Release-Build.
