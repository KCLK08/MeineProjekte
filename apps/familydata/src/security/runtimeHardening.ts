/** Runtime flags for local security self-checks (no secrets). */

let screenCaptureProtected = false;

export function markScreenCaptureProtected(active: boolean) {
  screenCaptureProtected = active;
}

export function isScreenCaptureProtected(): boolean {
  return screenCaptureProtected;
}
