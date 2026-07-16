# Cloudflare Pages – Setup

Dieses Repo ist ein **Monorepo**. Deshalb funktioniert `npx wrangler deploy` im Root **nicht**.

## Empfohlen: Deploy über GitHub Actions

1. In Cloudflare **kein** Worker mit Deploy-Command `npx wrangler deploy`.
2. Pages-Projekt **`meineprojekte`** (Direct Upload / ohne Git-Build) nutzen – oder Git-Verbindung entfernen.
3. GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
4. Workflow: `.github/workflows/deploy-cloudflare.yml`  
   → `npm run build:pages` → `wrangler pages deploy _site`

Live: https://meineprojekte.pages.dev/

## Optional: Build in Cloudflare (Git verbunden)

Nur wenn du wirklich Cloudflare CI nutzen willst – als **Pages**-Projekt, nicht als Worker:

| Einstellung | Wert |
|---|---|
| Framework preset | None |
| Build command | `npm run build:pages` |
| Build output directory | `_site` |
| Deploy command | **leer lassen** (nicht `wrangler deploy`) |
| Root directory | `/` (Repo-Root) |
| Node version | `22` |

`wrangler deploy` ist für Workers und scheitert im Workspace-Root mit genau dem Fehler aus dem Build-Log.
