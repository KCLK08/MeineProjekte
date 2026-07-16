import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

import { markScreenCaptureProtected } from '@/security/runtimeHardening';

const KEY = 'familydata-vault';

/** Re-enable FLAG_SECURE / screen-capture protection (default). */
export async function enableScreenshotProtection(): Promise<void> {
  try {
    await ScreenCapture.preventScreenCaptureAsync(KEY);
    if (Platform.OS === 'ios') {
      await ScreenCapture.enableAppSwitcherProtectionAsync(0.7);
    }
    markScreenCaptureProtected(true);
  } catch {
    markScreenCaptureProtected(false);
  }
}

/** Allow screenshots until the next vault lock (session only). */
export async function allowScreenshotsForSession(): Promise<void> {
  try {
    await ScreenCapture.allowScreenCaptureAsync(KEY);
    if (Platform.OS === 'ios') {
      await ScreenCapture.disableAppSwitcherProtectionAsync();
    }
    markScreenCaptureProtected(false);
  } catch {
    // leave previous state
  }
}
