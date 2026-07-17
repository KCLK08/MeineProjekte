import * as FileSystem from 'expo-file-system/legacy';

export type MigrationTxStatus =
  | 'prepared'
  | 'building'
  | 'validated'
  | 'committed'
  | 'rolled_back'
  | 'failed';

export type MigrationTransactionRecord = {
  transferId: string;
  status: MigrationTxStatus;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  expectedPeople: number;
  expectedDocuments: number;
  appliedPeople: number;
  appliedDocuments: number;
  appliedFiles: number;
};

function txPath(transferId: string): string {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error('Kein documentDirectory verfügbar.');
  return `${base}familydata-transfer-staging/${transferId}/migration.json`;
}

/**
 * Tracks Phase 4C cutover stages for a single staging transferId.
 * Status: prepared → building → validated → committed (or failed / rolled_back).
 */
export const MigrationTransaction = {
  async read(transferId: string): Promise<MigrationTransactionRecord | null> {
    const path = txPath(transferId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as MigrationTransactionRecord;
  },

  async write(record: MigrationTransactionRecord): Promise<MigrationTransactionRecord> {
    record.updatedAt = new Date().toISOString();
    await FileSystem.writeAsStringAsync(txPath(record.transferId), JSON.stringify(record));
    return record;
  },

  async prepare(
    transferId: string,
    counts: { expectedPeople: number; expectedDocuments: number }
  ): Promise<MigrationTransactionRecord> {
    const now = new Date().toISOString();
    const record: MigrationTransactionRecord = {
      transferId,
      status: 'prepared',
      createdAt: now,
      updatedAt: now,
      error: null,
      expectedPeople: counts.expectedPeople,
      expectedDocuments: counts.expectedDocuments,
      appliedPeople: 0,
      appliedDocuments: 0,
      appliedFiles: 0,
    };
    return this.write(record);
  },

  async setStatus(
    transferId: string,
    status: MigrationTxStatus,
    patch?: Partial<
      Pick<MigrationTransactionRecord, 'error' | 'appliedPeople' | 'appliedDocuments' | 'appliedFiles'>
    >
  ): Promise<MigrationTransactionRecord> {
    const existing = await this.read(transferId);
    if (!existing) throw new Error('MigrationTransaction fehlt – zuerst prepare().');
    existing.status = status;
    if (patch?.error !== undefined) existing.error = patch.error;
    if (patch?.appliedPeople !== undefined) existing.appliedPeople = patch.appliedPeople;
    if (patch?.appliedDocuments !== undefined) existing.appliedDocuments = patch.appliedDocuments;
    if (patch?.appliedFiles !== undefined) existing.appliedFiles = patch.appliedFiles;
    return this.write(existing);
  },

  async fail(transferId: string, error: string) {
    const existing = await this.read(transferId).catch(() => null);
    if (!existing) return;
    existing.status = 'failed';
    existing.error = error;
    await this.write(existing).catch(() => undefined);
  },
};
