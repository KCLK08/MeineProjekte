import { gcm } from '@noble/ciphers/aes.js';
import * as Crypto from 'expo-crypto';

import { wipeBytes } from '@/deviceTransfer/bytes';
import { MessageProtocol, type TransferMessage } from '@/deviceTransfer/transport/MessageProtocol';
import type { TransferRole } from '@/deviceTransfer/types';

const IV_LEN = 12;
const VERSION = 2;

function roleByte(role: TransferRole): number {
  return role === 'host' ? 0x48 : 0x4a; // 'H' / 'J'
}

function buildAad(sessionIdHex: string, seq: number, senderRole: TransferRole): Uint8Array {
  const sid = new TextEncoder().encode(sessionIdHex);
  const aad = new Uint8Array(sid.length + 1 + 4);
  aad.set(sid, 0);
  aad[sid.length] = roleByte(senderRole);
  aad[sid.length + 1] = (seq >>> 24) & 0xff;
  aad[sid.length + 2] = (seq >>> 16) & 0xff;
  aad[sid.length + 3] = (seq >>> 8) & 0xff;
  aad[sid.length + 4] = seq & 0xff;
  return aad;
}

/**
 * AEAD secure channel with directional keys + role-bound AAD (anti-reflection).
 * Frame: version(1) || seq(4 BE) || iv(12) || ciphertext+tag
 */
export class SecureChannel {
  private sendKey: Uint8Array | null;
  private recvKey: Uint8Array | null;
  private readonly sessionId: string;
  private readonly localRole: TransferRole;
  private readonly remoteRole: TransferRole;
  private sendSeq = 0;
  private lastRecvSeq = 0;
  private readonly seenIds = new Set<string>();

  constructor(
    sendKey: Uint8Array,
    recvKey: Uint8Array,
    sessionId: string,
    localRole: TransferRole
  ) {
    if (sendKey.byteLength !== 32 || recvKey.byteLength !== 32) {
      throw new Error('Transport-Keys müssen 32 Byte sein.');
    }
    this.sendKey = new Uint8Array(sendKey);
    this.recvKey = new Uint8Array(recvKey);
    this.sessionId = sessionId;
    this.localRole = localRole;
    this.remoteRole = localRole === 'host' ? 'joiner' : 'host';
  }

  async sealFrame(type: TransferMessage['type'], payload: string): Promise<Uint8Array> {
    if (!this.sendKey) throw new Error('SecureChannel geschlossen.');
    this.sendSeq += 1;
    const seq = this.sendSeq;
    const message = await MessageProtocol.create(type, payload, seq);
    const plaintext = MessageProtocol.encode(message);
    const iv = new Uint8Array(await Crypto.getRandomBytesAsync(IV_LEN));
    const aad = buildAad(this.sessionId, seq, this.localRole);
    try {
      const aes = gcm(this.sendKey, iv, aad);
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
    if (!this.recvKey) throw new Error('SecureChannel geschlossen.');
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
    const aad = buildAad(this.sessionId, seq, this.remoteRole);
    let plaintext: Uint8Array | null = null;
    try {
      const aes = gcm(this.recvKey, iv, aad);
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
    wipeBytes(this.sendKey);
    wipeBytes(this.recvKey);
    this.sendKey = null;
    this.recvKey = null;
    this.seenIds.clear();
  }
}
