import { MigrationManifestService } from '@/deviceTransfer/migration/MigrationManifest';
import { StagingStore } from '@/deviceTransfer/migration/StagingStore';
import type { MigrationManifest, StagingRecord, VaultMetadataPayload } from '@/deviceTransfer/migration/types';

/**
 * Receiver-side import into staging only.
 * Does NOT write the productive SQLCipher vault or create a new master key.
 */
export const VaultImportService = {
  async beginStaging(transferId: string): Promise<StagingRecord> {
    await StagingStore.rollback(transferId).catch(() => undefined);
    return StagingStore.create(transferId);
  },

  async storeManifest(transferId: string, manifest: MigrationManifest) {
    MigrationManifestService.parseManifest(manifest);
    await StagingStore.writeManifest(transferId, manifest);
  },

  async storePayload(transferId: string, payloadJson: string) {
    await StagingStore.writePayload(transferId, payloadJson);
    await StagingStore.setStatus(transferId, 'staged');
  },

  /**
   * Validate manifest + payload integrity. On failure: rollback staging.
   */
  async validate(transferId: string, sessionKey: Uint8Array): Promise<VaultMetadataPayload> {
    try {
      const manifest = await StagingStore.readManifest(transferId);
      if (!manifest) throw new Error('Manifest fehlt im Staging.');
      const payloadJson = await StagingStore.readPayload(transferId);
      const payload = MigrationManifestService.verifyBeforeImport({
        manifest,
        payloadJson,
        sessionKey,
      });
      await StagingStore.setStatus(transferId, 'validated');
      return payload;
    } catch (e) {
      await StagingStore.setStatus(transferId, 'failed', (e as Error).message).catch(() => undefined);
      await StagingStore.rollback(transferId);
      throw e;
    }
  },

  /**
   * Phase 4A "commit": mark staging as accepted for a later vault apply.
   * Does not touch the productive vault.
   */
  async commitStaging(transferId: string): Promise<StagingRecord> {
    const record = await StagingStore.readRecord(transferId);
    if (record.status !== 'validated') {
      throw new Error('Commit nur nach erfolgreicher Validierung.');
    }
    return StagingStore.setStatus(transferId, 'committed');
  },

  async rollback(transferId: string) {
    await StagingStore.setStatus(transferId, 'rolled_back').catch(() => undefined);
    await StagingStore.rollback(transferId);
  },
};
