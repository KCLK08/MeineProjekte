import { z } from 'zod';

import { DeviceIdentityService } from '@/deviceTransfer/DeviceIdentityService';

export const MESSAGE_TYPES = [
  'ping',
  'pong',
  'test',
  'ack',
  'close',
  'meta_manifest',
  'meta_chunk',
  'meta_done',
  'meta_ack',
  'meta_reject',
] as const;
export type TransferMessageType = (typeof MESSAGE_TYPES)[number];

export type TransferMessage = {
  messageId: string;
  timestamp: number;
  type: TransferMessageType;
  /** Monotonic per-sender sequence for replay protection. */
  seq: number;
  payload: string;
};

const messageSchema = z.object({
  messageId: z.string().regex(/^[0-9a-f]{32}$/),
  timestamp: z.number().int().positive(),
  type: z.enum(MESSAGE_TYPES),
  seq: z.number().int().positive(),
  /** Chunked metadata may use larger payloads than Phase 3 test strings. */
  payload: z.string().max(8192),
});

/** Max clock skew accepted for incoming messages (ms). */
export const MESSAGE_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Application message codec (plaintext before AEAD).
 */
export const MessageProtocol = {
  async create(
    type: TransferMessageType,
    payload: string,
    seq: number
  ): Promise<TransferMessage> {
    const messageId = await DeviceIdentityService.createSessionId();
    return {
      messageId,
      timestamp: Date.now(),
      type,
      seq,
      payload,
    };
  },

  encode(message: TransferMessage): Uint8Array {
    const parsed = messageSchema.parse(message);
    return new TextEncoder().encode(JSON.stringify(parsed));
  },

  decode(bytes: Uint8Array): TransferMessage {
    let text: string;
    try {
      text = new TextDecoder().decode(bytes);
    } catch {
      throw new Error('Nachricht konnte nicht gelesen werden.');
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Nachrichtenformat ungültig.');
    }
    const result = messageSchema.safeParse(json);
    if (!result.success) {
      throw new Error('Nachricht abgelehnt (Schema).');
    }
    return result.data;
  },

  assertFresh(message: TransferMessage, now = Date.now()) {
    const skew = Math.abs(now - message.timestamp);
    if (skew > MESSAGE_TIMESTAMP_WINDOW_MS) {
      throw new Error('Nachricht abgelehnt (Zeitfenster / Replay).');
    }
  },
};
