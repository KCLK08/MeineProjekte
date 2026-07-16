import * as SecureStore from 'expo-secure-store';

import type { AutoLockOption } from '@/security/types';

const ENABLED_KEY = 'familydata.security.enabled';
const AUTO_LOCK_KEY = 'familydata.security.autoLock';
const MIGRATED_KEY = 'familydata.security.migratedVault';
const AUTO_LOCK_PROMPT_KEY = 'familydata.security.autoLockPromptPending';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function readSecurityEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENABLED_KEY, OPTIONS)) === '1';
}

export async function writeSecurityEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_KEY, enabled ? '1' : '0', OPTIONS);
}

export async function readAutoLock(): Promise<AutoLockOption> {
  const value = await SecureStore.getItemAsync(AUTO_LOCK_KEY, OPTIONS);
  if (value === 'immediate' || value === '1' || value === '5' || value === '15') return value;
  return 'immediate';
}

export async function writeAutoLock(option: AutoLockOption): Promise<void> {
  await SecureStore.setItemAsync(AUTO_LOCK_KEY, option, OPTIONS);
}

export async function readVaultMigrated(): Promise<boolean> {
  return (await SecureStore.getItemAsync(MIGRATED_KEY, OPTIONS)) === '1';
}

export async function writeVaultMigrated(done: boolean): Promise<void> {
  await SecureStore.setItemAsync(MIGRATED_KEY, done ? '1' : '0', OPTIONS);
}

/** Shown once after first vault activation so the user can confirm auto-lock timing. */
export async function readAutoLockPromptPending(): Promise<boolean> {
  return (await SecureStore.getItemAsync(AUTO_LOCK_PROMPT_KEY, OPTIONS)) === '1';
}

export async function writeAutoLockPromptPending(pending: boolean): Promise<void> {
  if (pending) {
    await SecureStore.setItemAsync(AUTO_LOCK_PROMPT_KEY, '1', OPTIONS);
  } else {
    await SecureStore.deleteItemAsync(AUTO_LOCK_PROMPT_KEY).catch(() => undefined);
  }
}
