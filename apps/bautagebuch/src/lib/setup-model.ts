import { PDFDocument, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';

import type { DetectedField, FieldType, RunSection, SetupModel } from '@/types';

export function detectPdfFieldType(field: unknown): FieldType {
  const constructorName = String((field as { constructor?: { name?: string } })?.constructor?.name || '').toLowerCase();

  if (!field) {
    return 'unsupported';
  }
  if (field instanceof PDFTextField) {
    return 'text';
  }
  if (field instanceof PDFCheckBox) {
    return 'checkbox';
  }
  if (field instanceof PDFRadioGroup) {
    return 'radio';
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    return 'dropdown';
  }
  if (constructorName.includes('text')) {
    return 'text';
  }
  if (constructorName.includes('check')) {
    return 'checkbox';
  }
  if (constructorName.includes('radio')) {
    return 'radio';
  }
  if (constructorName.includes('drop') || constructorName.includes('option')) {
    return 'dropdown';
  }
  return 'unsupported';
}

function fieldKey(fieldId: string) {
  return `field:${String(fieldId || '')}`;
}

function cellKey(cellId: string) {
  return `cell:${String(cellId || '')}`;
}

function hasValue(fieldType: string, value: unknown) {
  if (fieldType === 'checkbox') {
    return value === true || value === false;
  }
  return String(value ?? '').trim().length > 0;
}

function hasFilledInput(fieldType: string, value: unknown) {
  if (fieldType === 'checkbox') {
    return value === true;
  }
  return String(value ?? '').trim().length > 0;
}

function visibleTableRows(section: { kind?: string; rows?: unknown[] }, options: { visibleRowCount?: number } = {}) {
  const rows = Array.isArray(section?.rows) ? section.rows : [];
  if (section?.kind !== 'table' || rows.length === 0) {
    return rows;
  }
  const visibleRowCount = Number(options?.visibleRowCount);
  if (!Number.isFinite(visibleRowCount)) {
    return rows;
  }
  const clamped = Math.max(1, Math.min(rows.length, Math.floor(visibleRowCount)));
  return rows.slice(0, clamped);
}

function sectionHasAnyValue(section: { kind?: string; fields?: { fieldId?: string; type?: string }[]; rows?: { cells?: { cellId?: string; type?: string }[] }[] }, values: Record<string, unknown> = {}, options = {}) {
  if (!section) return false;

  if (section.kind === 'single') {
    return (section.fields || []).some((field) => {
      const fieldId = String(field?.fieldId || '').trim();
      if (!fieldId) return false;
      return hasFilledInput(field.type || 'text', values[fieldKey(fieldId)]);
    });
  }

  if (section.kind === 'table') {
    return (visibleTableRows(section, options) as { cells?: { cellId?: string; type?: string }[] }[]).some((row) =>
      (row.cells || []).some((cell) => {
        const entryId = String(cell?.cellId || '').trim();
        if (!entryId) return false;
        return hasFilledInput(cell.type || 'text', values[cellKey(entryId)]);
      })
    );
  }

  return false;
}

const COMPACT_FIELD_FONT_SIZES = new Map([
  ['Text63', 12],
  ['Text64', 12],
  ['Text66', 12],
  ['Text67', 12],
  ['Text70', 9],
]);

const COMPACT_TABLE_FONT_SIZES = new Map([
  ['table_detail_blocks:c1', 12],
  ['table_detail_blocks:c2', 12],
  ['table_detail_blocks:c3', 12],
  ['table_detail_blocks:c4', 12],
  ['table_detail_blocks:c5', 12],
]);

function fontSizeKey(tableId: string, columnId: string) {
  const normalizedTableId = String(tableId || '').trim();
  const normalizedColumnId = String(columnId || '').trim();
  if (!normalizedTableId || !normalizedColumnId) return '';
  return `${normalizedTableId}:${normalizedColumnId}`;
}

function fieldFontSize(fieldName: string, { tableId = '', columnId = '' } = {}) {
  const tableKey = fontSizeKey(tableId, columnId);
  if (tableKey) {
    const tableSize = Number(COMPACT_TABLE_FONT_SIZES.get(tableKey));
    if (Number.isFinite(tableSize)) return tableSize;
  }
  const normalizedFieldName = String(fieldName || '').trim();
  if (!normalizedFieldName) return null;
  const fieldSize = Number(COMPACT_FIELD_FONT_SIZES.get(normalizedFieldName));
  return Number.isFinite(fieldSize) ? fieldSize : null;
}

export function inputKeyForField(field: { fieldId?: string }) {
  return fieldKey(field?.fieldId || '');
}

export function inputKeyForCell(cell: { cellId?: string }) {
  return cellKey(cell?.cellId || '');
}

export function validateSetupModel(model: SetupModel | null): string[] {
  const errors: string[] = [];
  if (!model) return ['Setup-Modell fehlt.'];

  const usedCellIds = new Set<string>();
  const usedFieldIds = new Map<string, string>();

  for (const section of model.single_sections || []) {
    for (const field of section?.fields || []) {
      if (field?.skipped === true) continue;
      const fieldId = String(field?.fieldId || '').trim();
      if (!fieldId) {
        errors.push(`${section?.label || 'Einzelfelder'}: aktives Feld ohne fieldId.`);
        continue;
      }
      if (usedFieldIds.has(fieldId)) {
        errors.push(`fieldId ${fieldId} ist mehrfach zugeordnet.`);
      } else {
        usedFieldIds.set(fieldId, `single:${section?.sectionId || section?.label || 'section'}`);
      }
    }
  }

  for (const table of model.table_sections || []) {
    const tableLabel = String(table?.label || table?.tableId || 'Tabelle');
    const columns = table.columns || [];
    const rows = table.rows || [];
    const columnsById = new Map(columns.map((c) => [String(c.columnId), c]));
    const rowIds = new Set<string>();

    for (const row of rows) {
      const rowId = String(row?.rowId || '').trim();
      if (!rowId) errors.push(`${tableLabel}: Zeile ohne rowId gefunden.`);
      else if (rowIds.has(rowId)) errors.push(`${tableLabel}: doppelte rowId ${rowId}.`);
      else rowIds.add(rowId);
    }

    const activeColumns = columns.filter((c) => c?.skipped !== true);
    const activeRows = rows.filter((r) => r?.skipped !== true);
    if (activeColumns.length === 0) errors.push(`${tableLabel}: mindestens eine aktive Spalte erforderlich.`);
    if (activeRows.length === 0) errors.push(`${tableLabel}: mindestens eine aktive Zeile erforderlich.`);

    for (const row of activeRows) {
      const rowId = String(row?.rowId || '');
      const cells = row.cells || [];
      const seenColumnIds = new Set<string>();

      for (const cell of cells) {
        if (cell?.skipped === true) continue;
        const columnId = String(cell?.columnId || '').trim();
        if (!columnId || !columnsById.has(columnId)) {
          errors.push(`${tableLabel}: Zelle verweist auf ungültige Spalte.`);
          continue;
        }
        if (seenColumnIds.has(columnId)) {
          errors.push(`${tableLabel}: doppelte Zellzuordnung für Spalte ${columnId}.`);
          continue;
        }
        seenColumnIds.add(columnId);

        const fieldId = String(cell?.fieldId || '').trim();
        if (fieldId) {
          if (usedFieldIds.has(fieldId)) errors.push(`${tableLabel}: fieldId ${fieldId} ist mehrfach zugeordnet.`);
          else usedFieldIds.set(fieldId, `table:${table?.tableId || tableLabel}`);
        } else {
          errors.push(`${tableLabel}: aktive Zelle ohne fieldId.`);
        }

        const cellId = String(cell?.cellId || '').trim();
        if (cellId) {
          if (usedCellIds.has(cellId)) errors.push(`${tableLabel}: doppelte cellId ${cellId}.`);
          else usedCellIds.add(cellId);
        } else {
          errors.push(`${tableLabel}: leere cellId.`);
        }
      }
    }
  }

  return errors;
}

export function buildRunSections(model: SetupModel): RunSection[] {
  if (!model) return [];

  const sections: RunSection[] = [];

  for (const section of model.single_sections || []) {
    const fields = (section.fields || []).filter((f) => f.skipped !== true);
    if (fields.length !== 0) {
      sections.push({
        sectionId: `single:${section.sectionId}`,
        kind: 'single',
        label: section.label,
        page: section.page,
        fields,
      });
    }
  }

  for (const table of model.table_sections || []) {
    const columns = (table.columns || []).filter((c) => c.skipped !== true);
    const activeColumnIds = new Set(columns.map((c) => String(c.columnId)));
    const rows = (table.rows || [])
      .filter((r) => r.skipped !== true)
      .map((row) => {
        const cellMap = new Map<string, (typeof row.cells)[0]>();
        for (const cell of row.cells || []) {
          if (cell?.skipped === true) continue;
          const columnId = String(cell?.columnId || '');
          if (activeColumnIds.has(columnId) && !cellMap.has(columnId)) {
            cellMap.set(columnId, cell);
          }
        }
        return {
          ...row,
          cells: columns.map((column) => cellMap.get(String(column.columnId))).filter(Boolean) as (typeof row.cells),
        };
      })
      .filter((row) => row.cells.length > 0);

    if (columns.length !== 0 && rows.length !== 0) {
      sections.push({
        sectionId: `table:${table.tableId}`,
        kind: 'table',
        tableId: table.tableId,
        label: table.label,
        page: table.page,
        columns,
        rows,
      });
    }
  }

  return sections;
}

export function requiredMissingCount(
  section: RunSection,
  values: Record<string, unknown> = {},
  options: { visibleRowCount?: number; requiredAnyGroups?: { fieldIds?: string[] }[] } = {}
) {
  if (!section) return 0;

  if (section.kind === 'single') {
    const requiredAnyGroups = options?.requiredAnyGroups || [];
    const anyGroupFieldIds = new Set(
      requiredAnyGroups.flatMap((g) => (g?.fieldIds || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    const fieldsById = new Map(
      (section.fields || [])
        .map((f: { fieldId?: string; type?: string }) => [String(f?.fieldId || '').trim(), f] as const)
        .filter(([id]) => Boolean(id))
    );

    const requiredSinglesMissing = (section.fields || [])
      .filter((f: { required?: boolean }) => f.required === true)
      .filter((f: { fieldId?: string; type?: string }) => {
        const fieldId = String(f?.fieldId || '').trim();
        if (!fieldId || anyGroupFieldIds.has(fieldId)) return false;
        return !hasFilledInput(String(f.type || 'text'), values[fieldKey(fieldId)]);
      }).length;

    let requiredAnyMissing = 0;
    for (const group of requiredAnyGroups) {
      const fieldIds = [...new Set((group?.fieldIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
      if (fieldIds.length === 0) continue;
      const anyFilled = fieldIds.some((fieldId) => {
        const field = fieldsById.get(fieldId);
        if (!field) return false;
        return hasFilledInput(String(field?.type || 'text'), values[fieldKey(fieldId)]);
      });
      if (!anyFilled) requiredAnyMissing += 1;
    }

    return requiredSinglesMissing + requiredAnyMissing;
  }

  if (section.kind === 'table') {
    const firstVisibleRow = visibleTableRows(section, options)[0] as { cells?: { cellId?: string; columnId?: string; type?: string }[] };
    if (!firstVisibleRow) return 0;
    let missing = 0;
    for (const column of section.columns || []) {
      if (column.required !== true) continue;
      const cell = (firstVisibleRow.cells || []).find((e) => String(e.columnId) === String(column.columnId));
      if (!cell) continue;
      const cellId = String(cell?.cellId || '').trim();
      if (!cellId) continue;
      if (!hasFilledInput(cell.type || 'text', values[cellKey(cellId)])) missing += 1;
    }
    return missing;
  }

  return 0;
}

export function sectionProgressState(
  section: RunSection,
  values: Record<string, unknown> = {},
  options = {}
): 'done' | 'progress' | 'todo' {
  const missingRequired = requiredMissingCount(section, values, options);
  const hasAny = sectionHasAnyValue(section, values, options);
  if (missingRequired === 0 && hasAny) return 'done';
  if (hasAny || missingRequired > 0) return 'progress';
  return 'todo';
}

export function collectPdfValueAssignments(model: SetupModel, values: Record<string, unknown> = {}) {
  const assignments: {
    fieldName: string;
    type: string;
    value: unknown;
    tableId?: string;
    columnId?: string;
  }[] = [];

  for (const section of model?.single_sections || []) {
    for (const field of section.fields || []) {
      if (field?.skipped === true) continue;
      const inputKey = inputKeyForField(field);
      const value = values[inputKey];
      if (hasValue(field?.type, value)) {
        assignments.push({
          fieldName: String(field.fieldName || '').trim(),
          type: String(field.type || 'text'),
          value,
        });
      }
    }
  }

  for (const table of model?.table_sections || []) {
    const activeColumns = (table.columns || []).filter((c) => c?.skipped !== true);
    const activeColumnIds = new Set(activeColumns.map((c) => String(c.columnId)));
    for (const row of table.rows || []) {
      if (row?.skipped === true) continue;
      for (const cell of row.cells || []) {
        if (cell?.skipped === true || !activeColumnIds.has(String(cell.columnId)) || !String(cell.fieldName || '').trim()) {
          continue;
        }
        const inputKey = inputKeyForCell(cell);
        const value = values[inputKey];
        if (hasValue(cell?.type, value)) {
          assignments.push({
            fieldName: String(cell.fieldName || '').trim(),
            type: String(cell.type || 'text'),
            tableId: String(table.tableId || '').trim(),
            columnId: String(cell.columnId || '').trim(),
            value,
          });
        }
      }
    }
  }

  return assignments;
}

export function applyPdfFieldValue(
  field: PDFTextField | PDFCheckBox | PDFRadioGroup | PDFDropdown,
  type: string,
  value: unknown,
  { fieldName = '', tableId = '', columnId = '' } = {}
) {
  const resolvedType = type || detectPdfFieldType(field);
  if (!field) return;

  if (resolvedType === 'checkbox') {
    if (value === true) (field as PDFCheckBox).check();
    else (field as PDFCheckBox).uncheck();
    return;
  }

  if (resolvedType === 'radio' || resolvedType === 'dropdown') {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue) return;
    (field as PDFRadioGroup | PDFDropdown).select(normalizedValue);
    return;
  }

  const normalizedText = String(value ?? '').replace(/\r\n/g, '\n');
  if (!normalizedText.trim()) return;

  const fontSize = fieldFontSize(fieldName, { tableId, columnId });
  const textField = field as PDFTextField;
  if (Number.isFinite(fontSize) && typeof textField.setFontSize === 'function') {
    try {
      textField.setFontSize(fontSize as number);
    } catch {
      // ignore
    }
  }

  if (normalizedText.includes('\n') && typeof textField.enableMultiline === 'function') {
    try {
      textField.enableMultiline();
    } catch {
      // ignore
    }
  }

  textField.setText(normalizedText);
}

function humanizeFieldName(value: string) {
  return String(value || '')
    .replace(/[_\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readSelectOptions(field: unknown): string[] {
  try {
    const options = (field as { getOptions?: () => string[] })?.getOptions?.();
    if (Array.isArray(options)) return options.map((o) => String(o));
  } catch {
    // ignore
  }
  return [];
}

export async function scanTemplatePdf(bytes: Uint8Array): Promise<{
  pageCount: number;
  detectedFields: Omit<DetectedField, 'id' | 'templateId'>[];
}> {
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(bytes);
  } catch (error) {
    throw new Error(`PDF konnte nicht gelesen werden: ${(error as Error)?.message || 'Unbekannt'}`);
  }

  let formFields;
  try {
    formFields = pdfDoc.getForm().getFields();
  } catch (error) {
    throw new Error(`AcroForm konnte nicht gelesen werden: ${(error as Error)?.message || 'Unbekannt'}`);
  }

  if (!Array.isArray(formFields) || formFields.length === 0) {
    throw new Error('Nur ausfüllbare AcroForm-PDFs werden unterstützt.');
  }

  const detectedFields = formFields.map((field, index) => {
    const fieldName = String((field as { getName?: () => string }).getName?.() || '').trim();
    const fieldType = detectPdfFieldType(field);
    const options = readSelectOptions(field);
    return {
      fieldId: `field_${index + 1}`,
      fieldName,
      labelCandidate: humanizeFieldName(fieldName),
      type: fieldType,
      options,
      page: 1,
      orderIndex: index,
      rect: null as number[] | null,
    };
  });

  return {
    pageCount: pdfDoc.getPageCount(),
    detectedFields,
  };
}
