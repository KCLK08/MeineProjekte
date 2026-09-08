# Solidarfonds-Planer

Planungstool für einen **Solidarfonds mit zinsfreien Krediten** (mögliche Qard-Hasan-Struktur).

> **Keine Banksoftware, kein reales Finanzprodukt, keine rechtliche oder schariarechtliche Beratung.**  
> Alle Ergebnisse sind Modellannahmen. Die tatsächliche Scharia-Konformität muss durch qualifizierte Fachleute geprüft werden.

## Vorhandener Stack (Monorepo)

Diese App ist eine **neue Vite-Webanwendung** unter `apps/qard-hasan-simulator`. Das übrige Monorepo (Expo-Apps) bleibt unverändert. Es gab zuvor keine Finanz-Simulationsengine.

| Schicht | Technik |
| --- | --- |
| UI | React 19, TypeScript, Vite, Tailwind CSS |
| Charts | Recharts |
| State | Zustand |
| Validierung | Zod |
| Tests | Vitest |
| Engine | Reines TypeScript, **keine React-Abhängigkeit** |

## Start

Im Repo-Root:

```bash
npm install
npm run dev:qard-hasan
```

Oder:

```bash
npm run dev -w @meineprojekte/qard-hasan-simulator
```

Tests:

```bash
npm run test:qard-hasan
```

Build:

```bash
npm run build:qard-hasan
```

Beim ersten Öffnen des Dashboards läuft automatisch die **Beispielsimulation** (1.000 Mitglieder, 60 Monate, als Beispieldaten gekennzeichnet).

## Architektur

```
src/
  domain/       Parameter, Typen, Defaults, Presets, Validierung
  engine/       Simulation, Kapazität, Allokation, Tilgung, Kreditregeln, Risiko, Monte Carlo
  store/        Zustand (UI)
  pages/        Dashboard, Parameter, Analyse, Export
  services/     LocalStorage, JSON/CSV-Export
```

Öffentliche Engine-API:

```ts
simulateScenario(parameters) → SimulationResult
```

Die Engine kann später unverändert in API, Batch, Excel-Export oder Monte-Carlo-Jobs verwendet werden.

Drei Geldtöpfe bleiben getrennt:

1. Persönliche Mitgliederguthaben (Verpflichtung, nicht kreditierbar)
2. Solidaritätsfonds (Beiträge, Kredite, Recovery)
3. Verwaltung (Gebühr unabhängig vom Kredit, eigene Kosten)

Geld intern in **Cent** (Integer).

## Mathematisches Modell

Siehe [`SIMULATION_MODEL.md`](./SIMULATION_MODEL.md).

## Parameter

Alle wesentlichen Annahmen liegen in `SimulationParameters` (Wachstum, Beiträge, Fonds-70/30, Kreditlimit, Nachfrage, Score, Ausfälle, Recovery, Krisen, Monte Carlo, Verwaltungskosten …).  
Keine versteckten 3-/5-/10-/70-/30-Prozentwerte in der Engine: Defaults stehen in `src/domain/defaults.ts` und sind in der UI sichtbar.

Presets (`conservative`, `base`, `growth`, `stress`, `crisis`, `extreme`) setzen **nur Parameter**, keine eigene Logik.

## Tests

`src/engine/simulation.test.ts` und `src/engine/allocation.test.ts` prüfen unter anderem:

- 100 € → 80 € persönlich + 20 € Solidarität
- 1.000 × 5 € Verwaltung
- 10.000 € / 24 Monate tilgen exakt 10.000 €
- Fonds-Cash-Identität
- Recovery-Beispiel 70 %
- Austrittsauszahlung
- Invarianten (nicht-negative Bestände, keine Über-Tilgung)
- Determinismus bei gleichem Seed
- Parameteränderungen verändern Ergebnisse wirklich
- Nachfrage unter/gleich/über Kapazität
- Warteliste ≠ Ablehnung
- Teilfinanzierung an/aus
- Liquiditäts- und 70%-Grenze
- Struktureller Finanzierungsengpass

## Bekannte Einschränkungen

- Große Bestände werden als **Kohorten / Kredit-Vintages** aggregiert, nicht als 100.000 vollständige Einzelkonten.
- Alternative Tilgungsmodelle (flexibel, Sonderzahlung) sind parametrisiert, Standard bleibt lineare Tilgung.
- PDF/XLSX sind nicht enthalten; JSON und CSV schon.
- Persistenz nur LocalStorage (Backend-Anschluss vorbereitet, nicht implementiert).
- System Health ist eine interne Simulationsmetrik, kein validierter Score.
- Monte-Carlo-Läufe laufen im UI-Thread (Worker-Datei ist vorbereitet).

## Nächste sinnvolle Erweiterungen

- Web-Worker für Monte Carlo und 240-Monats-Läufe
- IndexedDB für große Ergebnisarchive
- PDF-Bericht
- Echte Mitglieder-/Kreditantragsmodule hinter derselben Engine
