import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { SecurityManager } from '@/security/SecurityManager';
import { autoLockMs, type AutoLockOption } from '@/security/types';
import { useFamilyStore } from '@/store/familyStore';

type SecurityState = {
  hydrated: boolean;
  securityEnabled: boolean;
  isLocked: boolean;
  lastAuthentication: number | null;
  autoLock: AutoLockOption;
  sqlCipherSupported: boolean;
  busy: boolean;
  error: string;
  hydrate: () => Promise<void>;
  unlock: () => Promise<boolean>;
  lock: () => Promise<void>;
  enableSecurity: () => Promise<void>;
  disableSecurity: () => Promise<void>;
  setAutoLock: (option: AutoLockOption) => Promise<void>;
  testAuth: () => Promise<boolean>;
};

let appStateSub: { remove: () => void } | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
let backgroundedAt: number | null = null;

function clearLockTimer() {
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
}

function wipeSensitiveUiState() {
  useFamilyStore.setState({
    people: [],
    documents: [],
    familyName: '',
    error: '',
  });
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  hydrated: false,
  securityEnabled: false,
  isLocked: false,
  lastAuthentication: null,
  autoLock: '1',
  sqlCipherSupported: SecurityManager.supportsSqlCipher(),
  busy: false,
  error: '',

  hydrate: async () => {
    const securityEnabled = await SecurityManager.isSecurityEnabled();
    const autoLock = await SecurityManager.getAutoLock();
    set({
      hydrated: true,
      securityEnabled,
      autoLock,
      sqlCipherSupported: SecurityManager.supportsSqlCipher(),
      isLocked: securityEnabled,
      lastAuthentication: null,
    });

    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
        const { securityEnabled: enabled, autoLock: mode, isLocked } = get();
        if (!enabled) return;

        if (next === 'background' || next === 'inactive') {
          backgroundedAt = Date.now();
          const ms = autoLockMs(mode);
          clearLockTimer();
          if (ms === 0) {
            void get().lock();
          } else if (ms != null) {
            lockTimer = setTimeout(() => {
              void get().lock();
            }, ms);
          }
        }

        if (next === 'active') {
          clearLockTimer();
          if (backgroundedAt != null && !isLocked) {
            const ms = autoLockMs(get().autoLock);
            const elapsed = Date.now() - backgroundedAt;
            if (ms === 0 || (ms != null && elapsed >= ms)) {
              void get().lock();
            }
          }
          backgroundedAt = null;
        }
      });
    }
  },

  unlock: async () => {
    set({ busy: true, error: '' });
    try {
      const result = await SecurityManager.unlockApp();
      if (!result.ok) {
        set({ error: result.message, busy: false, isLocked: true });
        return false;
      }
      set({
        isLocked: false,
        lastAuthentication: Date.now(),
        securityEnabled: await SecurityManager.isSecurityEnabled(),
        busy: false,
        error: '',
      });
      await useFamilyStore.getState().bootstrap();
      return true;
    } catch (e) {
      set({ busy: false, error: (e as Error).message, isLocked: true });
      return false;
    }
  },

  lock: async () => {
    clearLockTimer();
    await SecurityManager.lockApp();
    wipeSensitiveUiState();
    set({
      isLocked: get().securityEnabled,
      lastAuthentication: null,
    });
  },

  enableSecurity: async () => {
    set({ busy: true, error: '' });
    try {
      await SecurityManager.enableSecurity();
      set({
        securityEnabled: true,
        isLocked: false,
        lastAuthentication: Date.now(),
        busy: false,
      });
      await useFamilyStore.getState().bootstrap();
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      throw e;
    }
  },

  disableSecurity: async () => {
    set({ busy: true, error: '' });
    try {
      await SecurityManager.disableSecurity();
      set({
        securityEnabled: false,
        isLocked: false,
        lastAuthentication: null,
        busy: false,
      });
      await useFamilyStore.getState().bootstrap();
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      throw e;
    }
  },

  setAutoLock: async (option) => {
    await SecurityManager.setAutoLock(option);
    set({ autoLock: option });
  },

  testAuth: async () => {
    const result = await SecurityManager.authenticateUser('Sicherheitstest');
    return result.ok;
  },
}));
