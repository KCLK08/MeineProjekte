import imageCompression from 'browser-image-compression';

const DEFAULTS = {
  maxSizeMB: 0.6,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  initialQuality: 0.75,
  fileType: 'image/jpeg'
};

export async function compressImage(file) {
  return imageCompression(file, DEFAULTS);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function blobToObjectUrl(blob) {
  return URL.createObjectURL(blob);
}
