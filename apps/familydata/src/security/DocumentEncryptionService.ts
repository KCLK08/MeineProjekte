import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import { EncryptionService } from '@/security/EncryptionService';
import { wipeBytes } from '@/security/KeyStoreService';

const ENCRYPTED_DIR = 'familydata-encrypted';
const TEMP_DIR = 'familydata-decrypt-tmp';
const ENCRYPTED_EXT = '.dat';
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|bmp)$/i;
const PDF_EXT = /\.pdf$/i;

function rootDir() {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Kein Dokumentverzeichnis verfügbar.');
  return root;
}

function encryptedDir() {
  return `${rootDir()}${ENCRYPTED_DIR}/`;
}

function tempDir() {
  return `${rootDir()}${TEMP_DIR}/`;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function secureDelete(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return;
    }
    const size = typeof info.size === 'number' ? info.size : 0;
    if (size > 0 && size < 8_000_000) {
      const zeros = new Uint8Array(size);
      await FileSystem.writeAsStringAsync(uri, bytesToBase64(zeros), {
        encoding: FileSystem.EncodingType.Base64,
      });
      wipeBytes(zeros);
    }
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

function normalizeExt(ext: string): string {
  const clean = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  if (['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bin'].includes(clean)) {
    return clean === '.jpeg' ? '.jpg' : clean;
  }
  return '.bin';
}

function extFromSourceUri(uri: string): string {
  const clean = (uri.split('?')[0] || uri).toLowerCase();
  if (PDF_EXT.test(clean) || clean.includes('application/pdf')) return '.pdf';
  if (IMAGE_EXT.test(clean) || clean.includes('imagepicker')) {
    if (clean.endsWith('.png')) return '.png';
    if (clean.endsWith('.webp')) return '.webp';
    return '.jpg';
  }
  const match = clean.match(/\.([a-z0-9]+)$/);
  return match ? normalizeExt(match[1]) : '.bin';
}

export const DocumentEncryptionService = {
  isEncryptedPath(uri?: string | null): boolean {
    if (!uri) return false;
    return uri.includes(`/${ENCRYPTED_DIR}/`) && uri.endsWith(ENCRYPTED_EXT);
  },

  /** Reads original extension from `…/<hex>.pdf.dat` style paths. */
  extensionFromEncryptedPath(uri: string): string | null {
    if (!this.isEncryptedPath(uri)) return null;
    const base = uri.split('/').pop() || '';
    const match = base.match(/^[0-9a-f]+\.([a-z0-9]+)\.dat$/i);
    if (!match) return null;
    return normalizeExt(match[1]);
  },

  async ensureDirs() {
    await FileSystem.makeDirectoryAsync(encryptedDir(), { intermediates: true });
    await FileSystem.makeDirectoryAsync(tempDir(), { intermediates: true });
  },

  /**
   * Encrypts a local file into encrypted/<random>.<ext>.dat and securely deletes the plaintext source
   * when `deleteSource` is true. Original extension is preserved in the ciphertext filename.
   */
  async encryptFile(uri: string, key: Uint8Array, options?: { deleteSource?: boolean }): Promise<string> {
    await this.ensureDirs();
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const plain = base64ToBytes(base64);
    let packed: Uint8Array | null = null;
    try {
      packed = await EncryptionService.encryptBytes(plain, key);
      const rand = await Crypto.getRandomBytesAsync(16);
      const name = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
      const ext = extFromSourceUri(uri).replace(/^\./, '');
      const dest = `${encryptedDir()}${name}.${ext}${ENCRYPTED_EXT}`;
      await FileSystem.writeAsStringAsync(dest, bytesToBase64(packed), {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (options?.deleteSource !== false && !this.isEncryptedPath(uri)) {
        await secureDelete(uri);
      }
      return dest;
    } finally {
      wipeBytes(plain);
      wipeBytes(packed);
    }
  },

  /** Decrypts to a temporary readable file for preview/export. Caller should clear temps on lock. */
  async decryptFile(uri: string, key: Uint8Array, suggestedExt = '.bin'): Promise<string> {
    if (!this.isEncryptedPath(uri)) return uri;
    await this.ensureDirs();
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const packed = base64ToBytes(base64);
    let plain: Uint8Array | null = null;
    try {
      plain = EncryptionService.decryptBytes(packed, key);
      const rand = await Crypto.getRandomBytesAsync(8);
      const token = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
      const ext = normalizeExt(this.extensionFromEncryptedPath(uri) || suggestedExt);
      const dest = `${tempDir()}${token}${ext}`;
      await FileSystem.writeAsStringAsync(dest, bytesToBase64(plain), {
        encoding: FileSystem.EncodingType.Base64,
      });
      return dest;
    } finally {
      wipeBytes(packed);
      wipeBytes(plain);
    }
  },

  async deleteEncryptedFile(uri: string) {
    if (!uri) return;
    await secureDelete(uri);
  },

  async clearDecryptedTemps() {
    try {
      await FileSystem.deleteAsync(tempDir(), { idempotent: true });
      await FileSystem.makeDirectoryAsync(tempDir(), { intermediates: true });
    } catch {
      // ignore
    }
  },
};
