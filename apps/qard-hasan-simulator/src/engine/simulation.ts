import { proportionalShare, type Cents } from "../domain/money";
import { ENGINE_VERSION, PARAMETER_VERSION } from "../domain/types";
import type {
  FormulaLine,
  InvariantViolation,
  LedgerEntry,
  Loan,
  Member,
  MonthlySnapshot,
  NeedPurpose,
  SimulationLogEntry,
  SimulationParameters,
  SimulationResult,
  Warning,
} from "../domain/types";
import { assertValidParameters, validateParameters } from "../domain/validation";
import { linearAmortization, paymentDue } from "./amortization";
import {
  approveApplicant,
  creditLimitFor,
  creditScoreFor,
  pickClass,
  pickPurpose,
  priorityValue,
  termForClass,
  type Applicant,
} from "./credit";
import {
  activeEventEffects,
  isoMonth,
  monthOfYear,
  pushLedger,
  resetLedgerSeq,
  seasonalMultiplier,
  toMonthlyRate,
} from "./helpers";
import { computeHealth, computeRisk, computeWarnings } from "./risk";
import { createRng, type Rng } from "./rng";

type Cohort = {
  joinMonth: number;
  count: number;
  personalBalanceCents: Cents;
  solidarityPaidCents: Cents;
};

type Vintage = {
  id: string;
  originationMonth: number;
  termMonths: number;
  classId: string;
  purpose: NeedPurpose;
  count: number;
  originalPrincipalCents: Cents;
  remainingPrincipalCents: Cents;
  amountRepaidCents: Cents;
  paymentsMade: number;
  delinquentCents: Cents;
  delinquentAge: number;
};

type Payable = { monthDue: number; amountCents: Cents };
type RecoveryItem = { monthDue: number; amountCents: Cents; defaultedCents: Cents };

function id(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

function feeFor(params: SimulationParameters, month: number, members: number): Cents {
  const a = params.administration;
  if (a.feeMode === "schedule" && month >= a.feeChangeMonth) return a.feeAfterChangeCents;
  if (a.feeMode === "tiered") {
    const tier = a.tiers.find((t) => members >= t.minMembers && members <= t.maxMembers);
    if (tier) return tier.feeCents;
  }
  return a.feePerMemberCents;
}

function adminCostsFor(
  params: SimulationParameters,
  month: number,
  members: number,
  moy: number,
  costMultiplier: number,
): Cents {
  let total = 0;
  for (const cat of params.administration.costs) {
    if (!cat.enabled) continue;
    let m = cat.fixedMonthlyCents + cat.perMemberCents * members;
    if (cat.growthPercentPerMonth) {
      m = Math.round(m * (1 + cat.growthPercentPerMonth) ** (month - 1));
    }
    for (const tier of cat.tiers) {
      if (members >= tier.minMembers) m += tier.extraMonthlyCents;
    }
    if (cat.annualCents && moy === cat.annualChargeMonth) m += cat.annualCents;
    for (const one of cat.oneOff) {
      if (one.month === month) m += one.amountCents;
    }
    total += m;
  }
  return Math.round(total * costMultiplier);
}

function defaultRateFor(
  params: SimulationParameters,
  vintage: Vintage,
  month: number,
  delta: number,
  rng: Rng,
): number {
  let annual = params.defaults.constantRate;
  const model = params.defaults.model;
  if (model === "byClass") {
    annual = params.defaults.byClass.find((x) => x.classId === vintage.classId)?.rate ?? annual;
  } else if (model === "byTenure") {
    const age = month - vintage.originationMonth;
    let hit = params.defaults.byTenure[0]?.rate ?? annual;
    for (const row of params.defaults.byTenure) {
      if (age >= row.minMonths) hit = row.rate;
    }
    annual = hit;
  } else if (model === "byMonth") {
    annual = params.defaults.byMonth.find((x) => x.month === month)?.value ?? annual;
  } else if (model === "byRemainingTerm") {
    const left = vintage.termMonths - vintage.paymentsMade;
    let hit = annual;
    const sorted = [...params.defaults.byRemainingTerm].sort(
      (a, b) => a.maxRemainingMonths - b.maxRemainingMonths,
    );
    for (const row of sorted) {
      if (left <= row.maxRemainingMonths) {
        hit = row.rate;
        break;
      }
    }
    annual = hit;
  } else if (model === "random") {
    annual = Math.max(0, annual * (1 + rng.nextSigned(0.5)));
  }
  annual = Math.max(0, annual + delta);
  return toMonthlyRate(annual, params.defaults.rateBasis);
}

function timingAllowsDefault(params: SimulationParameters, vintage: Vintage, month: number, rng: Rng): boolean {
  const age = month - vintage.originationMonth;
  if (age < 1) return false;
  switch (params.defaults.timing) {
    case "immediate":
      return true;
    case "afterMonths":
      return age >= params.defaults.timingAfterMonths;
    case "nearEnd":
      return vintage.termMonths - vintage.paymentsMade <= params.defaults.nearEndMonths;
    case "random":
      return rng.next() > 0.02 || age >= 1;
    default:
      return true;
  }
}

function recoveryRateFor(
  params: SimulationParameters,
  classId: string,
  recoveryDelta: number,
  rng: Rng,
): number {
  let r = params.recovery.fixedRate;
  if (params.recovery.model === "byClass") {
    r = params.recovery.byClass.find((x) => x.classId === classId)?.rate ?? r;
  } else if (params.recovery.model === "byCollateral") {
    r = params.recovery.collateralRecoveryRate;
  } else if (params.recovery.model === "byTime") {
    r = params.recovery.byTime[0]?.rate ?? r;
  } else if (params.recovery.model === "random") {
    r = r + rng.gaussian() * params.recovery.randomStdev;
  }
  return Math.min(1, Math.max(0, r + recoveryDelta));
}

function availableCapacity(params: SimulationParameters, cash: Cents, outstanding: Cents): Cents {
  const assets = cash + outstanding;
  const fromUtil = Math.floor(params.fund.maximumLoanUtilization * assets) - outstanding;
  const fromReserve = cash - Math.ceil(params.fund.minimumFundReserve * assets);
  const fromAbs = cash - params.liquidity.minAbsoluteSolidarityCashCents;
  return Math.max(0, Math.min(cash, fromUtil, fromReserve, fromAbs));
}

function theoreticalCapacity(params: SimulationParameters, cash: Cents, outstanding: Cents): Cents {
  const assets = cash + outstanding;
  return Math.max(0, Math.floor(params.fund.maximumLoanUtilization * assets));
}

function demandCount(params: SimulationParameters, month: number, members: number, demandMul: number): number {
  const d = params.creditDemand;
  let n = 0;
  if (d.model === "fixed") n = d.applicationsPerMonth;
  else if (d.model === "perMember" || d.model === "byClass") {
    n = (members / 1000) * d.applicationsPerThousandMembers;
  } else if (d.model === "timeseries") {
    n = d.timeseries.find((x) => x.month === month)?.applications ?? d.applicationsPerMonth;
  }
  n *= (1 + d.demandGrowthPerMonth) ** Math.max(0, month - params.time.loanOriginationStartMonth);
  n *= demandMul;
  return Math.max(0, n);
}

function demandAverage(params: SimulationParameters, month: number): Cents {
  const ts = params.creditDemand.timeseries.find((x) => x.month === month);
  return ts?.averageAmountCents ?? params.creditDemand.averageAmountCents;
}

function cohortStats(cohorts: Cohort[]) {
  const members = cohorts.reduce((s, c) => s + c.count, 0);
  const personal = cohorts.reduce((s, c) => s + c.personalBalanceCents, 0);
  const solidarityPaid = cohorts.reduce((s, c) => s + c.solidarityPaidCents, 0);
  return { members, personal, solidarityPaid };
}

function takeFromCohort(c: Cohort, take: number): Cents {
  if (take <= 0 || c.count <= 0) return 0;
  const actual = Math.min(c.count, take);
  const w = proportionalShare(c.personalBalanceCents, actual, c.count);
  c.personalBalanceCents -= w;
  if (c.count - actual <= 0) {
    c.solidarityPaidCents = 0;
    c.count = 0;
  } else {
    c.solidarityPaidCents = proportionalShare(c.solidarityPaidCents, c.count - actual, c.count);
    c.count -= actual;
  }
  return w;
}

function allocateExits(
  cohorts: Cohort[],
  exitCount: number,
  month: number,
  minTenure: number,
  oldestFirst: boolean,
): { withdrawn: Cents; exited: number } {
  const eligible = cohorts.filter((c) => month - c.joinMonth >= minTenure && c.count > 0);
  const eligibleN = eligible.reduce((s, c) => s + c.count, 0);
  const target = Math.min(exitCount, eligibleN);
  if (target <= 0) return { withdrawn: 0, exited: 0 };
  const ordered = oldestFirst
    ? [...eligible].sort((a, b) => a.joinMonth - b.joinMonth)
    : [...eligible];
  let remaining = target;
  let withdrawn = 0;
  let exited = 0;
  if (!oldestFirst) {
    for (const c of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(c.count, remaining, Math.round((c.count / eligibleN) * target));
      const w = takeFromCohort(c, take);
      withdrawn += w;
      exited += take;
      remaining -= take;
    }
  }
  for (const c of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(c.count, remaining);
    if (take <= 0) continue;
    const w = takeFromCohort(c, take);
    withdrawn += w;
    exited += take;
    remaining -= take;
  }
  return { withdrawn, exited };
}

function schedulePayouts(rule: SimulationParameters["withdrawals"], month: number, amount: Cents): Payable[] {
  if (amount <= 0) return [];
  if (rule.payoutRule === "immediate") return [{ monthDue: month, amountCents: amount }];
  if (rule.payoutRule === "afterMonths") {
    return [{ monthDue: month + rule.payoutDelayMonths, amountCents: amount }];
  }
  if (rule.payoutRule === "fixedDeadline") {
    return [{ monthDue: month + rule.payoutDeadlineMonths, amountCents: amount }];
  }
  const n = Math.max(1, rule.installmentMonths);
  const each = Math.floor(amount / n);
  const last = amount - each * (n - 1);
  return Array.from({ length: n }, (_, i) => ({
    monthDue: month + i,
    amountCents: i === n - 1 ? last : each,
  }));
}

function sampleMember(cohort: Cohort, idx: number, income: Cents, expenses: Cents): Member {
  const n = Math.max(1, cohort.count);
  return {
    id: id("M", idx),
    joinDateMonth: cohort.joinMonth,
    status: "ACTIVE",
    personalBalanceCents: Math.floor(cohort.personalBalanceCents / n),
    solidarityContributionsCents: Math.floor(cohort.solidarityPaidCents / n),
    creditScore: 0,
    incomeCents: income,
    expensesCents: expenses,
    activeLoans: 0,
    totalBorrowedCents: 0,
    totalRepaidCents: 0,
    defaultHistory: 0,
  };
}

export function simulateScenario(parameters: SimulationParameters): SimulationResult {
  const started = Date.now();
  const log: SimulationLogEntry[] = [];
  const addLog = (message: string) => log.push({ atMs: Date.now() - started, message });
  addLog("Simulation gestartet");

  const warningsSoft = validateParameters(parameters);
  assertValidParameters(parameters);
  addLog("Parameter validiert");

  const params = structuredClone(parameters);
  const rng = createRng(params.seed);
  resetLedgerSeq();

  const ledger: LedgerEntry[] = [];
  const months: MonthlySnapshot[] = [];
  const invariants: InvariantViolation[] = [];
  const sampleLoans: Loan[] = [];
  const sampleMembers: Member[] = [];

  const cohorts: Cohort[] = [
    { joinMonth: 0, count: params.population.initialMembers, personalBalanceCents: 0, solidarityPaidCents: 0 },
  ];
  const vintages: Vintage[] = [];
  const payables: Payable[] = [];
  const recoveries: RecoveryItem[] = [];

  let solidarityCash = params.fund.initialCashCents;
  let personalCash = 0;
  let adminCash = params.administration.initialCashCents;
  let withdrawalPayables = 0;
  let loanSeq = 0;
  let memberSampleSeq = 0;
  let cumulativeNetLoss = 0;
  let cumulativeAdmin = adminCash;
  let vintageSeq = 0;

  addLog("Mitglieder generiert");

  const note = (month: number, rule: string, detail: string) => {
    invariants.push({ month, rule, detail });
  };

  for (let month = 1; month <= params.time.horizonMonths; month++) {
    const date = isoMonth(params.time.startDate, month);
    const moy = monthOfYear(params.time.startDate, month);
    const effects = activeEventEffects(params, month);
    const shock = params.shocks.enabled && month === params.shocks.month ? params.shocks : null;

    const before = cohortStats(cohorts);
    let members = before.members;

    let newMembers = 0;
    if (params.population.mode === "dynamic") {
      const seasonal = seasonalMultiplier(params.population.seasonalGrowth, moy);
      let raw = 0;
      const g = params.population.growth;
      if (g.type === "constant") raw = g.constantPerMonth;
      else if (g.type === "percent") raw = members * g.percentPerMonth;
      else if (g.type === "timeseries") {
        raw = g.timeseries.find((x) => x.month === month)?.newMembers ?? 0;
      }
      raw *= seasonal * effects.newMembersMultiplier;
      if (params.population.monthlyNoiseStdev > 0) {
        raw *= 1 + rng.gaussian() * params.population.monthlyNoiseStdev;
      }
      for (const ev of params.population.growthEvents) {
        if (month >= ev.startMonth && month < ev.startMonth + ev.durationMonths) {
          raw += ev.extraMembersPerMonth;
        }
      }
      if (params.population.joinWave.enabled && month === params.population.joinWave.month) {
        raw += params.population.joinWave.extraMembers;
      }
      newMembers = Math.max(0, Math.round(raw));
      const room = Math.max(0, params.population.maxMembers - members);
      newMembers = Math.min(newMembers, room);
      if (newMembers > 0) {
        cohorts.push({
          joinMonth: month,
          count: newMembers,
          personalBalanceCents: 0,
          solidarityPaidCents: 0,
        });
        members += newMembers;
      }
    }

    if (params.population.memberDrop.enabled && month === params.population.memberDrop.month) {
      /* applied with exits */
    }

    members = cohortStats(cohorts).members;
    const contributing = members;

    const personalShare = params.contributions.personalSavingsShareCents;
    const solidarityShare = params.contributions.solidarityShareCents;
    const contribution = params.contributions.monthlyContributionCents;
    const fee = feeFor(params, month, contributing);

    const personalIn = contributing * personalShare;
    const solidarityIn = contributing * solidarityShare;
    const adminIn = contributing * fee;
    const contribIn = contributing * contribution;

    for (const c of cohorts) {
      if (c.count <= 0) continue;
      c.personalBalanceCents += c.count * personalShare;
      c.solidarityPaidCents += c.count * solidarityShare;
    }

    personalCash += personalIn;
    solidarityCash += solidarityIn;
    adminCash += adminIn;

    pushLedger(ledger, month, date, "MEMBERSHIP_CONTRIBUTION", "CONTRA_CONTRIBUTION", contribIn, 0, "Mitgliedsbeitrag", contributing);
    pushLedger(ledger, month, date, "PERSONAL_BALANCE", "CASH_PERSONAL", personalIn, 0, "Persönliches Guthaben", contributing);
    pushLedger(ledger, month, date, "PERSONAL_BALANCE", "PERSONAL_LIABILITY", 0, personalIn, "Verpflichtung persönliches Guthaben", contributing);
    pushLedger(ledger, month, date, "SOLIDARITY_FUND", "CASH_SOLIDARITY", solidarityIn, 0, "Solidaritätsbeitrag", contributing);
    pushLedger(ledger, month, date, "ADMIN_FEE", "CASH_ADMIN", adminIn, 0, "Verwaltungsgebühr", contributing);
    pushLedger(ledger, month, date, "ADMIN_FEE", "CONTRA_FEE", 0, adminIn, "Verwaltungsgebühr-Ertrag", contributing);

    const adminCost = adminCostsFor(params, month, contributing, moy, effects.adminCostMultiplier);
    adminCash -= adminCost;
    pushLedger(ledger, month, date, "ADMIN_COST", "CONTRA_COST", adminCost, 0, "Verwaltungskosten");
    pushLedger(ledger, month, date, "ADMIN_COST", "CASH_ADMIN", 0, adminCost, "Abfluss Verwaltungskosten");

    if (month === 1) addLog("Beiträge berechnet");
    if (month === 1) addLog("Fonds aufgebaut");

    let repayments = 0;
    let defaultsAmt = 0;
    let recoveryAmt = 0;

    for (const v of vintages) {
      if (v.remainingPrincipalCents <= 0 || v.count <= 0) continue;
      if (v.paymentsMade >= v.termMonths) continue;
      const perLoanPrincipal = Math.floor(v.originalPrincipalCents / Math.max(1, v.count));
      const schedule = linearAmortization(Math.max(1, perLoanPrincipal), v.termMonths);
      const duePer = paymentDue(schedule, v.paymentsMade + 1);
      let due = Math.min(v.remainingPrincipalCents, duePer * v.count);
      if (v.paymentsMade + 1 === v.termMonths) due = v.remainingPrincipalCents;

      let paid = due;
      if (params.delinquency.enabled && params.delinquency.latePaymentRate > 0 && v.paymentsMade + 1 < v.termMonths) {
        const delayed = Math.floor(due * params.delinquency.latePaymentRate);
        paid = due - delayed;
        v.delinquentCents += delayed;
        v.delinquentAge = delayed > 0 ? v.delinquentAge + 1 : 0;
      }

      if (v.delinquentCents > 0 && v.delinquentAge >= params.delinquency.monthsUntilDefault) {
        const roll = v.delinquentCents;
        v.delinquentCents = 0;
        v.delinquentAge = 0;
        v.remainingPrincipalCents = Math.max(0, v.remainingPrincipalCents - roll);
        defaultsAmt += roll;
      }

      paid = Math.min(paid, v.remainingPrincipalCents);
      v.remainingPrincipalCents -= paid;
      v.amountRepaidCents += paid;
      v.paymentsMade += 1;
      repayments += paid;
      if (v.remainingPrincipalCents === 0) v.count = 0;
    }

    if (repayments > 0) {
      solidarityCash += repayments;
      pushLedger(ledger, month, date, "LOAN_REPAYMENT", "CASH_SOLIDARITY", repayments, 0, "Kreditrückzahlung");
      pushLedger(ledger, month, date, "LOAN_REPAYMENT", "LOAN_RECEIVABLE", 0, repayments, "Tilgung Forderung");
    }

    for (const v of vintages) {
      if (v.remainingPrincipalCents <= 0) continue;
      if (!timingAllowsDefault(params, v, month, rng)) continue;
      const rate = defaultRateFor(params, v, month, effects.defaultRateDelta, rng);
      if (rate <= 0) continue;
      const def = Math.min(v.remainingPrincipalCents, Math.round(v.remainingPrincipalCents * rate));
      if (def <= 0) continue;
      v.remainingPrincipalCents -= def;
      defaultsAmt += def;
      const recRate = recoveryRateFor(params, v.classId, effects.recoveryDelta, rng);
      const rec = Math.round(def * recRate);
      recoveries.push({
        monthDue: month + Math.max(0, params.recovery.lagMonths),
        amountCents: rec,
        defaultedCents: def,
      });
      if (v.remainingPrincipalCents === 0) v.count = 0;
    }

    if (shock && shock.defaultShareOfOutstanding > 0) {
      const outstandingNow = vintages.reduce((s, v) => s + v.remainingPrincipalCents, 0);
      let toDefault = Math.round(outstandingNow * shock.defaultShareOfOutstanding);
      for (const v of vintages) {
        if (toDefault <= 0 || v.remainingPrincipalCents <= 0) continue;
        const take = Math.min(v.remainingPrincipalCents, toDefault);
        v.remainingPrincipalCents -= take;
        defaultsAmt += take;
        const recRate = recoveryRateFor(params, v.classId, effects.recoveryDelta, rng);
        recoveries.push({
          monthDue: month + Math.max(0, params.recovery.lagMonths),
          amountCents: Math.round(take * recRate),
          defaultedCents: take,
        });
        toDefault -= take;
        if (v.remainingPrincipalCents === 0) v.count = 0;
      }
    }

    if (defaultsAmt > 0) {
      pushLedger(ledger, month, date, "LOAN_DEFAULT", "LOAN_RECEIVABLE", 0, defaultsAmt, "Ausfall Restforderung");
      pushLedger(ledger, month, date, "LOAN_LOSS", "LOAN_LOSS", defaultsAmt, 0, "Brutto-Ausfall");
    }

    const dueRecoveries = recoveries.filter((r) => r.monthDue === month);
    recoveryAmt = dueRecoveries.reduce((s, r) => s + r.amountCents, 0);
    if (recoveryAmt > 0) {
      solidarityCash += recoveryAmt;
      pushLedger(ledger, month, date, "LOAN_RECOVERY", "CASH_SOLIDARITY", recoveryAmt, 0, "Recovery-Eingang");
      pushLedger(ledger, month, date, "LOAN_RECOVERY", "LOAN_LOSS", 0, recoveryAmt, "Minderung Verlust durch Recovery");
    }

    const netLoss = defaultsAmt - recoveryAmt;
    cumulativeNetLoss += netLoss;

    if (month === params.time.loanOriginationStartMonth) {
      addLog("Kreditnachfrage berechnet");
      addLog("Kredite vergeben");
    }
    if (month === 2) {
      addLog("Rückzahlungen berechnet");
      addLog("Ausfälle berechnet");
      addLog("Recovery berechnet");
    }

    let extraDrop = 0;
    if (params.population.memberDrop.enabled && month === params.population.memberDrop.month) {
      extraDrop += params.population.memberDrop.membersLost;
    }
    if (shock && shock.memberDropRate > 0) {
      extraDrop += Math.round(members * shock.memberDropRate);
    }

    const seasonalExit = seasonalMultiplier(params.withdrawals.seasonalExits, moy);
    let exitsWanted = 0;
    if (params.withdrawals.rateMode === "percent") {
      exitsWanted = members * params.withdrawals.monthlyExitRate * seasonalExit * effects.exitRateMultiplier;
    } else {
      exitsWanted = params.withdrawals.monthlyExitCount * seasonalExit * effects.exitRateMultiplier;
    }
    if (params.withdrawals.shock.enabled && month === params.withdrawals.shock.month) {
      exitsWanted += members * params.withdrawals.shock.percentOfMembers;
    }
    exitsWanted = Math.round(exitsWanted) + extraDrop;

    const exitResult = allocateExits(
      cohorts,
      exitsWanted,
      month,
      params.population.minMembershipMonthsBeforeExit,
      params.withdrawals.allocation === "oldestFirst",
    );

    if (params.population.mode === "fixed" && params.population.fixedModeReplacesExits && exitResult.exited > 0) {
      cohorts.push({
        joinMonth: month,
        count: exitResult.exited,
        personalBalanceCents: 0,
        solidarityPaidCents: 0,
      });
    }

    withdrawalPayables += exitResult.withdrawn;
    personalCash = Math.max(0, personalCash); // cash still holds the money
    for (const p of schedulePayouts(params.withdrawals, month, exitResult.withdrawn)) {
      payables.push(p);
    }
    if (exitResult.withdrawn > 0) {
      pushLedger(
        ledger,
        month,
        date,
        "WITHDRAWAL_ACCRUAL",
        "PERSONAL_LIABILITY",
        exitResult.withdrawn,
        0,
        "Austritt: Guthaben wird auszahlungspflichtig",
        exitResult.exited,
      );
      pushLedger(
        ledger,
        month,
        date,
        "WITHDRAWAL_ACCRUAL",
        "WITHDRAWAL_PAYABLE",
        0,
        exitResult.withdrawn,
        "Verbindlichkeit Guthabenauszahlung",
        exitResult.exited,
      );
    }

    const outflowRate = effects.personalLiquidityOutflowRate;
    if (outflowRate > 0) {
      const stats = cohortStats(cohorts);
      const shockPayout = Math.round(stats.personal * outflowRate);
      if (shockPayout > 0) {
        let remaining = shockPayout;
        for (const c of cohorts) {
          if (remaining <= 0 || c.personalBalanceCents <= 0) continue;
          const take = Math.min(c.personalBalanceCents, remaining);
          c.personalBalanceCents -= take;
          remaining -= take;
        }
        withdrawalPayables += shockPayout - remaining;
        payables.push({ monthDue: month, amountCents: shockPayout - remaining });
      }
    }

    let personalWithdrawals = 0;
    let shortfallPersonal = 0;
    for (const p of payables) {
      if (p.monthDue !== month || p.amountCents <= 0) continue;
      const pay = Math.min(p.amountCents, personalCash);
      const miss = p.amountCents - pay;
      personalCash -= pay;
      withdrawalPayables -= pay;
      personalWithdrawals += pay;
      shortfallPersonal += miss;
      if (miss > 0) p.amountCents = miss;
      else p.amountCents = 0;
    }
    if (personalWithdrawals > 0) {
      pushLedger(ledger, month, date, "PERSONAL_WITHDRAWAL", "WITHDRAWAL_PAYABLE", personalWithdrawals, 0, "Auszahlung persönliches Guthaben");
      pushLedger(ledger, month, date, "PERSONAL_WITHDRAWAL", "CASH_PERSONAL", 0, personalWithdrawals, "Cash-Abfluss Guthabenauszahlung");
    }

    members = cohortStats(cohorts).members;

    let demandN = 0;
    let demandCents: Cents = 0;
    let approvedCount = 0;
    let approvedCents: Cents = 0;
    let rejectedCount = 0;
    let rejectedCents: Cents = 0;
    let disbursed = 0;
    let newLoanCount = 0;

    const outstandingBefore = vintages.reduce((s, v) => s + v.remainingPrincipalCents, 0);
    let capacity = availableCapacity(params, solidarityCash, outstandingBefore);

    if (month >= params.time.loanOriginationStartMonth) {
      demandN = demandCount(params, month, members, effects.demandMultiplier);
      const avg = demandAverage(params, month);
      const materialized = Math.min(Math.ceil(demandN), params.maxApplicationsMaterialized);
      const scale = demandN > 0 && materialized > 0 ? demandN / materialized : 1;
      const applicants: Applicant[] = [];
      const eligibleCohorts = cohorts.filter(
        (c) => c.count > 0 && month - c.joinMonth >= params.population.minMembershipMonthsForLoan,
      );
      const eligN = eligibleCohorts.reduce((s, c) => s + c.count, 0);

      for (let i = 0; i < materialized; i++) {
        const cls = pickClass(params, rng);
        const purpose = pickPurpose(params, rng);
        let amount = Math.round(avg * (1 + rng.gaussian() * params.creditDemand.amountNoiseStdev));
        amount = Math.min(params.creditDemand.maxAmountCents, Math.max(params.creditDemand.minAmountCents, amount));
        if (params.creditDemand.model === "byClass") {
          amount = Math.min(cls.maxCents, Math.max(cls.minCents || params.creditDemand.minAmountCents, amount));
        }
        let cohort = eligibleCohorts[0];
        if (eligN > 0) {
          let tick = rng.nextInt(eligN);
          for (const c of eligibleCohorts) {
            tick -= c.count;
            if (tick < 0) {
              cohort = c;
              break;
            }
          }
        }
        const tenure = cohort ? month - cohort.joinMonth : 0;
        const n = Math.max(1, cohort?.count ?? 1);
        const personalBal = cohort ? Math.floor(cohort.personalBalanceCents / n) : 0;
        const solPaid = cohort ? Math.floor(cohort.solidarityPaidCents / n) : 0;
        const income = Math.max(
          0,
          Math.round(params.income.averageMonthlyIncomeCents * (1 + rng.gaussian() * 0.15)),
        );
        const expenses = params.income.averageMonthlyExpensesCents;
        const partial = {
          seq: i,
          classId: cls.id,
          purpose: purpose.id,
          requestedCents: amount,
          tenureMonths: tenure,
          personalBalanceCents: personalBal,
          solidarityPaidCents: solPaid,
          incomeCents: income,
          expensesCents: expenses,
          existingDebtCents: 0,
          hasDefaultHistory: false,
          collateral: rng.next() < params.income.collateralShare,
          needPriority: purpose.priority,
          scale,
        };
        const limit = creditLimitFor(params, tenure, personalBal, solPaid, income);
        const score = creditScoreFor(params, partial);
        applicants.push({ ...partial, limitCents: limit, score });
        demandCents += Math.round(amount * scale);
      }
      if (materialized === 0) {
        demandCents = Math.round(demandN * avg);
      }

      applicants.sort(
        (a, b) =>
          priorityValue(params, b, b.seq, applicants.length) -
          priorityValue(params, a, a.seq, applicants.length),
      );

      for (const app of applicants) {
        const cls = params.loans.classes.find((c) => c.id === app.classId);
        const decision = approveApplicant(params, app, cls);
        const scaledCount = app.scale;
        if (!decision.ok) {
          rejectedCount += scaledCount;
          rejectedCents += Math.round(app.requestedCents * scaledCount);
          continue;
        }
        let amount = Math.round(decision.amount * scaledCount);
        if (amount > capacity) amount = capacity;
        if (amount < params.creditDemand.minAmountCents) {
          rejectedCount += scaledCount;
          rejectedCents += Math.round(app.requestedCents * scaledCount);
          continue;
        }
        const term = termForClass(params, cls);
        vintageSeq += 1;
        vintages.push({
          id: id("V", vintageSeq),
          originationMonth: month,
          termMonths: term,
          classId: app.classId,
          purpose: app.purpose,
          count: Math.max(1, Math.round(scaledCount)),
          originalPrincipalCents: amount,
          remainingPrincipalCents: amount,
          amountRepaidCents: 0,
          paymentsMade: 0,
          delinquentCents: 0,
          delinquentAge: 0,
        });
        solidarityCash -= amount;
        capacity -= amount;
        disbursed += amount;
        approvedCount += scaledCount;
        approvedCents += amount;
        newLoanCount += Math.max(1, Math.round(scaledCount));
        loanSeq += 1;
        if (sampleLoans.length < params.maxSampleLoans) {
          const sched = linearAmortization(Math.round(amount / Math.max(1, Math.round(scaledCount))), term);
          sampleLoans.push({
            id: id("K", loanSeq),
            memberId: id("M", (loanSeq % 9000) + 1),
            applicationDate: month,
            approvalDate: month,
            disbursementDate: month,
            principalCents: Math.round(amount / Math.max(1, Math.round(scaledCount))),
            termMonths: term,
            monthlyPaymentCents: sched.monthly,
            remainingPrincipalCents: Math.round(amount / Math.max(1, Math.round(scaledCount))),
            amountRepaidCents: 0,
            status: "ACTIVE",
            defaultDate: null,
            recoveryAmountCents: 0,
            lossAmountCents: 0,
            creditClass: app.classId,
            purpose: app.purpose,
          });
        }
      }

      if (disbursed > 0) {
        pushLedger(ledger, month, date, "LOAN_DISBURSEMENT", "CASH_SOLIDARITY", 0, disbursed, "Kreditauszahlung");
        pushLedger(ledger, month, date, "LOAN_RECEIVABLE", "LOAN_RECEIVABLE", disbursed, 0, "Kreditforderung");
      }
    }

    const stats = cohortStats(cohorts);
    members = stats.members;
    const outstanding = vintages.reduce((s, v) => s + v.remainingPrincipalCents, 0);
    const fundAssets = solidarityCash + outstanding;
    const reserveRatio = fundAssets > 0 ? solidarityCash / fundAssets : 1;
    const utilization = fundAssets > 0 ? outstanding / fundAssets : 0;
    const unmetCents = Math.max(0, demandCents - disbursed);
    const unmetCount = Math.max(0, demandN - approvedCount);
    const fulfillment = demandCents > 0 ? disbursed / demandCents : 1;
    const adminSurplus = adminIn - adminCost;
    cumulativeAdmin = adminCash;
    const theo = theoreticalCapacity(params, solidarityCash, outstanding);
    const avail = availableCapacity(params, solidarityCash, outstanding);
    const liquidity = personalCash + solidarityCash + Math.max(0, adminCash);

    if (stats.personal < 0) note(month, "personalBalance >= 0", `persönliches Guthaben ${stats.personal}`);
    if (solidarityCash < 0) note(month, "fundBalance >= 0", `Solidaritätscash ${solidarityCash}`);
    if (outstanding < 0) note(month, "loanRemaining >= 0", `offene Kredite ${outstanding}`);
    for (const v of vintages) {
      if (v.amountRepaidCents > v.originalPrincipalCents + 1) {
        note(month, "totalRepaid <= principal", `${v.id} repaid ${v.amountRepaidCents} > ${v.originalPrincipalCents}`);
      }
    }

    const fundBreakdown: FormulaLine[] = [
      { label: "Anfangsbestand Solidaritätscash", cents: solidarityCash - solidarityIn - repayments - recoveryAmt + disbursed, sign: "info" },
      { label: "Solidaritätsbeiträge", cents: solidarityIn, sign: "+" },
      { label: "Kreditrückzahlungen", cents: repayments, sign: "+" },
      { label: "Recovery", cents: recoveryAmt, sign: "+" },
      { label: "Kreditauszahlungen", cents: disbursed, sign: "-" },
      { label: "Endbestand Solidaritätscash", cents: solidarityCash, sign: "=" },
    ];
    const personalBreakdown: FormulaLine[] = [
      { label: "Persönliche Einzahlungen", cents: personalIn, sign: "+" },
      { label: "Guthabenauszahlungen", cents: personalWithdrawals, sign: "-" },
      { label: "Endbestand persönliche Verbindlichkeiten", cents: stats.personal, sign: "=" },
    ];
    const adminBreakdown: FormulaLine[] = [
      { label: "Verwaltungsgebühren", cents: adminIn, sign: "+" },
      { label: "Verwaltungskosten", cents: adminCost, sign: "-" },
      { label: "Monatsergebnis Verwaltung", cents: adminSurplus, sign: "=" },
      { label: "Kumuliertes Verwaltungskonto", cents: adminCash, sign: "info" },
    ];
    const liquidityBreakdown: FormulaLine[] = [
      { label: "Persönliches Cash (nicht für Kredite)", cents: personalCash, sign: "info" },
      { label: "Solidaritätscash", cents: solidarityCash, sign: "info" },
      { label: "Verwaltungscash", cents: adminCash, sign: "info" },
      { label: "Summe liquide Mittel", cents: liquidity, sign: "=" },
    ];

    months.push({
      month,
      date,
      members,
      newMembers,
      exits: exitResult.exited,
      contributionsCents: contribIn,
      personalContributionCents: personalIn,
      solidarityContributionCents: solidarityIn,
      adminFeeCents: adminIn,
      newLoanCount,
      newLoanPrincipalCents: disbursed,
      repaymentsCents: repayments,
      defaultsCents: defaultsAmt,
      recoveryCents: recoveryAmt,
      netLossCents: netLoss,
      loanDisbursementsCents: disbursed,
      personalWithdrawalsCents: personalWithdrawals,
      adminCostCents: adminCost,
      solidarityCashCents: solidarityCash,
      personalLiabilitiesCents: stats.personal,
      withdrawalPayablesCents: withdrawalPayables,
      adminCashCents: adminCash,
      outstandingLoansCents: outstanding,
      fundAssetsCents: fundAssets,
      liquidityCents: liquidity,
      reserveRatio,
      utilization,
      creditDemandCount: demandN,
      creditDemandCents: demandCents,
      approvedCount,
      approvedCents,
      rejectedCount,
      rejectedCents,
      unmetDemandCount: unmetCount,
      unmetDemandCents: unmetCents,
      fulfillmentRatio: fulfillment,
      availableLoanCapacityCents: avail,
      theoreticalCapacityCents: theo,
      defaultRateRealized: outstanding + defaultsAmt > 0 ? defaultsAmt / (outstanding + defaultsAmt) : 0,
      adminIncomeCents: adminIn,
      adminSurplusCents: adminSurplus,
      cumulativeAdminCents: cumulativeAdmin,
      cumulativeNetLossCents: cumulativeNetLoss,
      personalCashCents: personalCash,
      shortfallPersonalCents: shortfallPersonal,
      shortfallSolidarityCents: solidarityCash < 0 ? -solidarityCash : 0,
      solidarityInflowsCents: solidarityIn + repayments + recoveryAmt,
      solidarityOutflowsCents: disbursed,
      fundBreakdown,
      personalBreakdown,
      adminBreakdown,
      liquidityBreakdown,
    });

    if (sampleMembers.length < params.maxSampleMembers) {
      for (const c of cohorts) {
        if (c.count <= 0) continue;
        memberSampleSeq += 1;
        sampleMembers.push(
          sampleMember(
            c,
            memberSampleSeq,
            params.income.averageMonthlyIncomeCents,
            params.income.averageMonthlyExpensesCents,
          ),
        );
        if (sampleMembers.length >= params.maxSampleMembers) break;
      }
    }
  }

  addLog("Liquidität berechnet");
  addLog("Risikoanalyse durchgeführt");

  const last = months[months.length - 1] ?? null;
  const kpis = last
    ? {
        members: last.members,
        personalLiabilitiesCents: last.personalLiabilitiesCents,
        solidarityCashCents: last.solidarityCashCents,
        outstandingLoansCents: last.outstandingLoansCents,
        liquidityCents: last.liquidityCents,
        creditDemandCents: last.creditDemandCents,
        unmetDemandCents: last.unmetDemandCents,
        defaultRate: last.defaultRateRealized,
        netLossCents: last.cumulativeNetLossCents,
        adminBalanceCents: last.adminCashCents,
        utilization: last.utilization,
        fulfillmentRatio: last.fulfillmentRatio,
        theoreticalCapacityCents: last.theoreticalCapacityCents,
        availableCapacityCents: last.availableLoanCapacityCents,
      }
    : {
        members: 0,
        personalLiabilitiesCents: 0,
        solidarityCashCents: 0,
        outstandingLoansCents: 0,
        liquidityCents: 0,
        creditDemandCents: 0,
        unmetDemandCents: 0,
        defaultRate: 0,
        netLossCents: 0,
        adminBalanceCents: 0,
        utilization: 0,
        fulfillmentRatio: 1,
        theoreticalCapacityCents: 0,
        availableCapacityCents: 0,
      };

  const risk = computeRisk(months, params);
  const health = computeHealth(last, months, params);
  const warnings: Warning[] = [
    ...warningsSoft
      .filter((i) => i.path === "fund" || i.path === "seed")
      .map((i) => ({
        level: "yellow" as const,
        code: "PARAM",
        title: "Parameterhinweis",
        detail: i.message,
      })),
    ...computeWarnings(last, months, params, invariants),
  ];

  addLog("Simulation abgeschlossen");

  const endDate = last?.date ?? params.time.startDate;
  return {
    meta: {
      simulationId: `sim-${params.seed}-${started.toString(36)}`,
      createdAt: new Date(started).toISOString(),
      engineVersion: ENGINE_VERSION,
      parameterVersion: PARAMETER_VERSION,
      seed: params.seed,
      startDate: params.time.startDate,
      endDate,
      scenarioName: params.meta.name,
      durationMs: Date.now() - started,
      demo: params.meta.isDemo,
    },
    parameters: params,
    log,
    months,
    kpis,
    risk,
    warnings,
    health,
    ledger,
    sampleLoans,
    sampleMembers,
    invariants,
    lastMonth: last,
  };
}
