/**
 * Scoped auto-lock suppression for brief system UI / atomic ops only.
 *
 * Allowed:
 * - Active camera QR capture (PairingQrScanner while preview is live)
 * - Active biometric / OS auth sheet (requireSecureAccess, unlock)
 * - Short atomic vault cutover commit (file swap + Keystore write)
 *
 * NOT allowed for entire transfer screens, metadata/chunk transfer, or staging.
 * While unsuppressed, backgrounding the app follows normal Auto-Lock → lock()
 * which wipes the transfer session, closes transport, and cleans staging.
 */

let depth = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

export function beginAutoLockSuppress() {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  depth += 1;
}

export function endAutoLockSuppress() {
  if (releaseTimer) clearTimeout(releaseTimer);
  // Brief grace so AppState settles after the system sheet / camera teardown.
  releaseTimer = setTimeout(() => {
    depth = Math.max(0, depth - 1);
    releaseTimer = null;
  }, 900);
}

export function isAutoLockSuppressed() {
  return depth > 0;
}

export async function withAutoLockSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  beginAutoLockSuppress();
  try {
    return await fn();
  } finally {
    endAutoLockSuppress();
  }
}
