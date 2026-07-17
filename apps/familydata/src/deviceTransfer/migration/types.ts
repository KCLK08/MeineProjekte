/** Phase 4A – vault metadata package (no file bytes, no master key). */

export const METADATA_FORMAT = 'familydata.vault.metadata' as const;
export const METADATA_FORMAT_VERSION = 1 as const;

/** Logical tables included in a metadata export. */
export const EXPORT_TABLES = [
  'people',
  'id_entries',
  'documents',
  'document_people',
  'app_meta',
] as const;

export type ExportTableName = (typeof EXPORT_TABLES)[number];

export type DocumentFileRef = {
  kind: 'encrypted_document';
  /** Relative path only – never absolute device paths or file bytes. */
  relativePath: string;
};

export type ExportedPerson = {
  id: string;
  vorname: string;
  nachname: string;
  rolle: string;
  geburtsdatum: string;
  nationalitaet: string;
  telefon: string;
  email: string;
  adresse: string;
  notizen: string;
  createdAt: string;
  updatedAt: string;
};

export type ExportedIdEntry = {
  id: string;
  personId: string;
  label: string;
  value: string;
  sortOrder: number;
};

export type ExportedDocument = {
  id: string;
  name: string;
  documentNumber: string;
  expiryDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  personIds: string[];
  fileRef: DocumentFileRef | null;
};

export type VaultMetadataPayload = {
  format: typeof METADATA_FORMAT;
  formatVersion: typeof METADATA_FORMAT_VERSION;
  schemaVersion: number;
  exportedAt: string;
  family: {
    familyName: string;
    setupComplete: boolean;
  };
  appMeta: Record<string, string>;
  people: ExportedPerson[];
  idEntries: ExportedIdEntry[];
  documents: ExportedDocument[];
};

export type MigrationManifest = {
  version: number;
  timestamp: number;
  databaseVersion: number;
  tables: ExportTableName[];
  documentCount: number;
  /** SHA-256 hex of canonical payload JSON. */
  checksum: string;
  /** HMAC-SHA256 hex over checksum using transfer session key. */
  integrity: string;
  payloadBytes: number;
  chunkCount: number;
};

export type StagedTransferStatus = 'receiving' | 'staged' | 'validated' | 'committed' | 'rolled_back' | 'failed';

export type StagingRecord = {
  transferId: string;
  status: StagedTransferStatus;
  manifest: MigrationManifest | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
};
