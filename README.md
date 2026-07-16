# MeineProjekte

Monorepo für **Expo / React Native**-Apps mit gemeinsamer Landingpage, Shared Packages und automatischen APK-Builds.

**Pages:** https://meineprojekte.pages.dev/  
(Cloudflare Pages-Projekt: `meineprojekte`)

**APKs:** path-gefilterte Workflows pro App → Artifacts + Release-Tags `*-apk-latest`

## Übersicht

| App | Ordner | Web | APK (Expo/EAS) |
|-----|--------|-----|----------------|
| Bautagebuch | `apps/bautagebuch` | Expo Web | ja |
| BÜW-Toolbox | `apps/buew-toolbox` | `web/` | ja (WebView-Shell) |
| DS-Datenbank | `apps/ds-datenbank` | `web/` | ja (WebView-Shell) |
| ELIFBA | `apps/elifba` | `web/` | ja (WebView-Shell) |

## Repositorystruktur

```text
apps/
├── bautagebuch/          # Expo App
├── ds-datenbank/         # Expo Shell + web/ (Vite)
├── buew-toolbox/         # Expo Shell + web/ (SvelteKit/Hub)
└── elifba/               # Expo Shell + web/ (statisch)

packages/
├── theme/                # Design-Tokens (Farben, Spacing, Typo)
├── ui/                   # Buttons, Cards, Dialoge, WebShell
├── utils/
├── types/
├── hooks/
└── catalog/              # App-Katalog für Docs/CI

website/                  # Cloudflare Pages Landing
.github/
├── actions/              # Composite Actions (setup-expo, build-apk)
└── workflows/            # build-*.yml + deploy-cloudflare.yml + reusable-build-apk.yml
```

## Lokale Entwicklung

Node **≥ 20** empfohlen.

```bash
npm install

# Expo starten (jeweils eigene App)
npm run start:bautagebuch
npm run start:buew-toolbox
npm run start:ds-datenbank
npm run start:elifba
```

Web-Frontends (wo vorhanden):

```bash
npm run dev:web --prefix apps/buew-toolbox   # SiteReport
npm run dev:web --prefix apps/ds-datenbank
# Elifba: Dateien unter apps/elifba/web/ lokal hosten
```

## Expo / EAS

Jede App hat:

- `app.json`
- `eas.json`
- eigenes `package.json`

Lokal APK (EAS Preview):

```bash
cd apps/bautagebuch
npx eas build -p android --profile preview
```

Secret im GitHub-Repo setzen:

- `EXPO_TOKEN` – Expo-Zugangstoken für EAS Cloud Builds

Ohne Token fällt CI auf **lokales** `expo prebuild` + Gradle zurück.

## GitHub Actions

| Workflow | Trigger (Paths) | Zweck |
|----------|-----------------|-------|
| `build-bautagebuch.yml` | nur `apps/bautagebuch/**` | APK |
| `build-buew-toolbox.yml` | nur Expo-Shell (`apps/buew-toolbox/**`, ohne `web/`) | APK |
| `build-ds-datenbank.yml` | nur Expo-Shell (ohne `web/`) | APK |
| `build-elifba.yml` | nur Expo-Shell (ohne `web/`) | APK |
| `build-familydata.yml` | nur `apps/familydata/**` | APK |
| `deploy-cloudflare.yml` | `website/**`, `apps/**/web/**`, … | Landing + Web-Apps → Cloudflare |

APK-Builds laufen **pro App** und nur bei Änderungen an genau dieser App (manuell jederzeit per *Run workflow*).

Gemeinsame Build-Logik: `scripts/ci-build-apk.sh` (EAS Cloud mit Fallback auf lokales Gradle).

Nach erfolgreichem Build:

1. Artifact `*-apk`
2. GitHub Release-Tag `{slug}-apk-latest`
3. Update `website/releases.json` (Landing-Fallback)

## Cloudflare Pages

Landing unter `website/`, Deploy über `deploy-cloudflare.yml`:

- App-Name, Kurzbeschreibung
- **Web öffnen** (relativ `./apps/{slug}/`)
- **APK herunterladen** (Release-Asset / `releases.json`)
- Version + Build-Datum (GitHub Releases API)

GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`  
Projektname: `meineprojekte` → https://meineprojekte.pages.dev/

## Designsystem

Gemeinsame Tokens in `@meineprojekte/theme` (Farben u. a. Primary `#12534b`).  
RN-Komponenten in `@meineprojekte/ui` (`AppButton`, `Card`, `DialogShell`, `WebShell`).

## Qualität

```bash
npm run lint
npm run format
```

## Neue App hinzufügen

1. Ordner `apps/<slug>/` mit Expo (`app.json`, `eas.json`, `package.json`)
2. Eintrag in `packages/catalog` + `website/app.js`
3. Workflow `build-<slug>.yml` (Path-Filter + reusable workflow)
4. Optional `web/` + Eintrag in `deploy-cloudflare.yml`
