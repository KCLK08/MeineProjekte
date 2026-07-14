# Bautagebuch

Expo-App für das elektronische Bautagebuch (eBTB) – derselbe Stand wie im Original-Repo [KCLK08/Bautagebuch](https://github.com/KCLK08/Bautagebuch).

## Web (GitHub Pages)

Live: https://kclk08.github.io/MeineProjekte/apps/bautagebuch/

Statischer Expo-Web-Export (`expo export --platform web`) mit Base-Pfad für Pages.

```bash
EXPO_WEB_BASE=/MeineProjekte/apps/bautagebuch npm run build:web --workspace=@meineprojekte/bautagebuch
```

## Android APK

Automatischer Build über GitHub Actions (EAS / lokal). Releases: Tag `bautagebuch-apk-latest`.
