import { eurosToCents } from "./money";
import type {
  AdminCostCategory,
  AdminCostId,
  CrisisEvent,
  SimulationParameters,
  ShockConfig,
} from "./types";
import { ENGINE_VERSION } from "./types";

const ADMIN_COST_LABELS: Record<AdminCostId, string> = {
  personnel: "Personal",
  it: "IT",
  server: "Server",
  hosting: "Hosting",
  software: "Software",
  accounting: "Buchhaltung",
  taxAdvice: "Steuerberatung",
  legal: "Rechtsberatung",
  compliance: "Compliance",
  shariahAdvice: "Shariah-Beratung (Kostenannahme)",
  insurance: "Versicherung",
  office: "Büro",
  payments: "Zahlungsverkehr",
  customerService: "Kundenservice",
  marketing: "Marketing",
  other: "Sonstige Kosten",
};

function cost(
  id: AdminCostId,
  fixedEuro: number,
  perMemberEuro = 0,
  extras: Partial<AdminCostCategory> = {},
): AdminCostCategory {
  return {
    id,
    label: ADMIN_COST_LABELS[id],
    enabled: true,
    fixedMonthlyCents: eurosToCents(fixedEuro),
    perMemberCents: eurosToCents(perMemberEuro),
    growthPercentPerMonth: 0,
    annualCents: 0,
    annualChargeMonth: 12,
    oneOff: [],
    tiers: [],
    ...extras,
  };
}

function emptyShock(): ShockConfig {
  return {
    enabled: false,
    month: 24,
    memberDropRate: 0,
    defaultShareOfOutstanding: 0,
    personalPayoutRate: 0,
    demandMultiplier: 1,
    adminCostMultiplier: 1,
  };
}

function crisis(
  id: string,
  name: string,
  startMonth: number,
  durationMonths: number,
  effects: CrisisEvent["effects"],
  enabled = false,
): CrisisEvent {
  return { id, name, enabled, startMonth, durationMonths, effects };
}

export function createDefaultParameters(): SimulationParameters {
  return {
    meta: {
      name: "Beispieldaten: 1.000 Mitglieder – Base",
      description:
        "Demonstrationsszenario (Beispieldaten). Modellannahme, keine Prognose und keine schariarechtliche Bewertung.",
      isDemo: true,
      notes:
        "Alle Werte sind Simulationsparameter. Die tatsächliche Eignung und Scharia-Konformität muss durch qualifizierte Fachleute geprüft werden.",
    },
    seed: 20260101,
    time: {
      startDate: "2026-01-01",
      horizonMonths: 60,
      loanOriginationStartMonth: 12,
    },
    population: {
      mode: "dynamic",
      initialMembers: 1000,
      maxMembers: 20000,
      minMembershipMonthsForLoan: 12,
      minMembershipMonthsBeforeExit: 12,
      fixedModeReplacesExits: true,
      growth: {
        type: "percent",
        constantPerMonth: 10,
        percentPerMonth: 0.01,
        timeseries: [],
      },
      seasonalGrowth: [
        { monthOfYear: 1, multiplier: 0.8 },
        { monthOfYear: 9, multiplier: 1.2 },
      ],
      monthlyNoiseStdev: 0.05,
      joinWave: { enabled: false, month: 18, extraMembers: 500 },
      memberDrop: { enabled: false, month: 36, membersLost: 200 },
      growthEvents: [
        {
          id: "marketing-wave",
          name: "Marketingkampagne",
          startMonth: 12,
          durationMonths: 3,
          extraMembersPerMonth: 0,
        },
      ],
    },
    withdrawals: {
      rateMode: "percent",
      monthlyExitRate: 0.004,
      monthlyExitCount: 0,
      seasonalExits: [{ monthOfYear: 1, multiplier: 1.3 }],
      allocation: "oldestFirst",
      shock: { enabled: false, month: 36, percentOfMembers: 0.1 },
      payoutRule: "immediate",
      payoutDelayMonths: 3,
      payoutDeadlineMonths: 6,
      installmentMonths: 6,
      exitsContributeInExitMonth: true,
    },
    contributions: {
      monthlyContributionCents: eurosToCents(100),
      personalSavingsShareCents: eurosToCents(80),
      solidarityShareCents: eurosToCents(20),
    },
    administration: {
      feeMode: "fixed",
      feePerMemberCents: eurosToCents(5),
      feeChangeMonth: 25,
      feeAfterChangeCents: eurosToCents(6),
      tiers: [
        { minMembers: 0, maxMembers: 499, feeCents: eurosToCents(6) },
        { minMembers: 500, maxMembers: 4999, feeCents: eurosToCents(5) },
        { minMembers: 5000, maxMembers: 1_000_000, feeCents: eurosToCents(4) },
      ],
      initialCashCents: 0,
      costs: [
        cost("personnel", 2500, 1),
        cost("it", 150),
        cost("server", 80),
        cost("hosting", 40),
        cost("software", 120),
        cost("accounting", 180),
        cost("taxAdvice", 0, 0, { annualCents: eurosToCents(1800), annualChargeMonth: 12 }),
        cost("legal", 80),
        cost("compliance", 70),
        cost("shariahAdvice", 120),
        cost("insurance", 90),
        cost("office", 180),
        cost("payments", 0, 0.15),
        cost("customerService", 40, 0.2),
        cost("marketing", 250),
        cost("other", 50),
      ],
    },
    fund: {
      initialCashCents: eurosToCents(0),
      maximumLoanUtilization: 0.7,
      minimumFundReserve: 0.3,
    },
    loans: {
      limitMethod: "combined",
      maxProductCents: eurosToCents(20000),
      tenureLimits: [
        { minMonths: 12, maxCents: eurosToCents(2500) },
        { minMonths: 24, maxCents: eurosToCents(5000) },
        { minMonths: 36, maxCents: eurosToCents(10000) },
        { minMonths: 48, maxCents: eurosToCents(20000) },
      ],
      solidarityMultiplier: 10,
      personalMultiplier: 5,
      incomeLimitEnabled: true,
      incomeMultiple: 6,
      classes: [
        {
          id: "basic",
          label: "Basic",
          minCents: eurosToCents(0),
          maxCents: eurosToCents(3000),
          minMembershipMonths: 12,
          defaultTermMonths: 12,
          defaultRate: 0.02,
          recoveryRate: 0.8,
        },
        {
          id: "plus",
          label: "Plus",
          minCents: eurosToCents(3001),
          maxCents: eurosToCents(10000),
          minMembershipMonths: 24,
          defaultTermMonths: 24,
          defaultRate: 0.03,
          recoveryRate: 0.7,
        },
        {
          id: "premium",
          label: "Premium",
          minCents: eurosToCents(10001),
          maxCents: eurosToCents(20000),
          minMembershipMonths: 36,
          defaultTermMonths: 36,
          defaultRate: 0.05,
          recoveryRate: 0.6,
        },
      ],
      allowedTerms: [6, 12, 18, 24, 36, 48, 60],
      defaultTermMonths: 24,
      repaymentModel: "linear",
      graceMonths: 0,
      alternativeRepaymentEnabled: false,
      amountCapPolicy: "capToLimit",
      maxActiveLoansPerMember: 1,
    },
    creditDemand: {
      model: "perMember",
      applicationsPerMonth: 8,
      applicationsPerThousandMembers: 8,
      averageAmountCents: eurosToCents(5000),
      minAmountCents: eurosToCents(500),
      maxAmountCents: eurosToCents(20000),
      demandGrowthPerMonth: 0.005,
      amountNoiseStdev: 0.25,
      classMix: [
        { classId: "basic", share: 0.6 },
        { classId: "plus", share: 0.3 },
        { classId: "premium", share: 0.1 },
      ],
      timeseries: [],
    },
    needClasses: [
      { id: "medical", label: "Medizinischer Bedarf", priority: 100, share: 0.18 },
      { id: "emergency", label: "Notfall", priority: 95, share: 0.1 },
      { id: "repair", label: "Notwendige Reparatur", priority: 80, share: 0.12 },
      { id: "education", label: "Bildung", priority: 75, share: 0.12 },
      { id: "housing", label: "Wohnen", priority: 70, share: 0.15 },
      { id: "professional", label: "Beruflicher Bedarf", priority: 65, share: 0.1 },
      { id: "permitted_other", label: "Sonstiger zulässiger Bedarf", priority: 40, share: 0.08 },
      { id: "consumption", label: "Konsum", priority: 15, share: 0.1 },
      { id: "other", label: "Sonstiges", priority: 10, share: 0.05 },
    ],
    creditApproval: {
      enabledFactors: {
        membershipDuration: true,
        personalBalance: true,
        solidarityContributions: true,
        income: true,
        expenses: false,
        existingLoans: true,
        outstandingDebt: true,
        repaymentHistory: false,
        arrears: false,
        defaultHistory: true,
        requestedAmount: true,
        dti: true,
        guarantor: false,
        collateral: false,
        creditClass: true,
      },
      minCreditScore: 35,
      maxOutstandingToIncome: 8,
      rejectIfDefaultHistory: true,
      requireGuarantorForPremium: false,
    },
    creditScore: {
      enabledFactors: {
        membership: true,
        personalBalance: true,
        income: true,
        repaymentHistory: true,
        existingDebt: true,
        delinquency: true,
        dti: true,
        collateral: true,
      },
      membershipMax: 50,
      membershipRefMonths: 36,
      personalBalanceMax: 20,
      personalBalanceRefCents: eurosToCents(3000),
      incomeMax: 20,
      incomeRefCents: eurosToCents(2500),
      repaymentHistoryMax: 30,
      existingDebtMin: -30,
      existingDebtMax: 0,
      existingDebtRefCents: eurosToCents(10000),
      delinquencyMin: -50,
      delinquencyMax: 0,
      dtiMin: -30,
      dtiMax: 0,
      dtiRef: 0.4,
      collateralMax: 20,
    },
    prioritization: {
      strategy: "weighted",
      weightScore: 0.4,
      weightNeed: 0.3,
      weightTenure: 0.2,
      weightFifo: 0.1,
    },
    defaults: {
      model: "constant",
      rateBasis: "annual",
      constantRate: 0.03,
      timing: "random",
      timingAfterMonths: 3,
      nearEndMonths: 3,
      byClass: [
        { classId: "basic", rate: 0.02 },
        { classId: "plus", rate: 0.03 },
        { classId: "premium", rate: 0.05 },
      ],
      byTenure: [
        { minMonths: 0, rate: 0.05 },
        { minMonths: 12, rate: 0.03 },
        { minMonths: 24, rate: 0.02 },
      ],
      byMonth: [],
      byRemainingTerm: [
        { maxRemainingMonths: 3, rate: 0.015 },
        { maxRemainingMonths: 12, rate: 0.03 },
        { maxRemainingMonths: 60, rate: 0.04 },
      ],
    },
    delinquency: {
      enabled: true,
      latePaymentRate: 0.05,
      monthsUntilDefault: 3,
    },
    recovery: {
      model: "fixed",
      fixedRate: 0.7,
      lagMonths: 2,
      byClass: [
        { classId: "basic", rate: 0.8 },
        { classId: "plus", rate: 0.7 },
        { classId: "premium", rate: 0.6 },
      ],
      byTime: [
        { monthsSinceDefault: 1, rate: 0.5 },
        { monthsSinceDefault: 6, rate: 0.7 },
        { monthsSinceDefault: 12, rate: 0.4 },
      ],
      collateralRecoveryRate: 0.85,
      randomStdev: 0.1,
    },
    income: {
      averageMonthlyIncomeCents: eurosToCents(2200),
      averageMonthlyExpensesCents: eurosToCents(1600),
      collateralShare: 0.2,
    },
    liquidity: {
      warningReserveRatio: 0.35,
      minimumReserveRatio: 0.3,
      minAbsoluteSolidarityCashCents: eurosToCents(5000),
      coverageMonthsTarget: 6,
    },
    health: {
      weightLiquidity: 0.25,
      weightFund: 0.2,
      weightCredit: 0.15,
      weightMembers: 0.15,
      weightAdmin: 0.1,
      weightDemand: 0.15,
    },
    monteCarlo: {
      runs: 200,
      seed: 20260101,
      defaultRateVariation: 0.4,
      exitRateVariation: 0.4,
      growthVariation: 0.3,
      demandVariation: 0.35,
      recoveryVariation: 0.25,
      liquidityOutflowVariation: 0.2,
    },
    maxApplicationsMaterialized: 2500,
    maxSampleLoans: 200,
    maxSampleMembers: 80,
    events: [
      crisis("finanzkrise", "Finanzkrise", 36, 6, {
        defaultRateDelta: 0.1,
        exitRateMultiplier: 1.15,
        demandMultiplier: 1.5,
        newMembersMultiplier: 0.7,
        recoveryDelta: -0.2,
        adminCostMultiplier: 1.1,
        personalLiquidityOutflowRate: 0,
      }),
    ],
    shocks: emptyShock(),
  };
}

function cloneParams(): SimulationParameters {
  return structuredClone(createDefaultParameters());
}

export type PresetId = "conservative" | "base" | "growth" | "stress" | "crisis" | "extreme";

export const PRESET_INFO: Record<PresetId, { label: string; description: string }> = {
  conservative: {
    label: "Conservative",
    description: "Niedrige Kreditvergabe, hohe Reserve, niedrige angenommene Ausfallquote. Nur Parameter, keine eigene Logik.",
  },
  base: {
    label: "Base",
    description: "Beispieldaten mit mittleren Annahmen (1.000 Mitglieder, 60 Monate).",
  },
  growth: {
    label: "Growth",
    description: "Starkes Mitgliederwachstum und höhere Kreditnachfrage.",
  },
  stress: {
    label: "Stress",
    description: "Höhere angenommene Ausfälle, Austritte und Nachfrage.",
  },
  crisis: {
    label: "Crisis",
    description: "Krisenereignis mit Liquiditätsbelastung. Modellannahme, kein Prognosemodell.",
  },
  extreme: {
    label: "Extreme",
    description: "Extremes Stress-Preset mit massivem Liquiditätsabfluss.",
  },
};

export function createPreset(id: PresetId): SimulationParameters {
  const p = cloneParams();
  p.meta.isDemo = true;
  p.meta.name = `Beispieldaten: ${PRESET_INFO[id].label}`;
  p.meta.description = PRESET_INFO[id].description;

  if (id === "conservative") {
    p.fund.maximumLoanUtilization = 0.5;
    p.fund.minimumFundReserve = 0.5;
    p.defaults.constantRate = 0.01;
    p.creditDemand.applicationsPerThousandMembers = 4;
    p.withdrawals.monthlyExitRate = 0.002;
    p.population.growth.percentPerMonth = 0.005;
  }

  if (id === "growth") {
    p.population.growth.type = "percent";
    p.population.growth.percentPerMonth = 0.025;
    p.population.maxMembers = 50000;
    p.population.growthEvents[0].extraMembersPerMonth = 80;
    p.creditDemand.applicationsPerThousandMembers = 10;
    p.creditDemand.demandGrowthPerMonth = 0.01;
    p.time.horizonMonths = 120;
  }

  if (id === "stress") {
    p.defaults.constantRate = 0.05;
    p.withdrawals.monthlyExitRate = 0.009;
    p.creditDemand.applicationsPerThousandMembers = 14;
    p.recovery.fixedRate = 0.55;
    p.meta.name = "Beispieldaten: Stress";
  }

  if (id === "crisis") {
    p.defaults.constantRate = 0.1;
    p.withdrawals.monthlyExitRate = 0.018;
    p.creditDemand.applicationsPerThousandMembers = 16;
    p.events[0].enabled = true;
    p.shocks.enabled = true;
    p.shocks.month = 36;
    p.shocks.personalPayoutRate = 0.15;
    p.shocks.defaultShareOfOutstanding = 0.08;
    p.recovery.fixedRate = 0.45;
  }

  if (id === "extreme") {
    p.defaults.constantRate = 0.2;
    p.withdrawals.monthlyExitRate = 0.028;
    p.creditDemand.applicationsPerThousandMembers = 20;
    p.events[0].enabled = true;
    p.events[0].effects.personalLiquidityOutflowRate = 0.2;
    p.shocks.enabled = true;
    p.shocks.month = 24;
    p.shocks.memberDropRate = 0.2;
    p.shocks.defaultShareOfOutstanding = 0.15;
    p.shocks.personalPayoutRate = 0.25;
    p.shocks.demandMultiplier = 2;
    p.shocks.adminCostMultiplier = 1.5;
    p.recovery.fixedRate = 0.35;
    p.fund.maximumLoanUtilization = 0.8;
    p.fund.minimumFundReserve = 0.2;
  }

  return p;
}

export const STRESS_PRESET_IDS: PresetId[] = [
  "base",
  "conservative",
  "growth",
  "stress",
  "crisis",
  "extreme",
];

export { ENGINE_VERSION };
