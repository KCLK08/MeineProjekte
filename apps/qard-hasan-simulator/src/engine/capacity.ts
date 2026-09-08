import type { Cents } from "../domain/money";
import type {
  CapacityBreakdown,
  CapacityInput,
  DemandPressureBand,
  SimulationParameters,
} from "../domain/types";

export function utilizationBaseValue(params: SimulationParameters, input: CapacityInput): Cents {
  switch (params.allocation.utilizationBase) {
    case "solidarityCash":
      return input.solidarityCashCents;
    case "averageFundAssets":
      return input.averageFundAssetsCents > 0
        ? input.averageFundAssetsCents
        : input.solidarityCashCents + input.outstandingLoanBalanceCents;
    case "fundAssets":
    default:
      return input.solidarityCashCents + input.outstandingLoanBalanceCents;
  }
}

export function calculateMinimumLiquidityReserve(
  params: SimulationParameters,
  input: CapacityInput,
): {
  minimumLiquidityReserveCents: Cents;
  personalBalanceReserveCents: Cents;
  expectedExitReserveCents: Cents;
  operatingReserveCents: Cents;
} {
  const a = params.allocation;
  const pct = Math.round(input.solidarityCashCents * a.minimumLiquidityReservePercent);
  const abs = a.minimumLiquidityReserveAmountCents;
  const core = Math.max(pct, abs);
  const operatingReserveCents = Math.round(input.expectedAdminCostCents * a.minimumOperatingExpenseMonths);
  const personalBalanceReserveCents = Math.round(
    input.personalLiabilitiesCents * a.personalBalanceReservePercent,
  );
  const expectedExitReserveCents =
    a.expectedMemberExitAmountCents > 0
      ? a.expectedMemberExitAmountCents
      : Math.round(input.personalLiabilitiesCents * a.expectedMonthlyMemberExitRate);
  const minimumLiquidityReserveCents =
    core + operatingReserveCents + personalBalanceReserveCents + expectedExitReserveCents;
  return {
    minimumLiquidityReserveCents,
    personalBalanceReserveCents,
    expectedExitReserveCents,
    operatingReserveCents,
  };
}

/** Central capacity function. Never lets lending ignore reserves, utilization, commitments or monthly caps. */
export function calculateAvailableLoanCapacity(
  params: SimulationParameters,
  input: CapacityInput,
): CapacityBreakdown {
  const a = params.allocation;
  const util = params.fund.maximumLoanUtilization;
  const base = utilizationBaseValue(params, input);
  const maxOutstandingLoansCents = Math.max(0, Math.floor(base * util));
  const reserves = calculateMinimumLiquidityReserve(params, input);

  const availableFromUtilizationCents = Math.max(
    0,
    maxOutstandingLoansCents - input.outstandingLoanBalanceCents - input.committedLoanAmountCents,
  );

  let availableFromLiquidityCents = input.solidarityCashCents;
  if (a.enforceMinimumLiquidity) {
    availableFromLiquidityCents = Math.max(
      0,
      input.solidarityCashCents - reserves.minimumLiquidityReserveCents,
    );
  }

  const monthlyCap =
    a.maxMonthlyLoanDisbursementCents > 0 ? a.maxMonthlyLoanDisbursementCents : Number.MAX_SAFE_INTEGER;
  const availableFromMonthlyCapCents = Math.max(0, monthlyCap - input.disbursedThisMonthCents);

  const constraints: string[] = [];
  const candidates = [
    { name: "Auslastungsgrenze", value: availableFromUtilizationCents },
    { name: "Liquiditätsgrenze", value: availableFromLiquidityCents },
    { name: "Monatliches Auszahlungsmaximum", value: availableFromMonthlyCapCents },
    { name: "Solidaritätscash", value: Math.max(0, input.solidarityCashCents) },
  ];
  let availableLoanCapacityCents = candidates[0].value;
  let binding = candidates[0].name;
  for (const c of candidates) {
    if (c.value < availableLoanCapacityCents) {
      availableLoanCapacityCents = c.value;
      binding = c.name;
    }
  }
  constraints.push(`Bindende Grenze: ${binding}`);

  return {
    utilizationBaseCents: base,
    maxOutstandingLoansCents,
    minimumLiquidityReserveCents: reserves.minimumLiquidityReserveCents,
    personalBalanceReserveCents: reserves.personalBalanceReserveCents,
    expectedExitReserveCents: reserves.expectedExitReserveCents,
    operatingReserveCents: reserves.operatingReserveCents,
    availableFromUtilizationCents,
    availableFromLiquidityCents,
    availableFromMonthlyCapCents,
    availableLoanCapacityCents: Math.max(0, Math.floor(availableLoanCapacityCents)),
    constraints,
  };
}

export function calculateDemandPressure(eligibleDemandCents: Cents, availableLoanCapacityCents: Cents): number {
  if (availableLoanCapacityCents <= 0) return eligibleDemandCents > 0 ? 99 : 0;
  return eligibleDemandCents / availableLoanCapacityCents;
}

export function demandPressureBand(pressure: number, params: SimulationParameters): DemandPressureBand {
  const a = params.allocation;
  if (pressure >= a.pressureExtreme) return "extreme";
  if (pressure >= a.pressureHigh) return "high";
  if (pressure >= a.pressureBorder) return "border";
  return "normal";
}

export function calculateFundingRate(fundedCents: Cents, eligibleDemandCents: Cents): number {
  if (eligibleDemandCents <= 0) return 1;
  return Math.min(1, fundedCents / eligibleDemandCents);
}

export function calculateUnmetDemand(eligibleDemandCents: Cents, fundedCents: Cents): Cents {
  return Math.max(0, eligibleDemandCents - fundedCents);
}

export function calculateQueueClearanceTime(
  waitlistCents: Cents,
  expectedMonthlyNetCapacityCents: Cents,
): number {
  if (waitlistCents <= 0) return 0;
  if (expectedMonthlyNetCapacityCents <= 0) return 999;
  return waitlistCents / expectedMonthlyNetCapacityCents;
}

export const calculateLoanCapacity = calculateAvailableLoanCapacity;

export function calculateAvailableLiquidity(
  params: SimulationParameters,
  input: CapacityInput,
): Cents {
  return calculateAvailableLoanCapacity(params, input).availableFromLiquidityCents;
}

/** Planning question: if every member applied today at the average amount, what happens? */
export function estimateIfAllMembersApplied(
  params: SimulationParameters,
  members: number,
  availableLoanCapacityCents: Cents,
  expectedMonthlyNetCapacityCents: Cents,
): {
  eligibleDemandCents: Cents;
  fundedCents: Cents;
  waitlistedCents: Cents;
  fundingRate: number;
  queueClearanceMonths: number;
} {
  const eligibleDemandCents = Math.max(0, Math.round(members * params.creditDemand.averageAmountCents));
  const fundedCents = Math.min(eligibleDemandCents, Math.max(0, availableLoanCapacityCents));
  const waitlistedCents = Math.max(0, eligibleDemandCents - fundedCents);
  return {
    eligibleDemandCents,
    fundedCents,
    waitlistedCents,
    fundingRate: calculateFundingRate(fundedCents, eligibleDemandCents),
    queueClearanceMonths: calculateQueueClearanceTime(waitlistedCents, expectedMonthlyNetCapacityCents),
  };
}
