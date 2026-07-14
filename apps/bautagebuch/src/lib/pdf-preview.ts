import * as FileSystem from 'expo-file-system/legacy';

import type { ExportMode, PhotoDoc, SetupModel } from '@/types';
import { buildFinalPdfBytes } from './pdf-export';
import { mergeBtbWithPhotoDoc } from './photo-doc';
import { isPhotoDocEnabled, sanitizeFileName } from './run-utils';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function cachePdfBytes(bytes: Uint8Array, fileName = 'preview.pdf'): Promise<string> {
  const safeName = String(fileName || 'preview.pdf').replace(/[^\w.\-]+/g, '_');
  const directory = `${FileSystem.cacheDirectory}preview/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const path = `${directory}${safeName}`;
  await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

export async function buildRunPreviewBytes({
  templateBytes,
  setupModel,
  runValues = {},
  photoDoc,
  runTitle = 'Bautagebuch',
  mode = 'btb_with_photo_doc',
}: {
  templateBytes: Uint8Array;
  setupModel: SetupModel;
  runValues?: Record<string, unknown>;
  photoDoc?: PhotoDoc;
  runTitle?: string;
  mode?: ExportMode;
}): Promise<Uint8Array> {
  const baseBytes = await buildFinalPdfBytes({
    templateBytes,
    setupModel,
    runValues,
  });

  if (mode === 'btb_only') return baseBytes;

  const merged = await mergeBtbWithPhotoDoc({
    btbPdfBytes: baseBytes,
    photoDocEnabled: mode === 'photo_doc_only' ? true : isPhotoDocEnabled(photoDoc || { enabled: null, entries: [], updatedAt: '' }, runValues),
    photoEntries: photoDoc?.entries || [],
    photoDocTitle: `Fotodokumentation - ${runTitle}`,
  });

  return merged.bytes;
}

export async function buildAndCacheRunPreview({
  templateBytes,
  setupModel,
  runValues,
  photoDoc,
  runTitle,
  mode,
}: {
  templateBytes: Uint8Array;
  setupModel: SetupModel;
  runValues: Record<string, unknown>;
  photoDoc: PhotoDoc;
  runTitle: string;
  mode?: ExportMode;
}): Promise<string> {
  const bytes = await buildRunPreviewBytes({
    templateBytes,
    setupModel,
    runValues,
    photoDoc,
    runTitle,
    mode,
  });
  return cachePdfBytes(bytes, `${sanitizeFileName(runTitle)}_preview.pdf`);
}
