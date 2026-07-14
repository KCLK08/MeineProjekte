import type { AppCatalogEntry } from '@meineprojekte/types';

/** Static catalog used by the landing page and CI defaults. */
export const APP_CATALOG: AppCatalogEntry[] = [
  {
    slug: 'bautagebuch',
    name: 'Bautagebuch',
    description: 'Elektronisches Bautagebuch (eBTB) als Expo-App – Offline, PDF-Export, Fotodoku.',
    hasWeb: true,
    hasApk: true,
    accent: '#12534b',
  },
  {
    slug: 'buew-toolbox',
    name: 'BÜW-Toolbox',
    description: 'Tools für Bauüberwacher: SiteReport, Protokolle und mehr.',
    hasWeb: true,
    hasApk: true,
    accent: '#1a3a5c',
  },
  {
    slug: 'ds-datenbank',
    name: 'DS-Datenbank',
    description: 'DS-Angriffsplaner – Datenbank und Planung im Browser und als App.',
    hasWeb: true,
    hasApk: true,
    accent: '#2563eb',
  },
  {
    slug: 'elifba',
    name: 'ELIFBA',
    description: 'Lernweg zum Lesen des Korans – strukturiert, mit Audio-Unterstützung.',
    hasWeb: true,
    hasApk: true,
    accent: '#b44d2a',
  },
];

export const APK_FILE_NAMES: Record<string, string> = {
  bautagebuch: 'Bautagebuch.apk',
  'buew-toolbox': 'BuewToolbox.apk',
  'ds-datenbank': 'DSDatenbank.apk',
  elifba: 'Elifba.apk',
};

export const REPO = {
  owner: 'KCLK08',
  name: 'MeineProjekte',
} as const;
