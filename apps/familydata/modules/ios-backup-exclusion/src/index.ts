import { requireNativeModule } from 'expo-modules-core';

type IosBackupExclusionNative = {
  setExcludedFromBackup(uri: string): boolean;
  isExcludedFromBackup(uri: string): boolean;
};

let native: IosBackupExclusionNative | null = null;

function getNative(): IosBackupExclusionNative | null {
  if (native) return native;
  try {
    native = requireNativeModule<IosBackupExclusionNative>('IosBackupExclusion');
    return native;
  } catch {
    return null;
  }
}

/**
 * Thin JS bridge. Callers must not log URIs.
 */
export function setExcludedFromBackup(uri: string): boolean {
  const mod = getNative();
  if (!mod) return false;
  return mod.setExcludedFromBackup(uri);
}

export function isExcludedFromBackup(uri: string): boolean {
  const mod = getNative();
  if (!mod) return false;
  return mod.isExcludedFromBackup(uri);
}

export function isNativeModuleAvailable(): boolean {
  return getNative() != null;
}
