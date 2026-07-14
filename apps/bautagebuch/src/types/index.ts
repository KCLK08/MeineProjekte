export type FieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'unsupported';

export interface DetectedField {
  id: string;
  templateId: string;
  fieldId: string;
  fieldName: string;
  labelCandidate: string;
  type: FieldType;
  options: string[];
  page: number;
  orderIndex: number;
  rect: number[] | null;
}

export interface SetupField {
  fieldId: string;
  fieldName: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
  skipped: boolean;
  rect: number[] | null;
}

export interface SetupCell extends SetupField {
  cellId: string;
  tableId: string;
  rowId: string;
  columnId: string;
  page: number;
}

export interface SetupColumn {
  columnId: string;
  label: string;
  required: boolean;
  skipped: boolean;
}

export interface SetupRow {
  rowId: string;
  index: number;
  skipped: boolean;
  cells: SetupCell[];
}

export interface SingleSection {
  sectionId: string;
  label: string;
  page: number;
  fields: SetupField[];
}

export interface TableSection {
  tableId: string;
  label: string;
  page: number;
  source?: string;
  columns: SetupColumn[];
  rows: SetupRow[];
}

export interface SetupModel {
  modelId: string;
  version: number;
  status: string;
  templateId: string;
  templateName: string;
  pageCount: number;
  single_sections: SingleSection[];
  table_sections: TableSection[];
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  templateId: string;
  templateName: string;
  fileName: string;
  templateKind: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  pdfPath: string;
  status: 'draft' | 'ready';
  createdAt: string;
  updatedAt: string;
}

export interface PhotoDocEntry {
  id: string;
  createdAt: string;
  mimeType: string;
  photoUri: string;
}

export interface PhotoDoc {
  enabled: boolean | null;
  entries: PhotoDocEntry[];
  updatedAt: string;
}

export interface Run {
  runId: string;
  templateId: string;
  title: string;
  setupVersion: number;
  values: Record<string, string | boolean>;
  sectionIndex: number;
  status: 'draft' | 'completed';
  photoDoc: PhotoDoc;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

export interface RunSection {
  sectionId: string;
  kind: 'single' | 'table' | 'photo-doc';
  label: string;
  page?: number;
  fields?: SetupField[];
  tableId?: string;
  columns?: SetupColumn[];
  rows?: SetupRow[];
}

export type ExportMode = 'btb_only' | 'photo_doc_only' | 'btb_with_photo_doc';
