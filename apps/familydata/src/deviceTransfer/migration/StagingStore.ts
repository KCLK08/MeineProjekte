import * as FileSystem from 'expo-file-system/legacy';

import { wipeBytes } from '@/deviceTransfer/bytes';
import type { DocumentMappingEntry, DocumentMappingFile } from '@/deviceTransfer/migration/documentTypes';
import type { MigrationManifest, StagingRecord, StagedTransferStatus } from '@/deviceTransfer/migration/types';
import { EncryptionService } from '@/security/EncryptionService';

const ROOT = 'familydata-transfer-staging';
const PAYLOAD_ENC = 'payload.enc';
const PAYLOAD_LEGACY = 'payload.json';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function rootDir(): string {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error('Kein documentDirectory verfügbar.');
  return `${base}${ROOT}/`;
}

function transferDir(transferId: string): string {
  return `${rootDir()}${transferId}/`;
}

function documentsDir(transferId: string): string {
  return `${transferDir(transferId)}documents/`;
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
  transferDir,
  documentsDir,

  async create(transferId: string): Promise<StagingRecord> {
    await ensureDir(rootDir());
    const dir = transferDir(transferId);
    await ensureDir(dir);
    await ensureDir(documentsDir(transferId));
    const record: StagingRecord = {
      transferId,
      status: 'receiving',
      manifest: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    };
    await this.writeRecord(record);
    await this.writeMapping(transferId, {
      version: 1,
      transferId,
      documents: [],
      updatedAt: new Date().toISOString(),
    });
    return record;
  },

  async ensureDocumentsDir(transferId: string) {
    await ensureDir(transferDir(transferId));
    await ensureDir(documentsDir(transferId));
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

  /**
   * Persists vault metadata encrypted at rest with the transfer staging key.
   * Never writes plaintext PII to payload.json.
   */
  async writePayload(transferId: string, payloadJson: string, stagingKey: Uint8Array) {
    if (stagingKey.byteLength !== 32) throw new Error('Staging-Key muss 32 Byte sein.');
    const dir = transferDir(transferId);
    await ensureDir(dir);
    const plain = new TextEncoder().encode(payloadJson);
    let packed: Uint8Array | null = null;
    try {
      packed = await EncryptionService.encryptBytes(plain, stagingKey);
      await FileSystem.writeAsStringAsync(`${dir}${PAYLOAD_ENC}`, bytesToBase64(packed), {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Remove any legacy plaintext leftover.
      await FileSystem.deleteAsync(`${dir}${PAYLOAD_LEGACY}`, { idempotent: true }).catch(() => undefined);
    } finally {
      wipeBytes(plain);
      wipeBytes(packed);
    }
  },

  async readPayload(transferId: string, stagingKey: Uint8Array): Promise<string> {
    if (stagingKey.byteLength !== 32) throw new Error('Staging-Key muss 32 Byte sein.');
    const encPath = `${transferDir(transferId)}${PAYLOAD_ENC}`;
    const legacyPath = `${transferDir(transferId)}${PAYLOAD_LEGACY}`;
    const encInfo = await FileSystem.getInfoAsync(encPath);
    if (!encInfo.exists) {
      const legacy = await FileSystem.getInfoAsync(legacyPath);
      if (legacy.exists) {
        throw new Error('Unverschlüsseltes Staging erkannt – Transfer abbrechen und neu starten.');
      }
      throw new Error('Staging-Payload fehlt.');
    }
    const b64 = await FileSystem.readAsStringAsync(encPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const packed = base64ToBytes(b64);
    let plain: Uint8Array | null = null;
    try {
      plain = EncryptionService.decryptBytes(packed, stagingKey);
      return new TextDecoder().decode(plain);
    } finally {
      wipeBytes(packed);
      wipeBytes(plain);
    }
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

  async readMapping(transferId: string): Promise<DocumentMappingFile> {
    const path = `${documentsDir(transferId)}mapping.json`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return {
        version: 1,
        transferId,
        documents: [],
        updatedAt: new Date().toISOString(),
      };
    }
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as DocumentMappingFile;
  },

  async writeMapping(transferId: string, mapping: DocumentMappingFile) {
    await this.ensureDocumentsDir(transferId);
    mapping.updatedAt = new Date().toISOString();
    await FileSystem.writeAsStringAsync(
      `${documentsDir(transferId)}mapping.json`,
      JSON.stringify(mapping)
    );
  },

  async upsertMappingEntry(transferId: string, entry: DocumentMappingEntry) {
    const mapping = await this.readMapping(transferId);
    const idx = mapping.documents.findIndex((d) => d.documentId === entry.documentId);
    if (idx >= 0) mapping.documents[idx] = entry;
    else mapping.documents.push(entry);
    await this.writeMapping(transferId, mapping);
  },

  partialPath(transferId: string, documentId: string): string {
    return `${documentsDir(transferId)}${documentId}.partial`;
  },

  finalPath(transferId: string, localFileName: string): string {
    return `${documentsDir(transferId)}${localFileName}`;
  },

  async removeDocumentArtifacts(transferId: string, documentId: string, localFileName?: string) {
    await FileSystem.deleteAsync(this.partialPath(transferId, documentId), { idempotent: true }).catch(
      () => undefined
    );
    if (localFileName) {
      await FileSystem.deleteAsync(this.finalPath(transferId, localFileName), { idempotent: true }).catch(
        () => undefined
      );
    }
    const mapping = await this.readMapping(transferId);
    mapping.documents = mapping.documents.filter((d) => d.documentId !== documentId);
    await this.writeMapping(transferId, mapping);
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
