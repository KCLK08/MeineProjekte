import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Device-bound master key via Keychain / Keystore (expo-secure-store).
 * Production keys are always stored with requireAuthentication: true.
 * Legacy unbound keys are re-wrapped once after OS auth succeeds.
 */

const MASTER_KEY_ITEM = 'familydata.vault.masterKey.v1';
const MASTER_KEY_META = 'familydata.vault.masterKey.meta';
const META_AUTH_BOUND = 'auth-bound-v2';
const META_LEGACY = 'legacy-unbound';
const KEY_BYTES = 32;

const deviceBound: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function authBoundOptions(prompt = 'FamilyData Tresor öffnen'): SecureStore.SecureStoreOptions {
  return {
    ...deviceBound,
    requireAuthentication: true,
    authenticationPrompt: prompt,
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

/** Wipe a byte array in place (best-effort in JS). */
export function wipeBytes(bytes: Uint8Array | null | undefined) {
  if (!bytes) return;
  bytes.fill(0);
}

export const KeyStoreService = {
  /** Presence only – never loads key material. */
  async hasMasterKey(): Promise<boolean> {
    const meta = await this.getMasterKeyMeta();
    return meta === META_AUTH_BOUND || meta === META_LEGACY;
  },

  /** Meta flag only – never loads key material. */
  async getMasterKeyMeta(): Promise<string | null> {
    return SecureStore.getItemAsync(MASTER_KEY_META, deviceBound);
  },

  async markLegacyPresent(): Promise<void> {
    const meta = await SecureStore.getItemAsync(MASTER_KEY_META, deviceBound);
    if (!meta) {
      await SecureStore.setItemAsync(MASTER_KEY_META, META_LEGACY, deviceBound);
    }
  },

  /**
   * Creates a new 256-bit master key once.
   * Fails if the OS cannot bind the item to user authentication.
   */
  async createMasterKey(prompt = 'FamilyData Schlüssel schützen'): Promise<Uint8Array> {
    if (await this.hasMasterKey()) {
      throw new Error('Master-Key existiert bereits.');
    }
    const bytes = await Crypto.getRandomBytesAsync(KEY_BYTES);
    const key = new Uint8Array(bytes);
    const hex = bytesToHex(key);
    try {
      await SecureStore.setItemAsync(MASTER_KEY_ITEM, hex, authBoundOptions(prompt));
      await SecureStore.setItemAsync(MASTER_KEY_META, META_AUTH_BOUND, deviceBound);
      return key;
    } catch (e) {
      wipeBytes(key);
      throw new Error(
        `Master-Key konnte nicht an Biometrie/Gerätecode gebunden werden. ${(e as Error).message || ''}`.trim()
      );
    }
  },

  /**
   * Loads the master key. Auth-bound keys always require OS authentication.
   * Legacy unbound keys are migrated to auth-bound storage after read.
   */
  async getMasterKey(prompt = 'FamilyData Tresor öffnen'): Promise<Uint8Array> {
    const meta = await SecureStore.getItemAsync(MASTER_KEY_META, deviceBound);

    if (meta === META_AUTH_BOUND || !meta) {
      try {
        const hex = await SecureStore.getItemAsync(MASTER_KEY_ITEM, authBoundOptions(prompt));
        if (hex) {
          if (meta !== META_AUTH_BOUND) {
            await SecureStore.setItemAsync(MASTER_KEY_META, META_AUTH_BOUND, deviceBound);
          }
          return hexToBytes(hex);
        }
      } catch (authErr) {
        if (meta === META_AUTH_BOUND) {
          throw new Error(
            `Master-Key nicht freigegeben. ${(authErr as Error).message || 'Authentifizierung erforderlich.'}`
          );
        }
        // fall through to legacy read when meta missing/legacy
      }
    }

    // One-time legacy migration (key previously stored without requireAuthentication).
    const legacyHex = await SecureStore.getItemAsync(MASTER_KEY_ITEM, deviceBound);
    if (!legacyHex) throw new Error('Kein Master-Key vorhanden.');

    const key = hexToBytes(legacyHex);
    try {
      await SecureStore.deleteItemAsync(MASTER_KEY_ITEM);
      await SecureStore.setItemAsync(MASTER_KEY_ITEM, legacyHex, authBoundOptions(prompt));
      await SecureStore.setItemAsync(MASTER_KEY_META, META_AUTH_BOUND, deviceBound);
      return key;
    } catch (e) {
      wipeBytes(key);
      throw new Error(
        `Legacy-Key konnte nicht gehärtet werden. ${(e as Error).message || 'Biometrie/Gerätecode erforderlich.'}`
      );
    }
  },

  async deleteMasterKey(): Promise<void> {
    await SecureStore.deleteItemAsync(MASTER_KEY_ITEM).catch(() => undefined);
    await SecureStore.deleteItemAsync(MASTER_KEY_META).catch(() => undefined);
  },

  toSqlCipherHex(key: Uint8Array): string {
    return bytesToHex(key);
  },
};
