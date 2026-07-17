import { useSyncExternalStore } from 'react';

import {
  DocumentTransferService,
  type DocumentTransferSnapshot,
} from '@/deviceTransfer/migration/DocumentTransferService';

const IDLE: DocumentTransferSnapshot = {
  phase: 'idle',
  progress: '',
  currentDocumentId: null,
  sentCount: 0,
  receivedCount: 0,
  error: null,
  updatedAt: 0,
};

export function useDocumentTransfer(): DocumentTransferSnapshot {
  return useSyncExternalStore(
    (onStoreChange) => DocumentTransferService.subscribe(onStoreChange),
    () => DocumentTransferService.getSnapshot(),
    () => IDLE
  );
}
