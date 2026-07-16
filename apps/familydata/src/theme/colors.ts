export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

export const lightColors = {
  canvas: '#e8f0ec',
  canvasTop: '#d8ebe2',
  paper: '#f7fbf8',
  ink: '#10241c',
  mute: '#5a7368',
  line: '#c5d7ce',
  pine: '#0c3b2e',
  pineSoft: '#d8ebe2',
  pineMuted: '#eef6f2',
  danger: '#b42318',
  warn: '#b45309',
  ok: '#157a4b',
  tabBar: '#f7fbf8',
  header: '#e8f0ec',
  bannerErrorBg: '#fef3f2',
  bannerErrorBorder: '#fecdca',
  bannerWarnBg: '#fff7ed',
  bannerWarnBorder: '#fed7aa',
  bannerWarnText: '#9a3412',
  placeholder: '#7a9086',
  chevron: '#5a7368',
  iconOnSoft: '#0c3b2e',
} as const;

export const darkColors = {
  canvas: '#0d1612',
  canvasTop: '#13201a',
  paper: '#15241d',
  ink: '#e7f2ec',
  mute: '#9bb0a6',
  line: '#2a3f35',
  pine: '#3d9a74',
  pineSoft: '#1a3028',
  pineMuted: '#173028',
  danger: '#f97066',
  warn: '#fbbf24',
  ok: '#4ade80',
  tabBar: '#101c17',
  header: '#0d1612',
  bannerErrorBg: '#3b1512',
  bannerErrorBorder: '#7f1d1d',
  bannerWarnBg: '#3b2a12',
  bannerWarnBorder: '#92400e',
  bannerWarnText: '#fcd34d',
  placeholder: '#7a9086',
  chevron: '#9bb0a6',
  iconOnSoft: '#a7d7c0',
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };

export function colorsFor(scheme: ResolvedScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

export const THEME_PREF_KEY = 'familydata.theme.preference';
