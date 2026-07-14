# MeineProjekte

Monorepo – jedes Projekt liegt unter `apps/` und wird **separat** installiert, gestartet und deployt.

```
apps/
  bautagebuch/       Expo eBTB-App
  buew-toolbox/      Hub + SiteReport + Bautagebuch-Web
  ds-datenbank/      React/Vite DS-Angriffsplaner
  elifba/            Statische Elifba Lern-App
```

## Setup (pro Projekt)

Vom Repo-Root:

```bash
npm run install:bautagebuch
npm run install:buew-toolbox
npm run install:ds-datenbank
npm run install:elifba

# oder alles:
npm run install:all
```

## Entwickeln

| Befehl | Was startet |
|--------|-------------|
| `npm run dev:bautagebuch` | Expo Bautagebuch |
| `npm run dev:buew-toolbox` | SiteReport Dev-Server (Toolbox-Haupttool) |
| `npm run dev:sitereport` | SiteReport direkt |
| `npm run dev:bautagebuch-web` | Bautagebuch Web (Svelte) |
| `npm run dev:ds-datenbank` | DS-Datenbank (Vite) |
| `npm run dev:elifba` | Elifba auf Port 5174 |

## Bauen

```bash
npm run build:buew-toolbox
npm run build:ds-datenbank
npm run build:elifba
```

## GitHub Pages (eigene Repos)

Deploy pusht auf den `gh-pages`-Branch des **jeweiligen Original-Repos** – die Live-URLs bleiben getrennt:

| Befehl | Ziel-Repo / URL |
|--------|-----------------|
| `npm run deploy:buew-toolbox` | [KCLK08/buew-toolbox](https://github.com/KCLK08/buew-toolbox) → https://kclk08.github.io/buew-toolbox/ |
| `npm run deploy:ds-datenbank` | [KCLK08/DS-Datenbank](https://github.com/KCLK08/DS-Datenbank) |
| `npm run deploy:elifba` | [KCLK08/elifba](https://github.com/KCLK08/elifba) → Pages auf Branch `gh-pages` stellen |

Dafür brauchst du Push-Rechte auf die Ziel-Repos (lokales GitHub-Login / Token).

## CI

Pfad-gefilterte Workflows unter `.github/workflows/`:

- `bautagebuch-apk.yml` – nur bei Änderungen in `apps/bautagebuch/`
- `buew-toolbox-build.yml` – nur bei `apps/buew-toolbox/`
- `ds-datenbank-build.yml` – nur bei `apps/ds-datenbank/`

## Direkt im App-Ordner

Jedes Projekt bleibt eigenständig:

```bash
cd apps/buew-toolbox/sitereport && npm install && npm run dev
cd apps/ds-datenbank && npm install && npm run dev
```
