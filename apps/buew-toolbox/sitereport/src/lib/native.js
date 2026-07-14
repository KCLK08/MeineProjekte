import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

export function getNativePlatform() {
  return Capacitor.getPlatform();
}

export async function saveXlsxToFiles({ filename, base64Data }) {
  return saveBase64File({ filename, base64Data });
}

export async function shareXlsx({ filename, base64Data }) {
  const uri = await saveBase64File({ filename, base64Data });
  await shareFile({
    uri,
    title: filename,
    text: 'Baustellen-Protokoll',
    dialogTitle: 'Protokoll teilen'
  });
}

export async function saveBase64File({ filename, base64Data }) {
  const cleanedData = String(base64Data || '').replace(/\s+/g, '');
  const path = `SiteReport/${filename}`;

  if (Capacitor.getPlatform() === 'android') {
    try {
      const current = await Filesystem.checkPermissions();
      if (current?.publicStorage && current.publicStorage !== 'granted') {
        await Filesystem.requestPermissions();
      }
    } catch {
      // ignore permission API errors on platforms where this is not required
    }
  }

  try {
    const result = await Filesystem.writeFile({
      path,
      data: cleanedData,
      directory: Directory.Documents,
      recursive: true
    });
    return result.uri;
  } catch (err) {
    if (Capacitor.getPlatform() === 'android') {
      throw err;
    }
    const fallback = await Filesystem.writeFile({
      path,
      data: cleanedData,
      directory: Directory.Cache,
      recursive: true
    });
    return fallback.uri;
  }
}

export async function shareFile({ uri, title, text = 'Baustellen-Protokoll', dialogTitle = 'Datei teilen' }) {
  await Share.share({
    title,
    text,
    url: uri,
    dialogTitle
  });
}

export async function bufferToBase64(buffer) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('Base64-Konvertierung fehlgeschlagen.'));
        return;
      }
      resolve(dataUrl.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Base64-Konvertierung fehlgeschlagen.'));
    reader.readAsDataURL(blob);
  });
}

export function getXlsxMime() {
  return XLSX_MIME;
}
