import { useSyncExternalStore } from 'react';

import { TransportManager, type TransportSnapshot } from '@/deviceTransfer/transport/TransportManager';

const IDLE: TransportSnapshot = {
  status: 'idle',
  role: null,
  error: null,
  lastReceived: null,
  lastSentType: null,
  log: [],
  updatedAt: 0,
};

export function useTransportSession(): TransportSnapshot {
  return useSyncExternalStore(
    (onStoreChange) => TransportManager.subscribe(onStoreChange),
    () => TransportManager.getSnapshot(),
    () => IDLE
  );
}
