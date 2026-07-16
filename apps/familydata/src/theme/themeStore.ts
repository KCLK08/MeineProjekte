import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';
import { create } from 'zustand';

import { THEME_PREF_KEY, type ThemePreference } from '@/theme/colors';

type ThemeState = {
  preference: ThemePreference;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

function applyNativeAppearance(preference: ThemePreference) {
  if (preference === 'system') {
    Appearance.setColorScheme(null);
  } else {
    Appearance.setColorScheme(preference);
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  hydrated: false,

  hydrate: async () => {
    try {
      const stored = await SecureStore.getItemAsync(THEME_PREF_KEY);
      const preference =
        stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
      applyNativeAppearance(preference);
      set({ preference, hydrated: true });
    } catch {
      applyNativeAppearance('system');
      set({ preference: 'system', hydrated: true });
    }
  },

  setPreference: async (preference) => {
    applyNativeAppearance(preference);
    set({ preference });
    try {
      await SecureStore.setItemAsync(THEME_PREF_KEY, preference);
    } catch {
      // Preference still applies for this session.
    }
  },
}));
