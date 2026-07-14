import { buildEtbSetupModel as buildRaw } from './etb-template';
import type { DetectedField, SetupModel } from '@/types';

export function buildEtbSetupModel({
  templateId,
  pageCount,
  detectedFields = [],
}: {
  templateId: string;
  pageCount: number;
  detectedFields?: Array<DetectedField | Omit<DetectedField, 'id' | 'templateId'>>;
}): SetupModel {
  return buildRaw({ templateId, pageCount, detectedFields: detectedFields as never[] }) as SetupModel;
}
