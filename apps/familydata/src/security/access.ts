import {
  authenticateBiometric,
  getBiometricSupport,
  getSecurityFlags,
  verifyPin,
} from '@/security/lock';

export type SecureAccessResult = { ok: true } | { ok: false; reason: string };

type PinAsker = (title: string) => Promise<string | null>;

let pinAsker: PinAsker | null = null;

/** Register UI PIN prompt (mounted once in root layout). */
export function registerPinAsker(asker: PinAsker | null) {
  pinAsker = asker;
}

async function askPin(title: string): Promise<SecureAccessResult> {
  if (!pinAsker) {
    return { ok: false, reason: 'PIN-Eingabe nicht verfügbar.' };
  }
  const value = await pinAsker(title);
  if (value == null) return { ok: false, reason: 'Abgebrochen.' };
  const ok = await verifyPin(value);
  return ok ? { ok: true } : { ok: false, reason: 'PIN ungültig.' };
}

/**
 * Gate for sensitive data (Identifikation). Prefers biometrics, then PIN.
 * If nothing is configured, tries device biometrics; otherwise asks to set up security.
 */
export async function requireSecureAccess(
  promptMessage = 'Identifikation freigeben'
): Promise<SecureAccessResult> {
  const flags = await getSecurityFlags();
  const support = await getBiometricSupport();

  if (flags.biometricsEnabled && support.hasHardware && support.enrolled) {
    const result = await authenticateBiometric();
    if (result.success) return { ok: true };
    if (flags.pinEnabled && flags.pinConfigured) return askPin(promptMessage);
    return { ok: false, reason: 'Biometrie abgebrochen.' };
  }

  if (flags.pinEnabled && flags.pinConfigured) {
    return askPin(promptMessage);
  }

  if (support.hasHardware && support.enrolled) {
    const result = await authenticateBiometric();
    if (result.success) return { ok: true };
    return { ok: false, reason: 'Sicherheitscheck fehlgeschlagen.' };
  }

  return {
    ok: false,
    reason:
      'Bitte unter Einstellungen → Sicherheit Biometrie oder PIN aktivieren, um Identifikation zu sehen.',
  };
}
