# SiteReport

Dieses Projekt ist ein PWA-Skeleton für die Baustellen-Dokumentation.

## Start (lokal)
1. Abhängigkeiten installieren
   - `npm install`
2. Dev-Server starten
   - `npm run dev`

Hinweis: In dieser Umgebung war kein Netzwerkzugriff möglich, daher wurden die Dependencies nicht installiert.

## Capacitor Setup (iOS/Android)
1. Build erzeugen
   - `npm run build`
2. Capacitor initialisieren (einmalig)
   - `npm run cap:init`
3. Plattform hinzufügen
   - iOS: `npm run cap:add:ios`
   - Android: `npm run cap:add:android`
4. Sync
   - `npm run cap:sync`
5. Öffnen in Xcode/Android Studio
   - iOS: `npm run cap:open:ios`
   - Android: `npm run cap:open:android`

## Features
- Offline-DB (Dexie)
- Bildkomprimierung
- XLSX-Export mit eingebetteten Bildern
- Native Save/Share via Capacitor

## Icons
Die Icon-Dateien sind Platzhalter (1x1 PNG). Bitte durch echte App-Icons ersetzen.
