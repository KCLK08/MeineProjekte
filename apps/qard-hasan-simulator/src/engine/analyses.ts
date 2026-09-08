import { createDefaultParameters } from "../domain/defaults";
import type {
  BreakEvenResult,
  GoalSeekResult,
  MonteCarloResult,
  ReverseSimulationResult,
  SensitivityCell,
  SimulationParameters,
  SimulationResult,
} from "../domain/types";
import { percentileSet } from "./helpers";
import { createRng, varyRate } from "./rng";
import { simulateScenario } from "./simulation";

function clone(p: SimulationParameters): SimulationParameters {
  return structuredClone(p);
}

function varyParameters(base: SimulationParameters, runSeed: number): SimulationParameters {
  const p = clone(base);
  const rng = createRng(runSeed);
  const mc = base.monteCarlo;
  p.seed = runSeed;
  p.defaults.constantRate = varyRate(p.defaults.constantRate, mc.defaultRateVariation, rng);
  p.withdrawals.monthlyExitRate = varyRate(p.withdrawals.monthlyExitRate, mc.exitRateVariation, rng);
  p.population.growth.percentPerMonth = varyRate(
    p.population.growth.percentPerMonth,
    mc.growthVariation,
    rng,
    0,
    1,
  );
  p.creditDemand.applicationsPerThousandMembers = Math.max(
    0,
    p.creditDemand.applicationsPerThousandMembers * (1 + rng.nextSigned(mc.demandVariation)),
  );
  p.recovery.fixedRate = varyRate(p.recovery.fixedRate, mc.recoveryVariation, rng);
  if (rng.next() < mc.liquidityOutflowVariation) {
    p.shocks.enabled = true;
    p.shocks.personalPayoutRate = Math.min(0.5, mc.liquidityOutflowVariation * rng.next());
  }
  return p;
}

export function runMonteCarlo(base: SimulationParameters, runs?: number): MonteCarloResult {
  const n = runs ?? base.monteCarlo.runs;
  const started = Date.now();
  const fund: number[] = [];
  const liquidity: number[] = [];
  const loss: number[] = [];
  const members: number[] = [];
  const unmet: number[] = [];
  const admin: number[] = [];
  const utilization: number[] = [];
  for (let i = 0; i < n; i++) {
    const seed = (base.monteCarlo.seed + i * 9973) >>> 0 || 1;
    const result = simulateScenario(varyParameters(base, seed));
    fund.push(result.kpis.solidarityCashCents);
    liquidity.push(result.kpis.liquidityCents);
    loss.push(result.kpis.netLossCents);
    members.push(result.kpis.members);
    unmet.push(result.risk.totalUnmetDemandCents);
    admin.push(result.kpis.adminBalanceCents);
    utilization.push(result.kpis.utilization);
  }
  return {
    runs: n,
    seed: base.monteCarlo.seed,
    durationMs: Date.now() - started,
    metrics: {
      solidarityCashCents: percentileSet(fund),
      liquidityCents: percentileSet(liquidity),
      netLossCents: percentileSet(loss),
      members: percentileSet(members),
      unmetDemandCents: percentileSet(unmet),
      adminBalanceCents: percentileSet(admin),
      utilization: percentileSet(utilization),
    },
  };
}

export function runSensitivity(
  base: SimulationParameters,
  defaultRates: number[],
  exitRates: number[],
): SensitivityCell[] {
  const cells: SensitivityCell[] = [];
  for (const d of defaultRates) {
    for (const e of exitRates) {
      const p = clone(base);
      p.defaults.constantRate = d;
      p.withdrawals.monthlyExitRate = e;
      p.meta.isDemo = false;
      const r = simulateScenario(p);
      cells.push({
        defaultRate: d,
        exitRate: e,
        fundCents: r.kpis.solidarityCashCents,
        liquidityCents: r.kpis.liquidityCents,
        lossCents: r.kpis.netLossCents,
        unmetCents: r.risk.totalUnmetDemandCents,
      });
    }
  }
  return cells;
}

function binarySearch(
  min: number,
  max: number,
  iterations: number,
  predicate: (x: number) => boolean,
): number {
  let lo = min;
  let hi = max;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (predicate(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function runBreakEven(base: SimulationParameters): BreakEvenResult {
  const membersToCoverAdmin = Math.round(
    binarySearch(1, 100_000, 22, (n) => {
      const p = clone(base);
      p.population.mode = "fixed";
      p.population.initialMembers = Math.max(1, Math.round(n));
      p.population.fixedModeReplacesExits = true;
      p.withdrawals.monthlyExitRate = 0;
      p.time.horizonMonths = Math.min(24, p.time.horizonMonths);
      p.time.loanOriginationStartMonth = Math.min(p.time.loanOriginationStartMonth, p.time.horizonMonths);
      const r = simulateScenario(p);
      return r.kpis.adminBalanceCents >= 0;
    }),
  );

  const maxDefaultRateBeforeCritical = binarySearch(0, 0.5, 16, (d) => {
    const p = clone(base);
    p.defaults.constantRate = d;
    const r = simulateScenario(p);
    return r.warnings.some((w) => w.level === "red" || w.level === "critical");
  });

  const targetOrigination = 1_000_000_00;
  const solidarityShareForTargetOrigination = Math.round(
    binarySearch(0, base.contributions.monthlyContributionCents, 18, (share) => {
      const p = clone(base);
      const s = Math.round(share);
      p.contributions.solidarityShareCents = s;
      p.contributions.personalSavingsShareCents = p.contributions.monthlyContributionCents - s;
      const r = simulateScenario(p);
      const avgOrig =
        r.months.reduce((sum, m) => sum + m.loanDisbursementsCents, 0) / Math.max(1, r.months.length);
      return avgOrig >= targetOrigination;
    }),
  );

  const reserveForExitRate = (() => {
    const p = clone(base);
    const r = simulateScenario(p);
    const peak = Math.max(...r.months.map((m) => m.personalWithdrawalsCents), 0);
    return peak;
  })();

  const maxDemandBeforeUnmet = binarySearch(0, 200, 16, (perThousand) => {
    const p = clone(base);
    p.creditDemand.model = "perMember";
    p.creditDemand.applicationsPerThousandMembers = perThousand;
    const r = simulateScenario(p);
    return r.risk.totalUnmetDemandCents > 0;
  });

  return {
    membersToCoverAdmin,
    maxDefaultRateBeforeCritical,
    solidarityShareForTargetOrigination,
    reserveForExitRate,
    maxDemandBeforeUnmet,
  };
}

export function runReverseSimulation(
  members: number,
  monthlyOriginationCents: number,
  template?: SimulationParameters,
): ReverseSimulationResult {
  const base = clone(template ?? createDefaultParameters());
  base.population.mode = "fixed";
  base.population.initialMembers = members;
  base.population.fixedModeReplacesExits = true;
  base.meta.isDemo = false;
  base.meta.name = "Reverse Simulation";

  const notes = [
    "Reverse Simulation ist eine Modellannahme auf Basis der Simulationsengine, keine Planungsgarantie.",
    "Die tatsächliche Umsetzbarkeit und Scharia-Konformität muss fachlich geprüft werden.",
  ];

  const requiredSolidarityShareCents = Math.round(
    binarySearch(0, base.contributions.monthlyContributionCents, 18, (share) => {
      const p = clone(base);
      const s = Math.round(share);
      p.contributions.solidarityShareCents = s;
      p.contributions.personalSavingsShareCents = p.contributions.monthlyContributionCents - s;
      const r = simulateScenario(p);
      const avg =
        r.months.reduce((sum, m) => sum + m.loanDisbursementsCents, 0) / Math.max(1, r.months.length);
      return avg >= monthlyOriginationCents;
    }),
  );

  const probe = clone(base);
  probe.contributions.solidarityShareCents = requiredSolidarityShareCents;
  probe.contributions.personalSavingsShareCents =
    probe.contributions.monthlyContributionCents - requiredSolidarityShareCents;
  const result = simulateScenario(probe);
  const requiredFundCents = Math.max(
    result.kpis.outstandingLoansCents,
    Math.round(monthlyOriginationCents / Math.max(0.05, probe.fund.maximumLoanUtilization)),
  );
  const requiredReserveCents = Math.round(requiredFundCents * probe.fund.minimumFundReserve);

  const maxBearableDefaultRate = binarySearch(0, 0.4, 14, (d) => {
    const p = clone(probe);
    p.defaults.constantRate = d;
    const r = simulateScenario(p);
    return r.warnings.some((w) => w.level === "red" || w.level === "critical");
  });

  return {
    targetMembers: members,
    targetMonthlyOriginationCents: monthlyOriginationCents,
    requiredFundCents,
    requiredSolidarityShareCents,
    requiredReserveCents,
    maxBearableDefaultRate,
    notes,
  };
}

export function goalSeek(
  base: SimulationParameters,
  options: {
    param: "members" | "solidarityShare" | "utilization" | "applicationsPerThousand";
    metric: "fulfillment" | "admin" | "reserve" | "origination";
    target: number;
    min: number;
    max: number;
  },
): GoalSeekResult {
  let iterations = 0;
  const value = binarySearch(options.min, options.max, 18, (x) => {
    iterations += 1;
    const p = clone(base);
    if (options.param === "members") {
      p.population.mode = "fixed";
      p.population.initialMembers = Math.max(1, Math.round(x));
    } else if (options.param === "solidarityShare") {
      const s = Math.round(x);
      p.contributions.solidarityShareCents = s;
      p.contributions.personalSavingsShareCents = p.contributions.monthlyContributionCents - s;
    } else if (options.param === "utilization") {
      p.fund.maximumLoanUtilization = x;
      p.fund.minimumFundReserve = 1 - x;
    } else {
      p.creditDemand.applicationsPerThousandMembers = x;
    }
    const r = simulateScenario(p);
    const metric =
      options.metric === "fulfillment"
        ? r.kpis.fulfillmentRatio
        : options.metric === "admin"
          ? r.kpis.adminBalanceCents
          : options.metric === "reserve"
            ? r.lastMonth?.reserveRatio ?? 0
            : r.months.reduce((s, m) => s + m.loanDisbursementsCents, 0) / Math.max(1, r.months.length);
    return metric >= options.target;
  });
  const p = clone(base);
  if (options.param === "members") p.population.initialMembers = Math.round(value);
  const r = simulateScenario(p);
  const metric =
    options.metric === "fulfillment"
      ? r.kpis.fulfillmentRatio
      : options.metric === "admin"
        ? r.kpis.adminBalanceCents
        : options.metric === "reserve"
          ? r.lastMonth?.reserveRatio ?? 0
          : r.months.reduce((s, m) => s + m.loanDisbursementsCents, 0) / Math.max(1, r.months.length);
  return {
    found: true,
    paramPath: options.param,
    value,
    metric,
    iterations,
  };
}

export function compareResults(results: SimulationResult[]) {
  const keys = [
    "members",
    "solidarityCashCents",
    "outstandingLoansCents",
    "netLossCents",
    "liquidityCents",
    "unmetDemandCents",
    "adminBalanceCents",
    "personalLiabilitiesCents",
    "utilization",
    "fulfillmentRatio",
  ] as const;
  return {
    names: results.map((r) => r.meta.scenarioName),
    rows: keys.map((key) => ({
      key,
      values: results.map((r) => {
        if (key === "unmetDemandCents") return r.risk.totalUnmetDemandCents;
        return r.kpis[key as keyof typeof r.kpis] as number;
      }),
    })),
  };
}
