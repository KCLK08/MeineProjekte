import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as FileSystem from 'expo-file-system/legacy';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function preferredName(value: unknown, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

function fitIntoBox(sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { width: maxWidth, height: maxHeight };
  }
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

async function readImageBytes(uri: string): Promise<Uint8Array | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function embedImage(pdfDoc: PDFDocument, uri: string, mimeType = 'image/jpeg') {
  const bytes = await readImageBytes(uri);
  if (!bytes) return null;
  if (mimeType.toLowerCase().includes('png')) {
    try {
      return pdfDoc.embedPng(bytes);
    } catch {
      return null;
    }
  }
  try {
    return await pdfDoc.embedJpg(bytes);
  } catch {
    try {
      return pdfDoc.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

function toUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array([]);
}

export async function buildPhotoDocPdfBytes({
  title = 'Fotodokumentation',
  entries = [],
}: {
  title?: string;
  entries?: { photoUri: string; mimeType?: string }[];
} = {}): Promise<Uint8Array> {
  const validEntries = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === 'object');
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 36;
  const columnGap = 14;
  const rowGap = 16;
  const innerPadding = 10;
  const labelHeight = 18;
  const headerHeight = 58;
  const columnCount = 2;
  const rowCount = 2;
  const pageCapacity = columnCount * rowCount;
  const borderColor = rgb(0.86, 0.88, 0.9);
  const cardColor = rgb(0.97, 0.98, 0.99);
  const accentColor = rgb(0.17, 0.24, 0.35);
  const mutedColor = rgb(0.35, 0.38, 0.42);

  if (validEntries.length === 0) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawRectangle({ x: margin, y: A4_HEIGHT - margin - 4, width: A4_WIDTH - margin * 2, height: 4, color: accentColor });
    page.drawText(title, { x: margin, y: A4_HEIGHT - margin - 18, size: 16, font: boldFont, color: accentColor });
    page.drawText('Keine Bilder vorhanden.', { x: margin, y: A4_HEIGHT / 2, size: 12, font: regularFont, color: mutedColor });
    return pdfDoc.save();
  }

  const contentWidth = A4_WIDTH - margin * 2;
  const contentTop = A4_HEIGHT - margin - headerHeight;
  const usableHeight = contentTop - margin;
  const cellWidth = (contentWidth - columnGap * (columnCount - 1)) / columnCount;
  const cellHeight = (usableHeight - rowGap * (rowCount - 1)) / rowCount;

  for (let pageIndex = 0; pageIndex * pageCapacity < validEntries.length; pageIndex += 1) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawRectangle({ x: margin, y: A4_HEIGHT - margin - 4, width: A4_WIDTH - margin * 2, height: 4, color: accentColor });
    page.drawText(title, { x: margin, y: A4_HEIGHT - margin - 20, size: 16, font: boldFont, color: accentColor });

    const startIndex = pageIndex * pageCapacity + 1;
    const endIndex = Math.min((pageIndex + 1) * pageCapacity, validEntries.length);
    page.drawText(`Einträge ${startIndex}-${endIndex} von ${validEntries.length}`, {
      x: margin,
      y: A4_HEIGHT - margin - 38,
      size: 10,
      font: regularFont,
      color: mutedColor,
    });

    const pageEntries = validEntries.slice(pageIndex * pageCapacity, (pageIndex + 1) * pageCapacity);
    for (let itemIndex = 0; itemIndex < pageEntries.length; itemIndex += 1) {
      const entry = pageEntries[itemIndex];
      const absoluteIndex = pageIndex * pageCapacity + itemIndex;
      const rowIndex = Math.floor(itemIndex / columnCount);
      const columnIndex = itemIndex % columnCount;
      const x = margin + columnIndex * (cellWidth + columnGap);
      const top = contentTop - rowIndex * (cellHeight + rowGap);
      const y = top - cellHeight;

      page.drawRectangle({ x, y, width: cellWidth, height: cellHeight, color: cardColor, borderColor, borderWidth: 1 });
      page.drawRectangle({ x, y: top - 4, width: cellWidth, height: 4, color: accentColor });

      const badgeText = `Bild ${absoluteIndex + 1}`;
      const badgePadding = 8;
      const badgeWidth = Math.min(cellWidth - innerPadding * 2, boldFont.widthOfTextAtSize(badgeText, 10) + badgePadding * 2);
      const badgeX = x + innerPadding;
      const badgeY = top - innerPadding - labelHeight;
      page.drawRectangle({ x: badgeX, y: badgeY, width: badgeWidth, height: labelHeight, color: accentColor });
      page.drawText(badgeText, { x: badgeX + badgePadding, y: badgeY + 4, size: 10, font: boldFont, color: rgb(1, 1, 1) });

      const imageX = x + innerPadding;
      const imageY = y + innerPadding;
      const imageWidth = cellWidth - innerPadding * 2;
      const imageHeight = cellHeight - innerPadding * 2 - labelHeight - 6;
      page.drawRectangle({ x: imageX, y: imageY, width: imageWidth, height: imageHeight, borderColor, borderWidth: 1 });

      const embeddedImage = entry?.photoUri ? await embedImage(pdfDoc, entry.photoUri, entry.mimeType) : null;
      if (!embeddedImage) {
        page.drawText('Kein Bild vorhanden', {
          x: imageX + 10,
          y: imageY + imageHeight / 2 - 6,
          size: 10,
          font: regularFont,
          color: mutedColor,
        });
        continue;
      }

      const fittedImage = fitIntoBox(embeddedImage.width, embeddedImage.height, imageWidth, imageHeight);
      const drawX = imageX + (imageWidth - fittedImage.width) / 2;
      const drawY = imageY + (imageHeight - fittedImage.height) / 2;
      page.drawImage(embeddedImage, { x: drawX, y: drawY, width: fittedImage.width, height: fittedImage.height });
    }
  }

  return pdfDoc.save();
}

async function appendPdfBytes(basePdfBytes: Uint8Array, appendixPdfBytes: Uint8Array) {
  const outputPdf = await PDFDocument.create();
  const basePdf = await PDFDocument.load(basePdfBytes);
  const basePages = await outputPdf.copyPages(basePdf, basePdf.getPageIndices());
  for (const page of basePages) outputPdf.addPage(page);

  if (appendixPdfBytes) {
    const appendixPdf = await PDFDocument.load(appendixPdfBytes);
    const appendixPages = await outputPdf.copyPages(appendixPdf, appendixPdf.getPageIndices());
    for (const page of appendixPages) outputPdf.addPage(page);
  }

  return outputPdf.save();
}

export async function mergeBtbWithPhotoDoc({
  btbPdfBytes,
  photoDocEnabled = false,
  photoEntries = [],
  photoDocTitle = 'Fotodokumentation',
}: {
  btbPdfBytes: Uint8Array | ArrayBuffer;
  photoDocEnabled?: boolean;
  photoEntries?: { photoUri: string; mimeType?: string }[];
  photoDocTitle?: string;
}) {
  const baseBytes = toUint8Array(btbPdfBytes as Uint8Array);
  const enabled = photoDocEnabled === true;
  const validEntries = (Array.isArray(photoEntries) ? photoEntries : []).filter((e) => String(e?.photoUri || '').trim());

  if (!enabled || validEntries.length === 0) {
    return {
      bytes: baseBytes,
      appended: false,
      enabledWithoutImages: enabled && validEntries.length === 0,
    };
  }

  const photoDocBytes = await buildPhotoDocPdfBytes({ title: photoDocTitle, entries: validEntries });
  return {
    bytes: await appendPdfBytes(baseBytes, photoDocBytes),
    appended: true,
    enabledWithoutImages: false,
  };
}
