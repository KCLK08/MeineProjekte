import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

import type { FamilyDocument, FamilyRole, IdEntry, Person } from '@/types/models';
import { createId, isFamilyRole, nowIso } from '@/utils/helpers';

export const PLAIN_DB_NAME = 'familydata.db';
export const VAULT_DB_NAME = 'familydata.vault.db';
const SCHEMA_VERSION = '4';

export type DocumentListRow = FamilyDocument & { personNames: string };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
/** SQLCipher key as lowercase hex (no 0x prefix). Null = plaintext DB. */
let encryptionKeyHex: string | null = null;

export function configureDatabaseEncryption(keyHex: string | null) {
  encryptionKeyHex = keyHex && /^[0-9a-fA-F]+$/.test(keyHex) ? keyHex.toLowerCase() : null;
}

export async function closeDatabase() {
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    await db.closeAsync();
  } catch {
    // ignore close races
  } finally {
    dbPromise = null;
  }
}

export async function databaseFileExists(name: string): Promise<boolean> {
  try {
    const base = FileSystem.documentDirectory;
    if (!base) return false;
    // expo-sqlite stores under SQLite/ on native
    const candidates = [`${base}SQLite/${name}`, `${base}${name}`];
    for (const path of candidates) {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function deleteDatabaseFile(name: string) {
  await closeDatabase();
  try {
    await SQLite.deleteDatabaseAsync(name);
  } catch {
    const base = FileSystem.documentDirectory;
    if (!base) return;
    await FileSystem.deleteAsync(`${base}SQLite/${name}`, { idempotent: true }).catch(() => undefined);
    await FileSystem.deleteAsync(`${base}${name}`, { idempotent: true }).catch(() => undefined);
  }
}

/** Opens (or reuses) the active DB and ensures schema – used after unlock. */
export async function ensureDatabaseReady() {
  await getDb();
}

/**
 * Copies application tables from source → target ( foreigн keys off during copy ).
 * Target is cleared first for known tables.
 */
export async function copyAllTablesBetween(source: SQLite.SQLiteDatabase, target: SQLite.SQLiteDatabase) {
  // Ensure schema on both
  await ensureSchema(source);
  await ensureSchema(target);

  await target.execAsync('PRAGMA foreign_keys = OFF;');
  for (const table of [
    'document_people',
    'documents',
    'id_entries',
    'identification',
    'people',
    'app_meta',
    'security_events',
    'export_history',
  ]) {
    await target.execAsync(`DELETE FROM ${table};`).catch(() => undefined);
  }

  const people = await source.getAllAsync<Record<string, unknown>>('SELECT * FROM people').catch(() => []);
  for (const row of people) {
    await target.runAsync(
      `INSERT OR REPLACE INTO people
        (id, vorname, nachname, rolle, geburtsdatum, nationalitaet, telefon, email, adresse, notizen, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(row.id),
        String(row.vorname ?? ''),
        String(row.nachname ?? ''),
        String(row.rolle ?? ''),
        String(row.geburtsdatum ?? ''),
        String(row.nationalitaet ?? ''),
        String(row.telefon ?? ''),
        String(row.email ?? ''),
        String(row.adresse ?? ''),
        String(row.notizen ?? ''),
        String(row.createdAt ?? ''),
        String(row.updatedAt ?? ''),
      ]
    );
  }

  const idRows = await source.getAllAsync<Record<string, unknown>>('SELECT * FROM id_entries').catch(() => []);
  for (const row of idRows) {
    await target.runAsync(
      `INSERT OR REPLACE INTO id_entries (id, personId, label, value, sortOrder) VALUES (?, ?, ?, ?, ?)`,
      [
        String(row.id),
        String(row.personId),
        String(row.label ?? ''),
        String(row.value ?? ''),
        Number(row.sortOrder ?? 0),
      ]
    );
  }

  const docs = await source.getAllAsync<Record<string, unknown>>('SELECT * FROM documents').catch(() => []);
  for (const row of docs) {
    await target.runAsync(
      `INSERT OR REPLACE INTO documents
        (id, name, documentNumber, expiryDate, filePath, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(row.id),
        String(row.name ?? ''),
        String(row.documentNumber ?? ''),
        String(row.expiryDate ?? ''),
        String(row.filePath ?? ''),
        String(row.notes ?? ''),
        String(row.createdAt ?? ''),
        String(row.updatedAt ?? ''),
      ]
    );
  }

  const links = await source.getAllAsync<{ documentId: string; personId: string }>('SELECT * FROM document_people').catch(() => []);
  for (const row of links) {
    await target.runAsync(`INSERT OR IGNORE INTO document_people (documentId, personId) VALUES (?, ?)`, [
      row.documentId,
      row.personId,
    ]);
  }

  const meta = await source.getAllAsync<{ key: string; value: string }>('SELECT * FROM app_meta').catch(() => []);
  for (const row of meta) {
    await target.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [row.key, row.value]);
  }

  const events = await source
    .getAllAsync<{ id: string; at: string; type: string }>('SELECT * FROM security_events')
    .catch(() => []);
  for (const row of events) {
    await target.runAsync(`INSERT OR REPLACE INTO security_events (id, at, type) VALUES (?, ?, ?)`, [
      row.id,
      row.at,
      row.type,
    ]);
  }

  const exports = await source
    .getAllAsync<{ id: string; at: string; documentId: string; exportType: string }>(
      'SELECT * FROM export_history'
    )
    .catch(() => []);
  for (const row of exports) {
    await target.runAsync(
      `INSERT OR REPLACE INTO export_history (id, at, documentId, exportType) VALUES (?, ?, ?, ?)`,
      [row.id, row.at, row.documentId, row.exportType]
    );
  }

  await target.execAsync('PRAGMA foreign_keys = ON;');
}

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

function mapPerson(row: Record<string, unknown>): Person {
  const rolleRaw = String(row.rolle ?? '');
  return {
    id: String(row.id),
    vorname: String(row.vorname ?? ''),
    nachname: String(row.nachname ?? ''),
    rolle: isFamilyRole(rolleRaw) ? rolleRaw : '',
    geburtsdatum: String(row.geburtsdatum ?? ''),
    nationalitaet: String(row.nationalitaet ?? ''),
    telefon: String(row.telefon ?? ''),
    email: String(row.email ?? ''),
    adresse: String(row.adresse ?? ''),
    notizen: String(row.notizen ?? ''),
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  };
}

async function migrateDocumentsV2(db: SQLite.SQLiteDatabase) {
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

  if (hasDocuments && isLegacy) {
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
}

async function migrateIdentificationV3(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS id_entries (
      id TEXT PRIMARY KEY NOT NULL,
      personId TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(personId) REFERENCES people(id) ON DELETE CASCADE
    );
  `);

  if (!(await columnExists(db, 'people', 'rolle'))) {
    await db.execAsync(`ALTER TABLE people ADD COLUMN rolle TEXT NOT NULL DEFAULT ''`);
  }

  const hasLegacyId = await tableExists(db, 'identification');
  if (!hasLegacyId) return;

  const existing = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM id_entries');
  if ((existing?.c || 0) > 0) return;

  type LegacyId = {
    personId: string;
    reisepassnummer: string;
    personalausweisnummer: string;
    aufenthaltstitelnummer: string;
    fuehrerscheinnummer: string;
    steuerId: string;
    krankenkassenNummer: string;
    kindergeldNummer: string;
  };

  const rows = await db.getAllAsync<LegacyId>('SELECT * FROM identification');
  const mapping: { key: keyof LegacyId; label: string }[] = [
    { key: 'reisepassnummer', label: 'Reisepass' },
    { key: 'personalausweisnummer', label: 'Personalausweis' },
    { key: 'aufenthaltstitelnummer', label: 'Aufenthaltstitel' },
    { key: 'fuehrerscheinnummer', label: 'Führerschein' },
    { key: 'steuerId', label: 'Steuer-ID' },
    { key: 'krankenkassenNummer', label: 'Krankenversicherung' },
    { key: 'kindergeldNummer', label: 'Kindergeld' },
  ];

  for (const row of rows) {
    let order = 0;
    for (const field of mapping) {
      const value = (row[field.key] || '').trim();
      if (!value || field.key === 'personId') continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO id_entries (id, personId, label, value, sortOrder) VALUES (?, ?, ?, ?, ?)`,
        [createId('id'), row.personId, field.label, value, order]
      );
      order += 1;
    }
  }
}

async function ensureSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY NOT NULL,
      vorname TEXT NOT NULL,
      nachname TEXT NOT NULL,
      rolle TEXT NOT NULL DEFAULT '',
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

  let version = Number((await getMeta(db, 'schema_version')) || '0');

  if (version < 2) {
    await migrateDocumentsV2(db);
    version = 2;
    await setMeta(db, 'schema_version', '2');
  } else {
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
  }

  if (version < 3) {
    await migrateIdentificationV3(db);
    const familyName = await getMeta(db, 'family_name');
    if (!familyName) {
      const person = await db.getFirstAsync<{ nachname: string }>(
        `SELECT nachname FROM people WHERE TRIM(nachname) != '' ORDER BY createdAt ASC LIMIT 1`
      );
      if (person?.nachname) {
        await setMeta(db, 'family_name', person.nachname);
        await setMeta(db, 'setup_complete', '1');
      }
    }
    version = 3;
    await setMeta(db, 'schema_version', '3');
  } else {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS id_entries (
        id TEXT PRIMARY KEY NOT NULL,
        personId TEXT NOT NULL,
        label TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT '',
        sortOrder INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(personId) REFERENCES people(id) ON DELETE CASCADE
      );
    `);
    if (!(await columnExists(db, 'people', 'rolle'))) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN rolle TEXT NOT NULL DEFAULT ''`);
    }
  }

  if (version < 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY NOT NULL,
        at TEXT NOT NULL,
        type TEXT NOT NULL
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS export_history (
        id TEXT PRIMARY KEY NOT NULL,
        at TEXT NOT NULL,
        documentId TEXT NOT NULL,
        exportType TEXT NOT NULL
      );
    `);
    version = 4;
    await setMeta(db, 'schema_version', '4');
  } else {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY NOT NULL,
        at TEXT NOT NULL,
        type TEXT NOT NULL
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS export_history (
        id TEXT PRIMARY KEY NOT NULL,
        at TEXT NOT NULL,
        documentId TEXT NOT NULL,
        exportType TEXT NOT NULL
      );
    `);
  }
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const name = encryptionKeyHex ? VAULT_DB_NAME : PLAIN_DB_NAME;
      const db = await SQLite.openDatabaseAsync(name);
      if (encryptionKeyHex) {
        // SQLCipher hex key – only used in development builds with useSQLCipher.
        await db.execAsync(`PRAGMA key = "x'${encryptionKeyHex}'";`);
      }
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await ensureSchema(db);
      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
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

export async function getFamilyName(): Promise<string> {
  const db = await getDb();
  return (await getMeta(db, 'family_name')) || '';
}

export async function isSetupComplete(): Promise<boolean> {
  const db = await getDb();
  const flag = await getMeta(db, 'setup_complete');
  if (flag === '1') return true;
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM people');
  return (count?.c || 0) > 0 && Boolean(await getMeta(db, 'family_name'));
}

export async function completeFamilySetup(input: {
  familyName: string;
  members: Array<{
    vorname: string;
    nachname: string;
    rolle: FamilyRole;
    geburtsdatum?: string;
  }>;
}): Promise<void> {
  const db = await getDb();
  const familyName = input.familyName.trim();
  if (!familyName) throw new Error('Familienname ist erforderlich');
  if (!input.members.length) throw new Error('Mindestens ein Familienmitglied anlegen');

  for (const member of input.members) {
    await upsertPerson({
      vorname: member.vorname,
      nachname: member.nachname || familyName,
      rolle: member.rolle,
      geburtsdatum: member.geburtsdatum || '',
      nationalitaet: '',
      telefon: '',
      email: '',
      adresse: '',
      notizen: '',
    });
  }

  await setMeta(db, 'family_name', familyName);
  await setMeta(db, 'setup_complete', '1');
}

export async function setFamilyName(name: string) {
  const db = await getDb();
  await setMeta(db, 'family_name', name.trim());
}

export async function listPeople(): Promise<Person[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM people
     ORDER BY
       CASE rolle
         WHEN 'vater' THEN 0
         WHEN 'mutter' THEN 1
         WHEN 'kind' THEN 2
         ELSE 3
       END,
       nachname COLLATE NOCASE,
       vorname COLLATE NOCASE`
  );
  return rows.map(mapPerson);
}

export async function getPerson(id: string): Promise<Person | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM people WHERE id = ?', [id]);
  return row ? mapPerson(row) : null;
}

export async function listIdEntries(personId: string): Promise<IdEntry[]> {
  const db = await getDb();
  return db.getAllAsync<IdEntry>(
    'SELECT * FROM id_entries WHERE personId = ? ORDER BY sortOrder ASC, label COLLATE NOCASE',
    [personId]
  );
}

export async function replaceIdEntries(
  personId: string,
  entries: Array<{ id?: string; label: string; value: string }>
): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM id_entries WHERE personId = ?', [personId]);
  let order = 0;
  for (const entry of entries) {
    const label = entry.label.trim();
    const value = entry.value.trim();
    if (!label && !value) continue;
    await db.runAsync(
      `INSERT INTO id_entries (id, personId, label, value, sortOrder) VALUES (?, ?, ?, ?, ?)`,
      [entry.id || createId('id'), personId, label || 'Eintrag', value, order]
    );
    order += 1;
  }
}

export async function upsertPerson(
  input: Omit<Person, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const db = await getDb();
  const timestamp = nowIso();
  const id = input.id || createId('person');
  const existing = input.id ? await getPerson(input.id) : null;
  const rolle = input.rolle || '';

  if (existing) {
    await db.runAsync(
      `UPDATE people SET vorname=?, nachname=?, rolle=?, geburtsdatum=?, nationalitaet=?, telefon=?, email=?, adresse=?, notizen=?, updatedAt=?
       WHERE id=?`,
      [
        input.vorname,
        input.nachname,
        rolle,
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
        (id, vorname, nachname, rolle, geburtsdatum, nationalitaet, telefon, email, adresse, notizen, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.vorname,
        input.nachname,
        rolle,
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

  return id;
}

export async function deletePerson(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM id_entries WHERE personId = ?', [id]);
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

/** Security / export metadata – no document contents. Requires unlocked vault. */

export async function appendSecurityEvent(event: { id: string; at: string; type: string }) {
  const db = await getDb();
  await db.runAsync(`INSERT OR REPLACE INTO security_events (id, at, type) VALUES (?, ?, ?)`, [
    event.id,
    event.at,
    event.type,
  ]);
}

export async function listSecurityEvents(limit = 20): Promise<{ id: string; at: string; type: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ id: string; at: string; type: string }>(
    `SELECT id, at, type FROM security_events ORDER BY at DESC LIMIT ?`,
    [limit]
  );
}

export async function trimSecurityEvents(keep = 200) {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM security_events WHERE id NOT IN (
      SELECT id FROM security_events ORDER BY at DESC LIMIT ?
    )`,
    [keep]
  );
}

export async function appendExportHistory(entry: {
  id: string;
  at: string;
  documentId: string;
  exportType: string;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO export_history (id, at, documentId, exportType) VALUES (?, ?, ?, ?)`,
    [entry.id, entry.at, entry.documentId, entry.exportType]
  );
}

export async function listExportHistory(
  limit = 20
): Promise<{ id: string; at: string; documentId: string; exportType: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ id: string; at: string; documentId: string; exportType: string }>(
    `SELECT id, at, documentId, exportType FROM export_history ORDER BY at DESC LIMIT ?`,
    [limit]
  );
}

export async function trimExportHistory(keep = 100) {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM export_history WHERE id NOT IN (
      SELECT id FROM export_history ORDER BY at DESC LIMIT ?
    )`,
    [keep]
  );
}
