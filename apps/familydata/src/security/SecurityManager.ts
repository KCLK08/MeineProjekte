import Constants from 'expo-constants';

import { BiometricService } from '@/security/BiometricService';
import { DocumentEncryptionService } from '@/security/DocumentEncryptionService';
import { KeyStoreService, wipeBytes } from '@/security/KeyStoreService';
import { MigrationService } from '@/security/MigrationService';
import {
  readAutoLock,
  readSecurityEnabled,
  writeAutoLock,
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
 * Central orchestration for vault security.
 * Holds the session master key only while unlocked; wiped on lock.
 */
class SecurityManagerImpl {
  private sessionKey: Uint8Array | null = null;
  private unlocked = false;

  isExpoGo(): boolean {
    return Constants.appOwnership === 'expo';
  }

  /** SQLCipher requires a Dev Client / production build – not Expo Go. */
  supportsSqlCipher(): boolean {
    return !this.isExpoGo();
  }

  isUnlocked(): boolean {
    return this.unlocked && this.sessionKey != null;
  }

  /** Returns a copy of the session key; caller must wipe. */
  borrowSessionKey(): Uint8Array {
    if (!this.sessionKey) throw new Error('Tresor ist gesperrt.');
    return new Uint8Array(this.sessionKey);
  }

  async isSecurityEnabled(): Promise<boolean> {
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
   * Enables vault protection: native auth → create key → migrate DB/files → unlock session.
   */
  async enableSecurity(): Promise<{ documentsEncrypted: number }> {
    if (this.isExpoGo()) {
      throw new Error(
        'Vollständige Datenbankverschlüsselung (SQLCipher) benötigt einen Expo Development Build oder die Release-APK. Expo Go reicht nicht.'
      );
    }

    const auth = await this.authenticateUser('Sicherheit aktivieren');
    if (!auth.ok) throw new Error(auth.message);

    let key: Uint8Array | null = null;
    try {
      if (await KeyStoreService.hasMasterKey()) {
        key = await KeyStoreService.getMasterKey(false);
      } else {
        key = await KeyStoreService.createMasterKey(true);
      }

      const hasPlain = await databaseFileExists(PLAIN_DB_NAME);
      const hasVault = await databaseFileExists(VAULT_DB_NAME);
      let documentsEncrypted = 0;

      if (hasPlain && !hasVault) {
        documentsEncrypted = (await MigrationService.migrateToEncryptedVault(key)).documentsEncrypted;
      } else if (!hasVault) {
        // Fresh vault DB
        configureDatabaseEncryption(KeyStoreService.toSqlCipherHex(key));
        await closeDatabase();
        const { ensureDatabaseReady } = await import('@/db/repository');
        await ensureDatabaseReady();
      }

      await writeSecurityEnabled(true);
      await this.establishSession(key);
      key = null;
      return { documentsEncrypted };
    } catch (e) {
      wipeBytes(key);
      await this.lockApp();
      throw e;
    }
  }

  /**
   * Disables vault protection after auth: decrypts data back to plaintext and deletes the master key.
   */
  async disableSecurity(): Promise<void> {
    const auth = await this.authenticateUser('Sicherheit deaktivieren');
    if (!auth.ok) throw new Error(auth.message);

    let key: Uint8Array | null = null;
    try {
      key = this.sessionKey ? new Uint8Array(this.sessionKey) : await KeyStoreService.getMasterKey(false);
      if (await databaseFileExists(VAULT_DB_NAME)) {
        await MigrationService.migrateToPlaintext(key);
      }
      await KeyStoreService.deleteMasterKey();
      await writeSecurityEnabled(false);
      await this.lockApp();
      configureDatabaseEncryption(null);
      const { ensureDatabaseReady } = await import('@/db/repository');
      await ensureDatabaseReady();
    } finally {
      wipeBytes(key);
    }
  }

  async unlockApp(): Promise<AuthResult> {
    const enabled = await this.isSecurityEnabled();
    if (!enabled) {
      configureDatabaseEncryption(null);
      this.unlocked = true;
      return { ok: true };
    }

    const auth = await this.authenticateUser('FamilyData Tresor öffnen');
    if (!auth.ok) return auth;

    let key: Uint8Array | null = null;
    try {
      key = await KeyStoreService.getMasterKey(false);
      await this.establishSession(key);
      key = null;
      return { ok: true };
    } catch (e) {
      wipeBytes(key);
      return {
        ok: false,
        reason: 'failed',
        message: (e as Error).message || 'Tresor konnte nicht geöffnet werden.',
      };
    }
  }

  async lockApp(): Promise<void> {
    wipeBytes(this.sessionKey);
    this.sessionKey = null;
    this.unlocked = false;
    await DocumentEncryptionService.clearDecryptedTemps();
    await closeDatabase();
    configureDatabaseEncryption(null);
  }

  async encryptIncomingFile(uri: string): Promise<string> {
    if (!(await this.isSecurityEnabled()) || !this.sessionKey) return uri;
    return DocumentEncryptionService.encryptFile(uri, this.sessionKey, { deleteSource: true });
  }

  async resolveReadableUri(uri: string, ext = '.bin'): Promise<string> {
    if (!DocumentEncryptionService.isEncryptedPath(uri)) return uri;
    if (!this.sessionKey) throw new Error('Tresor ist gesperrt.');
    return DocumentEncryptionService.decryptFile(uri, this.sessionKey, ext);
  }

  private async establishSession(key: Uint8Array) {
    wipeBytes(this.sessionKey);
    this.sessionKey = new Uint8Array(key);
    configureDatabaseEncryption(KeyStoreService.toSqlCipherHex(this.sessionKey));
    await closeDatabase();
    const { ensureDatabaseReady } = await import('@/db/repository');
    await ensureDatabaseReady();
    this.unlocked = true;
  }
}

export const SecurityManager = new SecurityManagerImpl();
