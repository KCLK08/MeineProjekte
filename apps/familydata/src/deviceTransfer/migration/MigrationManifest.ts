import { z } from 'zod';

import { IntegrityService } from '@/deviceTransfer/migration/IntegrityService';
import {
  EXPORT_TABLES,
  METADATA_FORMAT,
  METADATA_FORMAT_VERSION,
  type MigrationManifest,
  type VaultMetadataPayload,
} from '@/deviceTransfer/migration/types';

const tableSchema = z.enum(EXPORT_TABLES);

const manifestSchema = z.object({
  version: z.literal(1),
  timestamp: z.number().int().positive(),
  databaseVersion: z.number().int().positive(),
  tables: z.array(tableSchema).min(1),
  documentCount: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  integrity: z.string().regex(/^[0-9a-f]{64}$/),
  payloadBytes: z.number().int().positive(),
  chunkCount: z.number().int().positive(),
});

const payloadSchema = z.object({
  format: z.literal(METADATA_FORMAT),
  formatVersion: z.literal(METADATA_FORMAT_VERSION),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().min(1),
  family: z.object({
    familyName: z.string(),
    setupComplete: z.boolean(),
  }),
  appMeta: z.record(z.string()),
  people: z.array(z.record(z.any())),
  idEntries: z.array(z.record(z.any())),
  documents: z.array(z.record(z.any())),
});

export const CHUNK_PAYLOAD_CHARS = 2400;

/**
 * Manifest build/parse + payload serialization helpers.
 */
export const MigrationManifestService = {
  serializePayload(payload: VaultMetadataPayload): string {
    // Stable-enough serialization for checksum (insertion order of constructed object).
    return JSON.stringify(payload);
  },

  buildManifest(params: {
    payloadJson: string;
    integrityKey: Uint8Array;
    databaseVersion: number;
    documentCount: number;
  }): MigrationManifest {
    const checksum = IntegrityService.checksumUtf8(params.payloadJson);
    const integrity = IntegrityService.sign(params.integrityKey, checksum, 'fv-meta-v1');
    const chunkCount = Math.max(1, Math.ceil(params.payloadJson.length / CHUNK_PAYLOAD_CHARS));
    return {
      version: 1,
      timestamp: Date.now(),
      databaseVersion: params.databaseVersion,
      tables: [...EXPORT_TABLES],
      documentCount: params.documentCount,
      checksum,
      integrity,
      payloadBytes: new TextEncoder().encode(params.payloadJson).byteLength,
      chunkCount,
    };
  },

  parseManifest(raw: unknown): MigrationManifest {
    const result = manifestSchema.safeParse(raw);
    if (!result.success) {
      throw new Error('Manifest ungültig oder unvollständig.');
    }
    return result.data;
  },

  parsePayload(raw: unknown): VaultMetadataPayload {
    const result = payloadSchema.safeParse(raw);
    if (!result.success) {
      throw new Error('Metadaten-Payload ungültig.');
    }
    return result.data as VaultMetadataPayload;
  },

  verifyBeforeImport(params: {
    manifest: MigrationManifest;
    payloadJson: string;
    integrityKey: Uint8Array;
  }) {
    const checksum = IntegrityService.checksumUtf8(params.payloadJson);
    if (checksum !== params.manifest.checksum) {
      throw new Error('Checksum-Mismatch – Payload manipuliert oder unvollständig.');
    }
    if (!IntegrityService.verify(params.integrityKey, checksum, params.manifest.integrity, 'fv-meta-v1')) {
      throw new Error('Integrity-HMAC ungültig – Manifest abgelehnt.');
    }
    if (params.manifest.databaseVersion < 1) {
      throw new Error('Ungültige databaseVersion.');
    }
    const parsed = this.parsePayload(JSON.parse(params.payloadJson));
    if (parsed.documents.length !== params.manifest.documentCount) {
      throw new Error('documentCount stimmt nicht mit Payload überein.');
    }
    return parsed;
  },

  splitChunks(payloadJson: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < payloadJson.length; i += CHUNK_PAYLOAD_CHARS) {
      chunks.push(payloadJson.slice(i, i + CHUNK_PAYLOAD_CHARS));
    }
    return chunks.length ? chunks : [''];
  },
};
