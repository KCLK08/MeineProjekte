import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { hexToBytes, wipeBytes } from '@/deviceTransfer/bytes';

const INFO = new TextEncoder().encode('familydata-transfer-session-v1');
const KEY_LEN = 32;

/**
 * Derives a session encryption key from the X25519 shared secret via HKDF-SHA256.
 * Shared secret is wiped immediately; returned key must be wiped by the caller.
 */
export const SessionKeyService = {
  deriveSessionKey(params: {
    localSecretKey: Uint8Array;
    remotePublicKeyHex: string;
    sessionIdHex: string;
  }): Uint8Array {
    const remotePk = hexToBytes(params.remotePublicKeyHex);
    const salt = hexToBytes(params.sessionIdHex);
    let shared: Uint8Array | null = null;
    try {
      shared = x25519.getSharedSecret(params.localSecretKey, remotePk);
      return hkdf(sha256, shared, salt, INFO, KEY_LEN);
    } finally {
      wipeBytes(shared);
      wipeBytes(remotePk);
      wipeBytes(salt);
    }
  },
};
