import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { maybePromptAutoLockPreference } from '@/security/autoLockPrompt';
import { isAutoLockSuppressed } from '@/security/autoLockSuppress';
import { wipeAllPreviews } from '@/security/previewSession';
import {
  allowScreenshotsForSession,
  enableScreenshotProtection,
} from '@/security/screenCaptureSession';
import { SecurityEventLog } from '@/security/SecurityEventLog';
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
  /** Allowed until the app is left (background) and locked – not reset by in-app biometrics. */
  screenshotsAllowedThisSession: boolean;
  hydrate: () => Promise<void>;
  unlock: () => Promise<boolean>;
  lock: () => Promise<void>;
  enableSecurity: () => Promise<void>;
  setAutoLock: (option: AutoLockOption) => Promise<void>;
  setScreenshotsAllowedForSession: (allowed: boolean) => Promise<void>;
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
  screenshotsAllowedThisSession: false,

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
        screenshotsAllowedThisSession: false,
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
      screenshotsAllowedThisSession: false,
      lastAuthentication: null,
      error: '',
    });

    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
        const { isLocked } = get();
        if (!SecurityManager.supportsSqlCipher()) return;

        // Only true background counts as leaving the app session.
        // "inactive" covers pickers / biometric sheets and must not lock or end the screenshot session.
        if (next === 'background') {
          if (isAutoLockSuppressed()) return;
          backgroundedAt = Date.now();
          const ms = autoLockMs(get().autoLock);
          clearLockTimer();
          if (ms === 0) {
            void get().lock();
          } else if (ms != null) {
            lockTimer = setTimeout(() => {
              if (!isAutoLockSuppressed()) void get().lock();
            }, ms);
          }
        }

        if (next === 'active') {
          clearLockTimer();
          if (backgroundedAt != null && !isLocked && !isAutoLockSuppressed()) {
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
      const { withAutoLockSuppressed } = await import('@/security/autoLockSuppress');
      return await withAutoLockSuppressed(async () => {
        const result = await SecurityManager.unlockApp();
        if (!result.ok) {
          set({ error: result.message, busy: false, isLocked: true, needsVaultSetup: false });
          return false;
        }
        // Fresh session after leaving the app / lock — screenshots off until user allows again.
        set({
          isLocked: false,
          lastAuthentication: Date.now(),
          securityEnabled: true,
          busy: false,
          error: '',
          needsVaultSetup: false,
          screenshotsAllowedThisSession: false,
        });
        await enableScreenshotProtection();
        await useFamilyStore.getState().bootstrap();
        await maybePromptAutoLockPreference(get().setAutoLock);
        return true;
      });
    } catch (e) {
      void SecurityEventLog.record('auth_failed');
      set({ busy: false, error: (e as Error).message, isLocked: true });
      return false;
    }
  },

  lock: async () => {
    clearLockTimer();
    await SecurityManager.lockApp();
    wipeSensitiveUiState();
    // Ephemeral device-transfer pairing material must not survive a vault lock.
    const { TransferSessionManager } = await import('@/deviceTransfer/TransferSessionManager');
    await TransferSessionManager.clear();
    // Leaving the app / locking ends the screenshot session.
    await enableScreenshotProtection();
    set((state) => ({
      isLocked: true,
      lastAuthentication: null,
      wipeToken: state.wipeToken + 1,
      screenshotsAllowedThisSession: false,
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
        screenshotsAllowedThisSession: false,
      });
      await enableScreenshotProtection();
      await useFamilyStore.getState().bootstrap();
      await maybePromptAutoLockPreference(get().setAutoLock);
    } catch (e) {
      set({ busy: false, error: (e as Error).message, isLocked: true });
      throw e;
    }
  },

  setAutoLock: async (option) => {
    await SecurityManager.setAutoLock(option);
    set({ autoLock: option });
  },

  setScreenshotsAllowedForSession: async (allowed) => {
    if (get().isLocked) {
      throw new Error('Tresor ist gesperrt.');
    }
    if (allowed) {
      const { requireSecureAccess } = await import('@/security/access');
      const access = await requireSecureAccess('Screenshots für diese Sitzung erlauben', {
        force: true,
      });
      if (!access.ok) {
        throw new Error(access.reason || 'Biometrie abgebrochen.');
      }
      await allowScreenshotsForSession();
      set({ screenshotsAllowedThisSession: true });
    } else {
      await enableScreenshotProtection();
      set({ screenshotsAllowedThisSession: false });
    }
  },

  testAuth: async () => {
    const { withAutoLockSuppressed } = await import('@/security/autoLockSuppress');
    return withAutoLockSuppressed(async () => {
      const result = await SecurityManager.authenticateUser('Sicherheitstest');
      return result.ok;
    });
  },
}));
