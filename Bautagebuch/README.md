# Bautagebuch

Expo-App für das elektronische Bautagebuch (eBTB) – portiert aus der Buew-Toolbox mit allen Kernfunktionen.

## Android APK installieren

Bei jedem Push auf `main` wird automatisch eine neue APK gebaut.

**Download:** [GitHub Releases – Latest APK](https://github.com/KCLK08/Bautagebuch/releases/tag/apk-latest)

1. `Bautagebuch.apk` herunterladen
2. Auf dem Android-Handy öffnen (ggf. „Installation aus unbekannten Quellen“ erlauben)
3. App installieren – fertig, kein Expo Go nötig

Alternativ: unter **Actions** → letzter erfolgreicher **Build Android APK**-Lauf → Artifact `Bautagebuch-apk`.

## Funktionen

- **Standard eBTB-Vorlage** (`Vorlage-eBTB.pdf`) mit fix definiertem Formular-Setup
- **Bautagebuch erstellen & bearbeiten** mit Abschnitten:
  - Kopfdaten
  - Witterung (inkl. automatischer Wetter-Sync per GPS)
  - Baustellenbesetzung (dynamische Zeilen)
  - Leistungsblock
  - Abschluss
  - Fotodokumentation
- **PDF-Vorschau** während der Bearbeitung
- **Offline-Speicherung** via SQLite + lokales Dateisystem
- **PDF-Export** als BTB, Fotodoku oder kombiniert
- **Eigene PDF-Vorlagen** hochladen (AcroForm)
- **Autosave** während der Bearbeitung

## Entwicklung (optional)

```bash
npm install
npm start
```

## Technologie

- Expo SDK 54
- Expo Router
- TypeScript
- pdf-lib für PDF-Formulare
- expo-sqlite für lokale Daten
- expo-image-picker / expo-location

## Ursprung

Diese App basiert auf dem Bautagebuch-Tool aus [buew-toolbox](https://github.com/KCLK08/buew-toolbox) und erweitert es als native/mobile Expo-Anwendung.
