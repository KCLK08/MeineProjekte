import * as repo from '@/db/repository';
import { DocumentEncryptionService } from '@/security/DocumentEncryptionService';
import { SecurityManager } from '@/security/SecurityManager';
import type {
  DocumentFileRef,
  ExportedDocument,
  ExportedIdEntry,
  ExportedPerson,
  VaultMetadataPayload,
} from '@/deviceTransfer/migration/types';
import { METADATA_FORMAT, METADATA_FORMAT_VERSION } from '@/deviceTransfer/migration/types';

function toRelativeFileRef(filePath: string): DocumentFileRef | null {
  const trimmed = filePath?.trim();
  if (!trimmed) return null;
  const base = trimmed.split('/').pop() || '';
  if (!base || !base.endsWith('.dat')) {
    // Still export a relative hint without absolute path leakage.
    return {
      kind: 'encrypted_document',
      relativePath: base ? `familydata-encrypted/${base}` : 'familydata-encrypted/unknown.dat',
    };
  }
  return {
    kind: 'encrypted_document',
    relativePath: DocumentEncryptionService.isEncryptedPath(trimmed)
      ? `familydata-encrypted/${base}`
      : `familydata-encrypted/${base}`,
  };
}

/**
 * Reads unlocked vault metadata only. Never reads master key or document bytes.
 */
export const VaultExportService = {
  async exportMetadataPackage(): Promise<{ payload: VaultMetadataPayload; schemaVersion: number }> {
    if (!SecurityManager.isUnlocked()) {
      throw new Error('Tresor muss entsperrt sein, um Metadaten zu exportieren.');
    }
    await repo.ensureDatabaseReady();

    const [familyName, setupComplete, people, documents] = await Promise.all([
      repo.getFamilyName(),
      repo.isSetupComplete(),
      repo.listPeople(),
      repo.listDocuments(),
    ]);

    const idEntries: ExportedIdEntry[] = [];
    for (const person of people) {
      const entries = await repo.listIdEntries(person.id);
      for (const e of entries) {
        idEntries.push({
          id: e.id,
          personId: e.personId,
          label: e.label,
          value: e.value,
          sortOrder: e.sortOrder,
        });
      }
    }

    const exportedPeople: ExportedPerson[] = people.map((p) => ({
      id: p.id,
      vorname: p.vorname,
      nachname: p.nachname,
      rolle: p.rolle,
      geburtsdatum: p.geburtsdatum,
      nationalitaet: p.nationalitaet,
      telefon: p.telefon,
      email: p.email,
      adresse: p.adresse,
      notizen: p.notizen,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    const exportedDocs: ExportedDocument[] = documents.map((d) => ({
      id: d.id,
      name: d.name,
      documentNumber: d.documentNumber,
      expiryDate: d.expiryDate,
      notes: d.notes,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      personIds: [...d.personIds],
      fileRef: toRelativeFileRef(d.filePath),
    }));

    const appMeta: Record<string, string> = {
      schema_version: '4',
      family_name: familyName,
      setup_complete: setupComplete ? '1' : '0',
    };

    const payload: VaultMetadataPayload = {
      format: METADATA_FORMAT,
      formatVersion: METADATA_FORMAT_VERSION,
      schemaVersion: 4,
      exportedAt: new Date().toISOString(),
      family: {
        familyName,
        setupComplete,
      },
      appMeta,
      people: exportedPeople,
      idEntries,
      documents: exportedDocs,
    };

    // Sanity: ensure we never accidentally included absolute device paths.
    const probe = JSON.stringify(payload);
    if (probe.includes('file://') || /\/data\/user\//.test(probe) || /\/Containers\/Data\//.test(probe)) {
      throw new Error('Export abgebrochen: absolute Pfade dürfen nicht enthalten sein.');
    }

    return { payload, schemaVersion: 4 };
  },
};
