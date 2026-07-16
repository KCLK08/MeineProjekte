/**
 * Suppress vault auto-lock while system UI is open (pickers, biometric sheets).
 * Those transitions often emit AppState "inactive" without leaving the app session.
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
  // Brief grace so AppState settles after the system sheet closes.
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
