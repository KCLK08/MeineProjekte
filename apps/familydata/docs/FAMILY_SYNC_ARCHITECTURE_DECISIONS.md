# Family Vault – Family Sync  
# Architecture Decision Log – Checkpoint 01

| Feld | Wert |
|------|------|
| **Status** | Checkpoint 01 – dokumentierter Entscheidungsstand |
| **Datum** | 2026-08-15 |
| **Geltung** | Ab diesem Dokument: **aktueller Entscheidungsstand für Family Sync** |
| **Scope** | Dokumentation only – keine Implementierung |

---

## Dokumentationsregel

- Alle in diesem Checkpoint festgelegten Punkte: **DECIDED**
- Alle ausdrücklich offenen Punkte: **OPEN / NOT DECIDED**
- Dieses Dokument **entscheidet nicht eigenmächtig** über OPEN-Punkte.

### Verhältnis zu anderen Dokumenten

| Dokument | Rolle |
|----------|--------|
| **`docs/FAMILY_SYNC_ARCHITECTURE_DECISIONS.md`** (diese Datei) | **Aktueller Entscheidungsstand** für Family Sync ab Checkpoint 01 |
| `FAMILY_SYNC_PHASE1_ANALYSIS.md` | Read-only Architekturanalyse des Istzustands (kein Decision Log) |
| `DEVICE_TRANSFER_*.md` | Device Transfer (Vault verschieben/übernehmen) – **andere Semantik** als Family Sync |

Falls Formulierungen in älteren Analyse-/Transfer-Docs diesem Stand widersprechen: **dieses Decision Log hat Vorrang für Family Sync**. Ältere Dateien wurden für Checkpoint 01 **nicht** umgeschrieben.

---

## 1. Produktziel — DECIDED

Family Vault wird von einem einzelnen lokalen Vault zu einer Familie aus mehreren **voneinander getrennten Member-Vaults** erweitert.

Die App bleibt grundsätzlich:

- cloudless
- ohne Family-Vault-Server
- ohne zentrale Datenbank
- ohne Cloud-Sync
- lokal verschlüsselt
- auf iOS und Android

**Wichtig:** Ein Familienmitglied besitzt einen **logischen Vault**. Mehrere Geräte können auf denselben Member-Vault zugreifen.

---

## 2. Identitätsmodell — DECIDED

Vier Identitätsebenen:

```
Family ID
    ↓
Member ID
    ↓
Vault ID
    ↓
Device ID
```

| Ebene | Bedeutung |
|-------|-----------|
| **Family ID** | Identifiziert eine Familie |
| **Member ID** | Identifiziert ein Familienmitglied innerhalb der Familie |
| **Vault ID** | Identifiziert den logischen Vault dieses Familienmitglieds |
| **Device ID** | Identifiziert ein autorisiertes Gerät, das auf diesen Member-Vault zugreifen darf |

### Regel — DECIDED

Ein Familienmitglied besitzt genau **einen** logischen Vault.

```
Familie
├── Vater
│   └── Vater-Vault
│       ├── Smartphone
│       └── Tablet
├── Mutter
│   └── Mutter-Vault
│       ├── Smartphone
│       └── Tablet
└── Kind
    └── Kind-Vault
        └── Smartphone
```

Alle Geräte eines Members repräsentieren denselben logischen Vault.  
Änderungen auf einem Gerät des Members müssen später auf dessen anderen Geräten erscheinen.

**Der Vault ist die logische Synchronisations- und Besitzgrenze.**

---

## 3. Device ≠ Vault — DECIDED

| Verboten | Geboten |
|----------|---------|
| Device → eigener unabhängiger Vault | Member → **ein** Vault → **mehrere** Devices |

- Ein Gerätewechsel erstellt **nicht** automatisch einen neuen Member-Vault.
- Ein neues Gerät wird als weiteres **autorisiertes Gerät** für den bestehenden Member-Vault hinzugefügt.

---

## 4. Familienadministrator — DECIDED

Es gibt einen **Familienadministrator**.

| Darf | Darf nicht (durch Admin-Rolle allein) |
|------|----------------------------------------|
| Neue Familienmitglieder zur Familie hinzufügen | Automatisch auf andere Member-Vaults zugreifen |
| | Mutters privaten Vault / Ausweis / private Dokumente lesen |

**Nur der Administrator** darf neue Mitglieder hinzufügen.  
Andere Mitglieder dürfen **keine** neuen Personen zur Familie hinzufügen.

Administratorrechte ≠ Zugriff auf fremde Member-Vaults.  
Die Rolle dient primär der **Verwaltung der Familienmitgliedschaft**.

---

## 5. Family Join — DECIDED (Konzept; nicht implementieren)

Beitritt über: **QR + Bestätigung + kryptografische Authentifizierung**.

Ablauf-Konzept:

1. Administrator legt neues Mitglied an (insb. **Name**, **Rolle**).
2. Eingeladenes Mitglied darf diese Angaben beim Beitritt **nicht** ändern.
3. Neue Person bestätigt lediglich den vorgesehenen Beitritt.

Bestehende QR-/X25519-/SAS-/AEAD-Infrastruktur des Device Transfer soll **perspektivisch** als technischer Ausgangspunkt untersucht und wiederverwendet werden.

**Status:** Konzept **DECIDED** · Implementierung **nicht** starten.

---

## 6. Erster Vault eines neuen Members — DECIDED

Der Vault eines neuen Familienmitglieds wird auf dessen **erstem Gerät** initial erzeugt.

| Der Administrator … | |
|---------------------|--|
| erzeugt **nicht** den privaten Vault-Schlüssel des neuen Members | DECIDED |
| bekommt **nicht** den Vault-Schlüssel des neuen Members | DECIDED |

**Familienmitgliedschaft ≠ Zugriff auf den Member-Vault.**

Beispiel: Vater lädt Mutter ein → Mutter-Gerät erzeugt Mutter-Vault mit eigenem Schlüssel → Vater kennt diesen Schlüssel nicht.

---

## 7. Familienstruktur — DECIDED

Alle Familienmitglieder dürfen die **Familienstruktur** sehen:

- Familienname
- alle Familienmitglieder
- Name
- Rolle

**Nicht** automatisch sichtbar:

- Ausweisnummern / Reisepassdaten / Identifikationsdaten
- private Dokumente
- sonstige private Vault-Daten

---

## 8. Dokumentfreigabe — DECIDED

Freigaben erfolgen auf **Member-/Vault-Ebene**, **nicht** auf Device-Ebene.

```
Vater-Vault  →  Mutter-Vault     ✓
Vater-Gerät  →  Mutter-Gerät     ✗ (kein Freigabe-Ziel)
```

Das Dokument wird dem **logischen** Mutter-Vault zur Verfügung gestellt.  
Alle autorisierten Geräte von Mutter halten diesen Vault anschließend konsistent.

---

## 9. Keine automatische Dokumentfreigabe beim Join — DECIDED

Beim Beitritt eines neuen Members werden **keine** bestehenden Dokumente automatisch freigegeben.

Der neue Member erhält:

- Familienmitgliedschaft
- Member ID
- eigenen Vault
- erstes autorisiertes Gerät
- sichtbare Familienstruktur

Vault startet **ohne** automatisch freigegebene Dokumente.  
Freigaben erfolgen später separat über die Dokumentfunktion.

---

## 10. Weitere Geräte eines Members — DECIDED

Jedes **bereits autorisierte Gerät** eines Members darf ein weiteres Gerät für **denselben** Member-Vault autorisieren.

- Neues Gerät erhält **keinen** neuen Vault.
- Familienadministrator muss für das zweite Gerät **nicht** erneut zustimmen.

---

## 11. Initialisierung eines neuen Geräts — DECIDED (Konzept)

**Nicht:** vollständigen neuen unabhängigen Vault aufbauen.

Stattdessen:

1. Bestehendes autorisiertes Gerät autorisiert neues Gerät.
2. Bestehendes Gerät erzeugt/überträgt einen **verschlüsselten Vault-Snapshot**.
3. Neues Gerät importiert und validiert den Snapshot.
4. Danach: Teilnahme am **normalen inkrementellen Sync** des Member-Vaults.

```
Bestehendes Gerät
    → verschlüsselter Vault-Snapshot
    → neues Gerät
    → validieren/importieren
    → gleicher Vault-Stand
    → inkrementeller Sync
```

### Abgrenzung zum bestehenden Device Transfer — DECIDED

| | Device Transfer (heute) | Family Sync (geplant) |
|--|-------------------------|------------------------|
| Semantik | Vault **verschieben/übernehmen** | Weiteres Gerät zu **bestehendem** Member-Vault |
| Ergebnis | Typischerweise neuer/übernommener Vault-Kontext | Gleicher logischer Vault, zusätzliches Device |

Bestehende Crypto-/Staging-/Transfer-Komponenten dürfen später als technische Grundlage analysiert und **teilweise** wiederverwendet werden — **nicht** den Device Transfer 1:1 umfunktionieren.

---

## 12. Administrator und Dokumente — DECIDED

Die Administratorrolle gewährt **keinen** generellen Zugriff auf andere Member-Vaults.  
Dokumentzugriff nur über **explizite Dokumentfreigaben**.

---

## 13. Kein Remote Delete — DECIDED

Ein Dokument, das bereits in einen anderen Member-Vault übertragen wurde, bleibt dort, auch wenn das Original im Ursprungs-Vault gelöscht wird.

- Löschen in einem Member-Vault betrifft die **eigenen** Vault-Daten und deren autorisierte Geräte.
- Später technisch absichern in **Datenmodell** und **Sync-Protokoll** (Umsetzung: OPEN, Regel: DECIDED).

---

## 14. Sync-Modell — DECIDED

Dauerhafter automatischer Hintergrund-Sync ist **kein** Ziel.

**Nicht:** Geräte finden sich ständig und synchronisieren im Hintergrund.

**Stattdessen:** bewusste Benutzeraktion löst den Dokument-Sync aus.

Konzeptueller Ablauf:

```
Sender erstellt/ändert Dokument
    → Änderung PENDING
    → Empfängergerät später im LAN gefunden
    → Empfänger über neue Freigabe informiert
    → Empfänger öffnet Family Vault
    → Empfänger bestätigt Synchronisation
    → verschlüsselte LAN-Übertragung
    → Dokument landet im Empfänger-Vault
```

---

## 15. Pending-Modell — DECIDED (Konzept)

Wenn Freigabe erfolgt, während Empfänger nicht erreichbar:

- Status: **PENDING**
- Änderung bleibt zunächst auf dem **Sendergerät** ausstehend
- **Keine** permanente Suche nach dem Empfängergerät
- Bei Erreichbarkeit eines bekannten/autorisierten Empfängergeräts im LAN: ausstehende Freigabe kann signalisiert werden

Genaues Offline-Pending-Datenmodell: siehe OPEN.

---

## 16. Lokale Benachrichtigung — DECIDED (Richtung) + OPEN (Machbarkeit)

**Bevorzugte Richtung (DECIDED als Produktansatz):**

- Keine externe Cloud-Push-Infrastruktur als Voraussetzung für Family Sync.
- Perspektivisch prüfen: lokales Finden eines autorisierten Empfängergeräts im LAN → lokale App-/OS-Benachrichtigung.

Beispiel-Text: „Vater möchte ein Dokument mit dir teilen.“  
Sync startet erst nach Öffnen + Bestätigung „Synchronisieren“.

**OPEN / NOT DECIDED:** technische Machbarkeit von lokaler Discovery + Hintergrundfähigkeit + lokalen Notifications auf iOS und Android.

**Nicht implementieren** in diesem Checkpoint.

---

## 17. Discovery — OPEN / NOT DECIDED (Tendenz dokumentiert)

Noch **keine** endgültige Technologie-Entscheidung.

Diskutiert:

- A) mDNS / Bonjour / Zeroconf  
- B) UDP Broadcast  
- C) Kombination Discovery + kryptografische Authentifizierung  

**Tendenz (nicht final):** Discovery nur bei tatsächlich ausstehender Sync-Anfrage, nicht als permanenter Hintergrundscan.

### Sicherheitsregel — DECIDED

**Discovery ≠ Vertrauen.**

Ein gefundenes Gerät muss anschließend **kryptografisch authentifiziert** werden.  
Akzeptanz nur, wenn persistente Device Identity und Zugehörigkeit zum Member-Vault kryptografisch bestätigt werden können.

---

## 18. Push vs. Sync — DECIDED

| | Bedeutung |
|--|-----------|
| **Benachrichtigung** | „Es gibt eine ausstehende Dokumentfreigabe.“ |
| **Sync** | „Übertrage die verschlüsselten Daten.“ |

- Benachrichtigung enthält **keine** sensiblen Dokumentdaten.
- Dokumentübertragung ausschließlich verschlüsselt über den vorgesehenen lokalen Kommunikationsweg.

---

## 19. OPEN / NOT DECIDED

Ausdrücklich offen — **nicht** eigenmächtig entscheiden:

- konkrete Key-Hierarchy  
- Family Key ja/nein  
- Vault-Key-Verteilung  
- Document-Key-Modell  
- Key Wrapping  
- genaue ACL-Struktur  
- Dokument-Versionierung  
- Sync-Journal  
- Conflict Resolution  
- Tombstones  
- genaue Discovery-Technologie  
- genaue lokale Notification-Technologie  
- iOS Background Execution  
- Android Background Execution  
- Verhalten bei nicht erreichbarem Sender  
- Retry-Mechanismus  
- Offline-Pending-Datenmodell  
- Verhalten bei mehreren Geräten desselben Members (Detailregeln jenseits der Snapshot-Init)  
- Geräteverlust  
- neues Gerät nach Geräteverlust  
- Geräteentfernung / Revocation  
- Migration des bestehenden Schema v4  
- genaue Integration mit bestehendem Device Transfer  

---

## 20. Wiederverwendung bestehender Architektur — DECIDED (Absicht)

Aus dem bestehenden Device Transfer **potenziell wiederverwendbar**:

- X25519, HKDF, HMAC, AES-GCM  
- SecureChannel  
- QR-Code-Schema/Validierung  
- SAS  
- TCP-Framing  
- Staging-/Wipe-Muster  
- Integrity Checks  
- DocumentTransferWrap  
- Snapshot-/Subscribe-Patterns  

**Aber:** Device Transfer **nicht** einfach in Family Sync umwandeln — unterschiedliche Semantik (siehe §11).

---

## 21. Architekturprinzip — DECIDED

Zentrale Leitlinie:

| Begriff | Bedeutung |
|---------|-----------|
| **FAMILY** | Identität der Familie |
| **MEMBER** | Person innerhalb der Familie |
| **VAULT** | privater logischer Datenraum dieses Members |
| **DEVICE** | autorisierter Zugang zu diesem Member-Vault |
| **DOCUMENT SHARE** | Freigabe eines Dokuments an einen Member/Vault |
| **SYNC** | Replikation eines Member-Vaults auf dessen autorisierte Geräte bzw. Übertragung freigegebener Dokumente in andere Member-Vaults |
| **ADMIN** | darf Familienmitglieder verwalten; **kein** automatischer Zugriff auf private Member-Vaults |

---

## Checkpoint-Historie

| Checkpoint | Datum | Inhalt |
|------------|-------|--------|
| **01** | 2026-08-15 | Identitätsmodell, Admin, Join, Vault-Init, Multi-Device-Snapshot, Share/Pending/Sync-UX-Richtung, No Remote Delete; OPEN-Liste Keys/Discovery/Background |

---

*Ende Checkpoint 01. Keine Implementierung. Keine Schema-Migration. Keine Dependency-Änderung.*
