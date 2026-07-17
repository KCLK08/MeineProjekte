/** Phase 4B – encrypted document staging transfer (no vault cutover). */

import { DOC_WRAP_FORMAT } from '@/deviceTransfer/migration/DocumentTransferWrap';

export type DocumentMappingEntry = {
  documentId: string;
  localFileName: string;
  sourceRelativePath: string;
  sha256: string;
  byteLength: number;
  status: 'receiving' | 'validated' | 'failed';
  /** Present when bytes are transfer-wrap ciphertext (not opaque vault .dat). */
  wrapFormat?: typeof DOC_WRAP_FORMAT;
};

export type DocumentMappingFile = {
  version: 1;
  transferId: string;
  documents: DocumentMappingEntry[];
  updatedAt: string;
};

export type DocumentStartPayload = {
  transferId: string;
  documentId: string;
  sourceRelativePath: string;
  totalBytes: number;
  totalChunks: number;
  fileSha256: string;
  /** HMAC over fileSha256 with integrity key (domain fv-doc-v1). */
  integrity: string;
  /** aes-gcm-docwrap-v1 – required for Phase 4C rekey. */
  wrapFormat: typeof DOC_WRAP_FORMAT;
};

export type DocumentChunkPayload = {
  documentId: string;
  index: number;
  total: number;
  size: number;
  chunkSha256: string;
  /** Base64 of transfer-wrap ciphertext chunk (never vault-master ciphertext, never plaintext). */
  data: string;
};

export type DocumentEndPayload = {
  documentId: string;
  fileSha256: string;
};

/** Raw bytes per chunk before base64 (keeps AEAD payload under limit). */
export const DOC_CHUNK_RAW_BYTES = 2400;
