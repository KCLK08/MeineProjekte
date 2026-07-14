import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

import { detectPdfFieldType } from './setup-model.js';

let pdfJsPromise = null;

const COMPACT_OVERLAY_FIELDS = new Set(['Text63', 'Text64', 'Text67', 'Text70']);

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.resolve().then(() => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function getPageAnnotations(page) {
  try {
    return await page.getAnnotations({ intent: 'display' });
  } catch {
    return await page.getAnnotations();
  }
}

function humanizeFieldName(value) {
  return String(value || '')
    .replace(/[_\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRect(rect) {
  if (!Array.isArray(rect) || rect.length < 4) {
    return null;
  }
  const x1 = Number(rect[0]);
  const y1 = Number(rect[1]);
  const x2 = Number(rect[2]);
  const y2 = Number(rect[3]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) {
    return null;
  }
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.max(y1, y2);
  const bottom = Math.min(y1, y2);
  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, top - bottom),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
}

function median(values = [], fallback = 0) {
  const filtered = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (filtered.length === 0) {
    return fallback;
  }
  return filtered[Math.floor(filtered.length / 2)];
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function parseSlottedFieldName(fieldName) {
  const normalized = String(fieldName || '').trim();
  const match = normalized.match(/^(.*?)([_\-\s\.])(\d+)$/);
  if (!match) {
    return null;
  }
  const baseName = String(match[1] || '').trim();
  const slot = Number(match[3]);
  if (!baseName || !Number.isFinite(slot) || slot <= 0) {
    return null;
  }
  return {
    baseKey: slugify(baseName) || slugify(normalized) || normalized.toLowerCase(),
    baseLabel: humanizeFieldName(baseName),
    slot
  };
}

function sortDetectedFields(fields = []) {
  return [...fields].sort((left, right) => {
    if ((left.page ?? 9999) !== (right.page ?? 9999)) {
      return (left.page ?? 9999) - (right.page ?? 9999);
    }

    const leftRect = normalizeRect(left.rect);
    const rightRect = normalizeRect(right.rect);
    if (Boolean(leftRect) !== Boolean(rightRect)) {
      return leftRect ? -1 : 1;
    }

    if (leftRect && rightRect) {
      const topDelta = rightRect.top - leftRect.top;
      if (Math.abs(topDelta) > 4) {
        return topDelta;
      }
      const leftDelta = leftRect.left - rightRect.left;
      if (Math.abs(leftDelta) > 4) {
        return leftDelta;
      }
    }

    if ((left.orderIndex ?? 9999) !== (right.orderIndex ?? 9999)) {
      return (left.orderIndex ?? 9999) - (right.orderIndex ?? 9999);
    }

    return String(left.fieldName || '').localeCompare(String(right.fieldName || ''));
  });
}

function assignFieldIds(fields = []) {
  const usedIds = new Set();
  return fields.map((field, index) => {
    const slug = slugify(field.fieldName) || `field-${index + 1}`;
    const page = Number(field.page || 1);
    const orderIndex = Number(field.orderIndex ?? index + 1);
    const baseId = `${slug}-p${page}-o${orderIndex}`;
    let fieldId = baseId;
    let suffix = 2;
    while (usedIds.has(fieldId)) {
      fieldId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(fieldId);
    return {
      ...field,
      fieldId
    };
  });
}

function inferColumnLabel(textLines = [], centerX = 0, topY = 0, fallback = '') {
  const candidate = textLines
    .filter((line) => line.y > topY + 2 && line.y < topY + 130)
    .map((line) => {
      const horizontalDistance = Math.abs((line.centerX ?? line.x ?? centerX) - centerX);
      const verticalDistance = Math.abs(line.y - topY);
      return {
        line,
        score: verticalDistance + horizontalDistance * 0.6
      };
    })
    .sort((left, right) => left.score - right.score)
    .find((entry) => entry.line.text.length > 1 && Math.abs((entry.line.centerX ?? centerX) - centerX) < 190);

  return String(candidate?.line?.text || fallback || 'Spalte').trim();
}

function inferLabelCandidate(textLines = [], rect, fallback = '') {
  const normalizedRect = normalizeRect(rect);
  if (!normalizedRect) {
    return String(fallback || '').trim();
  }

  const fallbackLabel = String(fallback || '').trim() || 'Feld';
  const candidates = [];

  for (const line of textLines || []) {
    const text = String(line?.text || '').trim();
    if (!text || text.length < 2) {
      continue;
    }
    const left = Number(line?.x ?? 0);
    const right = Number(line?.x ?? 0) + Number(line?.width ?? 0);
    const centerX = Number(line?.centerX ?? left);
    const y = Number(line?.y ?? 0);
    const isLeftLabel = right <= normalizedRect.left + 12 && Math.abs(y - normalizedRect.centerY) <= Math.max(10, normalizedRect.height * 1.15);
    const isTopLabel =
      y > normalizedRect.top + 1 &&
      y <= normalizedRect.top + 45 &&
      centerX >= normalizedRect.left - 140 &&
      centerX <= normalizedRect.right + 140;

    if (!isLeftLabel && !isTopLabel) {
      continue;
    }

    const score = isLeftLabel
      ? Math.abs(normalizedRect.left - right) + Math.abs(y - normalizedRect.centerY) * 1.4
      : 20 + Math.abs(y - normalizedRect.top) * 1.3 + Math.abs(centerX - normalizedRect.centerX) * 0.55;

    candidates.push({ text, score });
  }

  candidates.sort((left, right) => left.score - right.score);
  const best = candidates[0]?.text;
  if (!best || best.length > 80) {
    return fallbackLabel;
  }
  return best;
}

function remapOrderedSlots(slots = []) {
  const sortedSlots = [...new Set(slots.map((slot) => Number(slot)).filter((slot) => Number.isFinite(slot) && slot > 0))].sort(
    (left, right) => left - right
  );
  const slotMap = new Map();
  sortedSlots.forEach((slot, index) => slotMap.set(slot, index + 1));
  return slotMap;
}

function emptyCell({ tableId, rowId, columnId }) {
  return {
    cellId: `${tableId}:${rowId}:${columnId}`,
    rowId,
    columnId,
    fieldId: '',
    fieldName: '',
    type: 'text'
  };
}

function detectNameTables(fields = [], textLinesByPage = new Map()) {
  const tables = [];
  const fieldsByPage = new Map();
  for (const field of fields) {
    const page = Number(field.page || 1);
    if (!fieldsByPage.has(page)) {
      fieldsByPage.set(page, []);
    }
    fieldsByPage.get(page).push(field);
  }

  for (const [page, pageFields] of fieldsByPage.entries()) {
    const groupsByBaseKey = new Map();
    for (const field of pageFields) {
      const parsed = parseSlottedFieldName(field.fieldName);
      if (!parsed) {
        continue;
      }
      if (!groupsByBaseKey.has(parsed.baseKey)) {
        groupsByBaseKey.set(parsed.baseKey, {
          baseKey: parsed.baseKey,
          baseLabel: parsed.baseLabel,
          slots: new Map()
        });
      }
      const group = groupsByBaseKey.get(parsed.baseKey);
      if (!group.slots.has(parsed.slot)) {
        group.slots.set(parsed.slot, field);
      }
    }

    const candidateColumns = [...groupsByBaseKey.values()].filter((group) => group.slots.size >= 2);
    if (candidateColumns.length < 2) {
      continue;
    }

    const slotValues = [...new Set(candidateColumns.flatMap((group) => [...group.slots.keys()]))].sort((left, right) => left - right);
    if (slotValues.length < 2) {
      continue;
    }

    const slotIndexMap = remapOrderedSlots(slotValues);
    const tableId = `table_name_p${page}_1`;
    const textLines = textLinesByPage.get(page) || [];

    const columns = candidateColumns
      .map((group, groupIndex) => {
        const groupFields = [...group.slots.values()];
        const centerX = median(
          groupFields
            .map((field) => normalizeRect(field.rect)?.centerX)
            .filter((value) => Number.isFinite(value)),
          groupIndex * 160
        );
        const firstField = [...groupFields].sort((left, right) => (left.orderIndex ?? 9999) - (right.orderIndex ?? 9999))[0];
        return {
          columnId: `c${groupIndex + 1}`,
          baseKey: group.baseKey,
          centerX,
          label: inferColumnLabel(
            textLines,
            centerX,
            median(groupFields.map((field) => normalizeRect(field.rect)?.top), 0),
            group.baseLabel || humanizeFieldName(firstField?.fieldName || '')
          ),
          required: false,
          skipped: false,
          slots: group.slots
        };
      })
      .sort((left, right) => left.centerX - right.centerX)
      .map((column, index) => ({
        ...column,
        columnId: `c${index + 1}`
      }));

    const rows = slotValues.map((slotValue) => {
      const rowIndex = slotIndexMap.get(slotValue) || slotValue;
      const rowId = `r${rowIndex}`;
      const cells = columns.map((column) => {
        const sourceField = column.slots.get(slotValue);
        if (sourceField) {
          return {
            cellId: `${tableId}:${rowId}:${column.columnId}`,
            rowId,
            columnId: column.columnId,
            fieldId: String(sourceField.fieldId || ''),
            fieldName: String(sourceField.fieldName || ''),
            type: String(sourceField.type || 'text')
          };
        }
        return emptyCell({
          tableId,
          rowId,
          columnId: column.columnId
        });
      });

      return {
        rowId,
        index: rowIndex,
        slotValue,
        skipped: false,
        cells
      };
    });

    tables.push({
      tableId,
      label: `Tabelle Seite ${page}`,
      page,
      source: 'name',
      columns: columns.map((column) => ({
        columnId: column.columnId,
        label: column.label,
        required: false,
        skipped: false
      })),
      rows
    });
  }

  return tables;
}

function groupFieldsIntoLines(fields = []) {
  const normalized = fields
    .map((field) => ({
      ...field,
      _rect: normalizeRect(field.rect)
    }))
    .filter(
      (field) =>
        field._rect &&
        field.type !== 'checkbox' &&
        field.type !== 'radio' &&
        field.type !== 'unsupported' &&
        !(field._rect.height > 40) &&
        !(field._rect.width > 260)
    );

  if (normalized.length < 4) {
    return [];
  }

  const sorted = [...normalized].sort((left, right) => {
    if ((left.page ?? 9999) !== (right.page ?? 9999)) {
      return (left.page ?? 9999) - (right.page ?? 9999);
    }
    if (Math.abs((right._rect.centerY || 0) - (left._rect.centerY || 0)) > 0.1) {
      return (right._rect.centerY || 0) - (left._rect.centerY || 0);
    }
    return (left._rect.left || 0) - (right._rect.left || 0);
  });

  const lineTolerance = Math.max(5, Math.min(18, median(sorted.map((field) => field._rect.height), 14) * 0.65));
  const lines = [];

  for (const field of sorted) {
    let targetLine = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const distance = Math.abs(line.centerY - field._rect.centerY);
      if (distance <= lineTolerance && distance < bestDistance) {
        targetLine = line;
        bestDistance = distance;
      }
    }

    if (!targetLine) {
      targetLine = {
        centerY: field._rect.centerY,
        fields: []
      };
      lines.push(targetLine);
    }

    targetLine.fields.push(field);
    targetLine.centerY =
      (targetLine.centerY * (targetLine.fields.length - 1) + field._rect.centerY) / targetLine.fields.length;
  }

  return lines
    .filter((line) => line.fields.length >= 2)
    .map((line) => ({
      ...line,
      fields: [...line.fields].sort((left, right) => left._rect.left - right._rect.left)
    }))
    .sort((left, right) => right.centerY - left.centerY);
}

function clusterFieldLines(lines = []) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [];
  }

  const medianHeight = median(
    lines.flatMap((line) => line.fields.map((field) => field?._rect?.height)).filter((value) => Number.isFinite(value)),
    14
  );
  const gapThreshold = Math.max(28, Math.min(90, medianHeight * 2));
  const clusters = [];
  let currentCluster = [lines[0]];

  for (let index = 1; index < lines.length; index += 1) {
    const previousLine = lines[index - 1];
    const nextLine = lines[index];
    if (Math.max(0, (previousLine?.centerY ?? 0) - (nextLine?.centerY ?? 0)) > gapThreshold) {
      clusters.push(currentCluster);
      currentCluster = [nextLine];
      continue;
    }
    currentCluster.push(nextLine);
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  return clusters;
}

function detectGeometryTable(page, lineCluster = [], textLinesByPage = new Map(), tableIndex = 1) {
  if (!Array.isArray(lineCluster) || lineCluster.length < 2) {
    return null;
  }

  const medianWidth = median(
    lineCluster.flatMap((line) => line.fields.map((field) => field?._rect?.width)).filter((value) => Number.isFinite(value)),
    28
  );
  const columnTolerance = Math.max(10, Math.min(50, medianWidth * 0.75));
  const columnSamples = [];

  for (const line of lineCluster) {
    for (const field of line.fields) {
      let targetColumn = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const column of columnSamples) {
        const distance = Math.abs(column.centerX - field._rect.centerX);
        if (distance <= columnTolerance && distance < bestDistance) {
          targetColumn = column;
          bestDistance = distance;
        }
      }
      if (!targetColumn) {
        targetColumn = {
          centerX: field._rect.centerX,
          sampleFields: []
        };
        columnSamples.push(targetColumn);
      }
      targetColumn.sampleFields.push(field);
      targetColumn.centerX =
        (targetColumn.centerX * (targetColumn.sampleFields.length - 1) + field._rect.centerX) / targetColumn.sampleFields.length;
    }
  }

  if (columnSamples.length < 2) {
    return null;
  }

  const textLines = textLinesByPage.get(page) || [];
  const tableId = `table_geom_p${page}_${tableIndex}`;
  const orderedColumns = [...columnSamples].sort((left, right) => left.centerX - right.centerX);
  const topY = median(
    lineCluster[0].fields.map((field) => field?._rect?.top),
    0
  );

  const columns = orderedColumns.map((column, index) => {
    const sampleField = column.sampleFields[0];
    return {
      columnId: `c${index + 1}`,
      centerX: column.centerX,
      label: inferColumnLabel(textLines, column.centerX, topY, humanizeFieldName(sampleField?.fieldName || `Spalte ${index + 1}`)),
      required: false,
      skipped: false
    };
  });

  const rows = lineCluster
    .map((line, rowIndex) => {
      const rowId = `r${rowIndex + 1}`;
      const usedColumnIds = new Set();
      const fieldsByColumnId = new Map();

      for (const field of line.fields) {
        let bestColumn = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const column of columns) {
          if (usedColumnIds.has(column.columnId)) {
            continue;
          }
          const distance = Math.abs(column.centerX - field._rect.centerX);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestColumn = column;
          }
        }

        if (bestColumn) {
          usedColumnIds.add(bestColumn.columnId);
          fieldsByColumnId.set(bestColumn.columnId, field);
        }
      }

      return {
        rowId,
        index: rowIndex + 1,
        skipped: false,
        cells: columns.map((column) => {
          const sourceField = fieldsByColumnId.get(column.columnId);
          if (sourceField) {
            return {
              cellId: `${tableId}:${rowId}:${column.columnId}`,
              rowId,
              columnId: column.columnId,
              fieldId: String(sourceField.fieldId || ''),
              fieldName: String(sourceField.fieldName || ''),
              type: String(sourceField.type || 'text')
            };
          }
          return emptyCell({
            tableId,
            rowId,
            columnId: column.columnId
          });
        })
      };
    })
    .filter((row) => row.cells.filter((cell) => String(cell.fieldId || '').trim()).length >= Math.max(2, Math.floor(columns.length * 0.5)));

  const fillRatio =
    rows.reduce((count, row) => count + row.cells.filter((cell) => String(cell.fieldId || '').trim()).length, 0) /
    Math.max(1, rows.length * columns.length);

  if (rows.length < 2 || fillRatio < 0.55) {
    return null;
  }

  return {
    tableId,
    label: `Tabelle Seite ${page}`,
    page,
    source: 'geometry',
    columns: columns.map((column) => ({
      columnId: column.columnId,
      label: column.label,
      required: false,
      skipped: false
    })),
    rows
  };
}

function detectTableHints(fields = [], textLinesByPage = new Map()) {
  const tableHints = [];
  const nameTables = detectNameTables(fields, textLinesByPage);
  tableHints.push(...nameTables);

  const usedFieldIds = new Set(
    nameTables.flatMap((table) =>
      table.rows.flatMap((row) => row.cells.map((cell) => String(cell.fieldId || '')).filter(Boolean))
    )
  );

  const remainingByPage = new Map();
  for (const field of fields) {
    if (usedFieldIds.has(String(field.fieldId || ''))) {
      continue;
    }
    const page = Number(field.page || 1);
    if (!remainingByPage.has(page)) {
      remainingByPage.set(page, []);
    }
    remainingByPage.get(page).push(field);
  }

  for (const [page, pageFields] of remainingByPage.entries()) {
    const lines = groupFieldsIntoLines(pageFields);
    if (lines.length < 2) {
      continue;
    }
    const lineClusters = clusterFieldLines(lines).filter((cluster) => cluster.length >= 2);
    let tableIndex = 1;
    for (const cluster of lineClusters) {
      const table = detectGeometryTable(page, cluster, textLinesByPage, tableIndex);
      if (table) {
        tableHints.push(table);
        tableIndex += 1;
      }
    }
  }

  return tableHints;
}

function readSelectOptions(field, fallbackOptions = []) {
  try {
    if (typeof field.getOptions === 'function') {
      return uniqueStrings(field.getOptions());
    }
  } catch {
    // Ignore fields that do not expose options directly.
  }

  if (Array.isArray(fallbackOptions)) {
    return uniqueStrings(
      fallbackOptions.map(
        (option) => option?.displayValue || option?.exportValue || option?.value || option
      )
    );
  }
  return [];
}

async function extractWidgetMetadata(pdfJsDoc) {
  const widgets = new Map();
  for (let page = 1; page <= pdfJsDoc.numPages; page += 1) {
    const annotations = await getPageAnnotations(await pdfJsDoc.getPage(page));
    annotations.forEach((annotation, index) => {
      if (annotation?.subtype !== 'Widget') {
        return;
      }
      const fieldName = String(annotation?.fieldName || '').trim();
      if (!fieldName) {
        return;
      }
      const candidate = {
        page,
        orderIndex: index,
        rect: Array.isArray(annotation.rect) ? annotation.rect.slice(0, 4) : null,
        options: annotation.options || []
      };
      const existing = widgets.get(fieldName);
      if (!existing) {
        widgets.set(fieldName, candidate);
        return;
      }
      if (candidate.page < existing.page || (candidate.page === existing.page && candidate.orderIndex < existing.orderIndex)) {
        widgets.set(fieldName, candidate);
      }
    });
  }
  return widgets;
}

async function extractTextLines(pdfJsDoc) {
  const textLinesByPage = new Map();
  for (let page = 1; page <= pdfJsDoc.numPages; page += 1) {
    const textContent = await (await pdfJsDoc.getPage(page)).getTextContent();
    const textLines = [];
    for (const item of textContent.items || []) {
      const text = String(item?.str || '').trim();
      if (!text) {
        continue;
      }
      const transform = Array.isArray(item?.transform) ? item.transform : null;
      const x = Number(transform?.[4] ?? 0);
      const y = Number(transform?.[5] ?? 0);
      const width = Number(item?.width || 0);
      textLines.push({
        text,
        x,
        y,
        width,
        centerX: x + width / 2
      });
    }
    textLinesByPage.set(
      page,
      textLines.sort((left, right) => {
        if (Math.abs((right.y || 0) - (left.y || 0)) > 0.1) {
          return (right.y || 0) - (left.y || 0);
        }
        return (left.x || 0) - (right.x || 0);
      })
    );
  }
  return textLinesByPage;
}

function normalizePreviewHighlight(highlight) {
  if (!highlight || !Array.isArray(highlight.rect) || highlight.rect.length < 4) {
    return null;
  }
  return {
    fieldId: String(highlight.fieldId || '').trim(),
    page: Number(highlight.page || 1),
    rect: highlight.rect.slice(0, 4),
    mode: String(highlight.mode || 'context')
  };
}

function highlightPriority(mode) {
  if (mode === 'active') {
    return 3;
  }
  if (mode === 'context') {
    return 2;
  }
  return 1;
}

function dedupeHighlights(highlights = []) {
  const deduped = new Map();
  for (const highlight of highlights) {
    const normalized = normalizePreviewHighlight(highlight);
    if (!normalized) {
      continue;
    }
    const key = normalized.fieldId
      ? `id:${normalized.fieldId}`
      : `rect:${normalized.page}:${normalized.rect.map((value) => Number(value || 0)).join(',')}`;
    const existing = deduped.get(key);
    if (!existing || highlightPriority(normalized.mode) >= highlightPriority(existing.mode)) {
      deduped.set(key, normalized);
    }
  }
  return [...deduped.values()];
}

function drawHighlight(context, viewport, highlight) {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(highlight.rect);
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  context.save();
  if (highlight.mode === 'active') {
    context.fillStyle = 'rgba(15, 138, 122, 0.22)';
    context.strokeStyle = 'rgba(20, 105, 95, 0.95)';
    context.lineWidth = 2.4;
  } else if (highlight.mode === 'context') {
    context.fillStyle = 'rgba(46, 118, 214, 0.12)';
    context.strokeStyle = 'rgba(46, 118, 214, 0.86)';
    context.lineWidth = 1.8;
  } else {
    context.fillStyle = 'rgba(92, 111, 138, 0.07)';
    context.strokeStyle = 'rgba(92, 111, 138, 0.48)';
    context.lineWidth = 1.2;
  }
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
  context.restore();
}

function normalizeValueOverlay(overlay) {
  if (!overlay || !Array.isArray(overlay.rect) || overlay.rect.length < 4) {
    return null;
  }

  const type = String(overlay.type || 'text').trim().toLowerCase();
  const value = overlay.value;
  let text = '';
  if (type === 'checkbox') {
    if (value !== true) {
      return null;
    }
    text = '✓';
  } else {
    text = String(value ?? '').trim();
    if (!text) {
      return null;
    }
  }

  return {
    fieldId: String(overlay.fieldId || '').trim(),
    fieldName: String(overlay.fieldName || '').trim(),
    page: Number(overlay.page || 1),
    rect: overlay.rect.slice(0, 4),
    type,
    text
  };
}

function dedupeValueOverlays(overlays = []) {
  const deduped = new Map();
  for (const overlay of overlays || []) {
    const normalized = normalizeValueOverlay(overlay);
    if (!normalized) {
      continue;
    }
    const key = normalized.fieldId
      ? `id:${normalized.fieldId}`
      : `rect:${normalized.page}:${normalized.rect.map((value) => Number(value || 0)).join(',')}`;
    deduped.set(key, normalized);
  }
  return [...deduped.values()];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ellipsizeToWidth(context, text, maxWidth) {
  const normalizedText = String(text ?? '');
  if (!normalizedText) {
    return '';
  }
  if (context.measureText(normalizedText).width <= maxWidth) {
    return normalizedText;
  }
  const ellipsis = '…';
  let result = '';
  for (const character of normalizedText) {
    const nextValue = `${result}${character}`;
    if (context.measureText(`${nextValue}${ellipsis}`).width > maxWidth) {
      break;
    }
    result = nextValue;
  }
  return `${result}${ellipsis}`;
}

function wrapTextToWidth(context, text, maxWidth) {
  const normalizedText = String(text ?? '').replace(/\r\n/g, '\n');
  if (!normalizedText.trim()) {
    return [];
  }

  const lines = [];
  for (const line of normalizedText.split('\n')) {
    const compactLine = String(line || '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!compactLine) {
      lines.push('');
      continue;
    }

    const words = compactLine.split(' ').filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = '';
    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (context.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }

      if (context.measureText(word).width <= maxWidth) {
        currentLine = word;
      } else {
        lines.push(ellipsizeToWidth(context, word, maxWidth));
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

function drawValueOverlay(context, viewport, overlay) {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(overlay.rect);
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  if (!(width > 2) || !(height > 2)) {
    return;
  }

  context.save();
  context.beginPath();
  context.rect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2));
  context.clip();
  context.fillStyle = 'rgba(255, 255, 255, 0.14)';
  context.fillRect(x, y, width, height);

  if (overlay.type === 'checkbox') {
    const fontSize = clamp(Math.round(Math.min(width, height) * 0.78), 10, 30);
    context.font = `700 ${fontSize}px "IBM Plex Sans", "Segoe UI", Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(18, 83, 75, 0.95)';
    context.fillText('✓', x + width / 2, y + height / 2 + 0.5);
    context.restore();
    return;
  }

  const paddingX = clamp(Math.round(width * 0.04), 2, 8);
  const paddingY = clamp(Math.round(height * 0.14), 2, 6);
  const fieldName = String(overlay.fieldName || '').trim();
  const fontSize = COMPACT_OVERLAY_FIELDS.has(fieldName)
    ? clamp(Math.round(height * 0.33), 8, 12)
    : clamp(Math.round(height * 0.46), 10, 17);
  const lineHeight = Math.round(fontSize * 1.22);
  const maxTextWidth = Math.max(8, width - paddingX * 2);
  const maxLines = Math.max(1, Math.floor((height - paddingY * 2) / lineHeight));

  context.font = `600 ${fontSize}px "IBM Plex Sans", "Segoe UI", Arial, sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = 'rgba(17, 22, 30, 0.95)';

  const wrappedLines = wrapTextToWidth(context, overlay.text, maxTextWidth);
  if (wrappedLines.length === 0) {
    context.restore();
    return;
  }

  const linesToRender = wrappedLines.slice(0, maxLines);
  if (wrappedLines.length > maxLines && linesToRender.length > 0) {
    linesToRender[linesToRender.length - 1] = ellipsizeToWidth(
      context,
      linesToRender[linesToRender.length - 1],
      maxTextWidth
    );
  }

  linesToRender.forEach((line, index) => {
    context.fillText(line, x + paddingX, y + paddingY + index * lineHeight);
  });
  context.restore();
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function scanTemplatePdf(file) {
  const buffer = await file.arrayBuffer();

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch (error) {
    throw new Error(`PDF konnte nicht gelesen werden: ${error?.message || 'Unbekannt'}`);
  }

  let formFields;
  try {
    formFields = pdfDoc.getForm().getFields();
  } catch (error) {
    throw new Error(`AcroForm konnte nicht gelesen werden: ${error?.message || 'Unbekannt'}`);
  }

  if (!Array.isArray(formFields) || formFields.length === 0) {
    throw new Error('Nur ausfüllbare AcroForm-PDFs werden in V2 unterstützt.');
  }

  const pdfjs = await loadPdfJs();
  const pdfJsDoc = await pdfjs.getDocument({ data: buffer }).promise;
  const widgetsByName = await extractWidgetMetadata(pdfJsDoc);
  const textLinesByPage = await extractTextLines(pdfJsDoc);

  const detectedFields = formFields.map((field, index) => {
    const fieldName = String(field.getName() || '').trim();
    const widget = widgetsByName.get(fieldName);
    const fieldType = detectPdfFieldType(field);
    const options = readSelectOptions(field, widget?.options || []);
    const page = Number(widget?.page || 1);
    const textLines = textLinesByPage.get(page) || [];
    const rect = Array.isArray(widget?.rect) ? widget.rect.slice(0, 4) : null;

    return {
      fieldName,
      labelCandidate: inferLabelCandidate(textLines, rect, humanizeFieldName(fieldName)),
      type: fieldType,
      options,
      page,
      orderIndex: Number(widget?.orderIndex ?? index),
      rect
    };
  });

  const sortedFields = sortDetectedFields(detectedFields);
  const fieldsWithIds = assignFieldIds(sortedFields);
  const tableHints = detectTableHints(fieldsWithIds, textLinesByPage);

  return {
    pageCount: Number(pdfJsDoc.numPages || 1),
    detectedFields: fieldsWithIds,
    tableHints
  };
}

export async function loadPdfPreviewDocument(blob) {
  const pdfjs = await loadPdfJs();
  const buffer = await blob.arrayBuffer();
  return pdfjs.getDocument({ data: buffer }).promise;
}

export async function renderFieldPreview({
  pdfJsDoc,
  pageNumber,
  rect,
  highlights = [],
  valueOverlays = [],
  activeFieldId = '',
  canvas,
  maxWidth = 860
}) {
  if (!pdfJsDoc || !canvas) {
    return;
  }

  const safePageNumber = Math.min(Math.max(Number(pageNumber || 1), 1), pdfJsDoc.numPages);
  const page = await pdfJsDoc.getPage(safePageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / baseViewport.width, 2.1);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: context,
    viewport
  }).promise;

  const pageHighlights = dedupeHighlights(
    (Array.isArray(highlights) ? highlights : [])
      .map((highlight) => normalizePreviewHighlight(highlight))
      .filter(Boolean)
      .filter((highlight) => Number(highlight.page || 1) === safePageNumber)
  );

  const normalizedActiveFieldId = String(activeFieldId || '').trim();
  if (normalizedActiveFieldId) {
    let foundActive = false;
    for (const highlight of pageHighlights) {
      if (highlight.fieldId && highlight.fieldId === normalizedActiveFieldId) {
        highlight.mode = 'active';
        foundActive = true;
      }
    }
    if (!foundActive && Array.isArray(rect) && rect.length >= 4) {
      pageHighlights.push({
        fieldId: normalizedActiveFieldId,
        page: safePageNumber,
        rect: rect.slice(0, 4),
        mode: 'active'
      });
    }
  } else if (Array.isArray(rect) && rect.length >= 4) {
    pageHighlights.push({
      fieldId: '',
      page: safePageNumber,
      rect: rect.slice(0, 4),
      mode: 'active'
    });
  }

  pageHighlights.sort((left, right) => highlightPriority(left.mode) - highlightPriority(right.mode));
  for (const highlight of pageHighlights) {
    drawHighlight(context, viewport, highlight);
  }

  const pageOverlays = dedupeValueOverlays(
    (Array.isArray(valueOverlays) ? valueOverlays : []).filter(
      (overlay) => Number(overlay?.page || 1) === safePageNumber
    )
  );
  for (const overlay of pageOverlays) {
    drawValueOverlay(context, viewport, overlay);
  }
}
