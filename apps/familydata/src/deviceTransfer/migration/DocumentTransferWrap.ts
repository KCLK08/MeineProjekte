import { EncryptionService } from '@/security/EncryptionService';
import { wipeBytes } from '@/security/KeyStoreService';

export const DOC_WRAP_FORMAT = 'aes-gcm-docwrap-v1' as const;

/**
 * Re-keys document ciphertext for transfer without persisting plaintext.
 *
 * Sender: vault-master decrypt (RAM) → wrap-key encrypt → wire/staging
 * Receiver 4C: wrap-key decrypt (RAM) → new-master encrypt → familydata-encrypted/
 *
 * The vault master key never leaves the device; wrap key is HKDF session material only.
 */
export const DocumentTransferWrap = {
  /**
   * Convert vault .dat (master-keyed) into transfer-wrap ciphertext.
   * Plaintext exists only briefly in RAM and is wiped.
   */
  async wrapVaultCiphertext(
    vaultCiphertext: Uint8Array,
    masterKey: Uint8Array,
    docWrapKey: Uint8Array
  ): Promise<Uint8Array> {
    let plain: Uint8Array | null = null;
    try {
      plain = EncryptionService.decryptBytes(vaultCiphertext, masterKey);
      return await EncryptionService.encryptBytes(plain, docWrapKey);
    } finally {
      wipeBytes(plain);
    }
  },

  /**
   * Convert transfer-wrap ciphertext into a new vault .dat under the receiver master key.
   */
  async rekeyToNewMaster(
    wrapCiphertext: Uint8Array,
    docWrapKey: Uint8Array,
    newMasterKey: Uint8Array
  ): Promise<Uint8Array> {
    let plain: Uint8Array | null = null;
    try {
      plain = EncryptionService.decryptBytes(wrapCiphertext, docWrapKey);
      return await EncryptionService.encryptBytes(plain, newMasterKey);
    } finally {
      wipeBytes(plain);
    }
  },
};
