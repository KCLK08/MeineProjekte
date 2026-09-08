import type { Cents } from "../domain/money";
import { proportionalShare } from "../domain/money";
import type {
  CreditClassConfig,
  NeedPurpose,
  SimulationParameters,
} from "../domain/types";
import { classForAmount, clamp } from "./helpers";
import type { Rng } from "./rng";

export type Applicant = {
  seq: number;
  classId: string;
  purpose: NeedPurpose;
  requestedCents: Cents;
  tenureMonths: number;
  personalBalanceCents: Cents;
  solidarityPaidCents: Cents;
  incomeCents: Cents;
  expensesCents: Cents;
  existingDebtCents: Cents;
  hasDefaultHistory: boolean;
  collateral: boolean;
  score: number;
  needPriority: number;
  limitCents: Cents;
  scale: number;
};

export function tenureLimitCents(params: SimulationParameters, tenure: number): Cents {
  let best: Cents = 0;
  for (const row of params.loans.tenureLimits) {
    if (tenure >= row.minMonths) best = Math.max(best, row.maxCents);
  }
  return best;
}

export function creditLimitFor(
  params: SimulationParameters,
  tenure: number,
  personalBalance: Cents,
  solidarityPaid: Cents,
  income: Cents,
): Cents {
  const product = params.loans.maxProductCents;
  const byTenure = tenureLimitCents(params, tenure);
  const bySolidarity = Math.floor(solidarityPaid * params.loans.solidarityMultiplier);
  const byPersonal = Math.floor(personalBalance * params.loans.personalMultiplier);
  const byIncome = params.loans.incomeLimitEnabled
    ? Math.floor(income * params.loans.incomeMultiple)
    : Number.MAX_SAFE_INTEGER;

  switch (params.loans.limitMethod) {
    case "fixed":
      return product;
    case "tenure":
      return Math.min(product, byTenure);
    case "solidarityMultiple":
      return Math.min(product, bySolidarity);
    case "personalMultiple":
      return Math.min(product, byPersonal);
    case "combined":
      return Math.min(product, byTenure, bySolidarity, byPersonal, byIncome);
    default:
      return product;
  }
}

export function creditScoreFor(params: SimulationParameters, a: Omit<Applicant, "score" | "limitCents">): number {
  const s = params.creditScore;
  const f = s.enabledFactors;
  let score = 0;
  if (f.membership) {
    score += s.membershipMax * clamp(a.tenureMonths / Math.max(1, s.membershipRefMonths), 0, 1);
  }
  if (f.personalBalance) {
    score += s.personalBalanceMax * clamp(a.personalBalanceCents / Math.max(1, s.personalBalanceRefCents), 0, 1);
  }
  if (f.income) {
    score += s.incomeMax * clamp(a.incomeCents / Math.max(1, s.incomeRefCents), 0, 1);
  }
  if (f.repaymentHistory) {
    score += a.hasDefaultHistory ? s.repaymentHistoryMax * 0.25 : s.repaymentHistoryMax;
  }
  if (f.existingDebt) {
    const t = clamp(a.existingDebtCents / Math.max(1, s.existingDebtRefCents), 0, 1);
    score += s.existingDebtMax + (s.existingDebtMin - s.existingDebtMax) * t;
  }
  if (f.dti) {
    const payment = a.requestedCents / Math.max(1, 24);
    const dti = a.incomeCents > 0 ? payment / a.incomeCents : 1;
    const t = clamp(dti / Math.max(0.01, s.dtiRef), 0, 1);
    score += s.dtiMax + (s.dtiMin - s.dtiMax) * t;
  }
  if (f.collateral) {
    score += a.collateral ? s.collateralMax : 0;
  }
  if (f.delinquency && a.hasDefaultHistory) {
    score += s.delinquencyMin * 0.5;
  }
  return score;
}

export function approveApplicant(
  params: SimulationParameters,
  a: Applicant,
  cls: CreditClassConfig | undefined,
): { ok: boolean; reason: string; amount: Cents } {
  const f = params.creditApproval.enabledFactors;
  if (f.membershipDuration && a.tenureMonths < params.population.minMembershipMonthsForLoan) {
    return { ok: false, reason: "Mindestmitgliedschaft", amount: 0 };
  }
  if (cls && f.creditClass && a.tenureMonths < cls.minMembershipMonths) {
    return { ok: false, reason: "Kreditklasse Mitgliedschaftsdauer", amount: 0 };
  }
  if (f.defaultHistory && params.creditApproval.rejectIfDefaultHistory && a.hasDefaultHistory) {
    return { ok: false, reason: "Ausfallhistorie", amount: 0 };
  }
  if (a.score < params.creditApproval.minCreditScore) {
    return { ok: false, reason: "Credit Score", amount: 0 };
  }
  if (f.dti && a.incomeCents > 0) {
    const dti = a.requestedCents / a.incomeCents;
    if (dti > params.creditApproval.maxOutstandingToIncome) {
      return { ok: false, reason: "Kredit-/Einkommensverhältnis", amount: 0 };
    }
  }
  if (
    f.guarantor &&
    params.creditApproval.requireGuarantorForPremium &&
    cls?.id === "premium" &&
    !a.collateral
  ) {
    return { ok: false, reason: "Bürgschaft/Sicherheit", amount: 0 };
  }
  let amount = a.requestedCents;
  if (amount > a.limitCents) {
    if (params.loans.amountCapPolicy === "reject") {
      return { ok: false, reason: "Über Limit", amount: 0 };
    }
    amount = a.limitCents;
  }
  if (cls) {
    amount = Math.min(amount, cls.maxCents);
    if (amount < cls.minCents && cls.minCents > 0 && amount < a.requestedCents) {
      /* keep capped amount */
    }
  }
  amount = Math.max(0, Math.min(amount, params.creditDemand.maxAmountCents));
  if (amount < params.creditDemand.minAmountCents) {
    return { ok: false, reason: "Unter Mindestantrag", amount: 0 };
  }
  return { ok: true, reason: "approved", amount };
}

export function priorityValue(params: SimulationParameters, a: Applicant, fifoIndex: number, n: number): number {
  const need = a.needPriority / 100;
  const tenure = clamp(a.tenureMonths / 48, 0, 1);
  const score = clamp(a.score / 100, 0, 1);
  const fifo = 1 - fifoIndex / Math.max(1, n);
  switch (params.prioritization.strategy) {
    case "score":
      return score;
    case "need":
      return need;
    case "tenure":
      return tenure;
    case "fifo":
      return fifo;
    case "weighted":
    case "hybrid": {
      const w = params.prioritization;
      return (
        w.weightScore * score +
        w.weightNeed * need +
        w.weightTenure * tenure +
        w.weightFifo * fifo
      );
    }
    case "emergency":
      return need * 10 + score;
    case "proportional":
      return 1;
    default:
      return fifo;
  }
}

export function termForClass(params: SimulationParameters, cls: CreditClassConfig | undefined): number {
  const t = cls?.defaultTermMonths ?? params.loans.defaultTermMonths;
  if (params.loans.allowedTerms.includes(t)) return t;
  return params.loans.defaultTermMonths;
}

export function pickPurpose(params: SimulationParameters, rng: Rng): { id: NeedPurpose; priority: number } {
  const t = rng.next();
  let acc = 0;
  for (const n of params.needClasses) {
    acc += n.share;
    if (t <= acc) return { id: n.id, priority: n.priority };
  }
  const last = params.needClasses[params.needClasses.length - 1];
  return { id: last.id, priority: last.priority };
}

export function pickClass(params: SimulationParameters, rng: Rng): CreditClassConfig {
  const t = rng.next();
  let acc = 0;
  for (const mix of params.creditDemand.classMix) {
    acc += mix.share;
    if (t <= acc) {
      return params.loans.classes.find((c) => c.id === mix.classId) ?? params.loans.classes[0];
    }
  }
  return params.loans.classes[params.loans.classes.length - 1];
}

export { classForAmount, proportionalShare };
