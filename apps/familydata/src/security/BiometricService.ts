import * as LocalAuthentication from 'expo-local-authentication';

import type { AuthResult, BiometricAvailability } from '@/security/types';

/**
 * Native biometric / device-credential authentication.
 * No app-owned PIN or password is stored or verified in JS.
 */
export const BiometricService = {
  async checkBiometricAvailability(): Promise<BiometricAvailability> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const level = await LocalAuthentication.getEnrolledLevelAsync();

    let securityLevel: BiometricAvailability['securityLevel'] = 'none';
    if (level >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK) {
      securityLevel = 'biometric_or_device';
    } else if (level === LocalAuthentication.SecurityLevel.SECRET) {
      securityLevel = 'device_passcode';
    }

    return {
      hasHardware,
      isEnrolled,
      canAuthenticate: level > LocalAuthentication.SecurityLevel.NONE,
      securityLevel,
    };
  },

  /**
   * Prompts Face ID / fingerprint, with the system device passcode as fallback.
   */
  async authenticateUser(promptMessage = 'FamilyData entsperren'): Promise<AuthResult> {
    const availability = await this.checkBiometricAvailability();
    if (!availability.canAuthenticate) {
      return {
        ok: false,
        reason: 'unavailable',
        message:
          'Auf diesem Gerät ist keine Bildschirmsperre oder Biometrie eingerichtet. Bitte unter Systemeinstellungen aktivieren.',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Abbrechen',
      disableDeviceFallback: false,
    });

    if (result.success) return { ok: true };

    const err = 'error' in result ? String(result.error) : '';
    if (err.includes('cancel')) {
      return { ok: false, reason: 'cancelled', message: 'Authentifizierung abgebrochen.' };
    }
    if (err.includes('lockout')) {
      return { ok: false, reason: 'locked_out', message: 'Zu viele Fehlversuche. Bitte später erneut versuchen.' };
    }
    return {
      ok: false,
      reason: 'failed',
      message: err || 'Authentifizierung fehlgeschlagen.',
    };
  },
};
