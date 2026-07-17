import { useSyncExternalStore } from 'react';

import {
  VaultCutoverService,
  type VaultCutoverSnapshot,
} from '@/deviceTransfer/migration/VaultCutoverService';

const IDLE: VaultCutoverSnapshot = {
  phase: 'idle',
  progress: '',
  transferId: null,
  error: null,
  people: 0,
  documents: 0,
  files: 0,
  updatedAt: 0,
};

export function useVaultCutover(): VaultCutoverSnapshot {
  return useSyncExternalStore(
    (onStoreChange) => VaultCutoverService.subscribe(onStoreChange),
    () => VaultCutoverService.getSnapshot(),
    () => IDLE
  );
}
