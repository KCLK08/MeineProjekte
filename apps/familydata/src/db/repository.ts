import * as SQLite from 'expo-sqlite';

import type { DocumentType, FamilyDocument, IdentificationData, Person } from '@/types/models';
import { createId, nowIso } from '@/utils/helpers';
import { DEFAULT_DOCUMENT_TYPES, DUMMY_FAMILY } from '@/db/seed';

const DB_NAME = 'familydata.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      // Avoid WAL + multi-statement execAsync – both have hung on some Expo Go devices.
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS people (
          id TEXT PRIMARY KEY NOT NULL,
          vorname TEXT NOT NULL,
          nachname TEXT NOT NULL,
          geburtsdatum TEXT NOT NULL DEFAULT '',
          nationalitaet TEXT NOT NULL DEFAULT '',
          telefon TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          adresse TEXT NOT NULL DEFAULT '',
          notizen TEXT NOT NULL DEFAULT '',
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS identification (
          personId TEXT PRIMARY KEY NOT NULL,
          reisepassnummer TEXT NOT NULL DEFAULT '',
          personalausweisnummer TEXT NOT NULL DEFAULT '',
          aufenthaltstitelnummer TEXT NOT NULL DEFAULT '',
          fuehrerscheinnummer TEXT NOT NULL DEFAULT '',
          steuerId TEXT NOT NULL DEFAULT '',
          krankenkassenNummer TEXT NOT NULL DEFAULT '',
          kindergeldNummer TEXT NOT NULL DEFAULT '',
          FOREIGN KEY(personId) REFERENCES people(id) ON DELETE CASCADE
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS document_types (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          expiryDateRelevant INTEGER NOT NULL DEFAULT 0,
          isSystem INTEGER NOT NULL DEFAULT 0
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY NOT NULL,
          personId TEXT NOT NULL,
          documentTypeId TEXT NOT NULL,
          documentNumber TEXT NOT NULL DEFAULT '',
          expiryDate TEXT NOT NULL DEFAULT '',
          filePath TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY(personId) REFERENCES people(id) ON DELETE CASCADE,
          FOREIGN KEY(documentTypeId) REFERENCES document_types(id)
        );
      `);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      await ensureSeed(db);
      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function ensureSeed(db: SQLite.SQLiteDatabase) {
  const meta = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', ['seeded']);
  if (meta?.value === '1') return;

  for (const type of DEFAULT_DOCUMENT_TYPES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO document_types (id, name, expiryDateRelevant, isSystem) VALUES (?, ?, ?, 1)`,
      [type.id, type.name, type.expiryDateRelevant ? 1 : 0]
    );
  }

  for (const member of DUMMY_FAMILY) {
    const { person, identification, documents } = member;
    await db.runAsync(
      `INSERT OR IGNORE INTO people
        (id, vorname, nachname, geburtsdatum, nationalitaet, telefon, email, adresse, notizen, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        person.id,
        person.vorname,
        person.nachname,
        person.geburtsdatum,
        person.nationalitaet,
        person.telefon,
        person.email,
        person.adresse,
        person.notizen,
        person.createdAt,
        person.updatedAt,
      ]
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO identification
        (personId, reisepassnummer, personalausweisnummer, aufenthaltstitelnummer, fuehrerscheinnummer, steuerId, krankenkassenNummer, kindergeldNummer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        identification.personId,
        identification.reisepassnummer,
        identification.personalausweisnummer,
        identification.aufenthaltstitelnummer,
        identification.fuehrerscheinnummer,
        identification.steuerId,
        identification.krankenkassenNummer,
        identification.kindergeldNummer,
      ]
    );
    for (const doc of documents) {
      await db.runAsync(
        `INSERT OR IGNORE INTO documents
          (id, personId, documentTypeId, documentNumber, expiryDate, filePath, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doc.id,
          doc.personId,
          doc.documentTypeId,
          doc.documentNumber,
          doc.expiryDate,
          doc.filePath,
          doc.notes,
          doc.createdAt,
          doc.updatedAt,
        ]
      );
    }
  }

  await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('seeded', '1')`);
}

function emptyIdentification(personId: string): IdentificationData {
  return {
    personId,
    reisepassnummer: '',
    personalausweisnummer: '',
    aufenthaltstitelnummer: '',
    fuehrerscheinnummer: '',
    steuerId: '',
    krankenkassenNummer: '',
    kindergeldNummer: '',
  };
}

export async function listPeople(): Promise<Person[]> {
  const db = await getDb();
  return db.getAllAsync<Person>('SELECT * FROM people ORDER BY nachname COLLATE NOCASE, vorname COLLATE NOCASE');
}

export async function getPerson(id: string): Promise<Person | null> {
  const db = await getDb();
  return (await db.getFirstAsync<Person>('SELECT * FROM people WHERE id = ?', [id])) ?? null;
}

export async function getIdentification(personId: string): Promise<IdentificationData> {
  const db = await getDb();
  const row = await db.getFirstAsync<IdentificationData>('SELECT * FROM identification WHERE personId = ?', [personId]);
  return row ?? emptyIdentification(personId);
}

export async function upsertPerson(
  input: Omit<Person, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  identification: Omit<IdentificationData, 'personId'>
): Promise<string> {
  const db = await getDb();
  const timestamp = nowIso();
  const id = input.id || createId('person');
  const existing = input.id ? await getPerson(input.id) : null;

  if (existing) {
    await db.runAsync(
      `UPDATE people SET vorname=?, nachname=?, geburtsdatum=?, nationalitaet=?, telefon=?, email=?, adresse=?, notizen=?, updatedAt=?
       WHERE id=?`,
      [
        input.vorname,
        input.nachname,
        input.geburtsdatum || '',
        input.nationalitaet || '',
        input.telefon || '',
        input.email || '',
        input.adresse || '',
        input.notizen || '',
        timestamp,
        id,
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO people
        (id, vorname, nachname, geburtsdatum, nationalitaet, telefon, email, adresse, notizen, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.vorname,
        input.nachname,
        input.geburtsdatum || '',
        input.nationalitaet || '',
        input.telefon || '',
        input.email || '',
        input.adresse || '',
        input.notizen || '',
        timestamp,
        timestamp,
      ]
    );
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO identification
      (personId, reisepassnummer, personalausweisnummer, aufenthaltstitelnummer, fuehrerscheinnummer, steuerId, krankenkassenNummer, kindergeldNummer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      identification.reisepassnummer || '',
      identification.personalausweisnummer || '',
      identification.aufenthaltstitelnummer || '',
      identification.fuehrerscheinnummer || '',
      identification.steuerId || '',
      identification.krankenkassenNummer || '',
      identification.kindergeldNummer || '',
    ]
  );

  return id;
}

export async function deletePerson(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM people WHERE id = ?', [id]);
}

export async function listDocumentTypes(): Promise<DocumentType[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    expiryDateRelevant: number;
    isSystem: number;
  }>('SELECT * FROM document_types ORDER BY isSystem DESC, name COLLATE NOCASE');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    expiryDateRelevant: Boolean(r.expiryDateRelevant),
    isSystem: Boolean(r.isSystem),
  }));
}

export async function createDocumentType(name: string, expiryDateRelevant: boolean): Promise<DocumentType> {
  const db = await getDb();
  const record: DocumentType = {
    id: createId('dtype'),
    name: name.trim(),
    expiryDateRelevant,
    isSystem: false,
  };
  await db.runAsync(`INSERT INTO document_types (id, name, expiryDateRelevant, isSystem) VALUES (?, ?, ?, 0)`, [
    record.id,
    record.name,
    record.expiryDateRelevant ? 1 : 0,
  ]);
  return record;
}

export async function deleteDocumentType(id: string) {
  const db = await getDb();
  const type = await db.getFirstAsync<{ isSystem: number }>('SELECT isSystem FROM document_types WHERE id = ?', [id]);
  if (!type || type.isSystem) throw new Error('System-Dokumenttypen können nicht gelöscht werden.');
  const used = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM documents WHERE documentTypeId = ?', [id]);
  if ((used?.c || 0) > 0) throw new Error('Dokumenttyp wird noch verwendet.');
  await db.runAsync('DELETE FROM document_types WHERE id = ?', [id]);
}

export async function listDocuments(filters?: {
  personId?: string;
  documentTypeId?: string;
  query?: string;
}): Promise<(FamilyDocument & { personName: string; typeName: string; expiryDateRelevant: number })[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.personId) {
    clauses.push('d.personId = ?');
    params.push(filters.personId);
  }
  if (filters?.documentTypeId) {
    clauses.push('d.documentTypeId = ?');
    params.push(filters.documentTypeId);
  }
  if (filters?.query?.trim()) {
    const q = `%${filters.query.trim()}%`;
    clauses.push(`(
      p.vorname LIKE ? OR p.nachname LIKE ? OR d.documentNumber LIKE ? OR t.name LIKE ? OR d.notes LIKE ?
    )`);
    params.push(q, q, q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.getAllAsync(
    `SELECT d.*,
            (p.vorname || ' ' || p.nachname) as personName,
            t.name as typeName,
            t.expiryDateRelevant as expiryDateRelevant
     FROM documents d
     JOIN people p ON p.id = d.personId
     JOIN document_types t ON t.id = d.documentTypeId
     ${where}
     ORDER BY d.updatedAt DESC`,
    params
  );
}

export async function getDocument(id: string): Promise<FamilyDocument | null> {
  const db = await getDb();
  return (await db.getFirstAsync<FamilyDocument>('SELECT * FROM documents WHERE id = ?', [id])) ?? null;
}

export async function upsertDocument(
  input: Omit<FamilyDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const db = await getDb();
  const timestamp = nowIso();
  const id = input.id || createId('doc');
  const existing = input.id ? await getDocument(input.id) : null;

  if (existing) {
    await db.runAsync(
      `UPDATE documents SET personId=?, documentTypeId=?, documentNumber=?, expiryDate=?, filePath=?, notes=?, updatedAt=?
       WHERE id=?`,
      [
        input.personId,
        input.documentTypeId,
        input.documentNumber || '',
        input.expiryDate || '',
        input.filePath || '',
        input.notes || '',
        timestamp,
        id,
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO documents
        (id, personId, documentTypeId, documentNumber, expiryDate, filePath, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.personId,
        input.documentTypeId,
        input.documentNumber || '',
        input.expiryDate || '',
        input.filePath || '',
        input.notes || '',
        timestamp,
        timestamp,
      ]
    );
  }
  return id;
}

export async function deleteDocument(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
}

export async function countDocumentsForPerson(personId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM documents WHERE personId = ?', [personId]);
  return row?.c || 0;
}
