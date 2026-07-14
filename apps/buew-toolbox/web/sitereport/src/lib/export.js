import ExcelJS from 'exceljs';
import { blobToDataUrl } from './image';
import { bufferToBase64, getXlsxMime, isNativePlatform, saveXlsxToFiles } from './native';

export async function exportToXlsx({
  protocolTitle,
  projectName,
  protocolDate,
  protocolDescription,
  attendees,
  logoDataUrl,
  columns,
  entries
}) {
  const { workbook, stats } = await buildWorkbook({
    protocolTitle,
    projectName,
    protocolDate,
    protocolDescription,
    attendees,
    logoDataUrl,
    columns,
    entries
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = buildFilename(projectName, protocolDate);
  const base64 = await bufferToBase64(buffer);

  if (isNativePlatform()) {
    await saveXlsxToFiles({ filename, base64Data: base64 });
    return { filename, base64, stats };
  }

  const blob = new Blob([buffer], { type: getXlsxMime() });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
  return { filename, base64, stats };
}

export async function exportToXlsxData({
  protocolTitle,
  projectName,
  protocolDate,
  protocolDescription,
  attendees,
  logoDataUrl,
  columns,
  entries
}) {
  const { workbook, stats } = await buildWorkbook({
    protocolTitle,
    projectName,
    protocolDate,
    protocolDescription,
    attendees,
    logoDataUrl,
    columns,
    entries
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = buildFilename(projectName, protocolDate);
  const base64 = await bufferToBase64(buffer);
  return { filename, base64, stats };
}

export async function exportToXlsxShare({
  projectName,
  protocolDate,
  protocolDescription,
  attendees,
  logoDataUrl,
  columns,
  entries,
  shareFn
}) {
  const { workbook, stats } = await buildWorkbook({
    protocolTitle,
    projectName,
    protocolDate,
    protocolDescription,
    attendees,
    logoDataUrl,
    columns,
    entries
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = buildFilename(projectName, protocolDate);
  const base64 = await bufferToBase64(buffer);

  await shareFn({ filename, base64Data: base64 });
  return { filename, base64, stats };
}

async function buildWorkbook({
  protocolTitle,
  projectName,
  protocolDate,
  protocolDescription,
  attendees,
  logoDataUrl,
  columns,
  entries
}) {
  const workbook = new ExcelJS.Workbook();
  const issues = [];
  const addIssue = (message) => {
    if (issues.length < 20) issues.push(message);
  };
  workbook.creator = 'SiteReport';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Protokoll');

  const totalCols = 1 + columns.length;
  const minCellWidthPx = 160;
  const minCellHeightPx = 110;
  const maxCellWidthPx = 360;
  const maxCellHeightPx = 260;
  const colPx = (colWidth) => colWidth * 7 + 5;
  const rowPx = (rowHeightPts) => rowHeightPts * (96 / 72);
  const colWidthFromPx = (px) => Math.max(1, Math.round((px - 5) / 7));
  const rowHeightFromPx = (px) => Math.max(1, Math.round(px / (96 / 72)));

  const headerLines = [
    { label: 'Protokoll-Name', value: protocolTitle || '' },
    { label: 'Projekt', value: projectName || '' },
    { label: 'Datum', value: protocolDate || '' },
    { label: 'Beschreibung', value: protocolDescription || '' },
    { label: 'Anwesende Personen', value: attendees || '' }
  ];
  worksheet.addRow([headerLines[0]]);
  worksheet.addRow([headerLines[1]]);
  worksheet.addRow([headerLines[2]]);
  worksheet.addRow([headerLines[3]]);
  worksheet.addRow([headerLines[4]]);
  worksheet.addRow([]);

  // Merge metadata rows across full table width
  if (totalCols > 1) {
    worksheet.mergeCells(1, 1, 5, totalCols);
  }

  const headerStartRow = 7;
  const photoColumn = columns.find((c) => c.isPhoto);
  const photoColIndex = photoColumn ? columns.indexOf(photoColumn) + 2 : null;
  const photoCache = new Map();
  let maxImgW = 0;
  let maxImgH = 0;
  for (const [idx, entry] of entries.entries()) {
    if (!entry.photoBlob) continue;
    try {
      const dataUrl = await blobToDataUrl(entry.photoBlob);
      const { width, height } = await getImageSize(dataUrl);
      photoCache.set(entry.id, { dataUrl, width, height });
      maxImgW = Math.max(maxImgW, width || 0);
      maxImgH = Math.max(maxImgH, height || 0);
    } catch (err) {
      addIssue(`Eintrag ${idx + 1}: Bild konnte nicht vorbereitet werden (${err?.message || 'Unbekannt'}).`);
    }
  }
  const scaleDown = Math.min(
    maxCellWidthPx / (maxImgW || maxCellWidthPx),
    maxCellHeightPx / (maxImgH || maxCellHeightPx),
    1
  );
  const scaledMaxImgW = maxImgW ? Math.round(maxImgW * scaleDown) : minCellWidthPx;
  const scaledMaxImgH = maxImgH ? Math.round(maxImgH * scaleDown) : minCellHeightPx;

  const desiredCellWidthPx = Math.max(scaledMaxImgW, minCellWidthPx);
  const desiredCellHeightPx = Math.max(scaledMaxImgH, minCellHeightPx);

  const photoColWidth = colWidthFromPx(desiredCellWidthPx);
  const rowHeight = rowHeightFromPx(desiredCellHeightPx);
  const cellWidthPx = colPx(photoColWidth);
  const cellHeightPx = rowPx(rowHeight);
  const headerRowValues = ['Nr.', ...columns.map((col) => col.name)];

  worksheet.spliceRows(headerStartRow, 0, headerRowValues);

  const headerCell = worksheet.getCell(1, 1);
  headerCell.value = {
    richText: headerLines.flatMap((line, idx) => {
      const isTitle = idx === 0 && line.label === 'Protokoll-Name';
      const parts = [
        ...(isTitle
          ? [{ text: line.value || '—', font: { bold: true, size: 14 } }]
          : [
              { text: `${line.label}: `, font: { bold: true } },
              { text: line.value || '—', font: { bold: false } }
            ])
      ];
      if (idx < headerLines.length - 1) {
        parts.push({ text: '\n', font: { bold: false } });
      }
      return parts;
    })
  };
  headerCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF111827' } };
  headerCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  headerCell.border = {
    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
  };

  const headerRow = worksheet.getRow(headerStartRow);
  for (let c = 1; c <= totalCols; c += 1) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  headerRow.height = 22;

  worksheet.getColumn(1).width = 6;
  columns.forEach((col, idx) => {
    const columnIndex = idx + 2;
    worksheet.getColumn(columnIndex).width = col.isPhoto ? photoColWidth : 22;
  });

  if (logoDataUrl) {
    const { base64, extension } = extractImageData(logoDataUrl);
    if (base64) {
      const logoId = workbook.addImage({ base64, extension });
      const { width: logoW, height: logoH } = await getImageSize(logoDataUrl);
      const maxLogoW = 140;
      const maxLogoH = 70;
      const scale = Math.min(maxLogoW / logoW, maxLogoH / logoH, 1);
      const drawW = logoW * scale;
      const drawH = logoH * scale;
      const logoMargin = 8;

      const row1 = worksheet.getRow(1);
      const textHeightPx = headerLines.length * 18 + 16;
      row1.height = Math.max(
        row1.height || 18,
        rowHeightFromPx(Math.max(drawH + logoMargin * 2, textHeightPx))
      );

      const columnWidthsPx = [];
      for (let i = 1; i <= totalCols; i += 1) {
        const width = worksheet.getColumn(i).width || 10;
        columnWidthsPx.push(colPx(width));
      }
      const totalWidthPx = columnWidthsPx.reduce((sum, w) => sum + w, 0);
      const logoX = Math.max(0, totalWidthPx - drawW - logoMargin);
      const { col: logoCol, offset: logoOffset } = pxToColOffset(logoX, columnWidthsPx);
      const rowHeightPx = rowPx(row1.height || 18);
      const logoY = Math.max(0, logoMargin);
      const rowOffset = logoY / rowHeightPx;

      worksheet.addImage(logoId, {
        tl: { col: logoCol + logoOffset, row: 0 + rowOffset },
        ext: { width: Math.max(1, drawW), height: Math.max(1, drawH) },
        editAs: 'oneCell'
      });
    }
  }
  if (!logoDataUrl) {
    const row1 = worksheet.getRow(1);
    const textHeightPx = headerLines.length * 18 + 16;
    row1.height = Math.max(row1.height || 18, rowHeightFromPx(textHeightPx));
  }


  let rowNumber = 1;
  for (const [idx, entry] of entries.entries()) {
    const rowValues = [rowNumber];
    for (const col of columns) {
      if (!col.isPhoto) {
        rowValues.push(entry.fields?.[col.name] ?? '');
      } else {
        rowValues.push('');
      }
    }
    const row = worksheet.addRow(rowValues);
    row.height = rowHeight;
    row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

    columns.forEach((col, idx) => {
      if (col.type === 'number') {
        const cell = row.getCell(idx + 2);
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    });
    if (photoColIndex) {
      const cell = row.getCell(photoColIndex);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    if (photoColIndex && entry.photoBlob) {
      try {
        const cached = photoCache.get(entry.id);
        const dataUrl = cached?.dataUrl || (await blobToDataUrl(entry.photoBlob));
        const base64 = stripDataUrlPrefix(dataUrl);
        const extension = getImageExtension(entry.photoBlob.type);
        const imageId = workbook.addImage({
          base64,
          extension
        });

        const imgW = cached?.width || 1;
        const imgH = cached?.height || 1;
        const maxW = Math.max(1, cellWidthPx);
        const maxH = Math.max(1, cellHeightPx);
        let scale = Math.min(maxW / imgW, maxH / imgH);
        if (!Number.isFinite(scale) || scale <= 0) {
          scale = 1;
        }
        const scaledW = imgW * scale;
        const scaledH = imgH * scale;
        const colWidthUnits =
          worksheet.getColumn(photoColIndex).isCustomWidth && worksheet.getColumn(photoColIndex).width
            ? Math.floor(worksheet.getColumn(photoColIndex).width * 10000)
            : 640000;
        const rowHeightUnits = row.height ? Math.floor(row.height * 10000) : 180000;
        const imageFracW = Math.min(1, scaledW / cellWidthPx);
        const imageFracH = Math.min(1, scaledH / cellHeightPx);
        const colOff = Math.round(((1 - imageFracW) / 2) * colWidthUnits);
        const rowOff = Math.round(((1 - imageFracH) / 2) * rowHeightUnits);
        worksheet.addImage(imageId, {
          tl: {
            nativeCol: photoColIndex - 1,
            nativeRow: row.number - 1,
            nativeColOff: colOff,
            nativeRowOff: rowOff
          },
          ext: { width: Math.max(1, scaledW), height: Math.max(1, scaledH) },
          editAs: 'oneCell'
        });
      } catch (err) {
        addIssue(`Eintrag ${idx + 1}: Bild konnte nicht eingebettet werden (${err?.message || 'Unbekannt'}).`);
      }
    }
    rowNumber += 1;
  }

  const tableRange = {
    from: { row: headerStartRow, col: 1 },
    to: { row: headerStartRow + entries.length, col: totalCols }
  };

  for (let r = tableRange.from.row; r <= tableRange.to.row; r += 1) {
    const row = worksheet.getRow(r);
    for (let c = tableRange.from.col; c <= tableRange.to.col; c += 1) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
    }
  }

  return {
    workbook,
    stats: {
      format: 'xlsx',
      requestedEntries: entries.length,
      exportedEntries: entries.length,
      issues
    }
  };
}

function sanitizeFilename(name) {
  const clean = (name || 'protokoll').replace(/[^a-z0-9\-_. ]/gi, '_').trim();
  return clean.length ? clean : 'protokoll';
}

function buildFilename(projectName, protocolDate) {
  const namePart = sanitizeFilename(projectName);
  const datePart = sanitizeFilename(protocolDate || new Date().toISOString().slice(0, 10));
  return `${namePart}_${datePart}.xlsx`;
}

function extractImageData(dataUrl) {
  const match = String(dataUrl).match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) {
    return { base64: '', extension: 'jpeg' };
  }
  const extension = match[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
  return { base64: match[2], extension };
}

function pxToColOffset(px, columnWidthsPx) {
  let remaining = px;
  for (let i = 0; i < columnWidthsPx.length; i += 1) {
    const width = columnWidthsPx[i];
    if (remaining <= width) {
      return { col: i, offset: width ? remaining / width : 0 };
    }
    remaining -= width;
  }
  return { col: columnWidthsPx.length - 1, offset: 0 };
}

function getImageExtension(mime) {
  if (!mime) return 'jpeg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic') || mime.includes('heif')) return 'jpeg';
  return 'jpeg';
}

function getImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width || 1, height: img.height || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

function stripDataUrlPrefix(dataUrl) {
  const idx = dataUrl.indexOf(',');
  return idx === -1 ? dataUrl : dataUrl.slice(idx + 1);
}
