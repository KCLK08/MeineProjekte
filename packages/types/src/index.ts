export type AppSlug = 'bautagebuch' | 'ds-datenbank' | 'buew-toolbox' | 'elifba';

export type AppReleaseInfo = {
  slug: AppSlug;
  version: string;
  buildDate: string | null;
  apkUrl: string | null;
  webUrl: string | null;
};

export type AppCatalogEntry = {
  slug: AppSlug;
  name: string;
  description: string;
  hasWeb: boolean;
  hasApk: boolean;
  accent: string;
};

export type ReleasesManifest = Record<AppSlug, AppReleaseInfo>;
