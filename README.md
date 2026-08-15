# MeineProjekte

Monorepo für **Expo / React Native**-Apps mit gemeinsamer Landingpage-Quelle, Shared Packages und automatischen APK-Builds.

**APKs:** path-gefilterte Workflows pro App → Artifacts + Release-Tags `*-apk-latest`

Hinweis: Es gibt **kein** öffentliches Web-Hosting (weder Cloudflare Pages noch GitHub Pages) in diesem Repo. `website/` ist nur lokale Landing-Quelle.

## Family Vault

Family Vault wurde aus diesem Monorepo entfernt und als eigenständiges Repo vorbereitet.

- Bundle: `scripts/FamilyVault.bundle`
- Publish: `scripts/publish-familyvault-repo.sh` (benötigt Personal Access Token mit `repo`-Scope)
- Ziel-Repo: `https://github.com/KCLK08/FamilyVault` (privat)

## Übersicht

| App | Ordner | Web | APK (Expo/EAS) |
|-----|--------|-----|----------------|
| Bautagebuch | `apps/bautagebuch` | Expo Web (lokal) | ja |
| BÜW-Toolbox | `apps/buew-toolbox` | `web/` (lokal) | ja (WebView-Shell) |
| DS-Datenbank | `apps/ds-datenbank` | `web/` (lokal) | ja (WebView-Shell) |
| ELIFBA | `apps/elifba` | `web/` (lokal) | ja (WebView-Shell) |

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

website/                  # Lokale Landing-Quelle (kein Deploy)
.github/
├── actions/              # Composite Actions (setup-expo, build-apk)
└── workflows/            # build-*.yml (APKs → GitHub Releases)
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

Landing lokal prüfen: Dateien unter `website/` im Browser öffnen bzw. mit einem lokalen Static-Server bedienen.

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

APK-Builds laufen **pro App** und nur bei Änderungen an genau dieser App (manuell jederzeit per *Run workflow*).

Gemeinsame Build-Logik: `scripts/ci-build-apk.sh` (EAS Cloud mit Fallback auf lokales Gradle).

Nach erfolgreichem Build:

1. Artifact `*-apk`
2. GitHub Release-Tag `{slug}-apk-latest`
3. Update `website/releases.json` (Landing-Fallback mit GitHub-Release-Download-URLs)

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
3. Workflow `build-<slug>.yml` (Path-Filter)
4. Optional `web/` für lokale Web-Vorschau
