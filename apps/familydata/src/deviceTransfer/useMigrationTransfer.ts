import { useSyncExternalStore } from 'react';

import {
  MigrationTransferService,
  type MigrationTransferSnapshot,
} from '@/deviceTransfer/migration/MigrationTransferService';

const IDLE: MigrationTransferSnapshot = {
  phase: 'idle',
  transferId: null,
  progress: '',
  documentCount: null,
  peopleCount: null,
  error: null,
  updatedAt: 0,
};

export function useMigrationTransfer(): MigrationTransferSnapshot {
  return useSyncExternalStore(
    (onStoreChange) => MigrationTransferService.subscribe(onStoreChange),
    () => MigrationTransferService.getSnapshot(),
    () => IDLE
  );
}
