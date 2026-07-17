import { EphemeralKeyService } from '@/deviceTransfer/EphemeralKeyService';
import { PairingService } from '@/deviceTransfer/PairingService';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';
import type { TransportConnectParams } from '@/deviceTransfer/transport/TransportManager';
import type { EphemeralKeyPair, PairingStatus, TransferRole, TransferSessionSnapshot } from '@/deviceTransfer/types';

type Listener = (snapshot: TransferSessionSnapshot) => void;

/**
 * In-memory transfer session lifecycle for Phase 2 pairing + Phase 3 transport prep.
 * Cleared on vault lock / explicit cancel – never persisted.
 */
class TransferSessionManagerImpl {
  private role: TransferRole | null = null;
  private status: PairingStatus = 'idle';
  private sessionId: string | null = null;
  private localDeviceId: string | null = null;
  private keyPair: EphemeralKeyPair | null = null;
  private remoteDeviceId: string | null = null;
  private remotePublicKeyHex: string | null = null;
  private expiresAt: number | null = null;
  private offerQr: string | null = null;
  private acceptQr: string | null = null;
  private confirmationCode: string | null = null;
  private transportHost: string | null = null;
  private transportPort: number | null = null;
  private error: string | null = null;
  private updatedAt = Date.now();
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  private cachedSnapshot: TransferSessionSnapshot;

  constructor() {
    this.cachedSnapshot = this.buildSnapshot();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.cachedSnapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): TransferSessionSnapshot {
    this.refreshExpiryStatus();
    return this.cachedSnapshot;
  }

  getOfferQr(): string | null {
    this.refreshExpiryStatus();
    return this.status === 'expired' ? null : this.offerQr;
  }

  getAcceptQr(): string | null {
    this.refreshExpiryStatus();
    return this.status === 'expired' ? null : this.acceptQr;
  }

  /**
   * Credentials for Phase 3 TransportManager.connect().
   * Only available while paired and keys still in RAM.
   */
  getTransportConnectParams(): TransportConnectParams | null {
    if (
      this.status !== 'paired' ||
      !this.role ||
      !this.sessionId ||
      !this.keyPair ||
      !this.remotePublicKeyHex ||
      !this.transportHost ||
      this.transportPort == null
    ) {
      return null;
    }
    return {
      role: this.role,
      sessionId: this.sessionId,
      keyPair: this.keyPair,
      remotePublicKeyHex: this.remotePublicKeyHex,
      host: this.transportHost,
      port: this.transportPort,
    };
  }

  async startHostOffer(): Promise<TransferSessionSnapshot> {
    this.clearInternal(false);
    this.status = 'creating';
    this.emit();
    try {
      const offer = await PairingService.createHostOffer();
      this.role = 'host';
      this.sessionId = offer.sessionId;
      this.localDeviceId = offer.localDeviceId;
      this.keyPair = offer.keyPair;
      this.expiresAt = offer.expiresAt;
      this.offerQr = offer.offerQr;
      this.transportHost = offer.host;
      this.transportPort = offer.port;
      this.status = 'showing_offer';
      this.error = null;
      this.scheduleExpiry(offer.expiresAt);
      this.emit();
      return this.getSnapshot();
    } catch (e) {
      this.clearInternal(false);
      this.status = 'error';
      this.error = (e as Error).message || 'Sitzung konnte nicht erstellt werden.';
      this.emit();
      throw e;
    }
  }

  async acceptOfferFromQr(rawQr: string): Promise<TransferSessionSnapshot> {
    this.clearInternal(false);
    this.status = 'scanning_offer';
    this.emit();
    try {
      const accepted = await PairingService.acceptHostOffer(rawQr);
      this.role = 'joiner';
      this.sessionId = accepted.sessionId;
      this.localDeviceId = accepted.localDeviceId;
      this.keyPair = accepted.keyPair;
      this.remoteDeviceId = accepted.remoteDeviceId;
      this.remotePublicKeyHex = accepted.remotePublicKeyHex;
      this.expiresAt = accepted.expiresAt;
      this.acceptQr = accepted.acceptQr;
      this.confirmationCode = accepted.confirmationCode;
      this.transportHost = accepted.transportHost;
      this.transportPort = accepted.transportPort;
      this.status = 'showing_accept';
      this.error = null;
      this.scheduleExpiry(accepted.expiresAt);
      this.emit();
      return this.getSnapshot();
    } catch (e) {
      this.clearInternal(false);
      this.status = 'error';
      this.error = (e as Error).message || 'QR konnte nicht verarbeitet werden.';
      this.emit();
      throw e;
    }
  }

  completeHostFromAcceptQr(rawQr: string): TransferSessionSnapshot {
    this.refreshExpiryStatus();
    if (this.role !== 'host' || !this.sessionId || !this.localDeviceId || !this.keyPair) {
      throw new Error('Keine aktive Sender-Sitzung.');
    }
    if (this.status === 'expired') {
      throw new Error('Pairing-Sitzung abgelaufen. Bitte neu starten.');
    }
    this.status = 'scanning_accept';
    this.emit();
    try {
      const done = PairingService.completeHostWithAccept(rawQr, {
        sessionId: this.sessionId,
        localDeviceId: this.localDeviceId,
        keyPair: this.keyPair,
      });
      this.remoteDeviceId = done.remoteDeviceId;
      this.remotePublicKeyHex = done.remotePublicKeyHex;
      this.confirmationCode = done.confirmationCode;
      this.expiresAt = done.expiresAt;
      this.status = 'paired';
      this.error = null;
      this.clearExpiryTimer();
      this.emit();
      return this.getSnapshot();
    } catch (e) {
      this.status = 'showing_offer';
      this.error = (e as Error).message || 'Antwort-QR ungültig.';
      this.emit();
      throw e;
    }
  }

  /** Joiner marks paired after host has scanned (UI confirmation). */
  markJoinerPaired(): TransferSessionSnapshot {
    this.refreshExpiryStatus();
    if (this.role !== 'joiner' || this.status === 'expired') {
      throw new Error('Keine aktive Empfänger-Sitzung.');
    }
    if (!this.remotePublicKeyHex || !this.confirmationCode) {
      throw new Error('Pairing unvollständig.');
    }
    this.status = 'paired';
    this.error = null;
    this.emit();
    return this.getSnapshot();
  }

  clear(): void {
    this.clearInternal(true);
  }

  private clearInternal(emit: boolean) {
    this.clearExpiryTimer();
    try {
      TransportManager.close();
    } catch {
      /* ignore */
    }
    void import('@/deviceTransfer/migration/StagingStore')
      .then(({ StagingStore }) => StagingStore.wipeAll())
      .catch(() => undefined);
    void import('@/deviceTransfer/migration/MigrationTransferService')
      .then(({ MigrationTransferService }) => MigrationTransferService.reset())
      .catch(() => undefined);
    void import('@/deviceTransfer/migration/DocumentTransferService')
      .then(({ DocumentTransferService }) => DocumentTransferService.reset())
      .catch(() => undefined);
    EphemeralKeyService.dispose(this.keyPair);
    this.role = null;
    this.status = 'idle';
    this.sessionId = null;
    this.localDeviceId = null;
    this.keyPair = null;
    this.remoteDeviceId = null;
    this.remotePublicKeyHex = null;
    this.expiresAt = null;
    this.offerQr = null;
    this.acceptQr = null;
    this.confirmationCode = null;
    this.transportHost = null;
    this.transportPort = null;
    this.error = null;
    this.rebuildSnapshot();
    if (emit) {
      const snap = this.cachedSnapshot;
      for (const listener of this.listeners) {
        listener(snap);
      }
    }
  }

  private scheduleExpiry(expiresAt: number) {
    this.clearExpiryTimer();
    const delay = Math.max(0, expiresAt - Date.now());
    this.expiryTimer = setTimeout(() => {
      if (this.status === 'paired') return;
      this.status = 'expired';
      this.error = 'Pairing-Sitzung abgelaufen.';
      EphemeralKeyService.dispose(this.keyPair);
      this.keyPair = null;
      this.offerQr = null;
      this.acceptQr = null;
      try {
        TransportManager.close();
      } catch {
        /* ignore */
      }
      this.emit();
    }, delay);
  }

  private clearExpiryTimer() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  private refreshExpiryStatus() {
    if (
      this.expiresAt != null &&
      Date.now() >= this.expiresAt &&
      this.status !== 'paired' &&
      this.status !== 'idle' &&
      this.status !== 'expired'
    ) {
      this.status = 'expired';
      this.error = 'Pairing-Sitzung abgelaufen.';
      EphemeralKeyService.dispose(this.keyPair);
      this.keyPair = null;
      this.offerQr = null;
      this.acceptQr = null;
      try {
        TransportManager.close();
      } catch {
        /* ignore */
      }
      this.rebuildSnapshot();
    }
  }

  private buildSnapshot(): TransferSessionSnapshot {
    return {
      role: this.role,
      status: this.status,
      sessionId: this.sessionId,
      localDeviceId: this.localDeviceId,
      localPublicKeyHex: this.keyPair?.publicKeyHex ?? null,
      remoteDeviceId: this.remoteDeviceId,
      remotePublicKeyHex: this.remotePublicKeyHex,
      expiresAt: this.expiresAt,
      confirmationCode: this.confirmationCode,
      transportHost: this.transportHost,
      transportPort: this.transportPort,
      error: this.error,
      updatedAt: this.updatedAt,
    };
  }

  private rebuildSnapshot() {
    this.updatedAt = Date.now();
    this.cachedSnapshot = this.buildSnapshot();
  }

  private emit() {
    this.rebuildSnapshot();
    const snap = this.cachedSnapshot;
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const TransferSessionManager = new TransferSessionManagerImpl();
