/** Phase 4B – encrypted document staging transfer (no vault cutover). */

export type DocumentMappingEntry = {
  documentId: string;
  localFileName: string;
  sourceRelativePath: string;
  sha256: string;
  byteLength: number;
  status: 'receiving' | 'validated' | 'failed';
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
};

export type DocumentChunkPayload = {
  documentId: string;
  index: number;
  total: number;
  size: number;
  chunkSha256: string;
  /** Base64 of ciphertext chunk (still .dat bytes – never plaintext). */
  data: string;
};

export type DocumentEndPayload = {
  documentId: string;
  fileSha256: string;
};

/** Raw bytes per chunk before base64 (keeps AEAD payload under limit). */
export const DOC_CHUNK_RAW_BYTES = 2400;
