export type Rng = {
  seed: number;
  next: () => number;
  nextInt: (maxExclusive: number) => number;
  nextSigned: (amplitude: number) => number;
  pick: <T>(items: T[]) => T;
  gaussian: () => number;
};

/** Linear congruential generator. Same seed → same sequence. */
export function createRng(seed: number): Rng {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return {
    seed: (seed >>> 0) || 1,
    next,
    nextInt: (maxExclusive: number) => {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    nextSigned: (amplitude: number) => (next() * 2 - 1) * amplitude,
    pick: <T>(items: T[]) => items[Math.floor(next() * items.length)] ?? items[0],
    gaussian: () => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

export function varyRate(base: number, variation: number, rng: Rng, min = 0, max = 1): number {
  const factor = 1 + rng.nextSigned(variation);
  return Math.min(max, Math.max(min, base * factor));
}
