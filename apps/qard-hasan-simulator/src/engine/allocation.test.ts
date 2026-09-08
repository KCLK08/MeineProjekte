import { describe, expect, it } from "vitest";
import { eurosToCents } from "../domain/money";
import { createDefaultParameters } from "../domain/defaults";
import type { SimulationParameters } from "../domain/types";
import { simulateScenario } from "./simulation";
import { calculateAvailableLoanCapacity } from "./capacity";
import { allocateLoans, solidarityLoanNeedCents } from "./allocation";

function lendingBase(overrides: (p: SimulationParameters) => void = () => undefined): SimulationParameters {
  const p = createDefaultParameters();
  p.meta.isDemo = false;
  p.seed = 1;
  p.time.horizonMonths = 3;
  p.time.loanOriginationStartMonth = 1;
  p.population.mode = "fixed";
  p.population.initialMembers = 20;
  p.population.minMembershipMonthsForLoan = 0;
  p.population.monthlyNoiseStdev = 0;
  p.withdrawals.monthlyExitRate = 0;
  p.defaults.constantRate = 0;
  p.delinquency.enabled = false;
  p.creditDemand.amountNoiseStdev = 0;
  p.creditDemand.model = "fixed";
  p.creditDemand.applicationsPerMonth = 0;
  p.creditDemand.applicationsPerThousandMembers = 0;
  p.creditDemand.minAmountCents = eurosToCents(1);
  p.creditDemand.maxAmountCents = eurosToCents(1_000_000);
  p.creditDemand.scriptedApplications = [];
  p.loans.limitMethod = "fixed";
  p.loans.maxProductCents = eurosToCents(1_000_000);
  p.loans.amountCapPolicy = "capToLimit";
  p.loans.defaultTermMonths = 24;
  p.loans.classes = p.loans.classes.map((c) => ({
    ...c,
    minMembershipMonths: 0,
    minCents: 0,
    maxCents: eurosToCents(1_000_000),
  }));
  p.creditApproval.enabledFactors.dti = false;
  p.creditApproval.enabledFactors.membershipDuration = false;
  p.creditApproval.enabledFactors.creditClass = false;
  p.creditApproval.minCreditScore = 0;
  p.allocation.minimumLiquidityReservePercent = 0.3;
  p.allocation.minimumLiquidityReserveAmountCents = 0;
  p.allocation.minimumOperatingExpenseMonths = 0;
  p.allocation.personalBalanceReservePercent = 0;
  p.allocation.expectedMonthlyMemberExitRate = 0;
  p.allocation.expectedMemberExitAmountCents = 0;
  p.allocation.enforceMinimumLiquidity = true;
  p.allocation.allowPartialFunding = false;
  p.allocation.commitWaitlisted = false;
  p.allocation.disbursementLagMonths = 0;
  p.allocation.maxMonthlyLoanDisbursementCents = 0;
  p.allocation.maxMemberExposureCents = 0;
  p.allocation.waitlistMerge = "behind";
  p.prioritization.strategy = "fifo";
  p.fund.initialCashCents = eurosToCents(1_000_000);
  p.fund.maximumLoanUtilization = 0.7;
  p.fund.minimumFundReserve = 0.3;
  p.administration.costs = p.administration.costs.map((c) => ({ ...c, enabled: false }));
  overrides(p);
  return p;
}

function apps(
  month: number,
  amountsEuro: number[],
  extra: { creditScore?: number; hasDefaultHistory?: boolean; memberId?: string }[] = [],
) {
  return amountsEuro.map((euro, i) => ({
    month,
    requestedAmountCents: eurosToCents(euro),
    tenureMonths: 24,
    creditScore: extra[i]?.creditScore ?? 80,
    hasDefaultHistory: extra[i]?.hasDefaultHistory ?? false,
    memberId: extra[i]?.memberId ?? `M-${month}-${i}`,
    incomeCents: eurosToCents(50_000),
    classId: "plus",
    purpose: "medical" as const,
  }));
}

describe("calculateAvailableLoanCapacity", () => {
  it("bildet das Beispiel 1 Mio. Fonds / 70 % / 500k ausstehend / 50k zugesagt = 150k", () => {
    const p = lendingBase((x) => {
      x.allocation.utilizationBase = "solidarityCash";
      x.allocation.minimumLiquidityReservePercent = 0.3;
      x.fund.maximumLoanUtilization = 0.7;
    });
    const cap = calculateAvailableLoanCapacity(p, {
      solidarityCashCents: eurosToCents(1_000_000),
      outstandingLoanBalanceCents: eurosToCents(500_000),
      committedLoanAmountCents: eurosToCents(50_000),
      personalLiabilitiesCents: 0,
      expectedAdminCostCents: 0,
      averageFundAssetsCents: eurosToCents(1_000_000),
      outstandingByClass: {},
      outstandingByPurpose: {},
      disbursedThisMonthCents: 0,
    });
    expect(cap.maxOutstandingLoansCents).toBe(eurosToCents(700_000));
    expect(cap.availableLoanCapacityCents).toBe(eurosToCents(150_000));
  });

  it("Fonds-Kredit = max(0, Antrag − Guthaben)", () => {
    const p = lendingBase();
    p.loans.payoutPersonalBalanceOnDisbursement = true;
    expect(solidarityLoanNeedCents(p, eurosToCents(10_000), eurosToCents(3_000))).toBe(eurosToCents(7_000));
    expect(solidarityLoanNeedCents(p, eurosToCents(2_000), eurosToCents(5_000))).toBe(0);
    p.loans.payoutPersonalBalanceOnDisbursement = false;
    expect(solidarityLoanNeedCents(p, eurosToCents(10_000), eurosToCents(3_000))).toBe(eurosToCents(10_000));
  });
});

describe("Allokation und Warteliste", () => {
  it("Test 1: Nachfrage < Kapazität → alle zulässigen Kredite werden finanziert", () => {
    const p = lendingBase((x) => {
      x.creditDemand.scriptedApplications = apps(1, [100_000, 80_000, 50_000]);
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.eligibleDemandCents).toBe(eurosToCents(230_000));
    expect(m.loanDisbursementsCents).toBe(eurosToCents(230_000));
    expect(m.waitlistedAmountCents).toBe(0);
    expect(m.fundingRate).toBe(1);
    expect(m.unmetDemandCents).toBe(0);
  });

  it("Test 2: Nachfrage = Kapazität → alles zulässige wird finanziert", () => {
    const p = lendingBase((x) => {
      x.allocation.maxMonthlyLoanDisbursementCents = eurosToCents(150_000);
      x.creditDemand.scriptedApplications = apps(1, [100_000, 50_000]);
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.loanDisbursementsCents).toBe(eurosToCents(150_000));
    expect(m.waitlistedAmountCents).toBe(0);
    expect(m.fundingRate).toBe(1);
  });

  it("Test 3: Nachfrage > Kapazität → Kapazität wird nicht überschritten", () => {
    const p = lendingBase((x) => {
      x.allocation.maxMonthlyLoanDisbursementCents = eurosToCents(150_000);
      x.creditDemand.scriptedApplications = apps(1, [100_000, 80_000, 50_000, 20_000]);
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.creditDemandCents).toBe(eurosToCents(250_000));
    expect(m.loanDisbursementsCents).toBeLessThanOrEqual(eurosToCents(150_000));
    expect(m.loanDisbursementsCents).toBe(eurosToCents(150_000));
    expect(m.waitlistedAmountCents).toBe(eurosToCents(100_000));
    expect(m.unmetDemandCents).toBe(eurosToCents(100_000));
    expect(m.rejectedCents).toBe(0);
    expect(r.invariants.filter((i) => i.rule.includes("availableLoanCapacity"))).toHaveLength(0);
  });

  it("Test 4: bestehende Warteliste + neue Anträge (FIFO hinter bestehender Liste)", () => {
    const p = lendingBase((x) => {
      x.time.horizonMonths = 2;
      x.allocation.maxMonthlyLoanDisbursementCents = eurosToCents(100_000);
      x.allocation.waitlistMerge = "behind";
      x.prioritization.strategy = "fifo";
      x.creditDemand.scriptedApplications = [
        ...apps(1, [80_000, 80_000]),
        ...apps(2, [50_000]),
      ];
    });
    const r = simulateScenario(p);
    expect(r.months[0].waitlistedAmountCents).toBe(eurosToCents(80_000));
    expect(r.months[1].loanDisbursementsCents).toBe(eurosToCents(80_000));
    expect(r.months[1].waitlistedAmountCents).toBe(eurosToCents(50_000));
  });

  it("Test 5: Liquiditätsreserve wird nicht unterschritten", () => {
    const p = lendingBase((x) => {
      x.fund.maximumLoanUtilization = 1;
      x.fund.minimumFundReserve = 0;
      x.allocation.minimumLiquidityReservePercent = 0.3;
      x.allocation.enforceMinimumLiquidity = true;
      x.creditDemand.scriptedApplications = apps(1, [100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000]);
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.loanDisbursementsCents).toBeLessThanOrEqual(eurosToCents(700_000) + 500);
    expect(m.solidarityCashCents).toBeGreaterThanOrEqual(m.liquidityReserveCents - 1);
    expect(m.waitlistedCount).toBeGreaterThan(0);
  });

  it("Test 6: maximale Kreditquote → weitere Anträge auf die Warteliste", () => {
    const p = lendingBase((x) => {
      x.allocation.enforceMinimumLiquidity = false;
      x.allocation.minimumLiquidityReservePercent = 0;
      x.fund.maximumLoanUtilization = 0.7;
      x.creditDemand.scriptedApplications = apps(1, Array.from({ length: 10 }, () => 100_000));
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.utilization).toBeLessThanOrEqual(0.7 + 0.02);
    expect(m.loanDisbursementsCents).toBeLessThanOrEqual(eurosToCents(700_000) + 1);
    expect(m.waitlistedAmountCents).toBeGreaterThan(0);
  });

  it("Test 7: Teilfinanzierung aktiv → Rest bleibt in der Warteschlange", () => {
    const p = lendingBase((x) => {
      x.time.horizonMonths = 1;
      x.allocation.allowPartialFunding = true;
      x.allocation.maxMonthlyLoanDisbursementCents = eurosToCents(150_000);
      x.creditDemand.scriptedApplications = apps(1, [100_000, 80_000]);
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.loanDisbursementsCents).toBe(eurosToCents(150_000));
    expect(m.waitlistedAmountCents).toBe(eurosToCents(30_000));
    expect(r.waitlist.some((a) => a.remainingAmountCents === eurosToCents(30_000))).toBe(true);
  });

  it("Test 8: Teilfinanzierung aus → Antrag wird vollständig gewartet", () => {
    const p = lendingBase((x) => {
      x.allocation.allowPartialFunding = false;
      x.allocation.maxMonthlyLoanDisbursementCents = eurosToCents(150_000);
      x.creditDemand.scriptedApplications = apps(1, [100_000, 80_000, 50_000, 20_000]);
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.loanDisbursementsCents).toBe(eurosToCents(150_000));
    expect(m.waitlistedAmountCents).toBe(eurosToCents(100_000));
  });

  it("Test 9: Rückzahlung schafft Kapazität für die Warteliste", () => {
    const p = lendingBase((x) => {
      x.time.horizonMonths = 2;
      x.loans.defaultTermMonths = 2;
      x.loans.classes = x.loans.classes.map((c) => ({ ...c, defaultTermMonths: 2 }));
      x.allocation.enforceMinimumLiquidity = false;
      x.allocation.minimumLiquidityReservePercent = 0;
      x.fund.maximumLoanUtilization = 1;
      x.fund.minimumFundReserve = 0;
      x.fund.initialCashCents = eurosToCents(200_000);
      x.allocation.maxMonthlyLoanDisbursementCents = 0;
      x.creditDemand.scriptedApplications = apps(1, [120_000, 100_000]);
    });
    const r = simulateScenario(p);
    expect(r.months[0].loanDisbursementsCents).toBe(eurosToCents(120_000));
    expect(r.months[0].waitlistedAmountCents).toBe(eurosToCents(100_000));
    expect(r.months[1].repaymentsCents).toBeGreaterThan(0);
    expect(r.months[1].loanDisbursementsCents).toBe(eurosToCents(100_000));
    expect(r.months[1].waitlistedAmountCents).toBe(0);
  });

  it("Test 10: Austrittsreserve mindert die verfügbare Kreditkapazität", () => {
    const withReserve = lendingBase((x) => {
      x.allocation.expectedMemberExitAmountCents = eurosToCents(800_000);
      x.allocation.minimumLiquidityReservePercent = 0;
      x.fund.maximumLoanUtilization = 1;
      x.fund.minimumFundReserve = 0;
      x.creditDemand.scriptedApplications = apps(1, [100_000, 100_000, 100_000]);
    });
    const without = structuredClone(withReserve);
    without.allocation.expectedMemberExitAmountCents = 0;
    const a = simulateScenario(withReserve);
    const b = simulateScenario(without);
    expect(a.months[0].capacityAtAllocationCents).toBeLessThan(b.months[0].capacityAtAllocationCents);
    expect(a.months[0].loanDisbursementsCents).toBe(eurosToCents(200_000));
    expect(b.months[0].loanDisbursementsCents).toBe(eurosToCents(300_000));
  });

  it("Test 11: Krise erhöht Nachfrage und Ausfälle", () => {
    const base = lendingBase((x) => {
      x.time.horizonMonths = 6;
      x.defaults.constantRate = 0.02;
      x.creditDemand.model = "fixed";
      x.creditDemand.applicationsPerMonth = 4;
      x.creditDemand.averageAmountCents = eurosToCents(20_000);
      x.creditDemand.scriptedApplications = [];
      x.events[0].enabled = true;
      x.events[0].startMonth = 2;
      x.events[0].durationMonths = 4;
      x.events[0].effects.demandMultiplier = 2;
      x.events[0].effects.defaultRateDelta = 0.2;
    });
    const calm = structuredClone(base);
    calm.events[0].enabled = false;
    const crisis = simulateScenario(base);
    const normal = simulateScenario(calm);
    expect(crisis.months[2].creditDemandCents).toBeGreaterThan(normal.months[2].creditDemandCents);
    expect(crisis.risk.totalDefaultedCents).toBeGreaterThanOrEqual(normal.risk.totalDefaultedCents);
  });

  it("Test 12: dauerhafte Übernachfrage wird als struktureller Engpass erkannt", () => {
    const p = lendingBase((x) => {
      x.time.horizonMonths = 5;
      x.allocation.maxMonthlyLoanDisbursementCents = eurosToCents(50_000);
      x.allocation.structuralShortageMonths = 3;
      x.creditDemand.scriptedApplications = [1, 2, 3, 4, 5].flatMap((month) => apps(month, [40_000, 40_000]));
    });
    const r = simulateScenario(p);
    expect(r.lastMonth?.structuralShortage).toBe(true);
    expect(r.warnings.some((w) => w.code === "STRUCTURAL_FUNDING_SHORTAGE")).toBe(true);
    expect(r.months[4].waitlistedAmountCents).toBeGreaterThan(r.months[0].waitlistedAmountCents);
  });

  it("trennt Ablehnung und Warteliste", () => {
    const p = lendingBase((x) => {
      x.allocation.maxMonthlyLoanDisbursementCents = eurosToCents(10_000);
      x.creditDemand.scriptedApplications = [
        ...apps(1, [10_000], [{ creditScore: 80 }]),
        ...apps(1, [10_000], [{ creditScore: 80 }]),
        { month: 1, requestedAmountCents: eurosToCents(10_000), hasDefaultHistory: true, creditScore: 10, tenureMonths: 24, classId: "plus" },
      ];
      x.creditApproval.rejectIfDefaultHistory = true;
      x.creditApproval.enabledFactors.defaultHistory = true;
      x.creditApproval.minCreditScore = 35;
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.rejectedCents).toBe(eurosToCents(10_000));
    expect(m.waitlistedAmountCents).toBe(eurosToCents(10_000));
    expect(m.unmetDemandCents).toBe(eurosToCents(10_000));
    expect(m.unmetDemandCents).not.toBe(m.rejectedCents + m.waitlistedAmountCents);
  });

  it("zahlt persönliches Guthaben bei Kredit aus; Fonds-Kredit ist die Differenz", () => {
    const p = lendingBase((x) => {
      x.time.horizonMonths = 1;
      x.loans.payoutPersonalBalanceOnDisbursement = true;
      x.creditDemand.scriptedApplications = [
        {
          month: 1,
          requestedAmountCents: eurosToCents(5_000),
          personalBalanceCents: eurosToCents(800),
          tenureMonths: 24,
          creditScore: 80,
          incomeCents: eurosToCents(50_000),
          classId: "plus",
          purpose: "medical",
          memberId: "M-offset",
        },
      ];
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.loanDisbursementsCents).toBe(eurosToCents(4_200));
    expect(m.outstandingLoansCents).toBe(eurosToCents(4_200));
    expect(m.loanLinkedPersonalPayoutsCents).toBe(eurosToCents(800));
    expect(m.personalLiabilitiesCents).toBe(m.personalContributionCents - eurosToCents(800));
    const solidarityStart = p.fund.initialCashCents + m.solidarityContributionCents;
    expect(m.solidarityCashCents).toBe(solidarityStart - eurosToCents(4_200));
  });

  it("ohne Guthaben-Verrechnung bleibt der Fonds-Kredit der volle Antrag", () => {
    const p = lendingBase((x) => {
      x.time.horizonMonths = 1;
      x.loans.payoutPersonalBalanceOnDisbursement = false;
      x.creditDemand.scriptedApplications = [
        {
          month: 1,
          requestedAmountCents: eurosToCents(5_000),
          personalBalanceCents: eurosToCents(800),
          tenureMonths: 24,
          creditScore: 80,
          incomeCents: eurosToCents(50_000),
          classId: "plus",
          purpose: "medical",
        },
      ];
    });
    const r = simulateScenario(p);
    expect(r.months[0].loanDisbursementsCents).toBe(eurosToCents(5_000));
    expect(r.months[0].loanLinkedPersonalPayoutsCents).toBe(0);
  });
});

describe("Teilfinanzierung (Unit)", () => {
  it("proportional verteilt bei Strategie proportional", () => {
    const p = lendingBase((x) => {
      x.prioritization.strategy = "proportional";
      x.allocation.allowPartialFunding = true;
    });
    const queue = apps(1, [10_000, 10_000, 10_000, 10_000, 10_000]).map((s, i) => ({
      id: `A-${i}`,
      memberId: `M-${i}`,
      applicationDate: 1,
      requestedAmountCents: s.requestedAmountCents,
      approvedAmountCents: s.requestedAmountCents,
      fundedAmountCents: 0,
      remainingAmountCents: s.requestedAmountCents,
      purpose: "other" as const,
      priorityCategory: "other" as const,
      creditClass: "basic",
      creditScore: 80,
      needScore: 10,
      membershipScore: 50,
      incomeScore: 50,
      repaymentScore: 100,
      priorityScore: 1,
      status: "ELIGIBLE" as const,
      queuePosition: i + 1,
      waitlistDate: null,
      expectedFundingDate: null,
      actualFundingDate: null,
      expirationDate: null,
      partialFundingAllowed: true,
      rejectionReason: "",
      tenureMonths: 24,
      scale: 1,
      termMonths: 12,
      personalBalanceCents: 0,
      solidarityPaidCents: 0,
      incomeCents: eurosToCents(3000),
      existingDebtCents: 0,
      hasDefaultHistory: false,
      collateral: false,
      personalPaidOutCents: 0,
    }));
    const alloc = allocateLoans(p, queue, eurosToCents(25_000), eurosToCents(1_000_000), {
      byMember: new Map(),
      byClass: new Map(),
      byPurpose: new Map(),
    });
    expect(alloc.disbursedCents).toBe(eurosToCents(25_000));
    expect(alloc.waitlisted.every((a) => a.remainingAmountCents === eurosToCents(5_000))).toBe(true);
  });
});
