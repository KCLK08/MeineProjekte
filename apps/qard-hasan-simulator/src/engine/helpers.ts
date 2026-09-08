import type { Cents } from "../domain/money";
import type {
  CreditClassConfig,
  LedgerAccount,
  LedgerEntry,
  LedgerEventType,
  SimulationParameters,
} from "../domain/types";

let ledgerSeq = 0;

export function resetLedgerSeq(): void {
  ledgerSeq = 0;
}

export function pushLedger(
  ledger: LedgerEntry[],
  month: number,
  date: string,
  type: LedgerEventType,
  account: LedgerAccount,
  debitCents: Cents,
  creditCents: Cents,
  memo: string,
  count = 1,
): void {
  if (debitCents === 0 && creditCents === 0) return;
  ledgerSeq += 1;
  ledger.push({
    id: `L-${month}-${ledgerSeq}`,
    month,
    date,
    type,
    account,
    debitCents,
    creditCents,
    memo,
    count,
  });
}

export function classForAmount(
  classes: CreditClassConfig[],
  amount: Cents,
): CreditClassConfig | undefined {
  return classes.find((c) => amount >= c.minCents && amount <= c.maxCents) ?? classes[classes.length - 1];
}

export function activeEventEffects(params: SimulationParameters, month: number) {
  const acc = {
    defaultRateDelta: 0,
    exitRateMultiplier: 1,
    demandMultiplier: 1,
    newMembersMultiplier: 1,
    recoveryDelta: 0,
    adminCostMultiplier: 1,
    personalLiquidityOutflowRate: 0,
  };
  for (const event of params.events) {
    if (!event.enabled) continue;
    if (month < event.startMonth || month >= event.startMonth + event.durationMonths) continue;
    acc.defaultRateDelta += event.effects.defaultRateDelta;
    acc.exitRateMultiplier *= event.effects.exitRateMultiplier;
    acc.demandMultiplier *= event.effects.demandMultiplier;
    acc.newMembersMultiplier *= event.effects.newMembersMultiplier;
    acc.recoveryDelta += event.effects.recoveryDelta;
    acc.adminCostMultiplier *= event.effects.adminCostMultiplier;
    acc.personalLiquidityOutflowRate += event.effects.personalLiquidityOutflowRate;
  }
  if (params.shocks.enabled && month === params.shocks.month) {
    acc.demandMultiplier *= params.shocks.demandMultiplier;
    acc.adminCostMultiplier *= params.shocks.adminCostMultiplier;
    acc.personalLiquidityOutflowRate += params.shocks.personalPayoutRate;
  }
  return acc;
}

export function monthDate(startIso: string, monthIndex: number): Date {
  const start = new Date(startIso);
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (monthIndex - 1), 1));
  return d;
}

export function isoMonth(startIso: string, monthIndex: number): string {
  return monthDate(startIso, monthIndex).toISOString().slice(0, 10);
}

export function monthOfYear(startIso: string, monthIndex: number): number {
  return monthDate(startIso, monthIndex).getUTCMonth() + 1;
}

export function seasonalMultiplier(
  table: { monthOfYear: number; multiplier: number }[],
  moy: number,
): number {
  const hit = table.find((s) => s.monthOfYear === moy);
  return hit ? hit.multiplier : 1;
}

export function toMonthlyRate(rate: number, basis: "annual" | "monthly"): number {
  if (basis === "monthly") return rate;
  return rate / 12;
}

export function pickWeighted<T extends { share: number }>(items: T[], t: number): T {
  let acc = 0;
  for (const item of items) {
    acc += item.share;
    if (t <= acc) return item;
  }
  return items[items.length - 1];
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

export function percentileSet(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, x) => s + x, 0);
  return {
    mean: sorted.length ? sum / sorted.length : 0,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    p5: percentile(sorted, 0.05),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
  };
}
