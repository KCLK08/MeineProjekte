import { useSyncExternalStore } from 'react';

import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import type { TransferSessionSnapshot } from '@/deviceTransfer/types';

const IDLE: TransferSessionSnapshot = {
  role: null,
  status: 'idle',
  sessionId: null,
  localDeviceId: null,
  localPublicKeyHex: null,
  remoteDeviceId: null,
  remotePublicKeyHex: null,
  expiresAt: null,
  confirmationCode: null,
  transportHost: null,
  transportPort: null,
  error: null,
  updatedAt: 0,
};

export function useTransferSession(): TransferSessionSnapshot {
  return useSyncExternalStore(
    (onStoreChange) => TransferSessionManager.subscribe(onStoreChange),
    () => TransferSessionManager.getSnapshot(),
    () => IDLE
  );
}
