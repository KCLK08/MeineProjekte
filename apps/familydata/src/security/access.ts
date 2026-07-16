import { withAutoLockSuppressed } from '@/security/autoLockSuppress';
import { SecurityManager } from '@/security/SecurityManager';

export type SecureAccessResult = { ok: true } | { ok: false; reason: string };

type Options = {
  /** When true, always show a fresh biometric / passcode prompt (e.g. Identifikation, preview). */
  force?: boolean;
};

/**
 * Gate for sensitive UI. Uses native biometrics / device passcode only.
 */
export async function requireSecureAccess(
  promptMessage = 'Identifikation freigeben',
  options: Options = {}
): Promise<SecureAccessResult> {
  if (!options.force && SecurityManager.isUnlocked()) {
    return { ok: true };
  }
  return withAutoLockSuppressed(async () => {
    const result = await SecurityManager.authenticateUser(promptMessage);
    if (result.ok) return { ok: true };
    return { ok: false, reason: result.message };
  });
}
