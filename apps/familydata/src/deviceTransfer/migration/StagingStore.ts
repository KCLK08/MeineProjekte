import * as FileSystem from 'expo-file-system/legacy';

import type { MigrationManifest, StagingRecord, StagedTransferStatus } from '@/deviceTransfer/migration/types';

const ROOT = 'familydata-transfer-staging';

function rootDir(): string {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error('Kein documentDirectory verfügbar.');
  return `${base}${ROOT}/`;
}

function transferDir(transferId: string): string {
  return `${rootDir()}${transferId}/`;
}

async function ensureDir(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  }
}

/**
 * Temporary staging on the receiver. Never writes the productive SQLCipher vault.
 */
export const StagingStore = {
  async create(transferId: string): Promise<StagingRecord> {
    await ensureDir(rootDir());
    const dir = transferDir(transferId);
    await ensureDir(dir);
    const record: StagingRecord = {
      transferId,
      status: 'receiving',
      manifest: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    };
    await this.writeRecord(record);
    return record;
  },

  async writeManifest(transferId: string, manifest: MigrationManifest) {
    const dir = transferDir(transferId);
    await ensureDir(dir);
    await FileSystem.writeAsStringAsync(`${dir}manifest.json`, JSON.stringify(manifest));
    const record = await this.readRecord(transferId);
    record.manifest = manifest;
    record.updatedAt = new Date().toISOString();
    await this.writeRecord(record);
  },

  async writePayload(transferId: string, payloadJson: string) {
    const dir = transferDir(transferId);
    await ensureDir(dir);
    await FileSystem.writeAsStringAsync(`${dir}payload.json`, payloadJson);
  },

  async readPayload(transferId: string): Promise<string> {
    return FileSystem.readAsStringAsync(`${transferDir(transferId)}payload.json`);
  },

  async readManifest(transferId: string): Promise<MigrationManifest | null> {
    const path = `${transferDir(transferId)}manifest.json`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as MigrationManifest;
  },

  async setStatus(transferId: string, status: StagedTransferStatus, error: string | null = null) {
    const record = await this.readRecord(transferId);
    record.status = status;
    record.error = error;
    record.updatedAt = new Date().toISOString();
    await this.writeRecord(record);
    return record;
  },

  async readRecord(transferId: string): Promise<StagingRecord> {
    const path = `${transferDir(transferId)}status.json`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      throw new Error('Staging-Eintrag nicht gefunden.');
    }
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as StagingRecord;
  },

  async writeRecord(record: StagingRecord) {
    const dir = transferDir(record.transferId);
    await ensureDir(dir);
    await FileSystem.writeAsStringAsync(`${dir}status.json`, JSON.stringify(record));
  },

  /** Rollback: delete staging directory entirely. */
  async rollback(transferId: string) {
    const dir = transferDir(transferId);
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  },

  /** Wipe all staging (e.g. on vault lock). */
  async wipeAll() {
    const root = rootDir();
    const info = await FileSystem.getInfoAsync(root);
    if (info.exists) {
      await FileSystem.deleteAsync(root, { idempotent: true });
    }
  },
};
