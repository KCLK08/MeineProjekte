import * as SQLite from 'expo-sqlite';

import type { FamilyDocument, IdentificationData, Person } from '@/types/models';
import { createId, nowIso } from '@/utils/helpers';
import { DUMMY_FAMILY } from '@/db/seed';

const DB_NAME = 'familydata.db';
const SCHEMA_VERSION = '2';

export type DocumentListRow = FamilyDocument & { personNames: string };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getMeta(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

async function setMeta(db: SQLite.SQLiteDatabase, key: string, value: string) {
  await db.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [key, value]);
}

async function tableExists(db: SQLite.SQLiteDatabase, name: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name]
  );
  return Boolean(row);
}

async function columnExists(db: SQLite.SQLiteDatabase, table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

async function ensureSchema(db: SQLite.SQLiteDatabase) {
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
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const version = await getMeta(db, 'schema_version');
  if (version === SCHEMA_VERSION) return;

  const hasDocuments = await tableExists(db, 'documents');
  const isLegacy =
    hasDocuments && (await columnExists(db, 'documents', 'personId')) && !(await columnExists(db, 'documents', 'name'));

  type LegacyDoc = {
    id: string;
    personId: string;
    documentTypeId: string;
    documentNumber: string;
    expiryDate: string;
    filePath: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
    typeName?: string | null;
  };

  let legacyDocs: LegacyDoc[] = [];
  if (isLegacy) {
    legacyDocs = await db.getAllAsync<LegacyDoc>(
      `SELECT d.*, t.name as typeName
       FROM documents d
       LEFT JOIN document_types t ON t.id = d.documentTypeId`
    );
  }

  if (hasDocuments) {
    await db.execAsync('DROP TABLE IF EXISTS document_people;');
    await db.execAsync('DROP TABLE IF EXISTS documents;');
  }
  await db.execAsync('DROP TABLE IF EXISTS document_types;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      documentNumber TEXT NOT NULL DEFAULT '',
      expiryDate TEXT NOT NULL DEFAULT '',
      filePath TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS document_people (
      documentId TEXT NOT NULL,
      personId TEXT NOT NULL,
      PRIMARY KEY (documentId, personId),
      FOREIGN KEY(documentId) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY(personId) REFERENCES people(id) ON DELETE CASCADE
    );
  `);

  for (const doc of legacyDocs) {
    if (!doc.filePath?.trim()) continue;
    const name = (doc.typeName || '').trim() || 'Dokument';
    await db.runAsync(
      `INSERT OR IGNORE INTO documents
        (id, name, documentNumber, expiryDate, filePath, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        doc.id,
        name,
        doc.documentNumber || '',
        doc.expiryDate || '',
        doc.filePath,
        doc.notes || '',
        doc.createdAt,
        doc.updatedAt,
      ]
    );
    if (doc.personId) {
      await db.runAsync(`INSERT OR IGNORE INTO document_people (documentId, personId) VALUES (?, ?)`, [
        doc.id,
        doc.personId,
      ]);
    }
  }

  await setMeta(db, 'schema_version', SCHEMA_VERSION);
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      // Avoid WAL + multi-statement execAsync – both have hung on some Expo Go devices.
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await ensureSchema(db);
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
  const meta = await getMeta(db, 'seeded');
  if (meta === '1') return;

  for (const member of DUMMY_FAMILY) {
    const { person, identification } = member;
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
  }

  await setMeta(db, 'seeded', '1');
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

async function personIdsForDocument(db: SQLite.SQLiteDatabase, documentId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ personId: string }>(
    'SELECT personId FROM document_people WHERE documentId = ? ORDER BY personId',
    [documentId]
  );
  return rows.map((r) => r.personId);
}

async function replaceDocumentPeople(db: SQLite.SQLiteDatabase, documentId: string, personIds: string[]) {
  await db.runAsync('DELETE FROM document_people WHERE documentId = ?', [documentId]);
  const unique = [...new Set(personIds.filter(Boolean))];
  for (const personId of unique) {
    await db.runAsync(`INSERT OR IGNORE INTO document_people (documentId, personId) VALUES (?, ?)`, [
      documentId,
      personId,
    ]);
  }
}

function mapDocumentRow(
  row: Omit<FamilyDocument, 'personIds'> & { personIds?: string[] },
  personIds: string[]
): FamilyDocument {
  return {
    id: row.id,
    name: row.name,
    personIds,
    documentNumber: row.documentNumber || '',
    expiryDate: row.expiryDate || '',
    filePath: row.filePath || '',
    notes: row.notes || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

export async function listDocuments(filters?: {
  personId?: string;
  query?: string;
}): Promise<DocumentListRow[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.personId) {
    clauses.push('EXISTS (SELECT 1 FROM document_people dp WHERE dp.documentId = d.id AND dp.personId = ?)');
    params.push(filters.personId);
  }
  if (filters?.query?.trim()) {
    const q = `%${filters.query.trim()}%`;
    clauses.push(`(
      d.name LIKE ? OR d.documentNumber LIKE ? OR d.notes LIKE ?
      OR EXISTS (
        SELECT 1 FROM document_people dp
        JOIN people p ON p.id = dp.personId
        WHERE dp.documentId = d.id AND (p.vorname LIKE ? OR p.nachname LIKE ?)
      )
    )`);
    params.push(q, q, q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.getAllAsync<Omit<FamilyDocument, 'personIds'>>(
    `SELECT d.* FROM documents d ${where} ORDER BY d.updatedAt DESC`,
    params
  );

  const result: DocumentListRow[] = [];
  for (const row of rows) {
    const personIds = await personIdsForDocument(db, row.id);
    const people = await db.getAllAsync<{ name: string }>(
      `SELECT (p.vorname || ' ' || p.nachname) as name
       FROM document_people dp
       JOIN people p ON p.id = dp.personId
       WHERE dp.documentId = ?
       ORDER BY p.nachname COLLATE NOCASE, p.vorname COLLATE NOCASE`,
      [row.id]
    );
    result.push({
      ...mapDocumentRow(row, personIds),
      personNames: people.map((p) => p.name).join(', ') || 'Keine Person',
    });
  }
  return result;
}

export async function getDocument(id: string): Promise<FamilyDocument | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Omit<FamilyDocument, 'personIds'>>(
    'SELECT * FROM documents WHERE id = ?',
    [id]
  );
  if (!row) return null;
  const personIds = await personIdsForDocument(db, id);
  return mapDocumentRow(row, personIds);
}

export async function upsertDocument(
  input: Omit<FamilyDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const db = await getDb();
  const timestamp = nowIso();
  const id = input.id || createId('doc');
  const name = input.name.trim();
  const filePath = input.filePath.trim();
  if (!name) throw new Error('Name ist erforderlich');
  if (!filePath) throw new Error('Datei ist erforderlich');
  if (!input.personIds?.length) throw new Error('Mindestens eine Person wählen');

  const existing = input.id ? await getDocument(input.id) : null;

  if (existing) {
    await db.runAsync(
      `UPDATE documents SET name=?, documentNumber=?, expiryDate=?, filePath=?, notes=?, updatedAt=?
       WHERE id=?`,
      [
        name,
        input.documentNumber || '',
        input.expiryDate || '',
        filePath,
        input.notes || '',
        timestamp,
        id,
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO documents
        (id, name, documentNumber, expiryDate, filePath, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        input.documentNumber || '',
        input.expiryDate || '',
        filePath,
        input.notes || '',
        timestamp,
        timestamp,
      ]
    );
  }

  await replaceDocumentPeople(db, id, input.personIds);
  return id;
}

export async function deleteDocument(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM document_people WHERE documentId = ?', [id]);
  await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
}

export async function countDocumentsForPerson(personId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM document_people WHERE personId = ?',
    [personId]
  );
  return row?.c || 0;
}
