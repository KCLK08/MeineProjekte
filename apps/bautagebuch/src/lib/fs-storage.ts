import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const IDB_NAME = 'bautagebuch-fs';
const IDB_STORE = 'files';
const WEB_DOC = 'idbfs://documents/';
const WEB_CACHE = 'idbfs://cache/';

export const EncodingType = FileSystem.EncodingType;

export const documentDirectory =
  Platform.OS === 'web' ? WEB_DOC : FileSystem.documentDirectory || WEB_DOC;

export const cacheDirectory =
  Platform.OS === 'web' ? WEB_CACHE : FileSystem.cacheDirectory || WEB_CACHE;

function isWebFsPath(uri: string) {
  return String(uri || '').startsWith('idbfs://');
}

function isRemoteOrInlineUri(uri: string) {
  return /^(blob:|data:|https?:|file:)/i.test(String(uri || ''));
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB konnte nicht geöffnet werden.'));
  });
}

async function idbGet(path: string): Promise<string | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(path);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
    req.onerror = () => reject(req.error || new Error('IndexedDB lesen fehlgeschlagen.'));
  });
}

async function idbSet(path: string, value: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, path);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('IndexedDB schreiben fehlgeschlagen.'));
  });
}

async function idbDelete(path: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(path);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('IndexedDB löschen fehlgeschlagen.'));
  });
}

async function fetchAsBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) {
    const comma = uri.indexOf(',');
    if (comma < 0) throw new Error('Ungültige data-URI.');
    const meta = uri.slice(0, comma);
    const payload = uri.slice(comma + 1);
    if (/;base64/i.test(meta)) return payload;
    return btoa(decodeURIComponent(payload));
  }

  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Datei konnte nicht geladen werden (${response.status}).`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function makeDirectoryAsync(_uri: string, _options?: { intermediates?: boolean }) {
  if (Platform.OS === 'web') return;
  await FileSystem.makeDirectoryAsync(_uri, _options);
}

export async function writeAsStringAsync(
  uri: string,
  contents: string,
  options?: { encoding?: string }
) {
  if (Platform.OS === 'web' || isWebFsPath(uri)) {
    await idbSet(uri, contents);
    return;
  }
  await FileSystem.writeAsStringAsync(uri, contents, options as { encoding: FileSystem.EncodingType });
}

export async function readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string> {
  if (isWebFsPath(uri)) {
    const value = await idbGet(uri);
    if (value == null) throw new Error(`Datei nicht gefunden: ${uri}`);
    return value;
  }

  if (Platform.OS === 'web' || isRemoteOrInlineUri(uri)) {
    return fetchAsBase64(uri);
  }

  return FileSystem.readAsStringAsync(uri, options as { encoding: FileSystem.EncodingType });
}

export async function deleteAsync(uri: string, options?: { idempotent?: boolean }) {
  if (/^(data:|blob:|download:)/i.test(String(uri || ''))) return;

  if (Platform.OS === 'web' || isWebFsPath(uri)) {
    try {
      await idbDelete(uri);
    } catch (error) {
      if (!options?.idempotent) throw error;
    }
    return;
  }
  await FileSystem.deleteAsync(uri, options);
}

export async function copyAsync({ from, to }: { from: string; to: string }) {
  if (Platform.OS === 'web' || isWebFsPath(to) || isWebFsPath(from) || isRemoteOrInlineUri(from)) {
    const base64 = await readAsStringAsync(from, { encoding: EncodingType.Base64 });
    await writeAsStringAsync(to, base64, { encoding: EncodingType.Base64 });
    return;
  }
  await FileSystem.copyAsync({ from, to });
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Trigger a browser download for PDF/bytes on web. */
export function downloadBytesOnWeb(bytes: Uint8Array, fileName: string, mimeType = 'application/pdf') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
