import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

import { StagingStore } from '@/deviceTransfer/migration/StagingStore';
import {
  databaseFileCandidates,
  MIGRATION_VAULT_DB_NAME,
  VAULT_DB_NAME,
} from '@/db/repository';

const MIGRATION_ENCRYPTED_DIR = 'familydata-encrypted-migration';
const BAK_ENCRYPTED_DIR = 'familydata-encrypted.pre-cutover';

async function wipeDirBestEffort(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    /* best-effort */
  }
}

async function wipeMigrationDatabaseBestEffort() {
  try {
    await SQLite.deleteDatabaseAsync(MIGRATION_VAULT_DB_NAME);
  } catch {
    /* may not exist */
  }
  for (const path of databaseFileCandidates(MIGRATION_VAULT_DB_NAME)) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* best-effort */
    }
  }
}

/** Remove `familydata.vault.db.pre-cutover` next to productive vault candidates only. */
async function wipePreCutoverDbBackupsBestEffort() {
  for (const vaultPath of databaseFileCandidates(VAULT_DB_NAME)) {
    const bak = `${vaultPath}.pre-cutover`;
    try {
      await FileSystem.deleteAsync(bak, { idempotent: true });
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Cold-start hygiene after process death:
 * - Transfer staging (RAM sessions never resume)
 * - Orphan Phase-4C migration artifacts (never productive vault/encrypted)
 *
 * Safe on boot: no in-RAM transfer/cutover can be active after process restart.
 */
export async function wipeOrphanTransferStaging(): Promise<void> {
  try {
    await StagingStore.wipeAll();
  } catch {
    /* best-effort */
  }

  const base = FileSystem.documentDirectory;
  if (base) {
    await wipeDirBestEffort(`${base}${MIGRATION_ENCRYPTED_DIR}/`);
    await wipeDirBestEffort(`${base}${MIGRATION_ENCRYPTED_DIR}`);
    await wipeDirBestEffort(`${base}${BAK_ENCRYPTED_DIR}/`);
    await wipeDirBestEffort(`${base}${BAK_ENCRYPTED_DIR}`);
  }

  await wipeMigrationDatabaseBestEffort();
  await wipePreCutoverDbBackupsBestEffort();

  // No paths or data — status only.
  console.info('orphan migration cleanup completed');
}
