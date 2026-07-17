/** Hex / wipe helpers for ephemeral transfer crypto. Never log key material. */

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('Ungültiges Hex-Format.');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Best-effort in-place wipe (JS cannot guarantee physical zeroization). */
export function wipeBytes(bytes: Uint8Array | null | undefined) {
  if (!bytes) return;
  bytes.fill(0);
}
