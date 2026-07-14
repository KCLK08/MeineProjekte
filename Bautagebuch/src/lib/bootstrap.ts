import {
  createTemplate,
  getDetectedFields,
  getTemplate,
  listTemplates,
  loadAssetBytes,
  markTemplateReady,
  putTemplate,
  saveDetectedFields,
  saveSetupModel,
} from './db';
import type { SetupModel } from '@/types';
import { buildEtbSetupModel } from './etb-setup';
import { ETB_TEMPLATE_ASSET, ETB_TEMPLATE_FILE_NAME, ETB_TEMPLATE_KIND, ETB_TEMPLATE_NAME } from './etb-template';
import { scanTemplatePdf } from './setup-model';

const MAX_PDF_SIZE = 40 * 1024 * 1024;

export async function ensureBuiltinTemplate(force = false): Promise<string> {
  const templates = await listTemplates();
  const existing = templates.find((t) => t.templateKind === ETB_TEMPLATE_KIND);

  if (existing && !force) {
    const setup = await import('./db').then((m) => m.getSetupModel(existing.templateId));
    if (setup) return existing.templateId;
  }

  const pdfBytes = await loadAssetBytes(ETB_TEMPLATE_ASSET);
  if (pdfBytes.byteLength > MAX_PDF_SIZE) {
    throw new Error('Vorlage-eBTB überschreitet 40 MB.');
  }

  const scanResult = await scanTemplatePdf(pdfBytes);
  let template = existing;

  if (!template) {
    template = await createTemplate({
      templateName: ETB_TEMPLATE_NAME,
      fileName: ETB_TEMPLATE_FILE_NAME,
      templateKind: ETB_TEMPLATE_KIND,
      mimeType: 'application/pdf',
      sizeBytes: pdfBytes.byteLength,
      pdfBytes,
      pageCount: scanResult.pageCount,
    });
  } else {
    template = await putTemplate({
      ...template,
      templateName: ETB_TEMPLATE_NAME,
      fileName: ETB_TEMPLATE_FILE_NAME,
      templateKind: ETB_TEMPLATE_KIND,
      mimeType: 'application/pdf',
      sizeBytes: pdfBytes.byteLength,
      pageCount: scanResult.pageCount,
      pdfBytes,
      status: 'draft',
    });
  }

  await saveDetectedFields(template.templateId, scanResult.detectedFields);
  const fields = await getDetectedFields(template.templateId);
  const setupModel = buildEtbSetupModel({
    templateId: template.templateId,
    pageCount: scanResult.pageCount,
    detectedFields: fields,
  }) as SetupModel;

  await saveSetupModel(template.templateId, setupModel, { status: 'ready' });
  await markTemplateReady(template.templateId);
  return template.templateId;
}

export async function getReadyBuiltinTemplateId(): Promise<string | null> {
  const templates = await listTemplates();
  const builtin = templates.find((t) => t.templateKind === ETB_TEMPLATE_KIND && t.status === 'ready');
  return builtin?.templateId || null;
}

export async function getBuiltinTemplate() {
  const templateId = await getReadyBuiltinTemplateId();
  if (!templateId) return null;
  return getTemplate(templateId);
}
