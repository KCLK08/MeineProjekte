import { colors } from './colors';

export const ui = {
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 20,
    xl: 28,
  },
  shadow: {
    card: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
  },
  typography: {
    hero: { fontSize: 30, fontWeight: '800' as const, color: colors.text },
    title: { fontSize: 20, fontWeight: '800' as const, color: colors.text },
    subtitle: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
    label: { fontSize: 13, fontWeight: '700' as const, color: colors.textMuted },
    body: { fontSize: 15, color: colors.text },
  },
};
