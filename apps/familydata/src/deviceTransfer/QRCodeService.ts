import { z } from 'zod';

import {
  PAIRING_ACCEPT_TYPE,
  PAIRING_OFFER_TYPE,
  PAIRING_PROTOCOL_VERSION,
  type PairingAcceptPayload,
  type PairingOfferPayload,
  type PairingPayload,
} from '@/deviceTransfer/types';

const hexId = z.string().regex(/^[0-9a-f]{32}$/);
const hexPk = z.string().regex(/^[0-9a-f]{64}$/);
const ipv4 = z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}$/);

const offerSchema = z.object({
  v: z.literal(PAIRING_PROTOCOL_VERSION),
  t: z.literal(PAIRING_OFFER_TYPE),
  sid: hexId,
  did: hexId,
  pk: hexPk,
  exp: z.number().int().positive(),
  host: ipv4,
  port: z.number().int().min(1024).max(65535),
});

const acceptSchema = z.object({
  v: z.literal(PAIRING_PROTOCOL_VERSION),
  t: z.literal(PAIRING_ACCEPT_TYPE),
  sid: hexId,
  did: hexId,
  pk: hexPk,
  exp: z.number().int().positive(),
});

/**
 * Encode / decode pairing QR payloads.
 * Only session id, temp device id, public key, expiry, and host/port – never secrets or PII.
 */
export const QRCodeService = {
  encodeOffer(payload: PairingOfferPayload): string {
    return JSON.stringify(payload);
  },

  encodeAccept(payload: PairingAcceptPayload): string {
    return JSON.stringify(payload);
  },

  parse(raw: string): PairingPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('QR-Code ist kein gültiges Pairing-Paket.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('QR-Code-Inhalt ungültig.');
    }

    const type = (parsed as { t?: string }).t;
    if (type === PAIRING_OFFER_TYPE) {
      const result = offerSchema.safeParse(parsed);
      if (!result.success) throw new Error('Angebots-QR ungültig oder unvollständig (v2 inkl. host/port).');
      return result.data;
    }
    if (type === PAIRING_ACCEPT_TYPE) {
      const result = acceptSchema.safeParse(parsed);
      if (!result.success) throw new Error('Antwort-QR ungültig oder unvollständig.');
      return result.data;
    }
    throw new Error('Unbekannter Pairing-QR-Typ.');
  },

  assertNotExpired(exp: number, now = Date.now()) {
    if (now >= exp) {
      throw new Error('Pairing-Sitzung abgelaufen. Bitte neu starten.');
    }
  },
};
