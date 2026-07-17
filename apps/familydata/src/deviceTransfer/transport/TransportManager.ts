import { wipeBytes } from '@/deviceTransfer/bytes';
import { ConnectionService } from '@/deviceTransfer/transport/ConnectionService';
import { type TransferMessage } from '@/deviceTransfer/transport/MessageProtocol';
import { SecureChannel } from '@/deviceTransfer/transport/SecureChannel';
import { SessionKeyService } from '@/deviceTransfer/transport/SessionKeyService';
import type { EphemeralKeyPair, TransferRole } from '@/deviceTransfer/types';

export type TransportStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'closed';

export type TransportSnapshot = {
  status: TransportStatus;
  role: TransferRole | null;
  error: string | null;
  lastReceived: TransferMessage | null;
  lastSentType: string | null;
  log: string[];
  updatedAt: number;
};

export type TransportConnectParams = {
  role: TransferRole;
  sessionId: string;
  keyPair: EphemeralKeyPair;
  remotePublicKeyHex: string;
  host: string;
  port: number;
};

type Listener = (snapshot: TransportSnapshot) => void;
type MessageHandler = (message: TransferMessage) => void;

const TEST_PAYLOAD = 'FamilyData Transfer Test';

/**
 * Orchestrates TCP connection + SecureChannel.
 * Phase 3: test messages. Phase 4A: metadata message types via handlers.
 */
class TransportManagerImpl {
  private status: TransportStatus = 'idle';
  private role: TransferRole | null = null;
  private error: string | null = null;
  private lastReceived: TransferMessage | null = null;
  private lastSentType: string | null = null;
  private log: string[] = [];
  private updatedAt = Date.now();
  private cached: TransportSnapshot;
  private listeners = new Set<Listener>();
  private messageHandlers = new Set<MessageHandler>();
  private connection: ConnectionService | null = null;
  private channel: SecureChannel | null = null;
  private sessionKey: Uint8Array | null = null;

  constructor() {
    this.cached = this.build();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.cached);
    return () => this.listeners.delete(listener);
  }

  addMessageHandler(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getSnapshot(): TransportSnapshot {
    return this.cached;
  }

  getTestPayload(): string {
    return TEST_PAYLOAD;
  }

  /**
   * Returns a copy of the session key for integrity operations.
   * Caller MUST wipe the returned buffer.
   */
  borrowSessionKey(): Uint8Array {
    if (!this.sessionKey || this.status !== 'connected') {
      throw new Error('Kein Session-Key – Kanal nicht verbunden.');
    }
    return new Uint8Array(this.sessionKey);
  }

  async connect(params: TransportConnectParams): Promise<void> {
    this.closeInternal(false);
    this.role = params.role;
    this.status = 'connecting';
    this.error = null;
    this.pushLog(params.role === 'host' ? 'Warte auf TCP-Verbindung…' : `Verbinde zu ${params.host}:${params.port}…`);
    this.emit();

    let derived: Uint8Array | null = null;
    try {
      derived = SessionKeyService.deriveSessionKey({
        localSecretKey: params.keyPair.secretKey,
        remotePublicKeyHex: params.remotePublicKeyHex,
        sessionIdHex: params.sessionId,
      });
      this.sessionKey = new Uint8Array(derived);
      this.channel = new SecureChannel(this.sessionKey, params.sessionId);
      this.connection = new ConnectionService();

      const handlers = {
        onConnected: () => {
          this.status = 'connected';
          this.pushLog('Kanal verbunden (AEAD aktiv).');
          this.emit();
        },
        onData: (frame: Uint8Array) => {
          this.handleIncomingFrame(frame);
        },
        onError: (e: Error) => {
          this.fail(e.message || 'Verbindungsfehler');
        },
        onClose: () => {
          if (this.status === 'connected' || this.status === 'connecting') {
            this.fail('Verbindung verloren');
          }
        },
      };

      if (params.role === 'host') {
        await this.connection.listen(params.port, handlers);
        this.pushLog(`TCP-Server lauscht auf Port ${params.port}.`);
        this.emit();
      } else {
        await this.connection.connect(params.host, params.port, handlers);
      }
    } catch (e) {
      this.fail((e as Error).message || 'connect() fehlgeschlagen');
      throw e;
    } finally {
      wipeBytes(derived);
    }
  }

  async sendMessage(type: TransferMessage['type'], payload: string): Promise<void> {
    if (!this.connection || !this.channel || this.status !== 'connected') {
      throw new Error('Kanal nicht verbunden.');
    }
    const frame = await this.channel.sealFrame(type, payload);
    this.connection.send(frame);
    this.lastSentType = type;
    this.pushLog(`Gesendet [${type}]: ${payload.slice(0, 80)}`);
    this.emit();
  }

  async sendTestMessage(): Promise<void> {
    await this.sendMessage('test', TEST_PAYLOAD);
  }

  receiveMessage(): TransferMessage | null {
    return this.lastReceived;
  }

  close(): void {
    this.closeInternal(true);
  }

  private handleIncomingFrame(frame: Uint8Array) {
    if (!this.channel) return;
    try {
      const message = this.channel.openFrame(frame);
      this.lastReceived = message;
      this.pushLog(`Empfangen [${message.type}]: ${message.payload.slice(0, 80)}`);
      if (message.type === 'ping') {
        void this.sendMessage('pong', 'ok').catch(() => undefined);
      }
      if (message.type === 'close') {
        this.pushLog('Gegenstelle hat geschlossen.');
        this.closeInternal(true);
        return;
      }
      for (const handler of this.messageHandlers) {
        try {
          handler(message);
        } catch {
          /* handlers must not break the channel */
        }
      }
      this.emit();
    } catch (e) {
      this.fail((e as Error).message || 'Empfang fehlgeschlagen');
    }
  }

  private fail(reason: string) {
    this.status = 'error';
    this.error = reason;
    this.pushLog(`Fehler: ${reason}`);
    this.wipeSecrets();
    try {
      this.connection?.close();
    } catch {
      /* ignore */
    }
    this.connection = null;
    this.emit();
  }

  private closeInternal(emit: boolean) {
    this.wipeSecrets();
    try {
      this.connection?.close();
    } catch {
      /* ignore */
    }
    this.connection = null;
    this.status = 'closed';
    this.role = null;
    this.error = null;
    if (emit) {
      this.pushLog('Kanal geschlossen – Keys gelöscht.');
      this.emit();
      this.status = 'idle';
      this.lastReceived = null;
      this.lastSentType = null;
      this.emit();
    } else {
      this.status = 'idle';
      this.lastReceived = null;
      this.lastSentType = null;
      this.rebuild();
    }
  }

  private wipeSecrets() {
    this.channel?.dispose();
    this.channel = null;
    wipeBytes(this.sessionKey);
    this.sessionKey = null;
  }

  private pushLog(line: string) {
    const stamp = new Date().toLocaleTimeString();
    this.log = [`${stamp} ${line}`, ...this.log].slice(0, 40);
  }

  private build(): TransportSnapshot {
    return {
      status: this.status,
      role: this.role,
      error: this.error,
      lastReceived: this.lastReceived,
      lastSentType: this.lastSentType,
      log: this.log,
      updatedAt: this.updatedAt,
    };
  }

  private rebuild() {
    this.updatedAt = Date.now();
    this.cached = this.build();
  }

  private emit() {
    this.rebuild();
    const snap = this.cached;
    for (const listener of this.listeners) listener(snap);
  }
}

export const TransportManager = new TransportManagerImpl();

/** Convenience aliases matching the Phase 3 API names. */
export const connect = (params: TransportConnectParams) => TransportManager.connect(params);
export const sendMessage = (type: TransferMessage['type'], payload: string) =>
  TransportManager.sendMessage(type, payload);
export const receiveMessage = () => TransportManager.receiveMessage();
export const close = () => TransportManager.close();
