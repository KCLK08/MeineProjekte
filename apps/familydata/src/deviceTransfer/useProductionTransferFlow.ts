/**
 * Production transfer orchestration for SecureChannelPanel.
 * Calls existing Transfer/Transport/Migration/Document services only.
 * Does not change crypto, security, stores, or navigation architecture.
 */

import { useEffect, useRef, useState } from 'react';

import { DocumentTransferService } from '@/deviceTransfer/migration/DocumentTransferService';
import { MigrationTransferService } from '@/deviceTransfer/migration/MigrationTransferService';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';
import { friendlyTransferError } from '@/deviceTransfer/transferUiCopy';
import { useDocumentTransfer } from '@/deviceTransfer/useDocumentTransfer';
import { useMigrationTransfer } from '@/deviceTransfer/useMigrationTransfer';
import { useTransportSession } from '@/deviceTransfer/useTransportSession';
import { useVaultCutover } from '@/deviceTransfer/useVaultCutover';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function resetTransferSession() {
  // clear() already closes TransportManager and wipes StagingStore.
  await TransferSessionManager.clear();
}

/**
 * After SAS confirmation: open channel, then host auto-sends metadata → documents.
 * Joiner receives via service message handlers; cutover stays user-triggered.
 */
export function useProductionTransferFlow(enabled: boolean) {
  const transport = useTransportSession();
  const migration = useMigrationTransfer();
  const docs = useDocumentTransfer();
  const cutover = useVaultCutover();
  const role = TransferSessionManager.getSnapshot().role;

  const [flowError, setFlowError] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);

  const connectStarted = useRef(false);
  const metaStarted = useRef(false);
  const docsStarted = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetFlowError = (message: string | null) => {
    if (!mountedRef.current) return;
    setFlowError(message);
  };

  useEffect(() => {
    if (!enabled) {
      connectStarted.current = false;
      metaStarted.current = false;
      docsStarted.current = false;
      if (mountedRef.current) setFlowError(null);
    }
  }, [enabled]);

  // Auto-connect after SAS (host listens first; joiner retries briefly).
  useEffect(() => {
    if (!enabled || !role) return;
    if (connectStarted.current) return;

    const snapshot = TransportManager.getSnapshot();
    if (
      snapshot.status === 'connected' ||
      snapshot.status === 'connecting' ||
      snapshot.status === 'error' ||
      snapshot.status === 'closed'
    ) {
      return;
    }

    const params = TransferSessionManager.getTransportConnectParams();
    if (!params) return;

    connectStarted.current = true;
    let active = true;

    void (async () => {
      try {
        if (role === 'joiner') {
          await delay(700);
        }
        const attempts = role === 'joiner' ? 20 : 1;
        let lastError: unknown = null;
        for (let i = 0; i < attempts; i += 1) {
          if (!active || !mountedRef.current) return;
          const liveParams = TransferSessionManager.getTransportConnectParams();
          if (!liveParams) {
            throw new Error(
              'Verbindung noch nicht bereit. Bitte Sicherheitscode erneut bestätigen.'
            );
          }
          try {
            await TransportManager.connect(liveParams);
            return;
          } catch (error) {
            lastError = error;
            if (role === 'host' || i === attempts - 1) break;
            await delay(1000);
          }
        }
        throw lastError ?? new Error('Verbindung fehlgeschlagen.');
      } catch (error) {
        if (!active || !mountedRef.current) return;
        connectStarted.current = false;
        safeSetFlowError(friendlyTransferError(error));
      }
    })();

    return () => {
      active = false;
      if (TransportManager.getSnapshot().status !== 'connected') {
        connectStarted.current = false;
      }
    };
  }, [enabled, role, restartToken]);

  // Host: metadata after channel is up.
  useEffect(() => {
    if (!enabled || role !== 'host') return;
    if (transport.status !== 'connected') return;
    if (migration.phase !== 'idle') return;
    if (metaStarted.current) return;

    metaStarted.current = true;
    let active = true;

    void MigrationTransferService.sendMetadataTransfer().catch((error) => {
      if (!active || !mountedRef.current) return;
      metaStarted.current = false;
      safeSetFlowError(friendlyTransferError(error));
    });

    return () => {
      active = false;
    };
  }, [enabled, role, transport.status, migration.phase, restartToken]);

  // Host: documents after metadata ACK / committed.
  useEffect(() => {
    if (!enabled || role !== 'host') return;
    if (transport.status !== 'connected') return;
    if (migration.phase !== 'committed') return;
    if (docs.phase !== 'idle') return;
    if (docsStarted.current) return;

    docsStarted.current = true;
    let active = true;

    void DocumentTransferService.sendAllEncryptedDocuments().catch((error) => {
      if (!active || !mountedRef.current) return;
      docsStarted.current = false;
      safeSetFlowError(friendlyTransferError(error));
    });

    return () => {
      active = false;
    };
  }, [enabled, role, transport.status, migration.phase, docs.phase, restartToken]);

  const serviceError =
    transport.error || migration.error || docs.error || cutover.error || null;
  const displayError = flowError || (serviceError ? friendlyTransferError(serviceError) : null);

  /** Hard failures only — not user abort / SAS mismatch (handled outside this hook). */
  const hasHardFailure =
    Boolean(flowError) ||
    transport.status === 'error' ||
    migration.phase === 'failed' ||
    docs.phase === 'failed' ||
    cutover.phase === 'failed';

  async function restartFlow() {
    if (!mountedRef.current) return;
    setFlowError(null);
    connectStarted.current = false;
    metaStarted.current = false;
    docsStarted.current = false;
    await resetTransferSession();
    if (!mountedRef.current) return;
    setRestartToken((value) => value + 1);
  }

  return {
    role,
    transport,
    migration,
    docs,
    cutover,
    displayError,
    hasHardFailure,
    restartFlow,
    resetTransferSession,
  };
}

export { resetTransferSession };
