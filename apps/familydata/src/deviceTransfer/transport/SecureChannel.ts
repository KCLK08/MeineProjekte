import { gcm } from '@noble/ciphers/aes.js';
import * as Crypto from 'expo-crypto';

import { wipeBytes } from '@/deviceTransfer/bytes';
import { MessageProtocol, type TransferMessage } from '@/deviceTransfer/transport/MessageProtocol';

const IV_LEN = 12;
const VERSION = 1;

function buildAad(sessionIdHex: string, seq: number): Uint8Array {
  const sid = new TextEncoder().encode(sessionIdHex);
  const aad = new Uint8Array(sid.length + 4);
  aad.set(sid, 0);
  aad[sid.length] = (seq >>> 24) & 0xff;
  aad[sid.length + 1] = (seq >>> 16) & 0xff;
  aad[sid.length + 2] = (seq >>> 8) & 0xff;
  aad[sid.length + 3] = seq & 0xff;
  return aad;
}

/**
 * AEAD secure channel over an already-paired session key (AES-256-GCM).
 * Frame: version(1) || seq(4 BE) || iv(12) || ciphertext+tag
 * Holds key only in RAM; wipe via dispose().
 */
export class SecureChannel {
  private key: Uint8Array | null;
  private readonly sessionId: string;
  private sendSeq = 0;
  private lastRecvSeq = 0;
  private readonly seenIds = new Set<string>();

  constructor(sessionKey: Uint8Array, sessionId: string) {
    if (sessionKey.byteLength !== 32) {
      throw new Error('Session-Key muss 32 Byte sein.');
    }
    this.key = new Uint8Array(sessionKey);
    this.sessionId = sessionId;
  }

  async sealFrame(type: TransferMessage['type'], payload: string): Promise<Uint8Array> {
    if (!this.key) throw new Error('SecureChannel geschlossen.');
    this.sendSeq += 1;
    const seq = this.sendSeq;
    const message = await MessageProtocol.create(type, payload, seq);
    const plaintext = MessageProtocol.encode(message);
    const iv = new Uint8Array(await Crypto.getRandomBytesAsync(IV_LEN));
    const aad = buildAad(this.sessionId, seq);
    try {
      const aes = gcm(this.key, iv, aad);
      const ciphertext = aes.encrypt(plaintext);
      const frame = new Uint8Array(1 + 4 + iv.length + ciphertext.length);
      frame[0] = VERSION;
      frame[1] = (seq >>> 24) & 0xff;
      frame[2] = (seq >>> 16) & 0xff;
      frame[3] = (seq >>> 8) & 0xff;
      frame[4] = seq & 0xff;
      frame.set(iv, 5);
      frame.set(ciphertext, 5 + iv.length);
      return frame;
    } finally {
      wipeBytes(iv);
      wipeBytes(aad);
      wipeBytes(plaintext);
    }
  }

  openFrame(frame: Uint8Array): TransferMessage {
    if (!this.key) throw new Error('SecureChannel geschlossen.');
    if (frame.byteLength < 1 + 4 + IV_LEN + 16) {
      throw new Error('Paket zu kurz (Manipulation?).');
    }
    if (frame[0] !== VERSION) {
      throw new Error('Unbekannte Kanal-Version.');
    }
    const seq = ((frame[1]! << 24) | (frame[2]! << 16) | (frame[3]! << 8) | frame[4]!) >>> 0;
    if (seq <= this.lastRecvSeq) {
      throw new Error('Replay erkannt (Sequenz).');
    }
    const iv = frame.slice(5, 5 + IV_LEN);
    const ciphertext = frame.slice(5 + IV_LEN);
    const aad = buildAad(this.sessionId, seq);
    let plaintext: Uint8Array | null = null;
    try {
      const aes = gcm(this.key, iv, aad);
      plaintext = aes.decrypt(ciphertext);
      const message = MessageProtocol.decode(plaintext);
      if (message.seq !== seq) {
        throw new Error('Sequenz-Mismatch (Manipulation).');
      }
      MessageProtocol.assertFresh(message);
      if (this.seenIds.has(message.messageId)) {
        throw new Error('Replay erkannt (messageId).');
      }
      this.seenIds.add(message.messageId);
      if (this.seenIds.size > 512) {
        const first = this.seenIds.values().next().value;
        if (first) this.seenIds.delete(first);
      }
      this.lastRecvSeq = seq;
      return message;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (
        msg.includes('Replay') ||
        msg.includes('Zeitfenster') ||
        msg.includes('Mismatch') ||
        msg.includes('Schema') ||
        msg.includes('Version') ||
        msg.includes('kurz') ||
        msg.includes('gelesen') ||
        msg.includes('Format')
      ) {
        throw e;
      }
      throw new Error('Entschlüsselung fehlgeschlagen (falscher Key oder Manipulation).');
    } finally {
      wipeBytes(iv);
      wipeBytes(aad);
      wipeBytes(plaintext);
    }
  }

  dispose() {
    wipeBytes(this.key);
    this.key = null;
    this.seenIds.clear();
  }
}
