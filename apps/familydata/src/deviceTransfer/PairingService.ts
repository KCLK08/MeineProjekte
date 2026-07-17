import { DeviceIdentityService } from '@/deviceTransfer/DeviceIdentityService';
import { EphemeralKeyService } from '@/deviceTransfer/EphemeralKeyService';
import { QRCodeService } from '@/deviceTransfer/QRCodeService';
import {
  PAIRING_ACCEPT_TYPE,
  PAIRING_OFFER_TYPE,
  PAIRING_PROTOCOL_VERSION,
  SESSION_TTL_MS,
  type EphemeralKeyPair,
  type PairingAcceptPayload,
  type PairingOfferPayload,
  type TransferRole,
} from '@/deviceTransfer/types';

export type HostOfferResult = {
  role: 'host';
  sessionId: string;
  localDeviceId: string;
  keyPair: EphemeralKeyPair;
  expiresAt: number;
  offerPayload: PairingOfferPayload;
  offerQr: string;
};

export type JoinerAcceptResult = {
  role: 'joiner';
  sessionId: string;
  localDeviceId: string;
  keyPair: EphemeralKeyPair;
  remoteDeviceId: string;
  remotePublicKeyHex: string;
  expiresAt: number;
  acceptPayload: PairingAcceptPayload;
  acceptQr: string;
  confirmationCode: string;
};

export type HostCompleteResult = {
  remoteDeviceId: string;
  remotePublicKeyHex: string;
  confirmationCode: string;
  expiresAt: number;
};

/**
 * Pairing preparation: ephemeral keys + QR offer/accept.
 * No transport, no data encryption, no vault access.
 */
export const PairingService = {
  async createHostOffer(ttlMs: number = SESSION_TTL_MS): Promise<HostOfferResult> {
    const [sessionId, localDeviceId, keyPair] = await Promise.all([
      DeviceIdentityService.createSessionId(),
      DeviceIdentityService.createTemporaryDeviceId(),
      EphemeralKeyService.generateKeyPair(),
    ]);
    const expiresAt = Date.now() + ttlMs;
    const offerPayload: PairingOfferPayload = {
      v: PAIRING_PROTOCOL_VERSION,
      t: PAIRING_OFFER_TYPE,
      sid: sessionId,
      did: localDeviceId,
      pk: keyPair.publicKeyHex,
      exp: expiresAt,
    };
    return {
      role: 'host',
      sessionId,
      localDeviceId,
      keyPair,
      expiresAt,
      offerPayload,
      offerQr: QRCodeService.encodeOffer(offerPayload),
    };
  },

  async acceptHostOffer(rawQr: string, ttlMs: number = SESSION_TTL_MS): Promise<JoinerAcceptResult> {
    const payload = QRCodeService.parse(rawQr);
    if (payload.t !== PAIRING_OFFER_TYPE) {
      throw new Error('Bitte den QR-Code vom alten Gerät scannen (Angebot).');
    }
    QRCodeService.assertNotExpired(payload.exp);

    const [localDeviceId, keyPair] = await Promise.all([
      DeviceIdentityService.createTemporaryDeviceId(),
      EphemeralKeyService.generateKeyPair(),
    ]);

    const expiresAt = Math.min(payload.exp, Date.now() + ttlMs);
    const acceptPayload: PairingAcceptPayload = {
      v: PAIRING_PROTOCOL_VERSION,
      t: PAIRING_ACCEPT_TYPE,
      sid: payload.sid,
      did: localDeviceId,
      pk: keyPair.publicKeyHex,
      exp: expiresAt,
    };

    const confirmationCode = EphemeralKeyService.deriveConfirmationCode(keyPair.secretKey, payload.pk);

    return {
      role: 'joiner',
      sessionId: payload.sid,
      localDeviceId,
      keyPair,
      remoteDeviceId: payload.did,
      remotePublicKeyHex: payload.pk,
      expiresAt,
      acceptPayload,
      acceptQr: QRCodeService.encodeAccept(acceptPayload),
      confirmationCode,
    };
  },

  completeHostWithAccept(
    rawQr: string,
    expected: { sessionId: string; localDeviceId: string; keyPair: EphemeralKeyPair }
  ): HostCompleteResult {
    const payload = QRCodeService.parse(rawQr);
    if (payload.t !== PAIRING_ACCEPT_TYPE) {
      throw new Error('Bitte den Antwort-QR vom neuen Gerät scannen.');
    }
    QRCodeService.assertNotExpired(payload.exp);
    if (payload.sid !== expected.sessionId) {
      throw new Error('Sitzungs-ID stimmt nicht überein.');
    }
    if (payload.did === expected.localDeviceId) {
      throw new Error('Eigenes Gerät erkannt – bitte das andere Gerät scannen.');
    }
    if (payload.pk === expected.keyPair.publicKeyHex) {
      throw new Error('Ungültige Antwort (gleicher Schlüssel).');
    }

    const confirmationCode = EphemeralKeyService.deriveConfirmationCode(
      expected.keyPair.secretKey,
      payload.pk
    );

    return {
      remoteDeviceId: payload.did,
      remotePublicKeyHex: payload.pk,
      confirmationCode,
      expiresAt: payload.exp,
    };
  },

  roleLabel(role: TransferRole | null): string {
    if (role === 'host') return 'Altes Gerät (Sender)';
    if (role === 'joiner') return 'Neues Gerät (Empfänger)';
    return '—';
  },
};
