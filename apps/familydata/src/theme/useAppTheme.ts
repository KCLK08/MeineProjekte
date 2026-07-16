import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { colorsFor, type ResolvedScheme, type ThemeColors } from '@/theme/colors';
import { useThemeStore } from '@/theme/themeStore';

export function useAppTheme(): {
  preference: 'light' | 'dark' | 'system';
  scheme: ResolvedScheme;
  colors: ThemeColors;
  setPreference: (preference: 'light' | 'dark' | 'system') => Promise<void>;
  hydrated: boolean;
} {
  const preference = useThemeStore((s) => s.preference);
  const hydrated = useThemeStore((s) => s.hydrated);
  const setPreference = useThemeStore((s) => s.setPreference);
  const system = useSystemColorScheme();
  const { setColorScheme } = useNativeWindColorScheme();

  useEffect(() => {
    try {
      setColorScheme(preference);
    } catch {
      // NativeWind may still be on media mode during first paint.
    }
  }, [preference, setColorScheme]);

  const scheme: ResolvedScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  return {
    preference,
    scheme,
    colors: colorsFor(scheme),
    setPreference,
    hydrated,
  };
}
