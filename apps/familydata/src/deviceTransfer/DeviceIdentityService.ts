import * as Crypto from 'expo-crypto';

import { bytesToHex } from '@/deviceTransfer/bytes';

const DEVICE_ID_BYTES = 16;

/**
 * Temporary transfer device identity – random per session, never persisted.
 * Not the OS device ID and not linked to family data.
 */
export const DeviceIdentityService = {
  async createTemporaryDeviceId(): Promise<string> {
    const bytes = new Uint8Array(await Crypto.getRandomBytesAsync(DEVICE_ID_BYTES));
    return bytesToHex(bytes);
  },

  async createSessionId(): Promise<string> {
    const bytes = new Uint8Array(await Crypto.getRandomBytesAsync(DEVICE_ID_BYTES));
    return bytesToHex(bytes);
  },
};
