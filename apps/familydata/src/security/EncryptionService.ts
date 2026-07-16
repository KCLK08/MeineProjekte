import { gcm } from '@noble/ciphers/aes.js';
import * as Crypto from 'expo-crypto';

import { wipeBytes } from '@/security/KeyStoreService';

const IV_LENGTH = 12;
const VERSION = 1;

/**
 * AES-256-GCM helpers using the audited @noble/ciphers library.
 * Callers supply a 32-byte key and must wipe it after use.
 */
export const EncryptionService = {
  async randomIv(): Promise<Uint8Array> {
    return new Uint8Array(await Crypto.getRandomBytesAsync(IV_LENGTH));
  },

  /**
   * Packs: version(1) || iv(12) || ciphertext+tag
   */
  async encryptBytes(plaintext: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    if (key.byteLength !== 32) throw new Error('AES-256 benötigt einen 32-Byte-Schlüssel.');
    const iv = await this.randomIv();
    const aes = gcm(key, iv);
    const ciphertext = aes.encrypt(plaintext);
    const packed = new Uint8Array(1 + iv.length + ciphertext.length);
    packed[0] = VERSION;
    packed.set(iv, 1);
    packed.set(ciphertext, 1 + iv.length);
    wipeBytes(iv);
    return packed;
  },

  decryptBytes(packed: Uint8Array, key: Uint8Array): Uint8Array {
    if (key.byteLength !== 32) throw new Error('AES-256 benötigt einen 32-Byte-Schlüssel.');
    if (packed.byteLength < 1 + IV_LENGTH + 16) {
      throw new Error('Verschlüsselte Datei ist beschädigt oder unvollständig.');
    }
    if (packed[0] !== VERSION) {
      throw new Error('Unbekanntes Verschlüsselungsformat.');
    }
    const iv = packed.slice(1, 1 + IV_LENGTH);
    const ciphertext = packed.slice(1 + IV_LENGTH);
    try {
      const aes = gcm(key, iv);
      return aes.decrypt(ciphertext);
    } catch {
      throw new Error('Entschlüsselung fehlgeschlagen. Datei beschädigt oder falscher Schlüssel.');
    } finally {
      wipeBytes(iv);
    }
  },
};
