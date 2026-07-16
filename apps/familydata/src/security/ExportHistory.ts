import { createId, nowIso } from '@/utils/helpers';

/** Metadata-only export audit trail (no file contents / names). Stored in SQLCipher vault. */

export type ExportHistoryEntry = {
  id: string;
  at: string;
  documentId: string;
  exportType: 'pdf';
};

export const ExportHistory = {
  async record(documentId: string, exportType: 'pdf' = 'pdf'): Promise<void> {
    const { SecurityManager } = await import('@/security/SecurityManager');
    if (!SecurityManager.isUnlocked()) {
      throw new Error('Tresor ist gesperrt.');
    }
    const repo = await import('@/db/repository');
    await repo.appendExportHistory({
      id: createId('exp'),
      at: nowIso(),
      documentId,
      exportType,
    });
    await repo.trimExportHistory(100);
  },

  async listRecent(limit = 20): Promise<ExportHistoryEntry[]> {
    const { SecurityManager } = await import('@/security/SecurityManager');
    if (!SecurityManager.isUnlocked()) return [];
    const repo = await import('@/db/repository');
    const rows = await repo.listExportHistory(limit);
    return rows.map((row) => ({
      id: row.id,
      at: row.at,
      documentId: row.documentId,
      exportType: (row.exportType === 'pdf' ? 'pdf' : 'pdf') as ExportHistoryEntry['exportType'],
    }));
  },
};
