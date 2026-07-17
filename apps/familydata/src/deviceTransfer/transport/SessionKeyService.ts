import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { hexToBytes, wipeBytes } from '@/deviceTransfer/bytes';
import type { TransferRole } from '@/deviceTransfer/types';

/** Bumped when key schedule / directionality changes (incompatible with older peers). */
const INFO = new TextEncoder().encode('familydata-transfer-session-v2');
const KEY_LEN = 32;
/** host→joiner | joiner→host | integrity | docWrap | staging */
const OKM_LEN = KEY_LEN * 5;

export type DerivedSessionKeys = {
  /** AES-GCM key for frames this role sends. */
  sendKey: Uint8Array;
  /** AES-GCM key for frames this role receives. */
  recvKey: Uint8Array;
  /** HMAC key for manifests / document integrity. */
  integrityKey: Uint8Array;
  /**
   * Ephemeral wrap key for document ciphertext during transfer.
   * Never equals the vault master key.
   */
  docWrapKey: Uint8Array;
  /** AES-GCM key for staging payload at rest (RAM + encrypted files). */
  stagingKey: Uint8Array;
};

/**
 * Derives directional transport keys + integrity/docWrap/staging from X25519 via HKDF-SHA256.
 * Shared secret is wiped immediately; returned keys must be wiped by the caller.
 */
export const SessionKeyService = {
  deriveSessionKeys(params: {
    localSecretKey: Uint8Array;
    remotePublicKeyHex: string;
    sessionIdHex: string;
    role: TransferRole;
  }): DerivedSessionKeys {
    const remotePk = hexToBytes(params.remotePublicKeyHex);
    const salt = hexToBytes(params.sessionIdHex);
    let shared: Uint8Array | null = null;
    let okm: Uint8Array | null = null;
    try {
      shared = x25519.getSharedSecret(params.localSecretKey, remotePk);
      okm = hkdf(sha256, shared, salt, INFO, OKM_LEN);
      const hostToJoiner = okm.slice(0, KEY_LEN);
      const joinerToHost = okm.slice(KEY_LEN, KEY_LEN * 2);
      const integrityKey = okm.slice(KEY_LEN * 2, KEY_LEN * 3);
      const docWrapKey = okm.slice(KEY_LEN * 3, KEY_LEN * 4);
      const stagingKey = okm.slice(KEY_LEN * 4, KEY_LEN * 5);
      const sendKey = params.role === 'host' ? hostToJoiner : joinerToHost;
      const recvKey = params.role === 'host' ? joinerToHost : hostToJoiner;
      return {
        sendKey: new Uint8Array(sendKey),
        recvKey: new Uint8Array(recvKey),
        integrityKey: new Uint8Array(integrityKey),
        docWrapKey: new Uint8Array(docWrapKey),
        stagingKey: new Uint8Array(stagingKey),
      };
    } finally {
      wipeBytes(shared);
      wipeBytes(okm);
      wipeBytes(remotePk);
      wipeBytes(salt);
    }
  },
};
