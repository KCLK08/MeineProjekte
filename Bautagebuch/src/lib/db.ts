import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

import type { DetectedField, PhotoDoc, Run, SetupModel, Template } from '@/types';

const DB_NAME = 'BautagebuchV2';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function createId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTemplateName(value: string) {
  return String(value || '').trim() || 'Bautagebuch Vorlage';
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS templates (
          templateId TEXT PRIMARY KEY NOT NULL,
          templateName TEXT NOT NULL,
          fileName TEXT NOT NULL,
          templateKind TEXT NOT NULL,
          mimeType TEXT NOT NULL,
          sizeBytes INTEGER NOT NULL,
          pageCount INTEGER NOT NULL,
          pdfPath TEXT NOT NULL,
          status TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS detected_fields (
          id TEXT PRIMARY KEY NOT NULL,
          templateId TEXT NOT NULL,
          fieldId TEXT NOT NULL,
          fieldName TEXT NOT NULL,
          labelCandidate TEXT NOT NULL,
          type TEXT NOT NULL,
          optionsJson TEXT NOT NULL,
          page INTEGER NOT NULL,
          orderIndex INTEGER NOT NULL,
          rectJson TEXT
        );
        CREATE TABLE IF NOT EXISTS setup_models (
          templateId TEXT PRIMARY KEY NOT NULL,
          status TEXT NOT NULL,
          version INTEGER NOT NULL,
          setupModelJson TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runs (
          runId TEXT PRIMARY KEY NOT NULL,
          templateId TEXT NOT NULL,
          title TEXT NOT NULL,
          setupVersion INTEGER NOT NULL,
          valuesJson TEXT NOT NULL,
          sectionIndex INTEGER NOT NULL,
          status TEXT NOT NULL,
          photoDocJson TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          completedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS exports (
          exportId TEXT PRIMARY KEY NOT NULL,
          runId TEXT NOT NULL,
          fileName TEXT NOT NULL,
          exportedAt TEXT NOT NULL
        );
      `);
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}templates/`, { intermediates: true });
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}photos/`, { intermediates: true });
      return db;
    })();
  }
  return dbPromise;
}

async function templatePdfPath(templateId: string) {
  return `${FileSystem.documentDirectory}templates/${templateId}.pdf`;
}

async function readTemplateBytes(template: Template): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(template.pdfPath, { encoding: FileSystem.EncodingType.Base64 });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function writeTemplateBytes(templateId: string, bytes: Uint8Array) {
  const path = await templatePdfPath(templateId);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  await FileSystem.writeAsStringAsync(path, btoa(binary), { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

function rowToTemplate(row: Record<string, unknown>): Template {
  return {
    templateId: String(row.templateId),
    templateName: String(row.templateName),
    fileName: String(row.fileName),
    templateKind: String(row.templateKind),
    mimeType: String(row.mimeType),
    sizeBytes: Number(row.sizeBytes),
    pageCount: Number(row.pageCount),
    pdfPath: String(row.pdfPath),
    status: String(row.status) as Template['status'],
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function rowToRun(row: Record<string, unknown>): Run {
  return {
    runId: String(row.runId),
    templateId: String(row.templateId),
    title: String(row.title),
    setupVersion: Number(row.setupVersion),
    values: JSON.parse(String(row.valuesJson || '{}')),
    sectionIndex: Number(row.sectionIndex),
    status: String(row.status) as Run['status'],
    photoDoc: JSON.parse(String(row.photoDocJson || '{"enabled":null,"entries":[],"updatedAt":""}')),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    completedAt: String(row.completedAt),
  };
}

export async function listTemplates(): Promise<Template[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM templates ORDER BY updatedAt DESC');
  return rows.map(rowToTemplate);
}

export async function getTemplate(templateId: string): Promise<Template | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM templates WHERE templateId = ?', [templateId]);
  return row ? rowToTemplate(row) : null;
}

export async function getTemplateBytes(templateId: string): Promise<Uint8Array | null> {
  const template = await getTemplate(templateId);
  if (!template) return null;
  return readTemplateBytes(template);
}

export async function createTemplate({
  templateName,
  fileName,
  mimeType,
  sizeBytes,
  pdfBytes,
  pageCount,
  templateKind = '',
}: {
  templateName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pdfBytes: Uint8Array;
  pageCount: number;
  templateKind?: string;
}): Promise<Template> {
  const db = await getDb();
  const templateId = createId('tplv2');
  const pdfPath = await writeTemplateBytes(templateId, pdfBytes);
  const record: Template = {
    templateId,
    templateName: normalizeTemplateName(templateName),
    fileName: String(fileName).trim(),
    templateKind: String(templateKind || '').trim(),
    mimeType: String(mimeType).trim(),
    sizeBytes: Number(sizeBytes || 0),
    pageCount: Number(pageCount || 1),
    pdfPath,
    status: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await db.runAsync(
    `INSERT INTO templates (templateId, templateName, fileName, templateKind, mimeType, sizeBytes, pageCount, pdfPath, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.templateId,
      record.templateName,
      record.fileName,
      record.templateKind,
      record.mimeType,
      record.sizeBytes,
      record.pageCount,
      record.pdfPath,
      record.status,
      record.createdAt,
      record.updatedAt,
    ]
  );
  return record;
}

export async function putTemplate(template: Template & { pdfBytes?: Uint8Array }): Promise<Template> {
  const db = await getDb();
  const timestamp = nowIso();
  let pdfPath = template.pdfPath;
  if (template.pdfBytes) {
    pdfPath = await writeTemplateBytes(template.templateId, template.pdfBytes);
  }
  const record: Template = {
    ...template,
    templateName: normalizeTemplateName(template.templateName),
    fileName: String(template.fileName || '').trim(),
    templateKind: String(template.templateKind || '').trim(),
    mimeType: String(template.mimeType || 'application/pdf').trim(),
    sizeBytes: Number(template.sizeBytes || 0),
    pageCount: Number(template.pageCount || 1),
    pdfPath,
    status: template.status || 'draft',
    createdAt: String(template.createdAt || timestamp),
    updatedAt: timestamp,
  };
  await db.runAsync(
    `INSERT OR REPLACE INTO templates (templateId, templateName, fileName, templateKind, mimeType, sizeBytes, pageCount, pdfPath, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.templateId,
      record.templateName,
      record.fileName,
      record.templateKind,
      record.mimeType,
      record.sizeBytes,
      record.pageCount,
      record.pdfPath,
      record.status,
      record.createdAt,
      record.updatedAt,
    ]
  );
  return record;
}

export async function saveDetectedFields(templateId: string, detectedFields: Omit<DetectedField, 'id' | 'templateId'>[] = []) {
  const db = await getDb();
  await db.runAsync('DELETE FROM detected_fields WHERE templateId = ?', [templateId]);
  for (const [index, field] of (detectedFields || []).entries()) {
    const id = `${templateId}::${field.fieldId || index}`;
    await db.runAsync(
      `INSERT INTO detected_fields (id, templateId, fieldId, fieldName, labelCandidate, type, optionsJson, page, orderIndex, rectJson)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        templateId,
        String(field.fieldId || `field_${index + 1}`),
        String(field.fieldName || ''),
        String(field.labelCandidate || field.fieldName || ''),
        String(field.type || 'text'),
        JSON.stringify(field.options || []),
        Number(field.page || 1),
        Number(field.orderIndex ?? index),
        JSON.stringify(field.rect || null),
      ]
    );
  }
  await db.runAsync('UPDATE templates SET updatedAt = ? WHERE templateId = ?', [nowIso(), templateId]);
}

export async function getDetectedFields(templateId: string): Promise<DetectedField[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM detected_fields WHERE templateId = ? ORDER BY page ASC, orderIndex ASC, fieldName ASC',
    [templateId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    templateId: String(row.templateId),
    fieldId: String(row.fieldId),
    fieldName: String(row.fieldName),
    labelCandidate: String(row.labelCandidate),
    type: String(row.type) as DetectedField['type'],
    options: JSON.parse(String(row.optionsJson || '[]')),
    page: Number(row.page),
    orderIndex: Number(row.orderIndex),
    rect: row.rectJson ? JSON.parse(String(row.rectJson)) : null,
  }));
}

export async function saveSetupModel(templateId: string, setupModel: SetupModel, { status = 'draft' } = {}) {
  const db = await getDb();
  const record = {
    templateId,
    status,
    version: Number(setupModel?.version || 1),
    setupModelJson: JSON.stringify(setupModel),
    createdAt: setupModel?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  await db.runAsync(
    `INSERT OR REPLACE INTO setup_models (templateId, status, version, setupModelJson, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [record.templateId, record.status, record.version, record.setupModelJson, record.createdAt, record.updatedAt]
  );
  await db.runAsync('UPDATE templates SET status = ?, updatedAt = ? WHERE templateId = ?', [status, nowIso(), templateId]);
}

export async function getSetupModel(templateId: string): Promise<SetupModel | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT setupModelJson FROM setup_models WHERE templateId = ?', [templateId]);
  return row ? (JSON.parse(String(row.setupModelJson)) as SetupModel) : null;
}

export async function markTemplateReady(templateId: string) {
  const db = await getDb();
  await db.runAsync('UPDATE setup_models SET status = ?, updatedAt = ? WHERE templateId = ?', ['ready', nowIso(), templateId]);
  await db.runAsync('UPDATE templates SET status = ?, updatedAt = ? WHERE templateId = ?', ['ready', nowIso(), templateId]);
}

export async function createRun({ templateId, title, setupVersion = 1 }: { templateId: string; title: string; setupVersion?: number }) {
  const db = await getDb();
  const record: Run = {
    runId: createId('runv2'),
    templateId,
    title: String(title || '').trim() || 'BTB',
    setupVersion: Number(setupVersion || 1),
    values: {},
    sectionIndex: 0,
    status: 'draft',
    photoDoc: { enabled: null, entries: [], updatedAt: nowIso() },
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: '',
  };
  await db.runAsync(
    `INSERT INTO runs (runId, templateId, title, setupVersion, valuesJson, sectionIndex, status, photoDocJson, createdAt, updatedAt, completedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.runId,
      record.templateId,
      record.title,
      record.setupVersion,
      JSON.stringify(record.values),
      record.sectionIndex,
      record.status,
      JSON.stringify(record.photoDoc),
      record.createdAt,
      record.updatedAt,
      record.completedAt,
    ]
  );
  return record;
}

export async function getRun(runId: string): Promise<Run | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM runs WHERE runId = ?', [runId]);
  return row ? rowToRun(row) : null;
}

export async function listRuns(templateId = ''): Promise<Run[]> {
  const db = await getDb();
  const rows = templateId
    ? await db.getAllAsync<Record<string, unknown>>('SELECT * FROM runs WHERE templateId = ? ORDER BY updatedAt DESC', [templateId])
    : await db.getAllAsync<Record<string, unknown>>('SELECT * FROM runs ORDER BY updatedAt DESC');
  return rows.map(rowToRun);
}

export async function updateRun(runId: string, patch: Partial<Run> = {}): Promise<Run | null> {
  const db = await getDb();
  const existing = await getRun(runId);
  if (!existing) return null;

  const record: Run = {
    ...existing,
    ...patch,
    values: patch.values ?? existing.values,
    photoDoc: patch.photoDoc ?? existing.photoDoc,
    updatedAt: nowIso(),
  };

  await db.runAsync(
    `UPDATE runs SET templateId = ?, title = ?, setupVersion = ?, valuesJson = ?, sectionIndex = ?, status = ?, photoDocJson = ?, updatedAt = ?, completedAt = ?
     WHERE runId = ?`,
    [
      record.templateId,
      record.title,
      record.setupVersion,
      JSON.stringify(record.values),
      record.sectionIndex,
      record.status,
      JSON.stringify(record.photoDoc),
      record.updatedAt,
      record.completedAt,
      runId,
    ]
  );
  return getRun(runId);
}

export async function deleteRunCascade(runId: string) {
  const db = await getDb();
  const run = await getRun(runId);
  if (run?.photoDoc?.entries) {
    for (const entry of run.photoDoc.entries) {
      if (entry.photoUri) {
        try {
          await FileSystem.deleteAsync(entry.photoUri, { idempotent: true });
        } catch {
          // ignore
        }
      }
    }
  }
  const exportsList = await db.getAllAsync<{ exportId: string }>('SELECT exportId FROM exports WHERE runId = ?', [runId]);
  for (const entry of exportsList) {
    await db.runAsync('DELETE FROM exports WHERE exportId = ?', [entry.exportId]);
  }
  if (run) {
    await db.runAsync('DELETE FROM runs WHERE runId = ?', [runId]);
  }
  return { deletedRun: Boolean(run), deletedExports: exportsList.length };
}

export async function addExportRecord({ runId, fileName }: { runId: string; fileName: string }) {
  const db = await getDb();
  const record = {
    exportId: createId('expv2'),
    runId,
    fileName: String(fileName || '').trim() || 'bautagebuch.pdf',
    exportedAt: nowIso(),
  };
  await db.runAsync('INSERT INTO exports (exportId, runId, fileName, exportedAt) VALUES (?, ?, ?, ?)', [
    record.exportId,
    record.runId,
    record.fileName,
    record.exportedAt,
  ]);
  return record;
}

export async function loadAssetBytes(moduleId: number): Promise<Uint8Array> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
