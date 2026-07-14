import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { blobToDataUrl } from './image';
import { bufferToBase64 } from './native';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export async function exportToPdfData({
  protocolTitle,
  projectName,
  protocolDate,
  protocolDescription,
  attendees,
  logoDataUrl,
  columns,
  entries
}) {
  const pdfDoc = await PDFDocument.create();
  const issues = [];
  const addIssue = (message) => {
    if (issues.length < 20) issues.push(message);
  };
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 36;
  const lineHeight = 14;
  const headerGap = 18;
  const blockGap = 20;
  const imageMaxHeight = 260;
  const placeholderHeight = 170;
  const tableGap = 12;
  const headerPadding = 14;
  const cardPadding = 12;
  const cornerColor = rgb(0.17, 0.24, 0.35);
  const softBorder = rgb(0.86, 0.88, 0.9);
  const softBg = rgb(0.97, 0.98, 0.99);
  const rowAlt = rgb(0.96, 0.97, 0.98);

  let page = null;
  let cursorY = 0;

  const headerLines = [
    `Projekt: ${projectName || ''}`,
    `Datum: ${protocolDate || ''}`,
    `Beschreibung: ${protocolDescription || ''}`,
    `Anwesende Personen: ${attendees || ''}`
  ];

  const drawHeader = async () => {
    const pageWidth = A4_WIDTH;
    const pageHeight = A4_HEIGHT;
    const headerTop = pageHeight - margin;
    const headerWidth = pageWidth - margin * 2;

    let logoWidth = 0;
    let logoHeight = 0;
    let logoImage = null;
    if (logoDataUrl) {
      const { bytes, extension } = dataUrlToBytes(logoDataUrl);
      if (extension === 'png') {
        logoImage = await pdfDoc.embedPng(bytes);
      } else {
        logoImage = await pdfDoc.embedJpg(bytes);
      }
      const maxLogoW = 120;
      const maxLogoH = 60;
      const scale = Math.min(maxLogoW / logoImage.width, maxLogoH / logoImage.height, 1);
      logoWidth = logoImage.width * scale;
      logoHeight = logoImage.height * scale;
    }

    const title = protocolTitle || 'Protokoll';
    const titleSize = 16;
    const headerTextHeight = headerLines.length * lineHeight + titleSize + 6;
    const headerHeight = Math.max(headerTextHeight, logoHeight);
    const headerBoxHeight = headerHeight + headerPadding * 2;

    const headerBottom = headerTop - headerBoxHeight;
    page.drawRectangle({
      x: margin,
      y: headerBottom,
      width: headerWidth,
      height: headerBoxHeight,
      color: softBg,
      borderColor: softBorder,
      borderWidth: 1
    });

    page.drawRectangle({
      x: margin,
      y: headerTop - 4,
      width: headerWidth,
      height: 4,
      color: cornerColor
    });

    let textY = headerTop - headerPadding - titleSize;
    page.drawText(title, {
      x: margin + headerPadding,
      y: textY,
      size: titleSize,
      font: fontBold,
      color: cornerColor
    });
    textY -= 8;
    for (const line of headerLines) {
      textY -= lineHeight;
      page.drawText(line, {
        x: margin + headerPadding,
        y: textY,
        size: 11,
        font,
        color: rgb(0.1, 0.1, 0.1)
      });
    }

    if (logoImage) {
      const logoX = pageWidth - margin - headerPadding - logoWidth;
      const logoY = headerTop - headerPadding - logoHeight;
      page.drawImage(logoImage, {
        x: logoX,
        y: logoY,
        width: logoWidth,
        height: logoHeight
      });
    }

    return headerBottom - headerGap;
  };

  let isFirstPage = true;
  const startPage = async () => {
    page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    if (isFirstPage) {
      cursorY = await drawHeader();
      isFirstPage = false;
    } else {
      cursorY = A4_HEIGHT - margin;
    }
  };

  const tableColumns = columns.filter((c) => !c.isPhoto);
  const blockWidth = A4_WIDTH - margin * 2;
  const labelWidth = blockWidth * 0.35;
  const valueWidth = blockWidth - labelWidth - 8;

  const wrapText = (text, maxWidth) => {
    if (!text) return ['—'];
    const words = String(text).split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, 11) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : ['—'];
  };

  const drawEntry = async (entry, index) => {
    let imageHeight = placeholderHeight;
    let imageWidth = blockWidth;
    let image = null;
    let imageIsPlaceholder = false;

    if (entry.photoBlob) {
      try {
        const dataUrl = await blobToDataUrl(entry.photoBlob);
        const { bytes, extension } = dataUrlToBytes(dataUrl);
        image = extension === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const scale = Math.min(blockWidth / image.width, imageMaxHeight / image.height, 1);
        imageWidth = image.width * scale;
        imageHeight = image.height * scale;
      } catch (err) {
        imageIsPlaceholder = true;
        imageWidth = blockWidth;
        imageHeight = placeholderHeight;
        addIssue(`Eintrag ${index + 1}: Bild konnte nicht eingebettet werden (${err?.message || 'Unbekannt'}).`);
      }
    } else {
      imageIsPlaceholder = true;
      imageWidth = blockWidth;
      imageHeight = placeholderHeight;
    }

    const rows = tableColumns.map((col) => ({
      label: col.name,
      value: entry.fields?.[col.name] ?? ''
    }));

    let tableHeight = 0;
    const rowHeights = rows.map((row) => {
      const labelLines = wrapText(row.label, labelWidth - 6);
      const valueLines = wrapText(row.value, valueWidth - 6);
      const lines = Math.max(labelLines.length, valueLines.length);
      const height = lines * lineHeight + 6;
      tableHeight += height;
      return { height, labelLines, valueLines };
    });

    const blockHeight = imageHeight + tableGap + tableHeight + blockGap + cardPadding * 2;
    if (!page || cursorY - blockHeight < margin) {
      await startPage();
    }

    const cardTop = cursorY;
    const cardBottom = cursorY - (imageHeight + tableGap + tableHeight + cardPadding * 2);
    page.drawRectangle({
      x: margin,
      y: cardBottom,
      width: blockWidth,
      height: cardTop - cardBottom,
      color: softBg,
      borderColor: softBorder,
      borderWidth: 1
    });

    const imageX = margin + cardPadding + (blockWidth - cardPadding * 2 - imageWidth) / 2;
    const imageY = cardTop - cardPadding - imageHeight;

    const badgeText = `Bild ${index + 1}`;
    const badgeHeight = 18;
    const badgePaddingX = 8;
    const badgeWidth = Math.min(
      blockWidth - cardPadding * 2,
      fontBold.widthOfTextAtSize(badgeText, 10) + badgePaddingX * 2
    );
    const badgeX = margin + cardPadding;
    const badgeY = cardTop - cardPadding - badgeHeight;
    page.drawRectangle({
      x: badgeX,
      y: badgeY,
      width: badgeWidth,
      height: badgeHeight,
      color: cornerColor
    });
    page.drawText(badgeText, {
      x: badgeX + badgePaddingX,
      y: badgeY + 4,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    if (imageIsPlaceholder) {
      page.drawRectangle({
        x: margin + cardPadding,
        y: imageY,
        width: blockWidth - cardPadding * 2,
        height: imageHeight,
        borderColor: softBorder,
        borderWidth: 1
      });
      page.drawText('Kein Bild vorhanden', {
        x: margin + cardPadding + 12,
        y: imageY + imageHeight / 2 - 6,
        size: 11,
        font,
        color: rgb(0.45, 0.47, 0.5)
      });
    } else if (image) {
      page.drawImage(image, {
        x: imageX,
        y: imageY,
        width: imageWidth,
        height: imageHeight
      });
    }

    let tableTop = imageY - tableGap;
    const tableLeft = margin + cardPadding;
    const tableRight = margin + blockWidth - cardPadding;
    const dividerX = tableLeft + labelWidth + 4;
    const textPadding = 4;

    page.drawLine({
      start: { x: tableLeft, y: tableTop },
      end: { x: tableRight, y: tableTop },
      thickness: 1,
      color: softBorder
    });

    rowHeights.forEach((rowData, idx) => {
      const row = rows[idx];
      const rowBottom = tableTop - rowData.height;
      if (idx % 2 === 1) {
        page.drawRectangle({
          x: tableLeft,
          y: rowBottom,
          width: tableRight - tableLeft,
          height: rowData.height,
          color: rowAlt
        });
      }

      const labelY = tableTop - lineHeight;
      rowData.labelLines.forEach((line, i) => {
        page.drawText(line, {
          x: tableLeft + textPadding,
          y: labelY - i * lineHeight,
          size: 11,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1)
        });
      });

      const valueY = tableTop - lineHeight;
      rowData.valueLines.forEach((line, i) => {
        page.drawText(line, {
          x: dividerX + textPadding,
          y: valueY - i * lineHeight,
          size: 11,
          font,
          color: rgb(0.1, 0.1, 0.1)
        });
      });

      page.drawLine({
        start: { x: tableLeft, y: rowBottom },
        end: { x: tableRight, y: rowBottom },
        thickness: 1,
        color: softBorder
      });

      tableTop = rowBottom;
    });

    page.drawLine({
      start: { x: dividerX, y: imageY - tableGap },
      end: { x: dividerX, y: imageY - tableGap - tableHeight },
      thickness: 1,
      color: softBorder
    });

    cursorY = tableTop - blockGap;
  };

  await startPage();
  let exportedEntries = 0;
  for (const [idx, entry] of entries.entries()) {
    try {
      await drawEntry(entry, idx);
      exportedEntries += 1;
    } catch (err) {
      addIssue(`Eintrag ${idx + 1}: PDF-Block konnte nicht erstellt werden (${err?.message || 'Unbekannt'}).`);
    }
  }

  const pdfBytes = await pdfDoc.save();
  const filename = buildPdfFilename(projectName, protocolDate);
  const base64 = await bufferToBase64(pdfBytes);
  return {
    filename,
    base64,
    stats: {
      format: 'pdf',
      requestedEntries: entries.length,
      exportedEntries,
      issues
    }
  };
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl).match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) {
    return { bytes: new Uint8Array(), extension: 'jpg' };
  }
  const extension = match[1].toLowerCase() === 'png' ? 'png' : 'jpg';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, extension };
}

function sanitizeFilename(name) {
  const clean = (name || 'protokoll').replace(/[^a-z0-9\-_. ]/gi, '_').trim();
  return clean.length ? clean : 'protokoll';
}

function buildPdfFilename(projectName, protocolDate) {
  const namePart = sanitizeFilename(projectName);
  const datePart = sanitizeFilename(protocolDate || new Date().toISOString().slice(0, 10));
  return `${namePart}_${datePart}.pdf`;
}
