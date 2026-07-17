import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';

import { bytesToHex, hexToBytes, wipeBytes } from '@/deviceTransfer/bytes';
import type { EphemeralKeyPair } from '@/deviceTransfer/types';

const KEY_BYTES = 32;

/**
 * Ephemeral X25519 key pairs for pairing only.
 * Secret keys stay in RAM and must be wiped via dispose().
 */
export const EphemeralKeyService = {
  async generateKeyPair(): Promise<EphemeralKeyPair> {
    const seed = new Uint8Array(await Crypto.getRandomBytesAsync(KEY_BYTES));
    const secretKey = new Uint8Array(seed);
    wipeBytes(seed);
    const publicKey = x25519.getPublicKey(secretKey);
    return {
      publicKeyHex: bytesToHex(publicKey),
      secretKey,
    };
  },

  /**
   * Derives a short authentication string from the ECDH shared secret via SHA-256.
   * Shared secret is wiped immediately. Not a password – visual MitM check only.
   */
  deriveConfirmationCode(localSecret: Uint8Array, remotePublicKeyHex: string): string {
    const remotePk = hexToBytes(remotePublicKeyHex);
    let shared: Uint8Array | null = null;
    let digest: Uint8Array | null = null;
    try {
      shared = x25519.getSharedSecret(localSecret, remotePk);
      digest = sha256(shared);
      // 8 hex chars ≈ 32 bit visual compare (stronger than prior non-crypto fold).
      return bytesToHex(digest).slice(0, 8).toUpperCase();
    } finally {
      wipeBytes(shared);
      wipeBytes(digest);
      wipeBytes(remotePk);
    }
  },

  dispose(pair: EphemeralKeyPair | null | undefined) {
    if (!pair) return;
    wipeBytes(pair.secretKey);
  },
};
