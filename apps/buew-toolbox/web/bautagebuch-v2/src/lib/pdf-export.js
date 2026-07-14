import { PDFDocument } from 'pdf-lib';

import { applyPdfFieldValue, collectPdfValueAssignments } from './setup-model.js';

export async function buildFinalPdfBytes({ templateBlob, setupModel, runValues = {} }) {
  const templateBuffer = await templateBlob.arrayBuffer();
  const pdfDoc = await PDFDocument.load(templateBuffer);
  const formFields = pdfDoc.getForm().getFields();
  const fieldsByName = new Map(formFields.map((field) => [String(field.getName() || '').trim(), field]));
  const assignments = collectPdfValueAssignments(setupModel, runValues);

  for (const assignment of assignments) {
    const field = fieldsByName.get(assignment.fieldName);
    if (!field) {
      continue;
    }
    try {
      applyPdfFieldValue(field, assignment.type, assignment.value, {
        fieldName: assignment.fieldName,
        tableId: assignment.tableId,
        columnId: assignment.columnId
      });
    } catch {
      // Keep export resilient even when individual form fields fail.
    }
  }

  return pdfDoc.save();
}
