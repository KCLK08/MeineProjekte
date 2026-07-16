import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { wipeAllPreviews } from '@/security/previewSession';
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
  wipeToken: number;
  needsVaultSetup: boolean;
  hydrate: () => Promise<void>;
  unlock: () => Promise<boolean>;
  lock: () => Promise<void>;
  enableSecurity: () => Promise<void>;
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
  wipeAllPreviews();
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  hydrated: false,
  securityEnabled: true,
  isLocked: true,
  lastAuthentication: null,
  autoLock: 'immediate',
  sqlCipherSupported: SecurityManager.supportsSqlCipher(),
  busy: false,
  error: '',
  wipeToken: 0,
  needsVaultSetup: false,

  hydrate: async () => {
    const sqlCipherSupported = SecurityManager.supportsSqlCipher();
    const autoLock = await SecurityManager.getAutoLock();

    if (!sqlCipherSupported) {
      set({
        hydrated: true,
        securityEnabled: true,
        isLocked: true,
        autoLock,
        sqlCipherSupported: false,
        needsVaultSetup: false,
        error: 'Vault benötigt Development Build / Release-APK (SQLCipher). Expo Go ist nicht erlaubt.',
      });
      return;
    }

    const status = await SecurityManager.getVaultStatus();
    const needsVaultSetup = !status.hasVaultDb || !status.hasMasterKey || status.hasLegacyPlainDb;

    set({
      hydrated: true,
      securityEnabled: true,
      isLocked: true,
      autoLock,
      sqlCipherSupported: true,
      needsVaultSetup,
      lastAuthentication: null,
      error: '',
    });

    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
        const { isLocked } = get();
        if (!SecurityManager.supportsSqlCipher()) return;

        if (next === 'background' || next === 'inactive') {
          backgroundedAt = Date.now();
          const ms = autoLockMs(get().autoLock);
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
        set({ error: result.message, busy: false, isLocked: true, needsVaultSetup: false });
        return false;
      }
      set({
        isLocked: false,
        lastAuthentication: Date.now(),
        securityEnabled: true,
        busy: false,
        error: '',
        needsVaultSetup: false,
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
    set((state) => ({
      isLocked: true,
      lastAuthentication: null,
      wipeToken: state.wipeToken + 1,
    }));
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
        needsVaultSetup: false,
      });
      await useFamilyStore.getState().bootstrap();
    } catch (e) {
      set({ busy: false, error: (e as Error).message, isLocked: true });
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
