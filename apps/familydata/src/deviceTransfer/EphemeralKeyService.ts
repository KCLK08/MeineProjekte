import { x25519 } from '@noble/curves/ed25519.js';
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
   * Derives a shared secret then immediately reduces it to a short
   * confirmation code and wipes the shared secret. Phase 2 does not
   * retain material for data encryption.
   */
  deriveConfirmationCode(localSecret: Uint8Array, remotePublicKeyHex: string): string {
    const remotePk = hexToBytes(remotePublicKeyHex);
    let shared: Uint8Array | null = null;
    try {
      shared = x25519.getSharedSecret(localSecret, remotePk);
      // Fold to 6 hex chars for visual compare – not a password.
      let h = 0;
      for (let i = 0; i < shared.length; i += 1) {
        h = (h * 33 + shared[i]!) >>> 0;
      }
      return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6).toUpperCase();
    } finally {
      wipeBytes(shared);
      wipeBytes(remotePk);
    }
  },

  dispose(pair: EphemeralKeyPair | null | undefined) {
    if (!pair) return;
    wipeBytes(pair.secretKey);
  },
};
