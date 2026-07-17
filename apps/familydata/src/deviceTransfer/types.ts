/**
 * Device-to-device transfer pairing + transport (Phase 2/3).
 * In-memory only – no vault/DB/document access.
 */

export const PAIRING_PROTOCOL_VERSION = 2 as const;
export const PAIRING_OFFER_TYPE = 'fv-pair-offer' as const;
export const PAIRING_ACCEPT_TYPE = 'fv-pair-accept' as const;

/** Default session lifetime for QR payloads. */
export const SESSION_TTL_MS = 5 * 60 * 1000;

/** Default TCP listen port for Phase 3 secure channel. */
export const TRANSFER_TCP_PORT = 27891;

export type TransferRole = 'host' | 'joiner';

export type PairingStatus =
  | 'idle'
  | 'creating'
  | 'showing_offer'
  | 'scanning_offer'
  | 'showing_accept'
  | 'scanning_accept'
  | 'paired'
  | 'expired'
  | 'error';

/** Public QR / handshake fields only – never private keys. */
export type PairingOfferPayload = {
  v: typeof PAIRING_PROTOCOL_VERSION;
  t: typeof PAIRING_OFFER_TYPE;
  sid: string;
  did: string;
  pk: string;
  exp: number;
  /** Host IPv4 for Phase 3 TCP connect (not a secret). */
  host: string;
  port: number;
};

export type PairingAcceptPayload = {
  v: typeof PAIRING_PROTOCOL_VERSION;
  t: typeof PAIRING_ACCEPT_TYPE;
  sid: string;
  did: string;
  pk: string;
  exp: number;
};

export type PairingPayload = PairingOfferPayload | PairingAcceptPayload;

export type EphemeralKeyPair = {
  publicKeyHex: string;
  /** Only held in RAM; wiped on clear. */
  secretKey: Uint8Array;
};

export type TransferSessionSnapshot = {
  role: TransferRole | null;
  status: PairingStatus;
  sessionId: string | null;
  localDeviceId: string | null;
  localPublicKeyHex: string | null;
  remoteDeviceId: string | null;
  remotePublicKeyHex: string | null;
  expiresAt: number | null;
  /** Short confirmation code derived after mutual keys (no secret material). */
  confirmationCode: string | null;
  /** Advertised TCP endpoint from offer (joiner uses to connect). */
  transportHost: string | null;
  transportPort: number | null;
  error: string | null;
  updatedAt: number;
};
