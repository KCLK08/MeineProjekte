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
  if (!uri) return 'unknown';
  // Encrypted vault paths: …/<hex>.pdf.dat or …/<hex>.jpg.dat
  const enc = uri.match(/\.([a-z0-9]+)\.dat$/i);
  if (enc && uri.includes('familydata-encrypted')) {
    const ext = `.${enc[1].toLowerCase()}`;
    if (PDF_EXT.test(ext)) return 'pdf';
    if (IMAGE_EXT.test(ext)) return 'image';
  }
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

/** A4 portrait – two images share one page (upper + lower half). */
const A4 = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 28;
const SLOT_GAP = 16;

async function embedImageBytes(pdf: PDFDocument, imageBytes: Uint8Array, preferPng: boolean) {
  try {
    return preferPng ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
  } catch {
    return preferPng ? await pdf.embedJpg(imageBytes) : await pdf.embedPng(imageBytes);
  }
}

function drawInSlot(
  page: ReturnType<PDFDocument['addPage']>,
  image: { width: number; height: number },
  slot: { x: number; y: number; width: number; height: number }
) {
  const scale = Math.min(slot.width / image.width, slot.height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = slot.x + (slot.width - w) / 2;
  const y = slot.y + (slot.height - h) / 2;
  page.drawImage(image as never, { x, y, width: w, height: h });
}

/** Single image → upper half of a new A4 page (export helper). */
async function embedImageHalfPage(pdf: PDFDocument, imageBytes: Uint8Array, preferPng: boolean) {
  const image = await embedImageBytes(pdf, imageBytes, preferPng);
  const page = pdf.addPage([A4.width, A4.height]);
  const slotH = (A4.height - PAGE_MARGIN * 2 - SLOT_GAP) / 2;
  drawInSlot(page, image, {
    x: PAGE_MARGIN,
    y: A4.height - PAGE_MARGIN - slotH,
    width: A4.width - PAGE_MARGIN * 2,
    height: slotH,
  });
}

/**
 * Build one PDF from multiple images.
 * Always two images per A4 page (top + bottom half). Odd last image uses the upper half.
 */
export async function buildPdfFromImageUris(uris: string[], suggestedName = 'dokument'): Promise<string> {
  if (!uris.length) throw new Error('Keine Bilder ausgewählt.');
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Kein Cache-Verzeichnis verfügbar.');

  const pdf = await PDFDocument.create();
  const slotH = (A4.height - PAGE_MARGIN * 2 - SLOT_GAP) / 2;
  const slotW = A4.width - PAGE_MARGIN * 2;

  for (let i = 0; i < uris.length; i += 2) {
    const page = pdf.addPage([A4.width, A4.height]);
    const pair = uris.slice(i, i + 2);
    for (let s = 0; s < pair.length; s += 1) {
      const uri = pair[s];
      const base64 = await readBase64(uri);
      const bytes = base64ToUint8Array(base64);
      const lower = (uri.split('?')[0] || '').toLowerCase();
      const preferPng = lower.endsWith('.png');
      const image = await embedImageBytes(pdf, bytes, preferPng);
      const top = s === 0;
      drawInSlot(page, image, {
        x: PAGE_MARGIN,
        y: top ? A4.height - PAGE_MARGIN - slotH : PAGE_MARGIN,
        width: slotW,
        height: slotH,
      });
    }
  }

  const pdfBytes = await pdf.save();
  const safeName = suggestedName.replace(/[^\w\-äöüÄÖÜß]+/g, '_').slice(0, 48) || 'dokument';
  const outPath = `${cacheDir}${safeName}-${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(outPath, uint8ArrayToBase64(pdfBytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return outPath;
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
      'Anhänge können nur im Vault gespeichert werden. Bitte Development Build / Family Vault-APK verwenden.'
    );
  }
  if (!SecurityManager.isUnlocked()) {
    throw new Error('Tresor ist gesperrt. Anhänge werden nicht im Klartext gespeichert.');
  }
  return SecurityManager.encryptIncomingFile(localUri);
}
