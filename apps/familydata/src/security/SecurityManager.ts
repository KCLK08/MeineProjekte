import Constants from 'expo-constants';

import { BiometricService } from '@/security/BiometricService';
import { DocumentEncryptionService } from '@/security/DocumentEncryptionService';
import { KeyStoreService, wipeBytes } from '@/security/KeyStoreService';
import { MigrationService } from '@/security/MigrationService';
import { SecurityEventLog } from '@/security/SecurityEventLog';
import {
  readAutoLock,
  readSecurityEnabled,
  writeAutoLock,
  writeAutoLockPromptPending,
  writeSecurityEnabled,
} from '@/security/settingsFlags';
import type { AuthResult, AutoLockOption, BiometricAvailability } from '@/security/types';
import {
  closeDatabase,
  configureDatabaseEncryption,
  databaseFileExists,
  PLAIN_DB_NAME,
  VAULT_DB_NAME,
} from '@/db/repository';

/**
 * Central vault orchestration.
 * Security is mandatory on supported builds (no plaintext mode).
 * Unlock uses a single OS auth prompt via SecureStore requireAuthentication.
 */
class SecurityManagerImpl {
  private sessionKey: Uint8Array | null = null;
  private unlocked = false;

  isExpoGo(): boolean {
    return Constants.appOwnership === 'expo';
  }

  supportsSqlCipher(): boolean {
    return !this.isExpoGo();
  }

  isUnlocked(): boolean {
    return this.unlocked && this.sessionKey != null;
  }

  borrowSessionKey(): Uint8Array {
    if (!this.sessionKey) throw new Error('Tresor ist gesperrt.');
    return new Uint8Array(this.sessionKey);
  }

  async isSecurityEnabled(): Promise<boolean> {
    if (this.supportsSqlCipher()) return true;
    return readSecurityEnabled();
  }

  async getAutoLock(): Promise<AutoLockOption> {
    return readAutoLock();
  }

  async setAutoLock(option: AutoLockOption): Promise<void> {
    await writeAutoLock(option);
  }

  async checkBiometricAvailability(): Promise<BiometricAvailability> {
    return BiometricService.checkBiometricAvailability();
  }

  async authenticateUser(prompt?: string): Promise<AuthResult> {
    return BiometricService.authenticateUser(prompt);
  }

  /**
   * Ensures vault exists. Uses at most one SecureStore auth prompt and may
   * establish a session when creating/migrating so unlock does not prompt again.
   */
  async ensureVaultInitialized(): Promise<{ migratedDocuments: number; created: boolean; sessionReady: boolean }> {
    if (!this.supportsSqlCipher()) {
      throw new Error(
        'Family Vault benötigt einen Development Build oder die Release-APK (SQLCipher). Expo Go wird nicht unterstützt.'
      );
    }

    await writeSecurityEnabled(true);
    await writeAutoLock((await readAutoLock()) || 'immediate');

    const hasVault = await databaseFileExists(VAULT_DB_NAME);
    const hasPlain = await databaseFileExists(PLAIN_DB_NAME);
    const hasKey = await KeyStoreService.hasMasterKey();

    if (hasVault && hasKey) {
      return { migratedDocuments: 0, created: false, sessionReady: false };
    }

    let key: Uint8Array | null = null;
    try {
      // Single auth: create or load key (SecureStore requireAuthentication).
      key = hasKey
        ? await KeyStoreService.getMasterKey('Family Vault Tresor einrichten')
        : await KeyStoreService.createMasterKey('Family Vault Schlüssel schützen');

      let migratedDocuments = 0;
      if (hasPlain && !hasVault) {
        migratedDocuments = (await MigrationService.migrateToEncryptedVault(key)).documentsEncrypted;
      } else if (!hasVault) {
        configureDatabaseEncryption(KeyStoreService.toSqlCipherHex(key));
        await closeDatabase();
        const { ensureDatabaseReady } = await import('@/db/repository');
        await ensureDatabaseReady();
        await closeDatabase();
        configureDatabaseEncryption(null);
      }

      await writeSecurityEnabled(true);
      await writeAutoLockPromptPending(true);
      await SecurityEventLog.record('encryption_enabled');

      // Keep session open so the caller does not need a second biometric prompt.
      await this.establishSession(key);
      key = null;
      return { migratedDocuments, created: true, sessionReady: true };
    } finally {
      wipeBytes(key);
    }
  }

  /** @deprecated Security cannot be disabled in hardened builds. */
  async enableSecurity(): Promise<{ documentsEncrypted: number }> {
    const result = await this.ensureVaultInitialized();
    if (!result.sessionReady) {
      const unlocked = await this.unlockApp();
      if (!unlocked.ok) throw new Error(unlocked.message);
    } else {
      await SecurityEventLog.flushPendingToVault();
      await SecurityEventLog.record('vault_unlocked');
    }
    return { documentsEncrypted: result.migratedDocuments };
  }

  async disableSecurity(): Promise<void> {
    await SecurityEventLog.record('encryption_disable_blocked');
    throw new Error('Der Tresor-Schutz kann nicht deaktiviert werden. Klartextbetrieb ist nicht erlaubt.');
  }

  async unlockApp(): Promise<AuthResult> {
    if (!this.supportsSqlCipher()) {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'Vault benötigt einen Development Build / Release-APK mit SQLCipher.',
      };
    }

    if (!(await readSecurityEnabled()) || !(await KeyStoreService.hasMasterKey())) {
      try {
        const init = await this.ensureVaultInitialized();
        if (init.sessionReady) {
          await SecurityEventLog.flushPendingToVault();
          await SecurityEventLog.record('vault_unlocked');
          return { ok: true };
        }
      } catch (e) {
        await SecurityEventLog.record('auth_failed');
        return { ok: false, reason: 'failed', message: (e as Error).message };
      }
    }

    // One OS prompt only: auth-bound SecureStore master key.
    let key: Uint8Array | null = null;
    try {
      key = await KeyStoreService.getMasterKey('Family Vault Tresor öffnen');
      await this.establishSession(key);
      key = null;
      await SecurityEventLog.flushPendingToVault();
      await SecurityEventLog.record('vault_unlocked');
      return { ok: true };
    } catch (e) {
      wipeBytes(key);
      await SecurityEventLog.record('auth_failed');
      await this.lockApp();
      return {
        ok: false,
        reason: 'failed',
        message: (e as Error).message || 'Tresor konnte nicht geöffnet werden.',
      };
    }
  }

  async lockApp(): Promise<void> {
    const wasUnlocked = this.unlocked;
    if (wasUnlocked) {
      await SecurityEventLog.record('vault_locked').catch(() => undefined);
    }
    wipeBytes(this.sessionKey);
    this.sessionKey = null;
    this.unlocked = false;
    await DocumentEncryptionService.clearDecryptedTemps();
    await closeDatabase();
    configureDatabaseEncryption(null);
  }

  async getVaultStatus(): Promise<{
    sqlCipherSupported: boolean;
    hasMasterKey: boolean;
    masterKeyAuthBound: boolean;
    hasVaultDb: boolean;
    hasLegacyPlainDb: boolean;
    unlocked: boolean;
  }> {
    const meta = await KeyStoreService.getMasterKeyMeta();
    return {
      sqlCipherSupported: this.supportsSqlCipher(),
      hasMasterKey: await KeyStoreService.hasMasterKey(),
      masterKeyAuthBound: meta === 'auth-bound-v2',
      hasVaultDb: await databaseFileExists(VAULT_DB_NAME),
      hasLegacyPlainDb: await databaseFileExists(PLAIN_DB_NAME),
      unlocked: this.isUnlocked(),
    };
  }

  async encryptIncomingFile(uri: string): Promise<string> {
    if (!this.sessionKey) throw new Error('Tresor ist gesperrt.');
    return DocumentEncryptionService.encryptFile(uri, this.sessionKey, { deleteSource: true });
  }

  async resolveReadableUri(uri: string, ext = '.bin'): Promise<string> {
    if (!this.sessionKey) throw new Error('Tresor ist gesperrt.');
    if (!DocumentEncryptionService.isEncryptedPath(uri)) {
      return uri;
    }
    const inferred = DocumentEncryptionService.extensionFromEncryptedPath(uri) || ext;
    return DocumentEncryptionService.decryptFile(uri, this.sessionKey, inferred);
  }

  private async establishSession(key: Uint8Array) {
    wipeBytes(this.sessionKey);
    this.sessionKey = new Uint8Array(key);
    const hex = KeyStoreService.toSqlCipherHex(this.sessionKey);
    configureDatabaseEncryption(hex);
    await closeDatabase();
    const { ensureDatabaseReady } = await import('@/db/repository');
    await ensureDatabaseReady();
    this.unlocked = true;
  }

  /**
   * After Phase 4C Keystore commit: adopt the new master key into the live session.
   * Does not read SecureStore again (avoids a second biometric prompt).
   */
  async adoptCommittedMasterKey(key: Uint8Array): Promise<void> {
    await this.establishSession(key);
    await SecurityEventLog.record('vault_unlocked').catch(() => undefined);
  }

  /**
   * Sender post-transfer: securely delete all vault user data and encrypted files.
   * Keeps the device-bound master key and empty SQLCipher database.
   */
  async secureWipeVaultContents(): Promise<void> {
    if (!this.isUnlocked()) throw new Error('Tresor ist gesperrt.');
    const FS = await import('expo-file-system/legacy');
    const { listDocuments, clearAllVaultUserData } = await import('@/db/repository');
    const docs = await listDocuments();
    for (const doc of docs) {
      if (doc.filePath) {
        await DocumentEncryptionService.deleteEncryptedFile(doc.filePath);
      }
    }
    try {
      const root = `${FS.documentDirectory}familydata-encrypted/`;
      const info = await FS.getInfoAsync(root);
      if (info.exists) {
        await FS.deleteAsync(root, { idempotent: true });
        await FS.makeDirectoryAsync(root, { intermediates: true });
      }
    } catch {
      /* best-effort */
    }
    await clearAllVaultUserData();
    await DocumentEncryptionService.clearDecryptedTemps();
    await SecurityEventLog.record('encryption_enabled').catch(() => undefined);
  }
}

export const SecurityManager = new SecurityManagerImpl();
