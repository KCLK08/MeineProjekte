import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';

const COMPACT_FIELD_FONT_SIZES = new Map([
  ['Text63', 12],
  ['Text64', 12],
  ['Text66', 12],
  ['Text67', 12],
  ['Text70', 9]
]);

const COMPACT_TABLE_FONT_SIZES = new Map([
  ['table_detail_blocks:c1', 12],
  ['table_detail_blocks:c2', 12],
  ['table_detail_blocks:c3', 12],
  ['table_detail_blocks:c4', 12],
  ['table_detail_blocks:c5', 12]
]);

function fieldKey(fieldId) {
  return `field:${String(fieldId || '')}`;
}

function cellKey(cellId) {
  return `cell:${String(cellId || '')}`;
}

function hasValue(fieldType, value) {
  if (fieldType === 'checkbox') {
    return value === true || value === false;
  }
  return String(value ?? '').trim().length > 0;
}

function hasFilledInput(fieldType, value) {
  if (fieldType === 'checkbox') {
    return value === true;
  }
  return String(value ?? '').trim().length > 0;
}

function visibleTableRows(section, options = {}) {
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

function sectionHasAnyValue(section, values = {}, options = {}) {
  if (!section) {
    return false;
  }

  if (section.kind === 'single') {
    return section.fields.some((field) => {
      const fieldId = String(field?.fieldId || '').trim();
      if (!fieldId) {
        return false;
      }
      return hasFilledInput(field.type, values[fieldKey(fieldId)]);
    });
  }

  if (section.kind === 'table') {
    return visibleTableRows(section, options).some((row) =>
      row.cells.some((cell) => {
        const entryId = String(cell?.cellId || '').trim();
        if (!entryId) {
          return false;
        }
        return hasFilledInput(cell.type, values[cellKey(entryId)]);
      })
    );
  }

  return false;
}

function fontSizeKey(tableId, columnId) {
  const normalizedTableId = String(tableId || '').trim();
  const normalizedColumnId = String(columnId || '').trim();
  if (!normalizedTableId || !normalizedColumnId) {
    return '';
  }
  return `${normalizedTableId}:${normalizedColumnId}`;
}

function fieldFontSize(fieldName, { tableId = '', columnId = '' } = {}) {
  const tableKey = fontSizeKey(tableId, columnId);
  if (tableKey) {
    const tableSize = Number(COMPACT_TABLE_FONT_SIZES.get(tableKey));
    if (Number.isFinite(tableSize)) {
      return tableSize;
    }
  }

  const normalizedFieldName = String(fieldName || '').trim();
  if (!normalizedFieldName) {
    return null;
  }

  const fieldSize = Number(COMPACT_FIELD_FONT_SIZES.get(normalizedFieldName));
  return Number.isFinite(fieldSize) ? fieldSize : null;
}

export function detectPdfFieldType(field) {
  const constructorName = String(field?.constructor?.name || '').toLowerCase();

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

export function inputKeyForField(field) {
  return fieldKey(field?.fieldId);
}

export function inputKeyForCell(cell) {
  return cellKey(cell?.cellId);
}

export function validateSetupModel(model) {
  const errors = [];
  if (!model) {
    return ['Setup-Modell fehlt.'];
  }

  const usedCellIds = new Set();
  const usedFieldIds = new Map();
  const singleSections = Array.isArray(model.single_sections) ? model.single_sections : [];

  for (const section of singleSections) {
    for (const field of section?.fields || []) {
      if (field?.skipped === true) {
        continue;
      }
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

  const tableSections = Array.isArray(model.table_sections) ? model.table_sections : [];
  for (const table of tableSections) {
    const tableLabel = String(table?.label || table?.tableId || 'Tabelle');
    const columns = Array.isArray(table?.columns) ? table.columns : [];
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const columnsById = new Map();
    const rowIds = new Set();

    for (const column of columns) {
      const columnId = String(column?.columnId || '').trim();
      if (!columnId) {
        errors.push(`${tableLabel}: Spalte ohne columnId gefunden.`);
        continue;
      }
      if (columnsById.has(columnId)) {
        errors.push(`${tableLabel}: doppelte columnId ${columnId}.`);
      } else {
        columnsById.set(columnId, column);
      }
    }

    for (const row of rows) {
      const rowId = String(row?.rowId || '').trim();
      if (!rowId) {
        errors.push(`${tableLabel}: Zeile ohne rowId gefunden.`);
        continue;
      }
      if (rowIds.has(rowId)) {
        errors.push(`${tableLabel}: doppelte rowId ${rowId}.`);
      } else {
        rowIds.add(rowId);
      }
    }

    const activeColumns = columns.filter((column) => column?.skipped !== true);
    const activeRows = rows.filter((row) => row?.skipped !== true);
    if (activeColumns.length === 0) {
      errors.push(`${tableLabel}: mindestens eine aktive Spalte erforderlich.`);
    }
    if (activeRows.length === 0) {
      errors.push(`${tableLabel}: mindestens eine aktive Zeile erforderlich.`);
    }

    for (const row of activeRows) {
      const rowId = String(row?.rowId || '');
      const cells = Array.isArray(row?.cells) ? row.cells : [];
      const seenColumnIds = new Set();

      for (const cell of cells) {
        if (cell?.skipped === true) {
          continue;
        }
        const columnId = String(cell?.columnId || '').trim();
        if (!columnId || !columnsById.has(columnId)) {
          errors.push(`${tableLabel}: Zelle in Zeile ${row.index || '?'} verweist auf ungültige Spalte.`);
          continue;
        }
        if (seenColumnIds.has(columnId)) {
          errors.push(`${tableLabel}: doppelte Zellzuordnung in Zeile ${row.index || '?'} für Spalte ${columnId}.`);
          continue;
        }
        seenColumnIds.add(columnId);
        if (String(cell?.rowId || '') !== rowId) {
          errors.push(`${tableLabel}: Zell-Row-Mapping in Zeile ${row.index || '?'} ist inkonsistent.`);
        }
        if (columnsById.get(columnId)?.skipped === true) {
          errors.push(`${tableLabel}: aktive Zelle referenziert übersprungene Spalte ${columnId}.`);
        }

        const fieldId = String(cell?.fieldId || '').trim();
        if (fieldId) {
          if (usedFieldIds.has(fieldId)) {
            errors.push(`${tableLabel}: fieldId ${fieldId} ist mehrfach zugeordnet.`);
          } else {
            usedFieldIds.set(fieldId, `table:${table?.tableId || tableLabel}`);
          }
        } else {
          errors.push(`${tableLabel}: aktive Zelle in Zeile ${row.index || '?'} ohne fieldId.`);
        }

        const cellId = String(cell?.cellId || '').trim();
        if (cellId) {
          if (usedCellIds.has(cellId)) {
            errors.push(`${tableLabel}: doppelte cellId ${cellId}.`);
          } else {
            usedCellIds.add(cellId);
          }
        } else {
          errors.push(`${tableLabel}: leere cellId in Zeile ${row.index || '?'}.`);
        }
      }

      for (const column of activeColumns) {
        const columnId = String(column?.columnId || '');
        const matchingCells = cells.filter(
          (cell) => String(cell?.columnId || '') === columnId && cell?.skipped !== true
        );
        if (matchingCells.length !== 1) {
          errors.push(`${tableLabel}: Zeile ${row.index || '?'} und Spalte ${column.label || columnId} ist nicht eindeutig zugeordnet.`);
          continue;
        }
        const cell = matchingCells[0];
        if (!String(cell?.rowId || '').trim() || !String(cell?.columnId || '').trim()) {
          errors.push(`${tableLabel}: ungültige Zellzuordnung in Zeile ${row.index || '?'}.`);
        }
      }
    }
  }

  return errors;
}

export function buildRunSections(model) {
  if (!model) {
    return [];
  }

  const sections = [];

  for (const section of model.single_sections || []) {
    const fields = (section.fields || []).filter((field) => field.skipped !== true);
    if (fields.length !== 0) {
      sections.push({
        sectionId: `single:${section.sectionId}`,
        kind: 'single',
        label: section.label,
        page: section.page,
        fields
      });
    }
  }

  for (const table of model.table_sections || []) {
    const columns = (table.columns || []).filter((column) => column.skipped !== true);
    const activeColumnIds = new Set(columns.map((column) => String(column.columnId)));
    const rows = (table.rows || [])
      .filter((row) => row.skipped !== true)
      .map((row) => {
        const cellMap = new Map();
        for (const cell of row.cells || []) {
          if (cell?.skipped === true) {
            continue;
          }
          const columnId = String(cell?.columnId || '');
          if (activeColumnIds.has(columnId) && !cellMap.has(columnId)) {
            cellMap.set(columnId, cell);
          }
        }
        return {
          ...row,
          cells: columns.map((column) => cellMap.get(String(column.columnId))).filter(Boolean)
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
        rows
      });
    }
  }

  return sections;
}

export function requiredMissingCount(section, values = {}, options = {}) {
  if (!section) {
    return 0;
  }

  if (section.kind === 'single') {
    const requiredAnyGroups = Array.isArray(options?.requiredAnyGroups) ? options.requiredAnyGroups : [];
    const anyGroupFieldIds = new Set(
      requiredAnyGroups.flatMap((group) => ((group?.fieldIds) || []).map((fieldId) => String(fieldId || '').trim()).filter(Boolean))
    );
    const fieldsById = new Map(
      (section.fields || [])
        .map((field) => [String(field?.fieldId || '').trim(), field])
        .filter(([fieldId]) => Boolean(fieldId))
    );

    const requiredSinglesMissing = section.fields
      .filter((field) => field.required === true)
      .filter((field) => {
        const fieldId = String(field?.fieldId || '').trim();
        if (!fieldId || anyGroupFieldIds.has(fieldId)) {
          return false;
        }
        return !hasFilledInput(field.type, values[fieldKey(fieldId)]);
      }).length;

    let requiredAnyMissing = 0;
    for (const group of requiredAnyGroups) {
      const fieldIds = [...new Set(((group?.fieldIds) || []).map((fieldId) => String(fieldId || '').trim()).filter(Boolean))];
      if (fieldIds.length === 0) {
        continue;
      }
      const anyFilled = fieldIds.some((fieldId) => {
        const field = fieldsById.get(fieldId);
        if (!field) {
          return false;
        }
        return hasFilledInput(field.type, values[fieldKey(fieldId)]);
      });
      if (!anyFilled) {
        requiredAnyMissing += 1;
      }
    }

    return requiredSinglesMissing + requiredAnyMissing;
  }

  if (section.kind === 'table') {
    const firstVisibleRow = visibleTableRows(section, options)[0];
    if (!firstVisibleRow) {
      return 0;
    }
    let missing = 0;
    for (const column of section.columns) {
      if (column.required !== true) {
        continue;
      }
      const cell = (firstVisibleRow.cells || []).find(
        (entry) => String(entry.columnId) === String(column.columnId)
      );
      if (!cell) {
        continue;
      }
      const cellId = String(cell?.cellId || '').trim();
      if (!cellId) {
        continue;
      }
      if (!hasFilledInput(cell.type, values[cellKey(cellId)])) {
        missing += 1;
      }
    }
    return missing;
  }

  return 0;
}

export function sectionProgressState(section, values = {}, options = {}) {
  const missingRequired = requiredMissingCount(section, values, options);
  const hasAny = sectionHasAnyValue(section, values, options);
  if (missingRequired === 0 && hasAny) {
    return 'done';
  }
  if (hasAny || missingRequired > 0) {
    return 'progress';
  }
  return 'todo';
}

export function collectPdfValueAssignments(model, values = {}) {
  const assignments = [];

  for (const section of model?.single_sections || []) {
    for (const field of section.fields || []) {
      if (field?.skipped === true) {
        continue;
      }
      const inputKey = inputKeyForField(field);
      const value = values[inputKey];
      if (hasValue(field?.type, value)) {
        assignments.push({
          fieldName: String(field.fieldName || '').trim(),
          type: String(field.type || 'text'),
          value
        });
      }
    }
  }

  for (const table of model?.table_sections || []) {
    const activeColumns = (table.columns || []).filter((column) => column?.skipped !== true);
    const activeColumnIds = new Set(activeColumns.map((column) => String(column.columnId)));
    for (const row of table.rows || []) {
      if (row?.skipped === true) {
        continue;
      }
      for (const cell of row.cells || []) {
        if (
          cell?.skipped === true ||
          !activeColumnIds.has(String(cell.columnId)) ||
          !String(cell.fieldName || '').trim()
        ) {
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
            value
          });
        }
      }
    }
  }

  return assignments;
}

export function applyPdfFieldValue(field, type, value, { fieldName = '', tableId = '', columnId = '' } = {}) {
  const resolvedType = type || detectPdfFieldType(field);
  if (!field) {
    return;
  }

  if (resolvedType === 'checkbox') {
    if (value === true) {
      field.check();
    } else {
      field.uncheck();
    }
    return;
  }

  if (resolvedType === 'radio' || resolvedType === 'dropdown') {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue) {
      return;
    }
    field.select(normalizedValue);
    return;
  }

  const normalizedText = String(value ?? '').replace(/\r\n/g, '\n');
  if (!normalizedText.trim()) {
    return;
  }

  const fontSize = fieldFontSize(fieldName, { tableId, columnId });
  if (Number.isFinite(fontSize) && typeof field.setFontSize === 'function') {
    try {
      field.setFontSize(fontSize);
    } catch {
      // Ignore fields that do not support font-size changes.
    }
  }

  if (normalizedText.includes('\n') && typeof field.enableMultiline === 'function') {
    try {
      field.enableMultiline();
    } catch {
      // Ignore fields that already have multiline state.
    }
  }

  field.setText(normalizedText);
}
