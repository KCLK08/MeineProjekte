import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { PDFDocument } from 'pdf-lib';

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|bmp)$/i;
const PDF_EXT = /\.pdf$/i;

export function isImageUri(uri?: string | null) {
  if (!uri) return false;
  const clean = uri.split('?')[0] || uri;
  return IMAGE_EXT.test(clean) || clean.includes('ImagePicker') || clean.includes('/ImagePicker/');
}

export function isPdfUri(uri?: string | null) {
  if (!uri) return false;
  const clean = uri.split('?')[0] || uri;
  return PDF_EXT.test(clean) || clean.toLowerCase().includes('application/pdf');
}

export function guessFileKind(uri?: string | null): 'image' | 'pdf' | 'unknown' {
  if (isPdfUri(uri)) return 'pdf';
  if (isImageUri(uri)) return 'image';
  return 'unknown';
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

/** A4 points – images are placed in the upper half so they print smaller than full-page. */
const A4 = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 36;

async function embedImageHalfPage(pdf: PDFDocument, imageBytes: Uint8Array, preferPng: boolean) {
  let image;
  try {
    image = preferPng ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
  } catch {
    image = preferPng ? await pdf.embedJpg(imageBytes) : await pdf.embedPng(imageBytes);
  }
  const page = pdf.addPage([A4.width, A4.height]);
  const maxW = A4.width - PAGE_MARGIN * 2;
  const maxH = A4.height / 2 - PAGE_MARGIN;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = (A4.width - w) / 2;
  const y = A4.height - PAGE_MARGIN - h;
  page.drawImage(image, { x, y, width: w, height: h });
}

/** Convert image (or pass-through PDF) into a local PDF, then open the share sheet. */
export async function exportUriAsPdf(uri: string, suggestedName = 'dokument') {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Teilen/Speichern ist auf diesem Gerät nicht verfügbar.');
  }

  const safeName = suggestedName.replace(/[^\w\-äöüÄÖÜß]+/g, '_').slice(0, 48) || 'dokument';
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Kein Cache-Verzeichnis verfügbar.');

  const kind = guessFileKind(uri);
  let outPath = `${cacheDir}${safeName}-${Date.now()}.pdf`;

  if (kind === 'pdf') {
    outPath = `${cacheDir}${safeName}-${Date.now()}.pdf`;
    await FileSystem.copyAsync({ from: uri, to: outPath });
  } else {
    const base64 = await readBase64(uri);
    const bytes = base64ToUint8Array(base64);
    const pdf = await PDFDocument.create();
    const lower = (uri.split('?')[0] || '').toLowerCase();
    const preferPng = lower.endsWith('.png') || kind !== 'image';
    await embedImageHalfPage(pdf, bytes, preferPng);
    const pdfBytes = await pdf.save();
    await FileSystem.writeAsStringAsync(outPath, uint8ArrayToBase64(pdfBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  await Sharing.shareAsync(outPath, {
    mimeType: 'application/pdf',
    dialogTitle: 'Als PDF speichern',
    UTI: 'com.adobe.pdf',
  });
  return outPath;
}

export async function readFileBase64(uri: string) {
  return readBase64(uri);
}

/** Copy picker/cache URIs into a stable app document folder; encrypt when vault is unlocked. */
export async function persistAttachment(uri: string, key: string) {
  const root = FileSystem.documentDirectory;
  if (!root) return uri;

  let localUri = uri;
  if (!uri.startsWith(root) || uri.includes('/familydata-decrypt-tmp/')) {
    const dir = `${root}familydata-files/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const clean = (uri.split('?')[0] || uri).toLowerCase();
    const extMatch = clean.match(/\.([a-z0-9]+)$/);
    const ext = extMatch ? `.${extMatch[1]}` : isPdfUri(uri) ? '.pdf' : '.jpg';
    const dest = `${dir}${key.replace(/[^\w-]+/g, '_')}${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    localUri = dest;
  }

  const { SecurityManager } = await import('@/security/SecurityManager');
  if (!SecurityManager.supportsSqlCipher()) {
    throw new Error(
      'Anhänge können nur im Vault gespeichert werden. Bitte Development Build / FamilyData-APK verwenden.'
    );
  }
  if (!SecurityManager.isUnlocked()) {
    throw new Error('Tresor ist gesperrt. Anhänge werden nicht im Klartext gespeichert.');
  }
  return SecurityManager.encryptIncomingFile(localUri);
}
