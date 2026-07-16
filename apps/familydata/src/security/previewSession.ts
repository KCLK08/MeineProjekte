type Listener = () => void;

const listeners = new Set<Listener>();

/** Notifies preview surfaces to drop in-memory document content on lock. */
export function subscribePreviewWipe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function wipeAllPreviews() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore listener failures
    }
  }
}
