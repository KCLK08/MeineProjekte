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

/** Pairing still usable for join connect retries (not expired / not cleared). */
function pairingAllowsConnectRetry(): boolean {
  const session = TransferSessionManager.getSnapshot();
  if (!session.sasConfirmed) return false;
  if (session.status === 'expired' || session.status === 'error' || session.status === 'idle') {
    return false;
  }
  if (session.expiresAt != null && Date.now() >= session.expiresAt) return false;
  return session.status === 'paired';
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
  const [joinWaitingForPeer, setJoinWaitingForPeer] = useState(false);

  const connectStarted = useRef(false);
  const connectGeneration = useRef(0);
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

  const safeSetJoinWaiting = (value: boolean) => {
    if (!mountedRef.current) return;
    setJoinWaitingForPeer(value);
  };

  useEffect(() => {
    if (!enabled) {
      connectStarted.current = false;
      connectGeneration.current += 1;
      metaStarted.current = false;
      docsStarted.current = false;
      if (mountedRef.current) {
        setFlowError(null);
        setJoinWaitingForPeer(false);
      }
    }
  }, [enabled]);

  // Auto-connect after SAS (host listens first; joiner retries until pairing expires).
  useEffect(() => {
    if (!enabled || !role) return;
    if (connectStarted.current) return;

    const snapshot = TransportManager.getSnapshot();
    if (snapshot.status === 'connected') return;
    if (snapshot.status === 'error' || snapshot.status === 'closed') return;
    // Allow continue if already connecting from this flow; skip duplicate start.
    if (snapshot.status === 'connecting' && connectStarted.current) return;

    const params = TransferSessionManager.getTransportConnectParams();
    if (!params) return;

    connectStarted.current = true;
    const generation = ++connectGeneration.current;
    let active = true;

    void (async () => {
      try {
        if (role === 'joiner') {
          safeSetJoinWaiting(true);
          await delay(700);
        }

        let lastError: unknown = null;
        // Host: single listen attempt. Join: retry until pairing expires (bounded by expiresAt).
        for (;;) {
          if (!active || !mountedRef.current) return;
          if (generation !== connectGeneration.current) return;

          if (role === 'joiner' && !pairingAllowsConnectRetry()) {
            throw lastError ?? new Error('Die Verbindung ist abgelaufen. Bitte starte die Übertragung erneut.');
          }

          const liveParams = TransferSessionManager.getTransportConnectParams();
          if (!liveParams) {
            if (role === 'joiner' && pairingAllowsConnectRetry()) {
              await delay(1000);
              continue;
            }
            throw new Error(
              'Verbindung noch nicht bereit. Bitte Sicherheitscode erneut bestätigen.'
            );
          }

          try {
            await TransportManager.connect(liveParams);
            if (!active || generation !== connectGeneration.current) return;

            if (role === 'host') {
              // listen() resolves while still "connecting"; keep gate until peer connects or fails.
              for (;;) {
                if (!active || !mountedRef.current) return;
                if (generation !== connectGeneration.current) return;
                const st = TransportManager.getSnapshot().status;
                if (st === 'connected') {
                  connectStarted.current = false;
                  return;
                }
                if (st === 'error' || st === 'closed') {
                  throw new Error(
                    TransportManager.getSnapshot().error || 'Verbindung fehlgeschlagen.'
                  );
                }
                if (!pairingAllowsConnectRetry()) {
                  throw new Error(
                    'Die Verbindung ist abgelaufen. Bitte starte die Übertragung erneut.'
                  );
                }
                await delay(500);
              }
            }

            // Joiner: connect() resolves only after TCP is up.
            connectStarted.current = false;
            safeSetJoinWaiting(false);
            return;
          } catch (error) {
            lastError = error;
            if (role === 'host') break;
            if (!pairingAllowsConnectRetry()) break;
            if (!active || generation !== connectGeneration.current) return;
            safeSetJoinWaiting(true);
            await delay(1000);
          }
        }
        throw lastError ?? new Error('Verbindung fehlgeschlagen.');
      } catch (error) {
        if (!active || !mountedRef.current) return;
        if (generation !== connectGeneration.current) return;
        connectStarted.current = false;
        safeSetJoinWaiting(false);
        safeSetFlowError(friendlyTransferError(error));
      }
    })();

    return () => {
      // P1: do not clear connectStarted on cleanup while connecting/listening/retrying.
      active = false;
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
    connectGeneration.current += 1;
    metaStarted.current = false;
    docsStarted.current = false;
    setJoinWaitingForPeer(false);
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
    joinWaitingForPeer,
    restartFlow,
    resetTransferSession,
  };
}

export { resetTransferSession };
