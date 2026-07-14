import type { PhotoDoc, RunSection, SetupField, SetupModel } from '@/types';
import { buildRunSections, inputKeyForField } from './setup-model';

export const PHOTO_DOC_SECTION_ID = 'photo-doc';
export const PHOTO_DOC_ENABLED_RUN_KEY = '__photoDoc:enabled';
export const TABLE_ROW_COUNT_KEY_PREFIX = '__tableRows:';
export const MAIN_PERSONAL_TABLE_ID = 'table_main_personal';
export const LEISTUNGSBLOCK_TABLE_ID = 'table_detail_blocks';

const RUN_DEFAULTS_BY_FIELD_NAME = new Map([['Text2', 'Kazim Celik']]);
const DATE_FIELD_NAME_PATTERN = /^Date\d+$/i;
export const SHIFT_FIELD_NAMES = ['Check Box1', 'Check Box2', 'Check Box3'] as const;
export const GEWERK_FIELD_NAMES = ['Text3', 'Text5', 'Text6', 'Text7', 'Text8'] as const;

export const GEWERK_LABELS: Record<string, string> = {
  Text3: 'Bautechnik',
  Text5: 'Elektrotechnik 16,7 Hz',
  Text6: 'Elektrotechnik 50 Hz',
  Text7: 'Leit- und Sicherungstechnik',
  Text8: 'Telekomunikationstechnik',
};

const SHIFT_FIELD_NAME_SET = new Set<string>(SHIFT_FIELD_NAMES);
const GEWERK_FIELD_NAME_SET = new Set<string>(GEWERK_FIELD_NAMES);

export function isShiftFieldName(fieldName: string) {
  return SHIFT_FIELD_NAME_SET.has(fieldName);
}

export function isGewerkFieldName(fieldName: string) {
  return GEWERK_FIELD_NAME_SET.has(fieldName);
}

export function getSelectedGewerkFieldName(fields: SetupField[], values: Record<string, unknown>) {
  for (const name of GEWERK_FIELD_NAMES) {
    const field = fields.find((entry) => entry.fieldName === name);
    if (!field) continue;
    if (String(values[inputKeyForField(field)] ?? '').trim().toUpperCase() === 'X') return name;
  }
  return '';
}

export function getShiftRequiredAnyGroup(fields: SetupField[] = []) {
  const fieldIds = fields
    .filter((field) => isShiftFieldName(field.fieldName))
    .map((field) => String(field.fieldId || '').trim())
    .filter(Boolean);
  return fieldIds.length > 0 ? [{ fieldIds }] : [];
}

export function runSectionOrderRank(section: RunSection) {
  const sectionId = String(section?.sectionId || '').trim();
  const label = String(section?.label || '').trim().toLowerCase();

  if (sectionId === 'single:header') return 10;
  if (sectionId === 'single:weather') return 20;
  if (sectionId === `table:${MAIN_PERSONAL_TABLE_ID}`) return 30;
  if (sectionId === `table:${LEISTUNGSBLOCK_TABLE_ID}`) return 40;
  if (sectionId === 'single:closing') return 50;
  if (sectionId === PHOTO_DOC_SECTION_ID) return 60;

  if (label.includes('kopfdaten')) return 10;
  if (label.includes('witterung')) return 20;
  if (label.includes('firmen') && label.includes('personal')) return 30;
  if (label.includes('leistungsblock') || label.includes('ausgeführte arbeiten')) return 40;
  if (label.includes('abschluss')) return 50;
  return 900;
}

export function orderRunSections(sections: RunSection[] = []) {
  return [...sections]
    .map((section, index) => ({ section, index, rank: runSectionOrderRank(section) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.section);
}

export function buildRunSectionsWithPhotoDoc(model: SetupModel, photoDocEnabled: boolean | null): RunSection[] {
  const sections = orderRunSections(buildRunSections(model) as RunSection[]);
  sections.push({
    sectionId: PHOTO_DOC_SECTION_ID,
    kind: 'photo-doc',
    label: 'Fotodokumentation',
  });
  return sections;
}

export function normalizeRunPhotoDoc(value: Partial<PhotoDoc> | null | undefined): PhotoDoc {
  const entries = Array.isArray(value?.entries)
    ? value.entries
        .map((entry) => ({
          id: String(entry?.id || '').trim(),
          createdAt: String(entry?.createdAt || '').trim() || new Date().toISOString(),
          mimeType: String(entry?.mimeType || 'image/jpeg').trim() || 'image/jpeg',
          photoUri: String(entry?.photoUri || '').trim(),
        }))
        .filter((entry) => entry.id && entry.photoUri)
    : [];

  return {
    enabled: value?.enabled ?? null,
    entries,
    updatedAt: String(value?.updatedAt || '').trim() || new Date().toISOString(),
  };
}

export function isPhotoDocEnabled(photoDoc: PhotoDoc, values: Record<string, unknown>): boolean {
  if (photoDoc.enabled === true) return true;
  if (photoDoc.enabled === false) return false;
  return values[PHOTO_DOC_ENABLED_RUN_KEY] === true;
}

export function applyRunDefaultsFromModel(model: SetupModel, values: Record<string, unknown> = {}) {
  const next = { ...values };
  let changed = false;
  const today = new Date().toISOString().slice(0, 10);

  for (const section of model.single_sections || []) {
    for (const field of section.fields || []) {
      if (field.skipped) continue;
      const key = inputKeyForField(field);
      if (next[key] !== undefined && String(next[key] ?? '').trim() !== '') continue;

      const fieldName = String(field.fieldName || '').trim();
      if (DATE_FIELD_NAME_PATTERN.test(fieldName)) {
        next[key] = today;
        changed = true;
        continue;
      }
      if (RUN_DEFAULTS_BY_FIELD_NAME.has(fieldName)) {
        next[key] = RUN_DEFAULTS_BY_FIELD_NAME.get(fieldName) || '';
        changed = true;
      }
    }
  }

  return { values: next, changed };
}

export function buildRunTitleByConvention(name: string): string {
  const normalized = String(name || '').trim();
  if (!normalized) return 'BTB';
  const date = new Date().toISOString().slice(0, 10);
  return `${normalized} – ${date}`;
}

export function normalizeRunNameInput(value: string): string {
  return String(value || '').trim();
}

export function tableRowCountKey(tableId: string) {
  return `${TABLE_ROW_COUNT_KEY_PREFIX}${tableId}`;
}

export function getVisibleRowCount(tableId: string, values: Record<string, unknown>, maxRows: number) {
  const raw = Number(values[tableRowCountKey(tableId)]);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(maxRows, Math.floor(raw)));
}

export function sanitizeFileName(value: string) {
  const cleaned = String(value || 'bautagebuch')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || 'bautagebuch';
}

export function getIsoWeekInfo(isoDate: string) {
  const date = new Date(isoDate);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekYear = utc.getUTCFullYear();
  return {
    weekYear,
    weekNo,
    weekKey: `${weekYear}-W${String(weekNo).padStart(2, '0')}`,
  };
}

export function getWeekKey(isoDate: string) {
  return getIsoWeekInfo(isoDate).weekKey;
}

function getIsoWeekDateRange(weekYear: number, weekNo: number) {
  const simple = new Date(weekYear, 0, 1 + (weekNo - 1) * 7);
  const day = simple.getDay();
  const start = new Date(simple);
  if (day <= 4) start.setDate(simple.getDate() - simple.getDay() + 1);
  else start.setDate(simple.getDate() + 8 - simple.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function formatWeekLabel(weekKey: string) {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (match) {
    const weekYear = Number(match[1]);
    const weekNo = Number(match[2]);
    const { start, end } = getIsoWeekDateRange(weekYear, weekNo);
    const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `KW ${weekNo} · ${fmt(start)} – ${fmt(end)}`;
  }

  const start = new Date(weekKey);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function formatWeekNumber(weekKey: string) {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (match) return Number(match[2]);
  const info = getIsoWeekInfo(weekKey);
  return info.weekNo;
}
