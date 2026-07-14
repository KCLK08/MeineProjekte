import { PDFDocument } from 'pdf-lib';

import { applyPdfFieldValue, collectPdfValueAssignments } from './setup-model';
import type { SetupModel } from '@/types';

export async function buildFinalPdfBytes({
  templateBytes,
  setupModel,
  runValues = {},
}: {
  templateBytes: Uint8Array;
  setupModel: SetupModel;
  runValues?: Record<string, unknown>;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const formFields = pdfDoc.getForm().getFields();
  const fieldsByName = new Map(formFields.map((field) => [String(field.getName() || '').trim(), field]));
  const assignments = collectPdfValueAssignments(setupModel, runValues);

  for (const assignment of assignments) {
    const field = fieldsByName.get(assignment.fieldName);
    if (!field) continue;
    try {
      applyPdfFieldValue(field as never, assignment.type, assignment.value, {
        fieldName: assignment.fieldName,
        tableId: assignment.tableId,
        columnId: assignment.columnId,
      });
    } catch {
      // Keep export resilient.
    }
  }

  return pdfDoc.save();
}
