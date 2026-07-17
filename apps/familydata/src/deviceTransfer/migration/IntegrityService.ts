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
   * Canonical HMAC over a checksum using the integrity key (never master key).
   * domain: e.g. fv-meta-v1 / fv-doc-v1
   */
  sign(integrityKey: Uint8Array, checksumHex: string, domain = 'fv-meta-v1'): string {
    if (integrityKey.byteLength !== 32) {
      throw new Error('Integrity-Key muss 32 Byte sein.');
    }
    const msg = new TextEncoder().encode(`${domain}:${checksumHex}`);
    const mac = hmac(sha256, integrityKey, msg);
    const hex = bytesToHex(mac);
    wipeBytes(mac);
    wipeBytes(msg);
    return hex;
  },

  verify(
    integrityKey: Uint8Array,
    checksumHex: string,
    integrityHex: string,
    domain = 'fv-meta-v1'
  ): boolean {
    const expected = this.sign(integrityKey, checksumHex, domain);
    if (expected.length !== integrityHex.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) {
      diff |= expected.charCodeAt(i) ^ integrityHex.charCodeAt(i);
    }
    return diff === 0;
  },

  assertValidHex(hex: string, label: string) {
    hexToBytes(hex);
    if (hex.length !== 64) {
      throw new Error(`${label} ungültig.`);
    }
  },
};
