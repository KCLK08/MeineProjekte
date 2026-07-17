import * as FileSystem from 'expo-file-system/legacy';

import { wipeBytes } from '@/deviceTransfer/bytes';
import { DocumentFileTransferIO } from '@/deviceTransfer/migration/DocumentFileTransferIO';
import type {
  DocumentChunkPayload,
  DocumentEndPayload,
  DocumentStartPayload,
} from '@/deviceTransfer/migration/documentTypes';
import { IntegrityService } from '@/deviceTransfer/migration/IntegrityService';
import { MigrationTransferService } from '@/deviceTransfer/migration/MigrationTransferService';
import { StagingStore } from '@/deviceTransfer/migration/StagingStore';
import * as repo from '@/db/repository';
import { SecurityManager } from '@/security/SecurityManager';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';

export type DocumentTransferSnapshot = {
  phase: 'idle' | 'sending' | 'receiving' | 'ready_for_4c' | 'failed';
  progress: string;
  currentDocumentId: string | null;
  sentCount: number;
  receivedCount: number;
  error: string | null;
  updatedAt: number;
};

type Listener = (snap: DocumentTransferSnapshot) => void;

type RecvState = {
  transferId: string;
  documentId: string;
  sourceRelativePath: string;
  totalBytes: number;
  totalChunks: number;
  fileSha256: string;
  integrity: string;
  chunks: (Uint8Array | null)[];
  received: number;
  localFileName: string;
};

/**
 * Phase 4B: stream encrypted .dat files into staging documents/.
 * No productive vault writes. No plaintext. No master key.
 */
class DocumentTransferServiceImpl {
  private phase: DocumentTransferSnapshot['phase'] = 'idle';
  private progress = '';
  private currentDocumentId: string | null = null;
  private sentCount = 0;
  private receivedCount = 0;
  private error: string | null = null;
  private updatedAt = Date.now();
  private listeners = new Set<Listener>();
  private cached: DocumentTransferSnapshot;
  private handlerAttached = false;
  private recv: RecvState | null = null;

  constructor() {
    this.cached = this.build();
  }

  subscribe(listener: Listener): () => void {
    this.ensureHandler();
    this.listeners.add(listener);
    listener(this.cached);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): DocumentTransferSnapshot {
    return this.cached;
  }

  reset() {
    this.abortCurrentReceive();
    this.phase = 'idle';
    this.progress = '';
    this.currentDocumentId = null;
    this.sentCount = 0;
    this.receivedCount = 0;
    this.error = null;
    this.emit();
  }

  /**
   * Host: send all encrypted document files referenced by the vault.
   * Requires prior metadata staging transferId (Phase 4A committed).
   */
  async sendAllEncryptedDocuments(): Promise<void> {
    this.ensureHandler();
    if (TransportManager.getSnapshot().status !== 'connected') {
      throw new Error('Sicherer Kanal ist nicht verbunden.');
    }
    if (!SecurityManager.isUnlocked()) {
      throw new Error('Tresor muss entsperrt sein.');
    }
    const meta = MigrationTransferService.getSnapshot();
    const transferId = meta.transferId;
    if (!transferId || meta.phase !== 'committed') {
      throw new Error('Zuerst Metadaten-Transfer (Phase 4A) erfolgreich abschließen.');
    }

    this.phase = 'sending';
    this.error = null;
    this.sentCount = 0;
    this.progress = 'Lade Dokumentliste…';
    this.emit();

    const documents = await repo.listDocuments();
    const withFiles = documents.filter((d) => d.filePath?.trim());
    if (!withFiles.length) {
      this.progress = 'Keine verschlüsselten Dokumente vorhanden.';
      this.phase = 'ready_for_4c';
      this.emit();
      await TransportManager.sendMessage(
        'document_ack',
        JSON.stringify({ transferId, stage: 'all_done', count: 0 })
      );
      return;
    }

    let totalBytes = 0;
    for (const doc of withFiles) {
      const uri = DocumentFileTransferIO.resolveSourceUri(doc.filePath);
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && typeof info.size === 'number') totalBytes += info.size;
    }
    await DocumentFileTransferIO.ensureFreeSpace(totalBytes);

    for (const doc of withFiles) {
      await this.sendOneDocument(transferId, doc.id, doc.filePath);
      this.sentCount += 1;
      this.progress = `Gesendet ${this.sentCount}/${withFiles.length}`;
      this.emit();
    }

    await TransportManager.sendMessage(
      'document_ack',
      JSON.stringify({ transferId, stage: 'all_done', count: this.sentCount })
    );
    this.phase = 'ready_for_4c';
    this.progress = `Alle Dokumente gesendet (${this.sentCount})`;
    this.currentDocumentId = null;
    this.emit();
  }

  private async sendOneDocument(transferId: string, documentId: string, filePath: string) {
    const uri = DocumentFileTransferIO.resolveSourceUri(filePath);
    const bytes = await DocumentFileTransferIO.readEncryptedBytes(uri);
    try {
      const fileSha256 = DocumentFileTransferIO.hashBytes(bytes);
      const integrityKey = TransportManager.borrowIntegrityKey();
      let integrity: string;
      try {
        integrity = IntegrityService.sign(integrityKey, fileSha256, 'fv-doc-v1');
      } finally {
        wipeBytes(integrityKey);
      }

      const chunks = DocumentFileTransferIO.splitChunks(bytes);
      const start: DocumentStartPayload = {
        transferId,
        documentId,
        sourceRelativePath: DocumentFileTransferIO.toRelativePath(uri),
        totalBytes: bytes.byteLength,
        totalChunks: chunks.length,
        fileSha256,
        integrity,
      };
      this.currentDocumentId = documentId;
      this.progress = `Dokument ${documentId.slice(0, 8)}… (${chunks.length} Chunks)`;
      this.emit();

      await TransportManager.sendMessage('document_start', JSON.stringify(start));

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i]!;
        const payload: DocumentChunkPayload = {
          documentId,
          index: i,
          total: chunks.length,
          size: chunk.byteLength,
          chunkSha256: DocumentFileTransferIO.hashChunk(chunk),
          data: DocumentFileTransferIO.encodeChunkBase64(chunk),
        };
        await TransportManager.sendMessage('document_chunk', JSON.stringify(payload));
      }

      const end: DocumentEndPayload = { documentId, fileSha256 };
      await TransportManager.sendMessage('document_end', JSON.stringify(end));
    } finally {
      wipeBytes(bytes);
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
      if (type === 'document_start') {
        await this.onDocumentStart(JSON.parse(payload) as DocumentStartPayload);
        return;
      }
      if (type === 'document_chunk') {
        await this.onDocumentChunk(JSON.parse(payload) as DocumentChunkPayload);
        return;
      }
      if (type === 'document_end') {
        await this.onDocumentEnd(JSON.parse(payload) as DocumentEndPayload);
        return;
      }
      if (type === 'document_ack') {
        const ack = JSON.parse(payload) as { stage?: string; count?: number; documentId?: string };
        if (ack.stage === 'doc_ok') {
          this.progress = `ACK Dokument ${ack.documentId?.slice(0, 8) ?? ''}…`;
          this.emit();
        } else if (ack.stage === 'all_done') {
          this.phase = 'ready_for_4c';
          this.progress = `Empfänger bereit für Phase 4C (${ack.count ?? '?'} Dateien)`;
          this.emit();
        }
        return;
      }
      if (type === 'document_reject') {
        this.phase = 'failed';
        this.error = payload || 'Dokumenttransfer abgelehnt';
        this.progress = 'Abgelehnt';
        this.abortCurrentReceive();
        this.emit();
      }
    } catch (e) {
      this.phase = 'failed';
      this.error = (e as Error).message;
      this.progress = 'Dokumentempfang fehlgeschlagen';
      const docId = this.recv?.documentId;
      const transferId = this.recv?.transferId;
      this.abortCurrentReceive();
      if (transferId && docId) {
        await StagingStore.removeDocumentArtifacts(transferId, docId).catch(() => undefined);
      }
      try {
        await TransportManager.sendMessage('document_reject', (e as Error).message.slice(0, 200));
      } catch {
        /* ignore */
      }
      this.emit();
    }
  }

  private async onDocumentStart(start: DocumentStartPayload) {
    this.abortCurrentReceive();
    if (!start.transferId || !start.documentId) {
      throw new Error('document_start unvollständig.');
    }
    if (start.totalChunks < 1 || start.totalBytes < 0) {
      throw new Error('Ungültige Dokumentgröße.');
    }
    await DocumentFileTransferIO.ensureFreeSpace(start.totalBytes);

    // Ensure staging root exists (metadata phase should have created it).
    try {
      await StagingStore.readRecord(start.transferId);
    } catch {
      await StagingStore.create(start.transferId);
    }
    await StagingStore.ensureDocumentsDir(start.transferId);

    const localFileName = await DocumentFileTransferIO.newLocalFileName();
    this.recv = {
      transferId: start.transferId,
      documentId: start.documentId,
      sourceRelativePath: start.sourceRelativePath,
      totalBytes: start.totalBytes,
      totalChunks: start.totalChunks,
      fileSha256: start.fileSha256,
      integrity: start.integrity,
      chunks: new Array(start.totalChunks).fill(null),
      received: 0,
      localFileName,
    };
    this.phase = 'receiving';
    this.currentDocumentId = start.documentId;
    this.progress = `Empfange ${start.documentId.slice(0, 8)}… (0/${start.totalChunks})`;
    this.emit();

    await StagingStore.upsertMappingEntry(start.transferId, {
      documentId: start.documentId,
      localFileName,
      sourceRelativePath: start.sourceRelativePath,
      sha256: start.fileSha256,
      byteLength: start.totalBytes,
      status: 'receiving',
    });
  }

  private async onDocumentChunk(chunk: DocumentChunkPayload) {
    if (!this.recv || chunk.documentId !== this.recv.documentId) {
      throw new Error('Chunk ohne passenden document_start.');
    }
    if (chunk.index !== this.recv.received) {
      throw new Error(`Falsche Chunk-Reihenfolge (erwartet ${this.recv.received}, got ${chunk.index}).`);
    }
    if (chunk.index < 0 || chunk.index >= this.recv.totalChunks) {
      throw new Error('Chunk-Index außerhalb des Bereichs.');
    }
    if (this.recv.chunks[chunk.index]) {
      throw new Error('Doppelter Chunk.');
    }
    const bytes = DocumentFileTransferIO.decodeChunkBase64(chunk.data);
    if (bytes.byteLength !== chunk.size) {
      wipeBytes(bytes);
      throw new Error('Chunk-Größe stimmt nicht.');
    }
    const hash = DocumentFileTransferIO.hashChunk(bytes);
    if (hash !== chunk.chunkSha256) {
      wipeBytes(bytes);
      throw new Error('Chunk-Hash Fehler.');
    }
    this.recv.chunks[chunk.index] = bytes;
    this.recv.received += 1;
    this.progress = `Empfange ${chunk.documentId.slice(0, 8)}… (${this.recv.received}/${this.recv.totalChunks})`;
    this.emit();
  }

  private async onDocumentEnd(end: DocumentEndPayload) {
    if (!this.recv || end.documentId !== this.recv.documentId) {
      throw new Error('document_end ohne aktiven Empfang.');
    }
    if (this.recv.received !== this.recv.totalChunks) {
      throw new Error('Fehlende Chunks vor document_end.');
    }
    if (end.fileSha256 !== this.recv.fileSha256) {
      throw new Error('Dokument-Hash in document_end weicht ab.');
    }

    // Assemble
    const total = this.recv.chunks.reduce((n, c) => n + (c?.byteLength ?? 0), 0);
    if (total !== this.recv.totalBytes) {
      throw new Error('Gesamtgröße nach Assemble falsch.');
    }
    const assembled = new Uint8Array(total);
    let offset = 0;
    for (const part of this.recv.chunks) {
      if (!part) throw new Error('Fehlender Chunk beim Assemble.');
      assembled.set(part, offset);
      offset += part.byteLength;
      wipeBytes(part);
    }
    this.recv.chunks = [];

    try {
      const fileSha256 = DocumentFileTransferIO.hashBytes(assembled);
      if (fileSha256 !== this.recv.fileSha256) {
        throw new Error('Dokument-Hash Fehler nach Assemble.');
      }
      const integrityKey = TransportManager.borrowIntegrityKey();
      try {
        if (
          !IntegrityService.verify(integrityKey, fileSha256, this.recv.integrity, 'fv-doc-v1')
        ) {
          throw new Error('Dokument-Integrity-HMAC ungültig.');
        }
      } finally {
        wipeBytes(integrityKey);
      }

      // Write as base64 .dat into staging (opaque ciphertext)
      let binary = '';
      const step = 0x8000;
      for (let i = 0; i < assembled.length; i += step) {
        binary += String.fromCharCode(...assembled.subarray(i, i + step));
      }
      const b64 = btoa(binary);
      const dest = StagingStore.finalPath(this.recv.transferId, this.recv.localFileName);
      await FileSystem.writeAsStringAsync(dest, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await StagingStore.upsertMappingEntry(this.recv.transferId, {
        documentId: this.recv.documentId,
        localFileName: this.recv.localFileName,
        sourceRelativePath: this.recv.sourceRelativePath,
        sha256: fileSha256,
        byteLength: this.recv.totalBytes,
        status: 'validated',
      });

      this.receivedCount += 1;
      const doneId = this.recv.documentId;
      const transferId = this.recv.transferId;
      this.recv = null;
      this.currentDocumentId = null;
      this.progress = `Dokument validiert (${this.receivedCount})`;
      this.phase = 'receiving';
      this.emit();

      await TransportManager.sendMessage(
        'document_ack',
        JSON.stringify({ transferId, stage: 'doc_ok', documentId: doneId })
      );
    } finally {
      wipeBytes(assembled);
    }
  }

  private abortCurrentReceive() {
    if (!this.recv) return;
    for (const part of this.recv.chunks) {
      wipeBytes(part);
    }
    const { transferId, documentId, localFileName } = this.recv;
    this.recv = null;
    void StagingStore.removeDocumentArtifacts(transferId, documentId, localFileName).catch(
      () => undefined
    );
  }

  private build(): DocumentTransferSnapshot {
    return {
      phase: this.phase,
      progress: this.progress,
      currentDocumentId: this.currentDocumentId,
      sentCount: this.sentCount,
      receivedCount: this.receivedCount,
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

export const DocumentTransferService = new DocumentTransferServiceImpl();
