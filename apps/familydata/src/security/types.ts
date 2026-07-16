/** Auto-lock delay after the app leaves the foreground. */
export type AutoLockOption = 'immediate' | '1' | '5' | '15';

export type BiometricAvailability = {
  hasHardware: boolean;
  isEnrolled: boolean;
  /** True when the OS can authenticate via biometrics and/or device passcode. */
  canAuthenticate: boolean;
  securityLevel: 'none' | 'biometric' | 'device_passcode' | 'biometric_or_device';
};

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed' | 'locked_out'; message: string };

export const AUTO_LOCK_OPTIONS: { id: AutoLockOption; label: string; ms: number | null }[] = [
  { id: 'immediate', label: 'Sofort (empfohlen)', ms: 0 },
  { id: '1', label: 'Nach 1 Minute', ms: 60_000 },
  { id: '5', label: 'Nach 5 Minuten', ms: 5 * 60_000 },
  { id: '15', label: 'Nach 15 Minuten', ms: 15 * 60_000 },
];

export function autoLockMs(option: AutoLockOption): number | null {
  return AUTO_LOCK_OPTIONS.find((o) => o.id === option)?.ms ?? 0;
}
