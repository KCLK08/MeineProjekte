import type { Cents } from "../domain/money";
import type {
  ApplicationStatus,
  CreditClassConfig,
  LoanApplication,
  NeedPurpose,
  ScriptedApplication,
  SimulationParameters,
} from "../domain/types";
import {
  approveApplicant,
  creditLimitFor,
  creditScoreFor,
  pickClass,
  pickPurpose,
  termForClass,
  type Applicant,
} from "./credit";
import { clamp } from "./helpers";
import type { Rng } from "./rng";

let appSeq = 0;
export function resetApplicationSeq(): void {
  appSeq = 0;
}

function nextAppId(): string {
  appSeq += 1;
  return `A-${String(appSeq).padStart(6, "0")}`;
}

export function demandCount(params: SimulationParameters, month: number, members: number, demandMul: number): number {
  const d = params.creditDemand;
  let shockMul = 1;
  if (
    d.demandShockEnabled &&
    month >= d.demandShockStartMonth &&
    month < d.demandShockStartMonth + d.demandShockDuration
  ) {
    shockMul *= 1 + d.demandShockPercent;
  }
  let n = 0;
  if (d.model === "fixed") n = d.applicationsPerMonth;
  else if (d.model === "percentOfMembers") n = members * d.applicationsPercentOfMembers;
  else if (d.model === "perMember" || d.model === "byClass") {
    n = (members / 1000) * d.applicationsPerThousandMembers;
  } else if (d.model === "timeseries") {
    n = d.timeseries.find((x) => x.month === month)?.applications ?? d.applicationsPerMonth;
  }
  n *= (1 + d.demandGrowthPerMonth) ** Math.max(0, month - params.time.loanOriginationStartMonth);
  n *= demandMul * shockMul;
  return Math.max(0, n);
}

export function demandAverage(params: SimulationParameters, month: number): Cents {
  const ts = params.creditDemand.timeseries.find((x) => x.month === month);
  return ts?.averageAmountCents ?? params.creditDemand.averageAmountCents;
}

export function applicationFromApplicant(
  params: SimulationParameters,
  a: Applicant,
  month: number,
  cls: CreditClassConfig | undefined,
  memberId: string,
): LoanApplication {
  const needScore = a.needPriority;
  const membershipScore = clamp(a.tenureMonths / Math.max(1, params.creditScore.membershipRefMonths), 0, 1) * 100;
  const incomeScore = clamp(a.incomeCents / Math.max(1, params.creditScore.incomeRefCents), 0, 1) * 100;
  const repaymentScore = a.hasDefaultHistory ? 25 : 100;
  return {
    id: nextAppId(),
    memberId,
    applicationDate: month,
    requestedAmountCents: a.requestedCents,
    approvedAmountCents: 0,
    fundedAmountCents: 0,
    remainingAmountCents: a.requestedCents,
    purpose: a.purpose,
    priorityCategory: a.purpose,
    creditClass: a.classId,
    creditScore: a.score,
    needScore,
    membershipScore,
    incomeScore,
    repaymentScore,
    priorityScore: 0,
    status: "SUBMITTED",
    queuePosition: 0,
    waitlistDate: null,
    expectedFundingDate: null,
    actualFundingDate: null,
    expirationDate: month + params.allocation.maxWaitMonths,
    partialFundingAllowed: params.allocation.allowPartialFunding,
    rejectionReason: "",
    tenureMonths: a.tenureMonths,
    scale: a.scale,
    termMonths: termForClass(params, cls),
    personalBalanceCents: a.personalBalanceCents,
    solidarityPaidCents: a.solidarityPaidCents,
    incomeCents: a.incomeCents,
    existingDebtCents: a.existingDebtCents,
    hasDefaultHistory: a.hasDefaultHistory,
    collateral: a.collateral,
  };
}

export function reviewApplication(params: SimulationParameters, app: LoanApplication): LoanApplication {
  const cls = params.loans.classes.find((c) => c.id === app.creditClass);
  const applicant: Applicant = {
    seq: 0,
    classId: app.creditClass,
    purpose: app.purpose,
    requestedCents: app.remainingAmountCents > 0 ? app.remainingAmountCents : app.requestedAmountCents,
    tenureMonths: app.tenureMonths,
    personalBalanceCents: app.personalBalanceCents,
    solidarityPaidCents: app.solidarityPaidCents,
    incomeCents: app.incomeCents || params.income.averageMonthlyIncomeCents,
    expensesCents: params.income.averageMonthlyExpensesCents,
    existingDebtCents: app.existingDebtCents,
    hasDefaultHistory: app.hasDefaultHistory,
    collateral: app.collateral,
    score: app.creditScore,
    needPriority: app.needScore,
    limitCents: creditLimitFor(
      params,
      app.tenureMonths,
      app.personalBalanceCents,
      app.solidarityPaidCents,
      app.incomeCents || params.income.averageMonthlyIncomeCents,
    ),
    scale: app.scale,
  };
  const decision = approveApplicant(params, applicant, cls);
  if (!decision.ok) {
    return { ...app, status: "REJECTED", rejectionReason: decision.reason, approvedAmountCents: 0 };
  }
  const approved = decision.amount;
  if (approved <= 0) {
    return { ...app, status: "REJECTED", rejectionReason: decision.reason, approvedAmountCents: 0 };
  }
  return {
    ...app,
    status: "ELIGIBLE",
    approvedAmountCents: approved,
    remainingAmountCents: Math.max(0, approved - app.fundedAmountCents),
    rejectionReason: "",
  };
}

export function calculatePriorityScore(
  params: SimulationParameters,
  app: LoanApplication,
  month: number,
  fifoIndex: number,
  n: number,
): number {
  const waiting = Math.max(0, month - (app.waitlistDate ?? app.applicationDate));
  const ageBonus = waiting * params.allocation.ageBonusPerMonth;
  const need = clamp(app.needScore / 100, 0, 1);
  const score = clamp(app.creditScore / 100, 0, 1);
  const tenure = clamp(app.membershipScore / 100, 0, 1);
  const fifo = 1 - fifoIndex / Math.max(1, n);
  const age = clamp(waiting / Math.max(1, params.allocation.maxWaitMonths), 0, 1);
  const w = params.prioritization;
  switch (params.prioritization.strategy) {
    case "fifo":
      return (1 - app.applicationDate / Math.max(1, month + 1)) * 100 + (1000 - fifoIndex);
    case "score":
      return app.creditScore + ageBonus;
    case "need":
      return app.needScore + ageBonus;
    case "tenure":
      return app.membershipScore + ageBonus;
    case "emergency":
      return app.needScore * 10 + app.creditScore + ageBonus;
    case "hybrid":
    case "weighted":
      return (
        (w.weightNeed * need +
          w.weightScore * score +
          w.weightTenure * tenure +
          w.weightFifo * fifo +
          (params.allocation.waitlistMerge === "agingBonus" ? 0.15 * age : 0)) *
          100 +
        ageBonus
      );
    case "proportional":
      return 1;
    default:
      return app.creditScore + ageBonus;
  }
}

export function sortForAllocation(
  params: SimulationParameters,
  apps: LoanApplication[],
  month: number,
): LoanApplication[] {
  const n = apps.length;
  const scored = apps.map((app, i) => ({
    app: {
      ...app,
      priorityScore: calculatePriorityScore(params, app, month, i, n),
    },
    i,
  }));
  if (params.prioritization.strategy === "fifo") {
    scored.sort((a, b) => a.app.applicationDate - b.app.applicationDate || a.i - b.i);
  } else {
    scored.sort((a, b) => b.app.priorityScore - a.app.priorityScore || a.app.applicationDate - b.app.applicationDate);
  }
  return scored.map((s, pos) => ({ ...s.app, queuePosition: pos + 1 }));
}

export function mergeWaitlist(
  params: SimulationParameters,
  waitlist: LoanApplication[],
  incoming: LoanApplication[],
  month: number,
): LoanApplication[] {
  const policy = params.allocation.waitlistMerge;
  if (policy === "behind") {
    const kept = waitlist.map((app, i) => ({ ...app, queuePosition: i + 1 }));
    const newcomers = sortForAllocation(params, incoming, month).map((app, i) => ({
      ...app,
      queuePosition: kept.length + i + 1,
    }));
    return [...kept, ...newcomers];
  }
  return sortForAllocation(params, [...waitlist, ...incoming], month);
}

export function applyMaxWait(
  params: SimulationParameters,
  waitlist: LoanApplication[],
  month: number,
): { kept: LoanApplication[]; expired: LoanApplication[] } {
  const kept: LoanApplication[] = [];
  const expired: LoanApplication[] = [];
  for (const app of waitlist) {
    const waiting = month - (app.waitlistDate ?? app.applicationDate);
    if (waiting < params.allocation.maxWaitMonths) {
      kept.push(app);
      continue;
    }
    switch (params.allocation.maxWaitAction) {
      case "expire":
        expired.push({ ...app, status: "EXPIRED" });
        break;
      case "reReview": {
        const reviewed = reviewApplication(params, app);
        if (reviewed.status === "REJECTED" || reviewed.status === "EXPIRED") expired.push({ ...reviewed, status: reviewed.status === "REJECTED" ? "REJECTED" : "EXPIRED" });
        else kept.push({ ...reviewed, status: "WAITLISTED" });
        break;
      }
      case "boost":
        kept.push({ ...app, priorityScore: app.priorityScore + 50, status: "WAITLISTED" });
        break;
      case "keep":
      default:
        kept.push(app);
    }
  }
  return { kept, expired };
}

export type ExposureMaps = {
  byMember: Map<string, Cents>;
  byClass: Map<string, Cents>;
  byPurpose: Map<string, Cents>;
};

export function classCapRemaining(
  params: SimulationParameters,
  classId: string,
  fundAssets: Cents,
  outstanding: Cents,
): Cents {
  const row = params.allocation.maxClassExposureShare.find((x) => x.classId === classId);
  if (!row) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(fundAssets * row.maxShare) - outstanding);
}

export function purposeCapRemaining(
  params: SimulationParameters,
  purpose: NeedPurpose,
  fundAssets: Cents,
  outstanding: Cents,
): Cents {
  const row = params.allocation.maxPurposeExposureShare.find((x) => x.purpose === purpose);
  if (!row) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(fundAssets * row.maxShare) - outstanding);
}

export type AllocationResult = {
  funded: LoanApplication[];
  waitlisted: LoanApplication[];
  disbursedCents: Cents;
  remainingCapacityCents: Cents;
};

export function allocateLoans(
  params: SimulationParameters,
  queue: LoanApplication[],
  capacityCents: Cents,
  fundAssetsCents: Cents,
  exposure: ExposureMaps,
): AllocationResult {
  const funded: LoanApplication[] = [];
  const waitlisted: LoanApplication[] = [];
  let remaining = capacityCents;
  const minAmt = params.creditDemand.minAmountCents;
  const proportional = params.prioritization.strategy === "proportional";

  if (proportional && queue.length) {
    const total = queue.reduce((s, a) => s + a.remainingAmountCents, 0);
    const ratio = total > 0 ? Math.min(1, remaining / total) : 0;
    if (!params.allocation.allowPartialFunding && ratio < 1) {
      return { funded: [], waitlisted: queue.map((a) => ({ ...a, status: "WAITLISTED" as const })), disbursedCents: 0, remainingCapacityCents: remaining };
    }
    for (const app of queue) {
      const share = Math.floor(app.remainingAmountCents * ratio);
      if (share < minAmt && share < app.remainingAmountCents) {
        waitlisted.push({ ...app, status: "WAITLISTED" });
        continue;
      }
      const take = Math.min(share, remaining, app.remainingAmountCents);
      remaining -= take;
      const next = applyFunding(app, take);
      if (next.remainingAmountCents > 0) waitlisted.push(next);
      else funded.push(next);
      addExposure(exposure, next, take);
    }
    return { funded, waitlisted, disbursedCents: capacityCents - remaining, remainingCapacityCents: remaining };
  }

  for (const app of queue) {
    if (remaining <= 0) {
      waitlisted.push({ ...app, status: "WAITLISTED", waitlistDate: app.waitlistDate ?? app.applicationDate });
      continue;
    }
    if (params.allocation.maxMemberExposureCents > 0) {
      const used = exposure.byMember.get(app.memberId) ?? 0;
      if (used + Math.min(app.remainingAmountCents, remaining) > params.allocation.maxMemberExposureCents) {
        if (used >= params.allocation.maxMemberExposureCents) {
          waitlisted.push({ ...app, status: "WAITLISTED", rejectionReason: "maxMemberExposure" });
          continue;
        }
      }
    }
    const classUsed = exposure.byClass.get(app.creditClass) ?? 0;
    const purposeUsed = exposure.byPurpose.get(app.purpose) ?? 0;
    const classRoom = classCapRemaining(params, app.creditClass, fundAssetsCents, classUsed);
    const purposeRoom = purposeCapRemaining(params, app.purpose, fundAssetsCents, purposeUsed);
    const room = Math.min(remaining, app.remainingAmountCents, classRoom, purposeRoom);
    if (room <= 0) {
      waitlisted.push({ ...app, status: "WAITLISTED", waitlistDate: app.waitlistDate ?? app.applicationDate });
      continue;
    }
    const allowPartial = app.partialFundingAllowed && params.allocation.allowPartialFunding;
    if (room < app.remainingAmountCents && !allowPartial) {
      waitlisted.push({ ...app, status: "WAITLISTED", waitlistDate: app.waitlistDate ?? app.applicationDate });
      continue;
    }
    if (room < minAmt && room < app.remainingAmountCents) {
      waitlisted.push({ ...app, status: "WAITLISTED", waitlistDate: app.waitlistDate ?? app.applicationDate });
      continue;
    }
    const take = allowPartial ? room : app.remainingAmountCents;
    if (take > remaining) {
      waitlisted.push({ ...app, status: "WAITLISTED", waitlistDate: app.waitlistDate ?? app.applicationDate });
      continue;
    }
    remaining -= take;
    const next = applyFunding(app, take);
    addExposure(exposure, next, take);
    if (next.remainingAmountCents > 0) waitlisted.push(next);
    else funded.push(next);
  }

  return {
    funded,
    waitlisted,
    disbursedCents: capacityCents - remaining,
    remainingCapacityCents: remaining,
  };
}

function applyFunding(app: LoanApplication, take: Cents): LoanApplication {
  const fundedAmountCents = app.fundedAmountCents + take;
  const remainingAmountCents = Math.max(0, (app.approvedAmountCents || app.requestedAmountCents) - fundedAmountCents);
  const status: ApplicationStatus =
    remainingAmountCents > 0 ? "PARTIALLY_FUNDED" : "FUNDED";
  return {
    ...app,
    fundedAmountCents,
    remainingAmountCents,
    status,
    actualFundingDate: remainingAmountCents > 0 ? app.actualFundingDate : app.applicationDate,
  };
}

function addExposure(exposure: ExposureMaps, app: LoanApplication, take: Cents): void {
  exposure.byMember.set(app.memberId, (exposure.byMember.get(app.memberId) ?? 0) + take);
  exposure.byClass.set(app.creditClass, (exposure.byClass.get(app.creditClass) ?? 0) + take);
  exposure.byPurpose.set(app.purpose, (exposure.byPurpose.get(app.purpose) ?? 0) + take);
}

export function generateStochasticApplications(
  params: SimulationParameters,
  month: number,
  members: number,
  demandMul: number,
  rng: Rng,
  sampleCohort: (rng: Rng) => {
    tenureMonths: number;
    personalBalanceCents: Cents;
    solidarityPaidCents: Cents;
    memberId: string;
  },
): LoanApplication[] {
  const scripted = params.creditDemand.scriptedApplications.filter((s) => s.month === month);
  if (scripted.length) {
    return scripted.map((s) => scriptedToApplication(params, s, month));
  }
  const n = demandCount(params, month, members, demandMul);
  const avg = demandAverage(params, month);
  const materialized = Math.min(Math.ceil(n), params.maxApplicationsMaterialized);
  const scale = n > 0 && materialized > 0 ? n / materialized : 1;
  const apps: LoanApplication[] = [];
  for (let i = 0; i < materialized; i++) {
    const cls = pickClass(params, rng);
    const purpose = pickPurpose(params, rng);
    let amount = Math.round(avg * (1 + rng.gaussian() * params.creditDemand.amountNoiseStdev));
    amount = Math.min(params.creditDemand.maxAmountCents, Math.max(params.creditDemand.minAmountCents, amount));
    if (params.creditDemand.model === "byClass") {
      amount = Math.min(cls.maxCents, Math.max(cls.minCents || params.creditDemand.minAmountCents, amount));
    }
    const cohort = sampleCohort(rng);
    const income = Math.max(0, Math.round(params.income.averageMonthlyIncomeCents * (1 + rng.gaussian() * 0.15)));
    const partial: Applicant = {
      seq: i,
      classId: cls.id,
      purpose: purpose.id,
      requestedCents: Math.round(amount * scale),
      tenureMonths: cohort.tenureMonths,
      personalBalanceCents: cohort.personalBalanceCents,
      solidarityPaidCents: cohort.solidarityPaidCents,
      incomeCents: income,
      expensesCents: params.income.averageMonthlyExpensesCents,
      existingDebtCents: 0,
      hasDefaultHistory: false,
      collateral: rng.next() < params.income.collateralShare,
      needPriority: purpose.priority,
      limitCents: 0,
      score: 0,
      scale,
    };
    partial.limitCents = creditLimitFor(
      params,
      cohort.tenureMonths,
      cohort.personalBalanceCents,
      cohort.solidarityPaidCents,
      income,
    );
    partial.score = creditScoreFor(params, partial);
    apps.push(applicationFromApplicant(params, partial, month, cls, cohort.memberId));
  }
  return apps;
}

function scriptedToApplication(
  params: SimulationParameters,
  s: ScriptedApplication,
  month: number,
): LoanApplication {
  const cls =
    params.loans.classes.find((c) => c.id === s.classId) ??
    params.loans.classes.find((c) => s.requestedAmountCents >= c.minCents && s.requestedAmountCents <= c.maxCents) ??
    params.loans.classes[0];
  const purpose = s.purpose ?? "other";
  const tenure = s.tenureMonths ?? params.population.minMembershipMonthsForLoan;
  const income = s.incomeCents ?? params.income.averageMonthlyIncomeCents;
  const personal = s.personalBalanceCents ?? 0;
  const sol = s.solidarityPaidCents ?? 0;
  const partial: Applicant = {
    seq: 0,
    classId: cls.id,
    purpose,
    requestedCents: s.requestedAmountCents,
    tenureMonths: tenure,
    personalBalanceCents: personal,
    solidarityPaidCents: sol,
    incomeCents: income,
    expensesCents: params.income.averageMonthlyExpensesCents,
    existingDebtCents: s.existingDebtCents ?? 0,
    hasDefaultHistory: s.hasDefaultHistory ?? false,
    collateral: s.collateral ?? false,
    needPriority: params.needClasses.find((n) => n.id === purpose)?.priority ?? 10,
    limitCents: creditLimitFor(params, tenure, personal, sol, income),
    score: s.creditScore ?? 80,
    scale: 1,
  };
  if (s.creditScore === undefined) partial.score = creditScoreFor(params, partial);
  const app = applicationFromApplicant(params, partial, month, cls, s.memberId ?? `M-script-${appSeq + 1}`);
  if (s.partialFundingAllowed !== undefined) app.partialFundingAllowed = s.partialFundingAllowed;
  return app;
}

export function waitlistStats(waitlist: LoanApplication[], month: number) {
  const amounts = waitlist.map((a) => a.remainingAmountCents);
  const waits = waitlist.map((a) => month - (a.waitlistDate ?? a.applicationDate));
  const sorted = [...waits].sort((a, b) => a - b);
  const mid = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const sumWait = waits.reduce((s, x) => s + x, 0);
  const sumAmt = amounts.reduce((s, x) => s + x, 0);
  return {
    count: waitlist.length,
    amountCents: sumAmt,
    averageWaitMonths: waitlist.length ? sumWait / waitlist.length : 0,
    medianWaitMonths: mid,
    maxWaitMonths: sorted.length ? sorted[sorted.length - 1] : 0,
    oldestAge: sorted.length ? sorted[sorted.length - 1] : 0,
    averageAmountCents: waitlist.length ? Math.round(sumAmt / waitlist.length) : 0,
  };
}

export const processWaitlist = allocateLoans;
export const calculateWaitlist = waitlistStats;
