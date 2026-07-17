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

  useEffect(() => {
    if (!enabled) {
      connectStarted.current = false;
      metaStarted.current = false;
      docsStarted.current = false;
      setFlowError(null);
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
    let cancelled = false;

    void (async () => {
      try {
        if (role === 'joiner') {
          // Give the host a moment to start listening.
          await delay(700);
        }
        const attempts = role === 'joiner' ? 20 : 1;
        let lastError: unknown = null;
        for (let i = 0; i < attempts; i += 1) {
          if (cancelled) return;
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
        if (cancelled) return;
        connectStarted.current = false;
        setFlowError(friendlyTransferError(error));
      }
    })();

    return () => {
      cancelled = true;
      // Allow remount/retry unless the channel is already up.
      if (TransportManager.getSnapshot().status !== 'connected') {
        connectStarted.current = false;
      }
    };
    // Intentionally not keyed on transport.status — status changes during connect()
    // must not cancel/restart the in-flight connection attempt.
  }, [enabled, role, restartToken]);

  // Host: metadata after channel is up.
  useEffect(() => {
    if (!enabled || role !== 'host') return;
    if (transport.status !== 'connected') return;
    if (migration.phase !== 'idle') return;
    if (metaStarted.current) return;

    metaStarted.current = true;
    void MigrationTransferService.sendMetadataTransfer().catch((error) => {
      metaStarted.current = false;
      setFlowError(friendlyTransferError(error));
    });
  }, [enabled, role, transport.status, migration.phase, restartToken]);

  // Host: documents after metadata ACK / committed.
  useEffect(() => {
    if (!enabled || role !== 'host') return;
    if (transport.status !== 'connected') return;
    if (migration.phase !== 'committed') return;
    if (docs.phase !== 'idle') return;
    if (docsStarted.current) return;

    docsStarted.current = true;
    void DocumentTransferService.sendAllEncryptedDocuments().catch((error) => {
      docsStarted.current = false;
      setFlowError(friendlyTransferError(error));
    });
  }, [enabled, role, transport.status, migration.phase, docs.phase, restartToken]);

  const serviceError =
    transport.error || migration.error || docs.error || cutover.error || null;
  const displayError = flowError || (serviceError ? friendlyTransferError(serviceError) : null);

  const hasHardFailure =
    Boolean(displayError) ||
    transport.status === 'error' ||
    migration.phase === 'failed' ||
    docs.phase === 'failed' ||
    cutover.phase === 'failed';

  async function restartFlow() {
    setFlowError(null);
    connectStarted.current = false;
    metaStarted.current = false;
    docsStarted.current = false;
    await resetTransferSession();
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
