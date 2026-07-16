import { SecurityManager } from '@/security/SecurityManager';

export type SecureAccessResult = { ok: true } | { ok: false; reason: string };

/**
 * Gate for sensitive UI (Identifikation). Uses native biometrics / device passcode only.
 */
export async function requireSecureAccess(promptMessage = 'Identifikation freigeben'): Promise<SecureAccessResult> {
  if (SecurityManager.isUnlocked()) {
    // Already in an authenticated vault session.
    return { ok: true };
  }
  const result = await SecurityManager.authenticateUser(promptMessage);
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.message };
}
