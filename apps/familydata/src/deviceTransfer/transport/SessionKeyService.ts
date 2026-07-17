import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { hexToBytes, wipeBytes } from '@/deviceTransfer/bytes';

const INFO = new TextEncoder().encode('familydata-transfer-session-v1');
const KEY_LEN = 32;
const OKM_LEN = 64;

export type DerivedSessionKeys = {
  /** AES-GCM key for SecureChannel frames. */
  transportKey: Uint8Array;
  /** HMAC key for manifests / document integrity. */
  integrityKey: Uint8Array;
};

/**
 * Derives transport + integrity keys from the X25519 shared secret via HKDF-SHA256.
 * Shared secret is wiped immediately; returned keys must be wiped by the caller.
 */
export const SessionKeyService = {
  deriveSessionKeys(params: {
    localSecretKey: Uint8Array;
    remotePublicKeyHex: string;
    sessionIdHex: string;
  }): DerivedSessionKeys {
    const remotePk = hexToBytes(params.remotePublicKeyHex);
    const salt = hexToBytes(params.sessionIdHex);
    let shared: Uint8Array | null = null;
    let okm: Uint8Array | null = null;
    try {
      shared = x25519.getSharedSecret(params.localSecretKey, remotePk);
      okm = hkdf(sha256, shared, salt, INFO, OKM_LEN);
      return {
        transportKey: okm.slice(0, KEY_LEN),
        integrityKey: okm.slice(KEY_LEN, OKM_LEN),
      };
    } finally {
      wipeBytes(shared);
      wipeBytes(okm);
      wipeBytes(remotePk);
      wipeBytes(salt);
    }
  },

  /** @deprecated Use deriveSessionKeys – kept for call-site migration clarity. */
  deriveSessionKey(params: {
    localSecretKey: Uint8Array;
    remotePublicKeyHex: string;
    sessionIdHex: string;
  }): Uint8Array {
    const keys = this.deriveSessionKeys(params);
    wipeBytes(keys.integrityKey);
    return keys.transportKey;
  },
};
