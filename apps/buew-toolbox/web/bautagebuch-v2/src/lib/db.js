import Dexie from 'dexie';

import { hydratePhotoDoc, preparePhotoDocForStorage } from './photo-storage.js';

const DB_NAME = 'BautagebuchV2';

const storesV1 = {
  templates: '&templateId, status, updatedAt, createdAt',
  detected_fields: '&id, templateId, fieldId, page, orderIndex',
  setup_models: '&templateId, status, updatedAt',
  runs: '&runId, templateId, status, updatedAt, createdAt',
  exports: '&exportId, runId, exportedAt'
};

const storesV2 = {
  ...storesV1,
  photo_assets: '&id, runId, entryId, updatedAt'
};

let dbInstance = null;

function createId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTemplateName(value) {
  return String(value || '').trim() || 'Bautagebuch Vorlage';
}

let dbReadyPromise = null;

function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB ist in dieser Umgebung nicht verfügbar.');
  }
  const db = new Dexie(DB_NAME);
  db.version(1).stores(storesV1);
  db.version(2).stores(storesV2);
  dbInstance = db;
  return dbInstance;
}

async function ensureDbReady() {
  const db = getDb();
  if (!dbReadyPromise) {
    dbReadyPromise = db.open().catch((error) => {
      dbReadyPromise = null;
      throw error;
    });
  }
  await dbReadyPromise;
}

export async function listTemplates() {
  await ensureDbReady();
  return getDb().templates.orderBy('updatedAt').reverse().toArray();
}

export async function getTemplate(templateId) {
  await ensureDbReady();
  return getDb().templates.get(templateId);
}

export async function createTemplate({
  templateName,
  fileName,
  mimeType,
  sizeBytes,
  pdfBlob,
  pageCount,
  templateKind = ''
}) {
  await ensureDbReady();
  const record = {
    templateId: createId('tplv2'),
    templateName: normalizeTemplateName(templateName),
    fileName: String(fileName).trim(),
    templateKind: String(templateKind || '').trim(),
    mimeType: String(mimeType).trim(),
    sizeBytes: Number(sizeBytes || 0),
    pageCount: Number(pageCount || 1),
    pdfBlob,
    status: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await getDb().templates.put(record);
  return record;
}

export async function putTemplate(template) {
  await ensureDbReady();
  const timestamp = nowIso();
  const record = {
    ...template,
    templateName: normalizeTemplateName(template?.templateName),
    fileName: String(template?.fileName || '').trim(),
    templateKind: String(template?.templateKind || '').trim(),
    mimeType: String(template?.mimeType || 'application/pdf').trim(),
    sizeBytes: Number(template?.sizeBytes || 0),
    pageCount: Number(template?.pageCount || 1),
    status: String(template?.status || 'draft'),
    createdAt: String(template?.createdAt || timestamp),
    updatedAt: timestamp
  };
  if (!String(record.templateId || '').trim()) {
    record.templateId = createId('tplv2');
  }
  await getDb().templates.put(record);
  return record;
}

export async function saveDetectedFields(templateId, detectedFields = []) {
  await ensureDbReady();
  const records = (Array.isArray(detectedFields) ? detectedFields : []).map((field, index) => ({
    id: `${templateId}::${field.fieldId || index}`,
    templateId,
    fieldId: String(field.fieldId || `field_${index + 1}`),
    fieldName: String(field.fieldName || ''),
    labelCandidate: String(field.labelCandidate || field.fieldName || ''),
    type: String(field.type || 'text'),
    options: Array.isArray(field.options) ? [...field.options] : [],
    page: Number(field.page || 1),
    orderIndex: Number(field.orderIndex ?? index),
    rect: Array.isArray(field.rect) ? field.rect.slice(0, 4) : null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  }));

  const db = getDb();
  await db.transaction('rw', db.detected_fields, db.templates, async () => {
    const existing = await db.detected_fields.where('templateId').equals(templateId).toArray();
    for (const entry of existing) {
      await db.detected_fields.delete(entry.id);
    }
    if (records.length > 0) {
      await db.detected_fields.bulkPut(records);
    }
    await db.templates.update(templateId, { updatedAt: nowIso() });
  });

  return records;
}

export async function getDetectedFields(templateId) {
  await ensureDbReady();
  const fields = await getDb().detected_fields.where('templateId').equals(templateId).toArray();
  return fields.sort((left, right) => {
    if ((left.page ?? 9999) !== (right.page ?? 9999)) {
      return (left.page ?? 9999) - (right.page ?? 9999);
    }
    if ((left.orderIndex ?? 9999) !== (right.orderIndex ?? 9999)) {
      return (left.orderIndex ?? 9999) - (right.orderIndex ?? 9999);
    }
    return String(left.fieldName || '').localeCompare(String(right.fieldName || ''));
  });
}

export async function saveSetupModel(templateId, setupModel, { status = 'draft' } = {}) {
  await ensureDbReady();
  const record = {
    templateId,
    status,
    version: Number(setupModel?.version || 1),
    setupModel,
    createdAt: setupModel?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  const db = getDb();
  await db.transaction('rw', db.setup_models, db.templates, async () => {
    await db.setup_models.put(record);
    await db.templates.update(templateId, {
      status,
      updatedAt: nowIso()
    });
  });
  return record;
}

export async function getSetupModel(templateId) {
  await ensureDbReady();
  const record = await getDb().setup_models.get(templateId);
  return record?.setupModel || null;
}

export async function markTemplateReady(templateId) {
  await ensureDbReady();
  const db = getDb();
  await db.transaction('rw', db.templates, db.setup_models, async () => {
    const record = await db.setup_models.get(templateId);
    if (record) {
      await db.setup_models.put({
        ...record,
        status: 'ready',
        updatedAt: nowIso()
      });
    }
    await db.templates.update(templateId, {
      status: 'ready',
      updatedAt: nowIso()
    });
  });
}

export async function createRun({ templateId, title, setupVersion = 1 }) {
  await ensureDbReady();
  const record = {
    runId: createId('runv2'),
    templateId,
    title: String(title || '').trim() || 'BTB',
    setupVersion: Number(setupVersion || 1),
    values: {},
    sectionIndex: 0,
    status: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: ''
  };
  await getDb().runs.put(record);
  return record;
}

export async function getRun(runId) {
  await ensureDbReady();
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) {
    return null;
  }
  const run = await getDb().runs.get(normalizedRunId);
  if (!run) {
    return null;
  }
  if (run.photoDoc) {
    const db = getDb();
    run.photoDoc = await hydratePhotoDoc(normalizedRunId, run.photoDoc, (assetId) => db.photo_assets.get(assetId));
  }
  return run;
}

export async function listRuns(templateId = '') {
  await ensureDbReady();
  const normalizedTemplateId = String(templateId || '').trim();
  if (normalizedTemplateId) {
    const runs = await getDb().runs.where('templateId').equals(normalizedTemplateId).toArray();
    return runs.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  }
  return getDb().runs.orderBy('updatedAt').reverse().toArray();
}

export async function updateRun(runId, patch = {}) {
  await ensureDbReady();
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) {
    return null;
  }
  const existing = await getDb().runs.get(normalizedRunId);
  if (!existing) {
    return null;
  }

  const nextPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, 'photoDoc')) {
    const { photoDocForRun, assets, activeEntryIds } = await preparePhotoDocForStorage(normalizedRunId, patch.photoDoc);
    const db = getDb();
    await db.transaction('rw', db.runs, db.photo_assets, async () => {
      const existingAssets = await db.photo_assets.where('runId').equals(normalizedRunId).toArray();
      for (const asset of existingAssets) {
        if (!activeEntryIds.has(String(asset.entryId || '').trim())) {
          await db.photo_assets.delete(asset.id);
        }
      }
      if (assets.length > 0) {
        await db.photo_assets.bulkPut(assets);
      }
      await db.runs.put({
        ...existing,
        ...nextPatch,
        photoDoc: photoDocForRun,
        updatedAt: nowIso()
      });
    });
    return getRun(normalizedRunId);
  }

  const record = {
    ...existing,
    ...nextPatch,
    updatedAt: nowIso()
  };
  await getDb().runs.put(record);
  return getRun(normalizedRunId);
}

export async function deleteRunCascade(runId) {
  await ensureDbReady();
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) {
    return { deletedRun: false, deletedExports: 0 };
  }
  const db = getDb();
  return db.transaction('rw', db.runs, db.exports, db.photo_assets, async () => {
    const run = await db.runs.get(normalizedRunId);
    const exportsList = await db.exports.where('runId').equals(normalizedRunId).toArray();
    const photoAssets = await db.photo_assets.where('runId').equals(normalizedRunId).toArray();
    for (const entry of exportsList) {
      await db.exports.delete(entry.exportId);
    }
    for (const asset of photoAssets) {
      await db.photo_assets.delete(asset.id);
    }
    if (run) {
      await db.runs.delete(normalizedRunId);
    }
    return {
      deletedRun: Boolean(run),
      deletedExports: exportsList.length
    };
  });
}

export async function addExportRecord({ runId, fileName }) {
  await ensureDbReady();
  const record = {
    exportId: createId('expv2'),
    runId,
    fileName: String(fileName || '').trim() || 'bautagebuch.pdf',
    exportedAt: nowIso()
  };
  await getDb().exports.put(record);
  return record;
}

export async function listExports(runId) {
  await ensureDbReady();
  const exportsList = await getDb().exports.where('runId').equals(runId).toArray();
  return exportsList.sort((left, right) => String(right.exportedAt || '').localeCompare(String(left.exportedAt || '')));
}
