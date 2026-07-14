// @ts-nocheck
const ETB_SNAPSHOT = null;

export const ETB_TEMPLATE_KIND = 'builtin-etb';
export const ETB_TEMPLATE_NAME = 'Vorlage-eBTB';
export const ETB_TEMPLATE_FILE_NAME = 'Vorlage-eBTB.pdf';
export const ETB_TEMPLATE_ASSET = require('../../assets/templates/Vorlage-eBTB.pdf');
export const ETB_SETUP_VERSION = 6;

const MAIN_PERSONAL_COLUMNS = [
  { columnId: 'c1', label: 'Firmenbezeichnung' },
  { columnId: 'c2', label: 'Beginn' },
  { columnId: 'c3', label: 'Ende' },
  { columnId: 'c4', label: 'Anzahl Poliere' },
  { columnId: 'c5', label: 'Anzahl Fachkräfte' },
  { columnId: 'c6', label: 'Anzahl SiPo' },
  { columnId: 'c7', label: 'Anzahl Sicherungaufsicht' }
];

const MAIN_PERSONAL_FIELD_NAMES = [
  ['Text4', 'Text21', 'Text22', 'Text35', 'Text36', 'Text49', 'Text50'],
  ['Text10', 'Text23', 'Text24', 'Text37', 'Text38', 'Text51', 'Text52'],
  ['Text16', 'Text25', 'Text26', 'Text39', 'Text40', 'Text53', 'Text54'],
  ['Text17', 'Text27', 'Text28', 'Text41', 'Text42', 'Text55', 'Text56'],
  ['Text18', 'Text29', 'Text30', 'Text43', 'Text44', 'Text57', 'Text58'],
  ['Text19', 'Text31', 'Text32', 'Text45', 'Text46', 'Text59', 'Text60'],
  ['Text20', 'Text33', 'Text34', 'Text47', 'Text48', 'Text61', 'Text62']
];

const DETAIL_BLOCK_COLUMNS = [
  { columnId: 'c1', label: 'BÜW' },
  { columnId: 'c2', label: 'Firmenbezeichnung' },
  { columnId: 'c3', label: 'NT' },
  {
    columnId: 'c4',
    label: `a) Ausgeführte Arbeiten und Bauablauf
b) Verwendete Maschinen und Geräte`
  },
  { columnId: 'c5', label: 'Besonderes' }
];

const DETAIL_BLOCK_FIELD_NAMES = [['Text63', 'Text64', 'Text65', 'Text66', 'Text67']];

const FIXED_SINGLE_SECTIONS = [
  {
    sectionId: 'header',
    label: 'Kopfdaten',
    fields: ['Date1', 'Text1', 'Check Box1', 'Check Box2', 'Check Box3', 'Text2', 'Text3', 'Text5', 'Text6', 'Text7', 'Text8', 'Text9']
  },
  {
    sectionId: 'weather',
    label: 'Witterung',
    fields: ['Dropdown6', 'Text11', 'Text12', 'Text13']
  },
  {
    sectionId: 'closing',
    label: 'Abschluss',
    fields: ['Text70', 'Text14', 'Text15', 'Date2', 'Signature1']
  }
];

const REQUIRED_SINGLE_FIELDS = new Set(['Date1', 'Text1', 'Text2', 'Dropdown6']);
const SKIPPED_SINGLE_FIELDS = new Set(['Text9', 'Signature1']);

const REQUIRED_COLUMNS_BY_TABLE = new Map([
  ['table_main_personal', new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'])],
  ['table_detail_blocks', new Set(['c1', 'c2', 'c4'])]
]);

const SKIPPED_COLUMNS_BY_TABLE = new Map([['table_detail_blocks', new Set(['c3'])]]);

const DEFAULT_LABELS = {
  Date1: 'Datum',
  Text1: 'Projekt',
  'Check Box1': 'Frühschicht',
  'Check Box2': 'Spätschicht',
  'Check Box3': 'Nachtschicht',
  Dropdown6: 'Wetter',
  Text2: 'Bearbeiter',
  Text3: 'Bautechnik',
  Text5: 'Elektrotechnik 16,7 Hz',
  Text6: 'Elektrotechnik 50 Hz',
  Text7: 'Leit- und Sicherungstechnik',
  Text8: 'Telekomunikationstechnik',
  Text9: 'Sonstiges',
  Text11: 'Temperatur min.',
  Text12: 'Temperatur max.',
  Text13: 'Weitere Messwerte',
  Text70: 'Zugehörige Anhänge / Bemerkungen',
  Text14: 'Ort',
  Text15: 'Name',
  Date2: 'Datum Unterschrift',
  Signature1: 'Unterschrift'
};

function createId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function buildFieldMap(fields = []) {
  const map = new Map();
  for (const field of fields) {
    const fieldName = String(field?.fieldName || '').trim();
    if (fieldName && !map.has(fieldName)) {
      map.set(fieldName, field);
    }
  }
  return map;
}

function fieldEntry(sourceField, { label = '', skipped = false } = {}) {
  if (sourceField) {
    return {
      fieldId: String(sourceField.fieldId || ''),
      fieldName: String(sourceField.fieldName || ''),
      label: String(label || sourceField.labelCandidate || sourceField.fieldName || 'Feld').trim(),
      type: String(sourceField.type || 'text'),
      options: Array.isArray(sourceField.options) ? [...sourceField.options] : [],
      required: false,
      skipped: skipped === true,
      rect: Array.isArray(sourceField.rect) ? sourceField.rect.slice(0, 4) : null
    };
  }
  return {
    fieldId: '',
    fieldName: '',
    label: String(label || '').trim() || 'Feld',
    type: 'text',
    options: [],
    required: false,
    skipped: true,
    rect: null
  };
}

function tableCellEntry({ tableId, rowId, column, sourceField }) {
  const columnId = String(column?.columnId || '').trim();
  const cellId = `${tableId}:${rowId}:${columnId}`;
  if (sourceField) {
    return {
      cellId,
      tableId,
      rowId,
      columnId,
      fieldId: String(sourceField.fieldId || ''),
      fieldName: String(sourceField.fieldName || ''),
      label: String(column?.label || sourceField.labelCandidate || sourceField.fieldName || 'Spalte').trim(),
      type: String(sourceField.type || 'text'),
      options: Array.isArray(sourceField.options) ? [...sourceField.options] : [],
      page: Number(sourceField.page || 1),
      rect: Array.isArray(sourceField.rect) ? sourceField.rect.slice(0, 4) : null,
      skipped: false,
      required: false
    };
  }
  return {
    cellId,
    tableId,
    rowId,
    columnId,
    fieldId: '',
    fieldName: '',
    label: String(column?.label || 'Spalte').trim() || 'Spalte',
    type: 'text',
    options: [],
    page: 1,
    rect: null,
    skipped: true,
    required: false
  };
}

function buildFixedTableSection({
  tableId,
  label,
  columns,
  rowFieldNames,
  fieldMap,
  requiredColumnIds = new Set(),
  skippedColumnIds = new Set()
}) {
  const normalizedColumns = columns.map((column, index) => ({
    columnId: String(column.columnId || `c${index + 1}`),
    label: String(column.label || `Spalte ${index + 1}`),
    required: requiredColumnIds.has(String(column.columnId || `c${index + 1}`)),
    skipped: skippedColumnIds.has(String(column.columnId || `c${index + 1}`))
  }));

  const rows = rowFieldNames.map((fieldNames, rowIndex) => {
    const rowId = `r${rowIndex + 1}`;
    const cells = normalizedColumns.map((column, columnIndex) => {
      const fieldName = String(fieldNames[columnIndex] || '').trim();
      const sourceField = fieldMap.get(fieldName);
      const cell = tableCellEntry({
        tableId,
        rowId,
        column,
        sourceField
      });
      cell.required = column.required === true;
      cell.skipped = column.skipped === true || cell.skipped === true;
      return cell;
    });
    return {
      rowId,
      index: rowIndex + 1,
      skipped: false,
      cells
    };
  });

  return {
    tableId,
    label,
    page: 1,
    source: 'etb-fixed',
    columns: normalizedColumns,
    rows
  };
}

function buildEtbSetupModelFromSnapshot({ templateId, pageCount, detectedFields = [], snapshot }) {
  const fields = Array.isArray(detectedFields) ? detectedFields : [];
  const fieldMap = buildFieldMap(fields);
  const assignedFieldNames = new Set();
  const singleSections = [];
  const usedSectionIds = new Set();

  for (const [sectionIndex, section] of (snapshot.single_sections || []).entries()) {
    const sectionId = uniqueToken(section?.sectionId, `single_code_${sectionIndex + 1}`, usedSectionIds);
    const usedFieldTokens = new Set();
    const normalizedFields = ((section?.fields) || []).map((field, fieldIndex) => {
      const fieldName = String(field?.fieldName || '').trim();
      if (fieldName) {
        assignedFieldNames.add(fieldName);
      }
      const sourceField = fieldMap.get(fieldName);
      const fieldToken = uniqueToken(fieldName, `${sectionId}_f${fieldIndex + 1}`, usedFieldTokens);
      return buildSnapshotSingleField(field, sourceField, fieldToken);
    });
    singleSections.push({
      sectionId,
      label: String(section?.label || `Gruppe ${sectionIndex + 1}`),
      page: Number(section?.page || 1),
      fields: normalizedFields
    });
  }

  const tableSections = [];
  const usedTableIds = new Set();
  for (const [tableIndex, table] of (snapshot.table_sections || []).entries()) {
    const tableId = uniqueToken(table?.tableId, `table_code_${tableIndex + 1}`, usedTableIds);
    const usedColumnIds = new Set();
    const columns = ((table?.columns) || []).map((column, columnIndex) => ({
      columnId: uniqueToken(column?.columnId, `c${columnIndex + 1}`, usedColumnIds),
      label: String(column?.label || `Spalte ${columnIndex + 1}`),
      required: column?.required === true,
      skipped: column?.skipped === true
    }));
    const usedRowIds = new Set();
    const rows = ((table?.rows) || []).map((row, rowIndex) => {
      const rowId = uniqueToken(row?.rowId, `r${rowIndex + 1}`, usedRowIds);
      const cells = columns.map((column) => {
        const entry = ((row?.cells) || []).find((cell) => String(cell?.columnId || '') === String(column.columnId)) || null;
        const fieldName = String(entry?.fieldName || '').trim();
        if (fieldName) {
          assignedFieldNames.add(fieldName);
        }
        const sourceField = fieldMap.get(fieldName);
        return buildSnapshotTableCell({
          tableId,
          rowId,
          column,
          entry,
          sourceField
        });
      });
      return {
        rowId,
        index: Number(row?.index || rowIndex + 1),
        skipped: row?.skipped === true,
        cells
      };
    });
    tableSections.push({
      tableId,
      label: String(table?.label || `Tabelle ${tableIndex + 1}`),
      page: Number(table?.page || 1),
      source: 'etb-code-lock',
      columns,
      rows
    });
  }

  const remainingFields = fields
    .filter((field) => !assignedFieldNames.has(String(field.fieldName || '').trim()))
    .map((field) => fieldEntry(field, { label: DEFAULT_LABELS[field.fieldName] }));

  if (remainingFields.length > 0) {
    singleSections.push({
      sectionId: 'remaining',
      label: 'Weitere Felder',
      page: 1,
      fields: remainingFields
    });
  }

  return {
    modelId: createId('setupv2'),
    version: ETB_SETUP_VERSION,
    status: 'ready',
    templateId: String(templateId || ''),
    templateName: ETB_TEMPLATE_NAME,
    pageCount: Number(pageCount || 1),
    single_sections: singleSections,
    table_sections: tableSections,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function buildSnapshotSingleField(snapshotField, sourceField, fieldToken) {
  const fieldName = String(snapshotField?.fieldName || sourceField?.fieldName || '').trim();
  const label = String(
    snapshotField?.label || DEFAULT_LABELS[fieldName] || sourceField?.labelCandidate || fieldName || 'Feld'
  ).trim();
  const required = snapshotField?.required === true;
  const skipped = snapshotField?.skipped === true;

  if (!sourceField) {
    return {
      fieldId: `missing:${fieldToken}`,
      fieldName,
      label,
      type: 'text',
      options: [],
      required,
      skipped: true,
      rect: null
    };
  }

  const field = fieldEntry(sourceField, { label, skipped });
  field.required = required;
  field.skipped = skipped;
  return field;
}

function buildSnapshotTableCell({ tableId, rowId, column, entry, sourceField }) {
  const fieldName = String(entry?.fieldName || sourceField?.fieldName || '').trim();
  const label = String(entry?.label || column?.label || sourceField?.labelCandidate || fieldName || 'Spalte').trim();
  const skipped = entry?.skipped === true;
  const required = entry?.required === true || column?.required === true;
  const cell = tableCellEntry({ tableId, rowId, column, sourceField });

  if (sourceField) {
    cell.label = label;
    cell.required = required;
    cell.skipped = skipped;
    return cell;
  }

  cell.fieldName = fieldName;
  cell.label = label;
  cell.skipped = true;
  cell.required = required;
  return cell;
}

function uniqueToken(value, fallback, used) {
  const base = String(value || '').trim() || String(fallback || '').trim() || 'item';
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  const next = `${base}-${suffix}`;
  used.add(next);
  return next;
}

export function buildEtbSetupModel({ templateId, pageCount, detectedFields = [] }) {
  const fields = Array.isArray(detectedFields) ? detectedFields : [];

  if (ETB_SNAPSHOT) {
    return buildEtbSetupModelFromSnapshot({
      templateId,
      pageCount,
      detectedFields: fields,
      snapshot: ETB_SNAPSHOT
    });
  }

  const fieldMap = buildFieldMap(fields);
  const mainPersonalTable = buildFixedTableSection({
    tableId: 'table_main_personal',
    label: 'Baustelenbesetzung',
    columns: MAIN_PERSONAL_COLUMNS,
    rowFieldNames: MAIN_PERSONAL_FIELD_NAMES,
    fieldMap,
    requiredColumnIds: REQUIRED_COLUMNS_BY_TABLE.get('table_main_personal') || new Set(),
    skippedColumnIds: SKIPPED_COLUMNS_BY_TABLE.get('table_main_personal') || new Set()
  });

  const detailBlockTable = buildFixedTableSection({
    tableId: 'table_detail_blocks',
    label: 'Leistungsblock',
    columns: DETAIL_BLOCK_COLUMNS,
    rowFieldNames: DETAIL_BLOCK_FIELD_NAMES,
    fieldMap,
    requiredColumnIds: REQUIRED_COLUMNS_BY_TABLE.get('table_detail_blocks') || new Set(),
    skippedColumnIds: SKIPPED_COLUMNS_BY_TABLE.get('table_detail_blocks') || new Set()
  });

  const assignedFieldNames = new Set(
    [MAIN_PERSONAL_FIELD_NAMES, DETAIL_BLOCK_FIELD_NAMES]
      .flat(2)
      .map((fieldName) => String(fieldName || '').trim())
      .filter(Boolean)
  );

  const singleSections = [];
  for (const section of FIXED_SINGLE_SECTIONS) {
    const resolvedFields = section.fields
      .map((fieldName) => {
        const normalizedFieldName = String(fieldName || '').trim();
        if (!normalizedFieldName) {
          return null;
        }
        assignedFieldNames.add(normalizedFieldName);
        const sourceField = fieldMap.get(normalizedFieldName);
        const field = fieldEntry(sourceField, {
          label: DEFAULT_LABELS[normalizedFieldName],
          skipped: SKIPPED_SINGLE_FIELDS.has(normalizedFieldName)
        });
        field.required = REQUIRED_SINGLE_FIELDS.has(normalizedFieldName);
        field.skipped = SKIPPED_SINGLE_FIELDS.has(normalizedFieldName);
        return field;
      })
      .filter(Boolean)
      .filter((field) => String(field.fieldId || '').trim());

    if (resolvedFields.length !== 0) {
      singleSections.push({
        sectionId: String(section.sectionId),
        label: String(section.label),
        page: 1,
        fields: resolvedFields
      });
    }
  }

  const remainingFields = fields
    .filter((field) => !assignedFieldNames.has(String(field.fieldName || '').trim()))
    .map((field) => fieldEntry(field, { label: DEFAULT_LABELS[field.fieldName] }));

  if (remainingFields.length > 0) {
    singleSections.push({
      sectionId: 'remaining',
      label: 'Weitere Felder',
      page: 1,
      fields: remainingFields
    });
  }

  return {
    modelId: createId('setupv2'),
    version: ETB_SETUP_VERSION,
    status: 'ready',
    templateId: String(templateId || ''),
    templateName: ETB_TEMPLATE_NAME,
    pageCount: Number(pageCount || 1),
    single_sections: singleSections,
    table_sections: [mainPersonalTable, detailBlockTable],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}
