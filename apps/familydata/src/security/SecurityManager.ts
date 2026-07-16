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
    // Vault mode is mandatory when SQLCipher is available.
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
   * Ensures vault exists (new install or migrate plaintext → vault).
   * Does not leave an unlocked session – caller must unlockApp().
   */
  async ensureVaultInitialized(): Promise<{ migratedDocuments: number; created: boolean }> {
    if (!this.supportsSqlCipher()) {
      throw new Error(
        'FamilyData Vault benötigt einen Development Build oder die Release-APK (SQLCipher). Expo Go wird nicht unterstützt.'
      );
    }

    await writeSecurityEnabled(true);
    await writeAutoLock((await readAutoLock()) || 'immediate');

    const hasVault = await databaseFileExists(VAULT_DB_NAME);
    const hasPlain = await databaseFileExists(PLAIN_DB_NAME);
    const hasKey = await KeyStoreService.hasMasterKey();

    if (hasVault && hasKey) {
      return { migratedDocuments: 0, created: false };
    }

    const auth = await this.authenticateUser(
      hasPlain ? 'Klartextdaten in den Tresor migrieren' : 'FamilyData Tresor einrichten'
    );
    if (!auth.ok) throw new Error(auth.message);

    let key: Uint8Array | null = null;
    try {
      key = hasKey
        ? await KeyStoreService.getMasterKey('FamilyData Schlüssel freigeben')
        : await KeyStoreService.createMasterKey('FamilyData Schlüssel schützen');

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
      return { migratedDocuments, created: true };
    } finally {
      wipeBytes(key);
      this.sessionKey = null;
      this.unlocked = false;
    }
  }

  /** @deprecated Security cannot be disabled in hardened builds. */
  async enableSecurity(): Promise<{ documentsEncrypted: number }> {
    const result = await this.ensureVaultInitialized();
    const unlocked = await this.unlockApp();
    if (!unlocked.ok) throw new Error(unlocked.message);
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

    let vaultJustCreated = false;
    if (!(await readSecurityEnabled()) || !(await KeyStoreService.hasMasterKey())) {
      try {
        const init = await this.ensureVaultInitialized();
        vaultJustCreated = init.created;
      } catch (e) {
        await SecurityEventLog.record('auth_failed');
        return { ok: false, reason: 'failed', message: (e as Error).message };
      }
    }

    // User presence (biometrics / device passcode), then Keystore-bound key fetch.
    const auth = await this.authenticateUser('FamilyData Tresor öffnen');
    if (!auth.ok) {
      if (auth.reason !== 'cancelled') {
        await SecurityEventLog.record('auth_failed');
      }
      return auth;
    }

    let key: Uint8Array | null = null;
    try {
      key = await KeyStoreService.getMasterKey('FamilyData Schlüssel freigeben');
      await this.establishSession(key);
      key = null;
      await SecurityEventLog.flushPendingToVault();
      await SecurityEventLog.record('vault_unlocked');
      if (vaultJustCreated) {
        await writeAutoLockPromptPending(true);
      }
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
      // Record while DB session is still open (SQLCipher).
      await SecurityEventLog.record('vault_locked').catch(() => undefined);
    }
    wipeBytes(this.sessionKey);
    this.sessionKey = null;
    this.unlocked = false;
    await DocumentEncryptionService.clearDecryptedTemps();
    await closeDatabase();
    configureDatabaseEncryption(null);
  }

  /** Status snapshot for settings / lock UI (no key material). */
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
      // Should not happen after vault migration; allow read-only for leftovers.
      return uri;
    }
    return DocumentEncryptionService.decryptFile(uri, this.sessionKey, ext);
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
}

export const SecurityManager = new SecurityManagerImpl();
