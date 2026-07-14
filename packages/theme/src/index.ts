/** Shared design tokens – source of truth for all apps + website */
export const colors = {
  background: '#eef2f5',
  surface: '#ffffff',
  primary: '#12534b',
  primaryDark: '#0d3f39',
  primarySoft: '#e8f4f2',
  accent: '#1a3a5c',
  text: '#11161e',
  textMuted: '#5a6168',
  border: '#d5dbe3',
  success: '#1f7a4c',
  warning: '#b45309',
  danger: '#b42318',
  card: '#f8fafb',
  progress: '#2563eb',
  todo: '#94a3b8',
  done: '#16a34a',
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  fontFamily: {
    sans: '"DM Sans", "Segoe UI", system-ui, sans-serif',
    display: '"Fraunces", "Georgia", serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  sizes: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    hero: 40,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;

export const theme = { colors, spacing, radius, typography, shadows } as const;
export type Theme = typeof theme;
