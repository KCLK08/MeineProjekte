# Cloudflare – Setup (Projekt `kclk08`)

Das Root enthält `wrangler.toml`. Dadurch funktioniert Cloudflare CI mit:

```bash
npx wrangler deploy
```

Wrangler baut zuerst (`npm run build:pages` → `_site/`) und deployt die Assets als Worker **`kclk08`**.

Live (typisch): `https://kclk08.<account-subdomain>.workers.dev/`  
(Account-abhängig kann auch `https://kclk08.workers.dev/` konfiguriert sein.)

## Empfohlen: eine Deploy-Quelle wählen

### A) Cloudflare Git / Workers Builds (aktueller Fehlerfall)

Dashboard → Worker **kclk08** → Settings → Builds:

| Einstellung | Wert |
|---|---|
| Root directory | `/` (Repo-Root) |
| Build command | leer lassen (Build steckt in `wrangler.toml`) |
| Deploy command | `npx wrangler deploy` |
| Node version | `22` |

Dann reicht der bisherige Deploy-Command – die Workspace-Detection scheitert nicht mehr, weil `wrangler.toml` im Root liegt.

### B) GitHub Actions (Direct Upload)

Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`  
Workflow: `.github/workflows/deploy-cloudflare.yml` → `wrangler deploy`

Wenn Actions und Cloudflare-Git **beide** aktiv sind, deployen sie denselben Worker und können sich überschreiben. Eine Quelle genügt.

## Lokal

```bash
npm ci
npm run deploy:cloudflare
```
