/** Integer money in euro cents. 100 € = 10_000. */
export type Cents = number;

export function eurosToCents(euros: number): Cents {
  return Math.round(euros * 100);
}

export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

export function roundCents(value: number): Cents {
  return Math.round(value);
}

export function clampCents(value: Cents, min = 0): Cents {
  return value < min ? min : value;
}

/** Allocate k of n members a share of a total without leftover drift. */
export function proportionalShare(total: Cents, k: number, n: number): Cents {
  if (n <= 0 || k <= 0 || total <= 0) return 0;
  if (k >= n) return total;
  return Math.floor((total * k) / n);
}

export function formatEuro(cents: Cents, fractionDigits = 2): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(ratio * 100)} %`;
}
