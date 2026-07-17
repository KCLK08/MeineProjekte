# Cloudflare – Setup (Projekt `kclk08`)

Worker **`kclk08`** liefert die Website aus `_site/` und APKs aus dem R2-Bucket **`kclk08-apks`** unter `/apks/<Datei>.apk`.

Das Root enthält `wrangler.toml`. Cloudflare CI / GitHub Actions:

```bash
npx wrangler deploy
```

## Einmalig: R2-Bucket

Im Cloudflare-Dashboard → **R2** → Create bucket: `kclk08-apks`  
oder lokal (mit Token):

```bash
npx wrangler r2 bucket create kclk08-apks
```

`CLOUDFLARE_API_TOKEN` braucht Rechte für **Workers** + **R2 Edit**.

## APKs nach R2 (privates Repo)

GitHub Releases bleiben privat. Downloads laufen über denselben Hostname wie die Site  
(Zero Trust Access gilt dann auch für APKs).

1. Bucket anlegen (oben).
2. Worker deployen (`wrangler deploy` / GitHub Action).
3. Einmalig vorhandene Releases spiegeln:  
   Actions → **Sync APKs to Cloudflare R2** → Run workflow  
   (`scripts/sync-github-apks-to-r2.sh`)
4. Danach lädt jeder APK-Build automatisch nach R2 hoch.

Website-Links: `/apks/FamilyVault.apk` usw. (`website/releases.json` + HEAD-Check in `app.js`).

## Deploy-Quelle

### A) Cloudflare Git / Workers Builds

| Einstellung | Wert |
|---|---|
| Root directory | `/` |
| Build command | leer |
| Deploy command | `npx wrangler deploy` |
| Node version | `22` |

### B) GitHub Actions

Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`  
Workflow: `.github/workflows/deploy-cloudflare.yml`

Nur eine Quelle aktiv lassen.

## Lokal

```bash
npm ci
npm run deploy:cloudflare
```
