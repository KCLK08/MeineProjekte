import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'familydata.pin.hash';
const PIN_ENABLED_KEY = 'familydata.pin.enabled';
const BIO_ENABLED_KEY = 'familydata.bio.enabled';

/** Demo-only hash (not a production KDF). Replace later with Argon2/scrypt. */
async function hashPin(pin: string) {
  const payload = `familydata::${pin}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return `demo-${hash.toString(16)}`;
}

export async function getSecurityFlags() {
  const [pinEnabled, bioEnabled, hasPin] = await Promise.all([
    SecureStore.getItemAsync(PIN_ENABLED_KEY),
    SecureStore.getItemAsync(BIO_ENABLED_KEY),
    SecureStore.getItemAsync(PIN_KEY),
  ]);
  return {
    pinEnabled: pinEnabled === '1',
    biometricsEnabled: bioEnabled === '1',
    pinConfigured: Boolean(hasPin),
    encryptionReady: false,
  };
}

export async function setPinEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(PIN_ENABLED_KEY, enabled ? '1' : '0');
}

export async function setBiometricsEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(BIO_ENABLED_KEY, enabled ? '1' : '0');
}

export async function savePin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN muss 4–8 Ziffern haben.');
  const hashed = await hashPin(pin);
  await SecureStore.setItemAsync(PIN_KEY, hashed);
  await setPinEnabled(true);
}

export async function verifyPin(pin: string) {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored) return false;
  return stored === (await hashPin(pin));
}

export async function clearPin() {
  await SecureStore.deleteItemAsync(PIN_KEY);
  await setPinEnabled(false);
}

export async function getBiometricSupport() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  return { hasHardware, enrolled, types };
}

export async function authenticateBiometric() {
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'FamilyData entsperren',
    cancelLabel: 'Abbrechen',
    disableDeviceFallback: false,
  });
}
