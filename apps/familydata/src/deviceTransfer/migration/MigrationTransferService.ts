import { DeviceIdentityService } from '@/deviceTransfer/DeviceIdentityService';
import { MigrationManifestService } from '@/deviceTransfer/migration/MigrationManifest';
import type { MigrationManifest } from '@/deviceTransfer/migration/types';
import { VaultExportService } from '@/deviceTransfer/migration/VaultExportService';
import { VaultImportService } from '@/deviceTransfer/migration/VaultImportService';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';

export type MigrationTransferSnapshot = {
  phase: 'idle' | 'sending' | 'receiving' | 'validated' | 'committed' | 'failed';
  transferId: string | null;
  progress: string;
  documentCount: number | null;
  peopleCount: number | null;
  error: string | null;
  updatedAt: number;
};

type Listener = (snap: MigrationTransferSnapshot) => void;

type ChunkEnvelope = { i: number; n: number; d: string };

/**
 * Orchestrates metadata export → chunked secure send → staging import/validate/commit.
 */
class MigrationTransferServiceImpl {
  private phase: MigrationTransferSnapshot['phase'] = 'idle';
  private transferId: string | null = null;
  private progress = '';
  private documentCount: number | null = null;
  private peopleCount: number | null = null;
  private error: string | null = null;
  private updatedAt = Date.now();
  private listeners = new Set<Listener>();
  private cached: MigrationTransferSnapshot;

  private recvTransferId: string | null = null;
  private recvManifest: MigrationManifest | null = null;
  private recvChunks: string[] = [];
  private recvExpected = 0;
  private handlerAttached = false;

  constructor() {
    this.cached = this.build();
  }

  subscribe(listener: Listener): () => void {
    this.ensureHandler();
    this.listeners.add(listener);
    listener(this.cached);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): MigrationTransferSnapshot {
    return this.cached;
  }

  reset() {
    this.phase = 'idle';
    this.transferId = null;
    this.progress = '';
    this.documentCount = null;
    this.peopleCount = null;
    this.error = null;
    this.recvTransferId = null;
    this.recvManifest = null;
    this.recvChunks = [];
    this.recvExpected = 0;
    this.emit();
  }

  /**
   * Host: export vault metadata and send over the open secure channel.
   */
  async sendMetadataTransfer(): Promise<void> {
    this.ensureHandler();
    if (TransportManager.getSnapshot().status !== 'connected') {
      throw new Error('Sicherer Kanal ist nicht verbunden.');
    }
    this.phase = 'sending';
    this.error = null;
    this.progress = 'Exportiere Metadaten…';
    this.emit();

    try {
      const transferId = await DeviceIdentityService.createSessionId();
      this.transferId = transferId;
      const { payload, schemaVersion } = await VaultExportService.exportMetadataPackage();
      const payloadJson = MigrationManifestService.serializePayload(payload);
      const integrityKey = TransportManager.borrowIntegrityKey();
      let manifest: MigrationManifest;
      try {
        manifest = MigrationManifestService.buildManifest({
          payloadJson,
          integrityKey,
          databaseVersion: schemaVersion,
          documentCount: payload.documents.length,
        });
      } finally {
        const { wipeBytes } = await import('@/deviceTransfer/bytes');
        wipeBytes(integrityKey);
      }

      this.documentCount = payload.documents.length;
      this.peopleCount = payload.people.length;
      this.progress = `Sende Manifest (${manifest.chunkCount} Chunks)…`;
      this.emit();

      await TransportManager.sendMessage(
        'meta_manifest',
        JSON.stringify({ transferId, manifest })
      );

      const chunks = MigrationManifestService.splitChunks(payloadJson);
      for (let i = 0; i < chunks.length; i += 1) {
        const envelope: ChunkEnvelope = { i, n: chunks.length, d: chunks[i]! };
        await TransportManager.sendMessage('meta_chunk', JSON.stringify(envelope));
        this.progress = `Sende Chunk ${i + 1}/${chunks.length}`;
        this.emit();
      }

      await TransportManager.sendMessage('meta_done', JSON.stringify({ transferId }));
      this.progress = 'Metadaten gesendet – warte auf ACK';
      this.emit();
    } catch (e) {
      this.phase = 'failed';
      this.error = (e as Error).message;
      this.progress = 'Senden fehlgeschlagen';
      this.emit();
      throw e;
    }
  }

  private ensureHandler() {
    if (this.handlerAttached) return;
    this.handlerAttached = true;
    TransportManager.addMessageHandler((message) => {
      void this.onMessage(message.type, message.payload);
    });
  }

  private async onMessage(type: string, payload: string) {
    try {
      const role = TransportManager.getSnapshot().role;
      // Host must never ingest metadata into staging (anti-reflection / role confusion).
      if (
        role === 'host' &&
        (type === 'meta_manifest' || type === 'meta_chunk' || type === 'meta_done')
      ) {
        return;
      }
      if (type === 'meta_manifest') {
        const parsed = JSON.parse(payload) as { transferId: string; manifest: MigrationManifest };
        const manifest = MigrationManifestService.parseManifest(parsed.manifest);
        this.recvTransferId = parsed.transferId;
        this.recvManifest = manifest;
        this.recvExpected = manifest.chunkCount;
        this.recvChunks = new Array(manifest.chunkCount).fill('');
        this.transferId = parsed.transferId;
        this.phase = 'receiving';
        this.progress = 'Manifest empfangen – Staging…';
        this.documentCount = manifest.documentCount;
        this.emit();
        await VaultImportService.beginStaging(parsed.transferId);
        await VaultImportService.storeManifest(parsed.transferId, manifest);
        await TransportManager.sendMessage('meta_ack', JSON.stringify({ transferId: parsed.transferId, stage: 'manifest' }));
        return;
      }

      if (type === 'meta_chunk') {
        if (!this.recvTransferId || !this.recvManifest) return;
        const envelope = JSON.parse(payload) as ChunkEnvelope;
        if (envelope.i < 0 || envelope.i >= this.recvExpected) {
          throw new Error('Ungültiger Chunk-Index.');
        }
        this.recvChunks[envelope.i] = envelope.d;
        this.progress = `Empfange Chunk ${envelope.i + 1}/${envelope.n}`;
        this.emit();
        return;
      }

      if (type === 'meta_done') {
        if (!this.recvTransferId || !this.recvManifest) return;
        const payloadJson = this.recvChunks.join('');
        if (this.recvChunks.some((c, idx) => idx < this.recvExpected && c === '' && this.recvExpected > 0)) {
          // allow empty string chunks only if intentionally empty; check length via checksum instead
        }
        this.progress = 'Validiere Staging…';
        this.emit();
        await VaultImportService.storePayload(this.recvTransferId, payloadJson);
        const integrityKey = TransportManager.borrowIntegrityKey();
        try {
          const validated = await VaultImportService.validate(this.recvTransferId, integrityKey);
          this.peopleCount = validated.people.length;
          this.documentCount = validated.documents.length;
          const committed = await VaultImportService.commitStaging(this.recvTransferId);
          this.phase = 'committed';
          this.progress = `Staging committed (${committed.transferId.slice(0, 8)}…)`;
          this.emit();
          await TransportManager.sendMessage(
            'meta_ack',
            JSON.stringify({
              transferId: this.recvTransferId,
              stage: 'committed',
              people: validated.people.length,
              documents: validated.documents.length,
            })
          );
        } finally {
          const { wipeBytes } = await import('@/deviceTransfer/bytes');
          wipeBytes(integrityKey);
        }
        return;
      }

      if (type === 'meta_ack') {
        const ack = JSON.parse(payload) as { stage?: string; people?: number; documents?: number };
        if (ack.stage === 'committed') {
          this.phase = 'committed';
          this.progress = `Empfänger bestätigt (${ack.people ?? '?'} Personen, ${ack.documents ?? '?'} Docs)`;
          if (typeof ack.people === 'number') this.peopleCount = ack.people;
          if (typeof ack.documents === 'number') this.documentCount = ack.documents;
          this.emit();
        } else if (ack.stage === 'manifest') {
          this.progress = 'Manifest ACK';
          this.emit();
        }
        return;
      }

      if (type === 'meta_reject') {
        this.phase = 'failed';
        this.error = payload || 'Transfer abgelehnt';
        this.progress = 'Abgelehnt';
        if (this.recvTransferId) {
          await VaultImportService.rollback(this.recvTransferId).catch(() => undefined);
        }
        this.emit();
      }
    } catch (e) {
      this.phase = 'failed';
      this.error = (e as Error).message;
      this.progress = 'Empfang/Validierung fehlgeschlagen';
      if (this.recvTransferId) {
        await VaultImportService.rollback(this.recvTransferId).catch(() => undefined);
      }
      try {
        await TransportManager.sendMessage(
          'meta_reject',
          (e as Error).message.slice(0, 200)
        );
      } catch {
        /* ignore */
      }
      this.emit();
    }
  }

  private build(): MigrationTransferSnapshot {
    return {
      phase: this.phase,
      transferId: this.transferId,
      progress: this.progress,
      documentCount: this.documentCount,
      peopleCount: this.peopleCount,
      error: this.error,
      updatedAt: this.updatedAt,
    };
  }

  private emit() {
    this.updatedAt = Date.now();
    this.cached = this.build();
    for (const l of this.listeners) l(this.cached);
  }
}

export const MigrationTransferService = new MigrationTransferServiceImpl();
