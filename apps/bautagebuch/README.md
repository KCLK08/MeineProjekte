# Bautagebuch

Expo-App für das elektronische Bautagebuch (eBTB) – derselbe Stand wie im Original-Repo [KCLK08/Bautagebuch](https://github.com/KCLK08/Bautagebuch).

## Web (Cloudflare Pages)

Live: https://meineprojekte.pages.dev/apps/bautagebuch/

Statischer Expo-Web-Export (`expo export --platform web`) mit Base-Pfad.

```bash
EXPO_WEB_BASE=/apps/bautagebuch npm run build:web --workspace=@meineprojekte/bautagebuch
```

## Android APK

Automatischer Build über GitHub Actions (EAS / lokal). Releases: Tag `bautagebuch-apk-latest`.
