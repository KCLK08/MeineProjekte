function nowIso() {
  return new Date().toISOString();
}

export function photoAssetKey(runId, entryId) {
  return `${String(runId || '').trim()}::${String(entryId || '').trim()}`;
}

export function revivePhotoBlob(value, mimeType = 'image/jpeg') {
  if (value instanceof Blob) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Blob([value], { type: mimeType });
  }
  if (ArrayBuffer.isView(value)) {
    return new Blob([value], { type: mimeType });
  }
  if (value && typeof value === 'object') {
    const nestedType = String(value.type || value.mimeType || mimeType).trim() || mimeType;
    if (value.data instanceof ArrayBuffer) {
      return new Blob([value.data], { type: nestedType });
    }
    if (ArrayBuffer.isView(value.data)) {
      return new Blob([value.data], { type: nestedType });
    }
    const base64 = String(value.base64 || '').trim();
    if (base64) {
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return new Blob([bytes], { type: nestedType });
      } catch {
        return null;
      }
    }
    const dataUrl = String(value.dataUrl || '').trim();
    if (dataUrl.startsWith('data:')) {
      try {
        const [header, encoded] = dataUrl.split(',');
        const typeMatch = header.match(/data:([^;]+)/);
        const resolvedType = typeMatch?.[1] || nestedType;
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return new Blob([bytes], { type: resolvedType });
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function blobToArrayBuffer(blob) {
  if (!(blob instanceof Blob)) {
    return null;
  }
  try {
    const buffer = await blob.arrayBuffer();
    return buffer instanceof ArrayBuffer && buffer.byteLength > 0 ? buffer : null;
  } catch {
    return null;
  }
}

export async function preparePhotoDocForStorage(runId, photoDoc = {}) {
  const normalizedRunId = String(runId || '').trim();
  const rawEntries = Array.isArray(photoDoc?.entries) ? photoDoc.entries : [];
  const storedEntries = [];
  const assets = [];
  const activeEntryIds = new Set();

  for (const entry of rawEntries) {
    const entryId = String(entry?.id || '').trim();
    if (!entryId) {
      continue;
    }
    const mimeType = String(entry?.mimeType || entry?.photoBlob?.type || 'image/jpeg').trim() || 'image/jpeg';
    const createdAt = String(entry?.createdAt || '').trim() || nowIso();
    let data = null;

    if (entry?.photoBlob instanceof Blob) {
      data = await blobToArrayBuffer(entry.photoBlob);
    } else {
      const revived = revivePhotoBlob(entry?.photoBlob, mimeType);
      if (revived) {
        data = await blobToArrayBuffer(revived);
      }
    }

    storedEntries.push({
      id: entryId,
      createdAt,
      mimeType
    });
    activeEntryIds.add(entryId);

    if (!normalizedRunId || !data) {
      continue;
    }

    assets.push({
      id: photoAssetKey(normalizedRunId, entryId),
      runId: normalizedRunId,
      entryId,
      mimeType,
      data,
      updatedAt: nowIso()
    });
  }

  return {
    photoDocForRun: {
      enabled: photoDoc?.enabled ?? null,
      entries: storedEntries,
      updatedAt: String(photoDoc?.updatedAt || '').trim() || nowIso()
    },
    assets,
    activeEntryIds
  };
}

export async function hydratePhotoDoc(runId, photoDoc = {}, loadAsset) {
  if (!photoDoc || typeof photoDoc !== 'object') {
    return photoDoc;
  }

  const normalizedRunId = String(runId || '').trim();
  const rawEntries = Array.isArray(photoDoc.entries) ? photoDoc.entries : [];
  const hydratedEntries = [];

  for (const entry of rawEntries) {
    const entryId = String(entry?.id || '').trim();
    if (!entryId) {
      continue;
    }
    const mimeType = String(entry?.mimeType || 'image/jpeg').trim() || 'image/jpeg';
    let photoBlob = null;

    if (typeof loadAsset === 'function' && normalizedRunId) {
      const asset = await loadAsset(photoAssetKey(normalizedRunId, entryId));
      if (asset?.data) {
        photoBlob = revivePhotoBlob(
          {
            mimeType: asset.mimeType || mimeType,
            data: asset.data
          },
          mimeType
        );
      }
    }

    if (!(photoBlob instanceof Blob)) {
      photoBlob = revivePhotoBlob(entry?.photoBlob, mimeType);
    }

    if (!(photoBlob instanceof Blob)) {
      continue;
    }

    hydratedEntries.push({
      id: entryId,
      createdAt: String(entry?.createdAt || '').trim() || nowIso(),
      mimeType: String(photoBlob.type || mimeType).trim() || mimeType,
      photoBlob
    });
  }

  return {
    ...photoDoc,
    entries: hydratedEntries
  };
}
