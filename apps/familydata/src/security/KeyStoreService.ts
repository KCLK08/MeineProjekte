import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Device-bound master key storage via the platform Keychain / Keystore
 * (expo-secure-store). The raw key is never written to AsyncStorage or files.
 *
 * Note: retrieving the key material into JS is required for SQLCipher PRAGMA key
 * and AES-GCM in this Expo architecture. Callers must wipe session copies on lock.
 */

const MASTER_KEY_ITEM = 'familydata.vault.masterKey.v1';
const KEY_BYTES = 32;

function secureStoreOptions(requireAuth: boolean): SecureStore.SecureStoreOptions {
  return {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: requireAuth,
    authenticationPrompt: 'FamilyData Tresor öffnen',
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Ungültiges Schlüsselmaterial.');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Wipe a byte array in place (best-effort; JS cannot guarantee physical erasure). */
export function wipeBytes(bytes: Uint8Array | null | undefined) {
  if (!bytes) return;
  bytes.fill(0);
}

export const KeyStoreService = {
  async hasMasterKey(): Promise<boolean> {
    const value = await SecureStore.getItemAsync(MASTER_KEY_ITEM, secureStoreOptions(false));
    return Boolean(value);
  },

  /**
   * Creates a new 256-bit master key once. Fails if a key already exists.
   * Stored with biometric/device-credential access control when the OS supports it.
   */
  async createMasterKey(requireAuth = true): Promise<Uint8Array> {
    if (await this.hasMasterKey()) {
      throw new Error('Master-Key existiert bereits.');
    }
    const bytes = await Crypto.getRandomBytesAsync(KEY_BYTES);
    const key = new Uint8Array(bytes);
    try {
      await SecureStore.setItemAsync(MASTER_KEY_ITEM, bytesToHex(key), secureStoreOptions(requireAuth));
    } catch {
      // Some devices reject requireAuthentication for write; fall back to device-bound storage.
      await SecureStore.setItemAsync(MASTER_KEY_ITEM, bytesToHex(key), secureStoreOptions(false));
    }
    return key;
  },

  /**
   * Loads the master key. When requireAuth is true, the OS may prompt via Keychain/Keystore.
   */
  async getMasterKey(requireAuth = true): Promise<Uint8Array> {
    let hex: string | null = null;
    try {
      hex = await SecureStore.getItemAsync(MASTER_KEY_ITEM, secureStoreOptions(requireAuth));
    } catch {
      hex = await SecureStore.getItemAsync(MASTER_KEY_ITEM, secureStoreOptions(false));
    }
    if (!hex) throw new Error('Kein Master-Key vorhanden.');
    return hexToBytes(hex);
  },

  async deleteMasterKey(): Promise<void> {
    await SecureStore.deleteItemAsync(MASTER_KEY_ITEM);
  },

  /** SQLCipher expects a hex key in the form x'<hex>'. */
  toSqlCipherHex(key: Uint8Array): string {
    return bytesToHex(key);
  },
};
