import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from '@noble/hashes/sha2.js';

import { bytesToHex } from '@/deviceTransfer/bytes';
import { DOC_CHUNK_RAW_BYTES } from '@/deviceTransfer/migration/documentTypes';
import { DocumentEncryptionService } from '@/security/DocumentEncryptionService';

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

/**
 * Reads encrypted .dat files as opaque bytes for transfer. Never decrypts.
 */
export const DocumentFileTransferIO = {
  resolveSourceUri(filePath: string): string {
    const trimmed = filePath.trim();
    if (!trimmed) throw new Error('Dokument ohne Dateipfad.');
    if (!DocumentEncryptionService.isEncryptedPath(trimmed)) {
      throw new Error('Nur verschlüsselte .dat-Dateien dürfen übertragen werden.');
    }
    return trimmed;
  },

  toRelativePath(filePath: string): string {
    const base = filePath.split('/').pop() || 'unknown.dat';
    return `familydata-encrypted/${base}`;
  },

  async readEncryptedBytes(uri: string): Promise<Uint8Array> {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) {
      throw new Error('Verschlüsselte Datei nicht gefunden.');
    }
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64ToBytes(b64);
  },

  hashBytes(bytes: Uint8Array): string {
    return bytesToHex(sha256(bytes));
  },

  hashChunk(bytes: Uint8Array): string {
    return this.hashBytes(bytes);
  },

  splitChunks(bytes: Uint8Array): Uint8Array[] {
    const out: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += DOC_CHUNK_RAW_BYTES) {
      out.push(bytes.subarray(i, Math.min(i + DOC_CHUNK_RAW_BYTES, bytes.length)));
    }
    return out.length ? out : [new Uint8Array(0)];
  },

  encodeChunkBase64(bytes: Uint8Array): string {
    return bytesToBase64(bytes);
  },

  decodeChunkBase64(b64: string): Uint8Array {
    return base64ToBytes(b64);
  },

  async newLocalFileName(): Promise<string> {
    const rand = await Crypto.getRandomBytesAsync(16);
    const hex = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex}.dat`;
  },

  async ensureFreeSpace(neededBytes: number) {
    try {
      const free = await FileSystem.getFreeDiskStorageAsync();
      if (typeof free === 'number' && free < neededBytes + 2_000_000) {
        throw new Error('Nicht genug Speicherplatz für den Dokumenttransfer.');
      }
    } catch (e) {
      if ((e as Error).message.includes('Speicherplatz')) throw e;
      // Some platforms may not report free space – continue cautiously.
    }
  },
};
