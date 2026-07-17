import type * as SQLite from 'expo-sqlite';

import type { VaultMetadataPayload } from '@/deviceTransfer/migration/types';

/**
 * Imports Phase 4A metadata into a freshly created SQLCipher vault DB.
 * Preserves IDs and timestamps. Does not touch document file bytes.
 */
export const VaultMetadataApplyService = {
  async apply(db: SQLite.SQLiteDatabase, payload: VaultMetadataPayload): Promise<{
    people: number;
    idEntries: number;
    documents: number;
  }> {
    await db.execAsync('PRAGMA foreign_keys = OFF;');

    for (const table of ['document_people', 'documents', 'id_entries', 'people']) {
      await db.execAsync(`DELETE FROM ${table};`).catch(() => undefined);
    }

    for (const p of payload.people) {
      await db.runAsync(
        `INSERT OR REPLACE INTO people
          (id, vorname, nachname, rolle, geburtsdatum, nationalitaet, telefon, email, adresse, notizen, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.vorname,
          p.nachname,
          p.rolle,
          p.geburtsdatum,
          p.nationalitaet,
          p.telefon,
          p.email,
          p.adresse,
          p.notizen,
          p.createdAt,
          p.updatedAt,
        ]
      );
    }

    for (const e of payload.idEntries) {
      await db.runAsync(
        `INSERT OR REPLACE INTO id_entries (id, personId, label, value, sortOrder) VALUES (?, ?, ?, ?, ?)`,
        [e.id, e.personId, e.label, e.value, e.sortOrder]
      );
    }

    for (const d of payload.documents) {
      await db.runAsync(
        `INSERT OR REPLACE INTO documents
          (id, name, documentNumber, expiryDate, filePath, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id,
          d.name,
          d.documentNumber,
          d.expiryDate,
          '', // file paths filled after document rekey
          d.notes,
          d.createdAt,
          d.updatedAt,
        ]
      );
      for (const personId of d.personIds) {
        await db.runAsync(`INSERT OR IGNORE INTO document_people (documentId, personId) VALUES (?, ?)`, [
          d.id,
          personId,
        ]);
      }
    }

    for (const [key, value] of Object.entries(payload.appMeta || {})) {
      await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [key, value]);
    }
    await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [
      'family_name',
      payload.family.familyName,
    ]);
    await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [
      'setup_complete',
      payload.family.setupComplete ? '1' : '0',
    ]);
    await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [
      'schema_version',
      String(payload.schemaVersion || 4),
    ]);

    await db.execAsync('PRAGMA foreign_keys = ON;');

    return {
      people: payload.people.length,
      idEntries: payload.idEntries.length,
      documents: payload.documents.length,
    };
  },

  async updateDocumentPath(db: SQLite.SQLiteDatabase, documentId: string, filePath: string) {
    await db.runAsync(`UPDATE documents SET filePath = ? WHERE id = ?`, [filePath, documentId]);
  },

  async countPeople(db: SQLite.SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM people');
    return row?.c ?? 0;
  },

  async countDocuments(db: SQLite.SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM documents');
    return row?.c ?? 0;
  },

  async listDocumentPaths(db: SQLite.SQLiteDatabase): Promise<{ id: string; filePath: string }[]> {
    return db.getAllAsync<{ id: string; filePath: string }>(
      `SELECT id, filePath FROM documents WHERE TRIM(filePath) != ''`
    );
  },
};
