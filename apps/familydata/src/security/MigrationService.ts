import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

import { DocumentEncryptionService } from '@/security/DocumentEncryptionService';
import { KeyStoreService } from '@/security/KeyStoreService';
import { writeVaultMigrated } from '@/security/settingsFlags';
import {
  PLAIN_DB_NAME,
  VAULT_DB_NAME,
  closeDatabase,
  copyAllTablesBetween,
  deleteDatabaseFile,
} from '@/db/repository';

/**
 * Migrates plaintext SQLite + document files into the encrypted vault.
 */
export const MigrationService = {
  async migrateToEncryptedVault(masterKey: Uint8Array): Promise<{ documentsEncrypted: number }> {
    const keyHex = KeyStoreService.toSqlCipherHex(masterKey);

    await closeDatabase();

    const plain = await SQLite.openDatabaseAsync(PLAIN_DB_NAME);
    await plain.execAsync('PRAGMA foreign_keys = ON;');

    const vault = await SQLite.openDatabaseAsync(VAULT_DB_NAME);
    await vault.execAsync(`PRAGMA key = "x'${keyHex}'";`);
    await vault.execAsync('PRAGMA foreign_keys = ON;');

    await copyAllTablesBetween(plain, vault);
    await plain.closeAsync();

    // Encrypt document files referenced by vault rows.
    const docs = await vault.getAllAsync<{ id: string; filePath: string }>(
      `SELECT id, filePath FROM documents WHERE TRIM(filePath) != ''`
    );
    let documentsEncrypted = 0;
    for (const doc of docs) {
      if (!doc.filePath || DocumentEncryptionService.isEncryptedPath(doc.filePath)) continue;
      const info = await FileSystem.getInfoAsync(doc.filePath);
      if (!info.exists) continue;
      const encryptedPath = await DocumentEncryptionService.encryptFile(doc.filePath, masterKey, {
        deleteSource: true,
      });
      await vault.runAsync('UPDATE documents SET filePath = ? WHERE id = ?', [encryptedPath, doc.id]);
      documentsEncrypted += 1;
    }

    await vault.closeAsync();
    await deleteDatabaseFile(PLAIN_DB_NAME);
    await writeVaultMigrated(true);
    return { documentsEncrypted };
  },

  async migrateToPlaintext(masterKey: Uint8Array): Promise<void> {
    const keyHex = KeyStoreService.toSqlCipherHex(masterKey);
    await closeDatabase();

    const vault = await SQLite.openDatabaseAsync(VAULT_DB_NAME);
    await vault.execAsync(`PRAGMA key = "x'${keyHex}'";`);
    await vault.execAsync('PRAGMA foreign_keys = ON;');

    const plain = await SQLite.openDatabaseAsync(PLAIN_DB_NAME);
    await plain.execAsync('PRAGMA foreign_keys = ON;');
    await copyAllTablesBetween(vault, plain);

    const docs = await plain.getAllAsync<{ id: string; filePath: string }>(
      `SELECT id, filePath FROM documents WHERE TRIM(filePath) != ''`
    );
    for (const doc of docs) {
      if (!DocumentEncryptionService.isEncryptedPath(doc.filePath)) continue;
      const decrypted = await DocumentEncryptionService.decryptFile(doc.filePath, masterKey, '.bin');
      const permanent = `${FileSystem.documentDirectory}familydata-files/${doc.id}.bin`;
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}familydata-files/`, {
        intermediates: true,
      });
      await FileSystem.copyAsync({ from: decrypted, to: permanent });
      await DocumentEncryptionService.deleteEncryptedFile(doc.filePath);
      await plain.runAsync('UPDATE documents SET filePath = ? WHERE id = ?', [permanent, doc.id]);
    }

    await vault.closeAsync();
    await plain.closeAsync();
    await deleteDatabaseFile(VAULT_DB_NAME);
    await DocumentEncryptionService.clearDecryptedTemps();
    await writeVaultMigrated(false);
  },
};
