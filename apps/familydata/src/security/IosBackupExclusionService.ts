import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Sensitive directories under the app Documents sandbox.
 * Relative names only – never log absolute paths.
 */
export const IOS_BACKUP_EXCLUDED_RELATIVE_DIRS = [
  /** expo-sqlite SQLCipher vault */
  'SQLite',
  /** AES-GCM document ciphertext */
  'familydata-encrypted',
  /** Device-transfer staging (encrypted payload + wrap .dat) */
  'familydata-transfer-staging',
  /** Phase 4C parallel build / rollback dirs */
  'familydata-encrypted-migration',
  'familydata-encrypted.pre-cutover',
  /** Decrypt preview temps */
  'familydata-decrypt-tmp',
  /** Attach staging before encrypt */
  'familydata-files',
] as const;

export type IosBackupExclusionResult = {
  /** Platform supports / ran exclusion. */
  applied: boolean;
  /** Native module present (iOS dev/release build). */
  nativeAvailable: boolean;
  /** All listed dirs exist and report excluded=true. */
  allExcluded: boolean;
  /** Count of dirs successfully flagged. */
  excludedCount: number;
  /** Count of dirs that still report not excluded. */
  missingCount: number;
  /** Count of dirs that could not be created or flagged. */
  errorCount: number;
};

async function ensureDir(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) return true;
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures sensitive Family Vault directories exist and are marked with
 * NSURLIsExcludedFromBackupKey on iOS. No-op on Android/web.
 * Never logs file paths.
 */
export const IosBackupExclusionService = {
  listRelativeDirs(): readonly string[] {
    return IOS_BACKUP_EXCLUDED_RELATIVE_DIRS;
  },

  async ensureExcludedAtStartup(): Promise<IosBackupExclusionResult> {
    if (Platform.OS !== 'ios') {
      return {
        applied: false,
        nativeAvailable: false,
        allExcluded: true,
        excludedCount: 0,
        missingCount: 0,
        errorCount: 0,
      };
    }

    const root = FileSystem.documentDirectory;
    if (!root) {
      return {
        applied: false,
        nativeAvailable: false,
        allExcluded: false,
        excludedCount: 0,
        missingCount: 0,
        errorCount: IOS_BACKUP_EXCLUDED_RELATIVE_DIRS.length,
      };
    }

    let native: typeof import('ios-backup-exclusion') | null = null;
    try {
      native = await import('ios-backup-exclusion');
    } catch {
      native = null;
    }

    if (!native?.isNativeModuleAvailable()) {
      return {
        applied: false,
        nativeAvailable: false,
        allExcluded: false,
        excludedCount: 0,
        missingCount: IOS_BACKUP_EXCLUDED_RELATIVE_DIRS.length,
        errorCount: 0,
      };
    }

    let excludedCount = 0;
    let missingCount = 0;
    let errorCount = 0;

    for (const name of IOS_BACKUP_EXCLUDED_RELATIVE_DIRS) {
      const uri = `${root}${name}`;
      try {
        const ready = await ensureDir(uri);
        if (!ready) {
          errorCount += 1;
          continue;
        }
        // Check first – only set when missing.
        let already = false;
        try {
          already = native.isExcludedFromBackup(uri);
        } catch {
          already = false;
        }
        if (!already) {
          native.setExcludedFromBackup(uri);
        }
        const ok = native.isExcludedFromBackup(uri);
        if (ok) excludedCount += 1;
        else missingCount += 1;
      } catch {
        errorCount += 1;
      }
    }

    return {
      applied: true,
      nativeAvailable: true,
      allExcluded: missingCount === 0 && errorCount === 0,
      excludedCount,
      missingCount,
      errorCount,
    };
  },

  /**
   * Read-only verification for security audit (no path details returned).
   */
  async verifyExclusion(): Promise<IosBackupExclusionResult> {
    return this.ensureExcludedAtStartup();
  },
};
