import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { bytesToHex, hexToBytes, wipeBytes } from '@/deviceTransfer/bytes';

/**
 * Content hashing + HMAC integrity for migration manifests/payloads.
 * Uses the transfer session key (RAM only) – never the vault master key.
 */
export const IntegrityService = {
  checksumBytes(data: Uint8Array): string {
    return bytesToHex(sha256(data));
  },

  checksumUtf8(text: string): string {
    return this.checksumBytes(new TextEncoder().encode(text));
  },

  /**
   * Canonical JSON: stable key order via JSON.stringify of already-built objects
   * plus UTF-8 bytes. Callers must pass a stable serialization.
   */
  sign(sessionKey: Uint8Array, checksumHex: string): string {
    if (sessionKey.byteLength !== 32) {
      throw new Error('Integrity-Key muss 32 Byte sein.');
    }
    const msg = new TextEncoder().encode(`fv-meta-v1:${checksumHex}`);
    const mac = hmac(sha256, sessionKey, msg);
    const hex = bytesToHex(mac);
    wipeBytes(mac);
    wipeBytes(msg);
    return hex;
  },

  verify(sessionKey: Uint8Array, checksumHex: string, integrityHex: string): boolean {
    const expected = this.sign(sessionKey, checksumHex);
    try {
      if (expected.length !== integrityHex.length) return false;
      // Constant-time-ish compare
      let diff = 0;
      for (let i = 0; i < expected.length; i += 1) {
        diff |= expected.charCodeAt(i) ^ integrityHex.charCodeAt(i);
      }
      return diff === 0;
    } finally {
      /* expected is string */
    }
  },

  assertValidHex(hex: string, label: string) {
    hexToBytes(hex);
    if (hex.length !== 64) {
      throw new Error(`${label} ungültig.`);
    }
  },
};
