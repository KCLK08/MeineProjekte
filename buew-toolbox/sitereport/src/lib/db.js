import Dexie from 'dexie';

const DB_NAME = 'SiteReport';
const LEGACY_DB_NAME = 'protokoll_app';

const storesV1 = {
  settings: '&id',
  entries: 'id, createdAt'
};

const storesV2 = {
  ...storesV1,
  exports: 'id, createdAt'
};

const storesV3 = {
  ...storesV2,
  templates: 'id, createdAt, name'
};

const storesV4 = {
  ...storesV3,
  protocols: 'id, createdAt, updatedAt'
};

export const db = new Dexie(DB_NAME);

db.version(1).stores(storesV1);
db.version(2).stores(storesV2);
db.version(3).stores(storesV3);
db.version(4).stores(storesV4);

const dbReadyPromise = migrateLegacyDbIfNeeded();

async function hasCurrentData() {
  const counts = await Promise.all([
    db.settings.count(),
    db.entries.count(),
    db.exports.count(),
    db.templates.count(),
    db.protocols.count()
  ]);
  return counts.some((count) => count > 0);
}

async function migrateLegacyDbIfNeeded() {
  if (DB_NAME === LEGACY_DB_NAME) return;
  const legacyExists = await Dexie.exists(LEGACY_DB_NAME);
  if (!legacyExists) return;

  const alreadyInitialized = await hasCurrentData();
  if (alreadyInitialized) return;

  const legacy = new Dexie(LEGACY_DB_NAME);
  legacy.version(4).stores(storesV4);
  await legacy.open();

  try {
    const [settings, entries, exportsRows, templates, protocols] = await Promise.all([
      legacy.table('settings').toArray(),
      legacy.table('entries').toArray(),
      legacy.table('exports').toArray(),
      legacy.table('templates').toArray(),
      legacy.table('protocols').toArray()
    ]);

    if (![settings, entries, exportsRows, templates, protocols].some((rows) => rows.length > 0)) return;

    await db.transaction('rw', db.settings, db.entries, db.exports, db.templates, db.protocols, async () => {
      if (settings.length) await db.settings.bulkPut(settings);
      if (entries.length) await db.entries.bulkPut(entries);
      if (exportsRows.length) await db.exports.bulkPut(exportsRows);
      if (templates.length) await db.templates.bulkPut(templates);
      if (protocols.length) await db.protocols.bulkPut(protocols);
    });
  } finally {
    legacy.close();
  }
}

async function ensureDbReady() {
  await dbReadyPromise;
}

export async function loadSettings() {
  await ensureDbReady();
  const row = await db.settings.get('current');
  return row?.value ?? null;
}

export async function saveSettings(value) {
  await ensureDbReady();
  await db.settings.put({ id: 'current', value });
}

export async function clearSettings() {
  await ensureDbReady();
  await db.settings.delete('current');
}

export async function loadLogo() {
  await ensureDbReady();
  const row = await db.settings.get('logo');
  return row?.value ?? '';
}

export async function saveLogo(value) {
  await ensureDbReady();
  await db.settings.put({ id: 'logo', value });
}

export async function clearLogo() {
  await ensureDbReady();
  await db.settings.delete('logo');
}

export async function listEntries() {
  await ensureDbReady();
  return db.entries.orderBy('createdAt').reverse().toArray();
}

export async function addEntry(entry) {
  await ensureDbReady();
  await db.entries.put(entry);
}

export async function clearEntries() {
  await ensureDbReady();
  await db.entries.clear();
}

export async function deleteEntry(id) {
  await ensureDbReady();
  await db.entries.delete(id);
}

export async function listExports() {
  await ensureDbReady();
  return db.exports.orderBy('createdAt').reverse().toArray();
}

export async function addExport(record) {
  await ensureDbReady();
  await db.exports.put(record);
}

export async function deleteExport(id) {
  await ensureDbReady();
  await db.exports.delete(id);
}

export async function upsertExportByProtocol(record) {
  await ensureDbReady();
  const existing = await db.exports.where('protocolId').equals(record.protocolId).first();
  if (existing) {
    await db.exports.put({ ...existing, ...record, id: existing.id });
    return { ...existing, ...record, id: existing.id };
  }
  await db.exports.put(record);
  return record;
}

export async function deleteExportsByProtocol(protocolId) {
  await ensureDbReady();
  const matches = await db.exports.where('protocolId').equals(protocolId).toArray();
  for (const exp of matches) {
    await db.exports.delete(exp.id);
  }
}

export async function listProtocols() {
  await ensureDbReady();
  return db.protocols.orderBy('updatedAt').reverse().toArray();
}

export async function addProtocol(record) {
  await ensureDbReady();
  await db.protocols.put(record);
}

export async function getProtocol(id) {
  await ensureDbReady();
  return db.protocols.get(id);
}

export async function deleteProtocol(id) {
  await ensureDbReady();
  await db.protocols.delete(id);
}

export async function listTemplates() {
  await ensureDbReady();
  return db.templates.orderBy('createdAt').reverse().toArray();
}

export async function addTemplate(record) {
  await ensureDbReady();
  await db.templates.put(record);
}

export async function updateTemplate(record) {
  await ensureDbReady();
  await db.templates.put(record);
}
