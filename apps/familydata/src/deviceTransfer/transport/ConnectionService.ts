import TcpSocket from 'react-native-tcp-socket';

type SocketLike = {
  on: (event: string, listener: (...args: any[]) => void) => void;
  write: (data: Uint8Array | string) => boolean;
  destroy: () => void;
};

type ServerLike = {
  listen: (options: { port: number; host: string; reuseAddress?: boolean }, cb?: () => void) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  close: () => void;
};

export type ConnectionHandlers = {
  onConnected?: () => void;
  onData?: (chunk: Uint8Array) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
};

/**
 * Raw TCP peer connection (length-agnostic byte stream).
 * Confidentiality/integrity are provided by SecureChannel, not by TLS.
 */
export class ConnectionService {
  private server: ServerLike | null = null;
  private socket: SocketLike | null = null;
  private closed = false;

  async listen(port: number, handlers: ConnectionHandlers): Promise<void> {
    this.assertOpen();
    return new Promise((resolve, reject) => {
      try {
        const server = TcpSocket.createServer((socket) => {
          if (this.socket) {
            socket.destroy();
            return;
          }
          this.bindSocket(socket as SocketLike, handlers);
          handlers.onConnected?.();
        }) as ServerLike;

        server.on('error', (e: Error) => {
          handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
          reject(e instanceof Error ? e : new Error(String(e)));
        });

        server.listen({ port, host: '0.0.0.0', reuseAddress: true }, () => {
          this.server = server;
          resolve();
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  async connect(host: string, port: number, handlers: ConnectionHandlers, timeoutMs = 15000): Promise<void> {
    this.assertOpen();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          this.socket?.destroy();
        } catch {
          /* ignore */
        }
        reject(new Error('Verbindungs-Timeout.'));
      }, timeoutMs);

      try {
        const socket = TcpSocket.createConnection({ host, port }, () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          handlers.onConnected?.();
          resolve();
        }) as SocketLike;

        this.bindSocket(socket, handlers);
        socket.on('error', (e: Error) => {
          if (settled) {
            handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
            return;
          }
          settled = true;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        });
      } catch (e) {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  send(bytes: Uint8Array) {
    if (!this.socket) throw new Error('Keine aktive Verbindung.');
    // Length-prefixed frame for stream demux.
    const header = new Uint8Array(4);
    const len = bytes.byteLength;
    header[0] = (len >>> 24) & 0xff;
    header[1] = (len >>> 16) & 0xff;
    header[2] = (len >>> 8) & 0xff;
    header[3] = len & 0xff;
    this.socket.write(header);
    this.socket.write(bytes);
  }

  close() {
    this.closed = true;
    try {
      this.socket?.destroy();
    } catch {
      /* ignore */
    }
    try {
      this.server?.close();
    } catch {
      /* ignore */
    }
    this.socket = null;
    this.server = null;
  }

  private assertOpen() {
    if (this.closed) throw new Error('ConnectionService bereits geschlossen.');
  }

  private bindSocket(socket: SocketLike, handlers: ConnectionHandlers) {
    this.socket = socket;
    let buffer = new Uint8Array(0);

    socket.on('data', (data: string | Buffer | Uint8Array) => {
      const chunk =
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data instanceof Uint8Array
            ? data
            : new Uint8Array(data as ArrayBuffer);
      const merged = new Uint8Array(buffer.length + chunk.length);
      merged.set(buffer, 0);
      merged.set(chunk, buffer.length);
      buffer = merged;

      while (buffer.length >= 4) {
        const frameLen =
          ((buffer[0]! << 24) | (buffer[1]! << 16) | (buffer[2]! << 8) | buffer[3]!) >>> 0;
        if (frameLen <= 0 || frameLen > 1024 * 1024) {
          handlers.onError?.(new Error('Ungültige Frame-Länge (Manipulation?).'));
          this.close();
          return;
        }
        if (buffer.length < 4 + frameLen) break;
        const frame = buffer.slice(4, 4 + frameLen);
        buffer = buffer.slice(4 + frameLen);
        handlers.onData?.(frame);
      }
    });

    socket.on('error', (e: Error) => {
      handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
    });

    socket.on('close', () => {
      handlers.onClose?.();
    });
  }
}
