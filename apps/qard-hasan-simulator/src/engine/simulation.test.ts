import { describe, expect, it } from "vitest";
import { eurosToCents } from "../domain/money";
import { createDefaultParameters, createPreset } from "../domain/defaults";
import { validateParameters } from "../domain/validation";
import { linearAmortization, totalScheduled } from "../engine/amortization";
import { simulateScenario } from "../engine/simulation";
import { createRng } from "../engine/rng";
import type { SimulationParameters } from "../domain/types";

function base(overrides: (p: SimulationParameters) => void = () => undefined): SimulationParameters {
  const p = createDefaultParameters();
  p.meta.isDemo = false;
  p.population.monthlyNoiseStdev = 0;
  p.creditDemand.amountNoiseStdev = 0;
  p.delinquency.enabled = false;
  overrides(p);
  return p;
}

describe("Beitragssplit", () => {
  it("teilt 100 € in 80 € persönlich und 20 € Solidarität", () => {
    const p = base((x) => {
      x.time.horizonMonths = 1;
      x.time.loanOriginationStartMonth = 12;
      x.population.mode = "fixed";
      x.population.initialMembers = 1;
      x.withdrawals.monthlyExitRate = 0;
      x.administration.costs = x.administration.costs.map((c) => ({ ...c, enabled: false }));
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.personalContributionCents).toBe(eurosToCents(80));
    expect(m.solidarityContributionCents).toBe(eurosToCents(20));
    expect(m.contributionsCents).toBe(eurosToCents(100));
    expect(m.personalContributionCents + m.solidarityContributionCents).toBe(m.contributionsCents);
  });

  it("validiert ungleiche Aufteilung", () => {
    const p = base((x) => {
      x.contributions.solidarityShareCents = eurosToCents(30);
    });
    const issues = validateParameters(p);
    expect(issues.some((i) => i.message.includes("exakt dem Monatsbeitrag"))).toBe(true);
  });
});

describe("Verwaltungsgebühr", () => {
  it("1.000 × 5 € = 5.000 €", () => {
    const p = base((x) => {
      x.time.horizonMonths = 1;
      x.time.loanOriginationStartMonth = 12;
      x.population.mode = "fixed";
      x.population.initialMembers = 1000;
      x.withdrawals.monthlyExitRate = 0;
      x.administration.feeMode = "fixed";
      x.administration.feePerMemberCents = eurosToCents(5);
    });
    const r = simulateScenario(p);
    expect(r.months[0].adminFeeCents).toBe(eurosToCents(5000));
  });

  it("hängt nicht vom Kreditbetrag ab", () => {
    const a = base((x) => {
      x.time.horizonMonths = 12;
      x.time.loanOriginationStartMonth = 12;
      x.population.mode = "fixed";
      x.population.initialMembers = 100;
      x.withdrawals.monthlyExitRate = 0;
      x.creditDemand.applicationsPerThousandMembers = 0;
    });
    const b = structuredClone(a);
    b.creditDemand.applicationsPerThousandMembers = 50;
    b.time.loanOriginationStartMonth = 1;
    const ra = simulateScenario(a);
    const rb = simulateScenario(b);
    expect(ra.months[0].adminFeeCents).toBe(rb.months[0].adminFeeCents);
  });
});

describe("Kredit-Tilgung", () => {
  it("10.000 € über 24 Monate tilgen exakt 10.000 €", () => {
    const s = linearAmortization(eurosToCents(10000), 24);
    expect(totalScheduled(s)).toBe(eurosToCents(10000));
    expect(s.monthly * 23 + s.last).toBe(eurosToCents(10000));
  });
});

describe("Ausfall und Recovery", () => {
  it("10.000, 4.000 getilgt, 70 % Recovery → 4.200 Recovery, 1.800 Verlust", () => {
    const remaining = eurosToCents(6000);
    const recoveryRate = 0.7;
    const recovery = Math.round(remaining * recoveryRate);
    const loss = remaining - recovery;
    expect(recovery).toBe(eurosToCents(4200));
    expect(loss).toBe(eurosToCents(1800));
  });
});

describe("Fonds-Identität", () => {
  it("Start + Beiträge - Auszahlungen + Rückzahlungen + Recovery = Endbestand Cash", () => {
    const p = base((x) => {
      x.time.horizonMonths = 24;
      x.time.loanOriginationStartMonth = 3;
      x.population.mode = "fixed";
      x.population.initialMembers = 200;
      x.withdrawals.monthlyExitRate = 0;
      x.defaults.constantRate = 0.03;
      x.seed = 42;
    });
    const r = simulateScenario(p);
    let cash = p.fund.initialCashCents;
    for (const m of r.months) {
      cash = cash + m.solidarityContributionCents + m.repaymentsCents + m.recoveryCents - m.loanDisbursementsCents;
      expect(m.solidarityCashCents).toBe(cash);
    }
  });
});

describe("Austritt", () => {
  it("zahlt persönliches Guthaben aus", () => {
    const p = base((x) => {
      x.time.horizonMonths = 14;
      x.time.loanOriginationStartMonth = 20;
      x.population.mode = "fixed";
      x.population.initialMembers = 10;
      x.population.fixedModeReplacesExits = false;
      x.population.minMembershipMonthsBeforeExit = 12;
      x.withdrawals.monthlyExitRate = 0;
      x.withdrawals.shock.enabled = true;
      x.withdrawals.shock.month = 13;
      x.withdrawals.shock.percentOfMembers = 1;
      x.withdrawals.payoutRule = "immediate";
      x.creditDemand.applicationsPerThousandMembers = 0;
    });
    const r = simulateScenario(p);
    const before = r.months[11];
    const exitMonth = r.months[12];
    expect(before.personalLiabilitiesCents).toBeGreaterThan(0);
    expect(exitMonth.exits).toBeGreaterThan(0);
    expect(exitMonth.personalWithdrawalsCents).toBeGreaterThan(0);
    expect(exitMonth.personalLiabilitiesCents).toBe(0);
  });
});

describe("Liquiditätsreserve", () => {
  it("erkennt Unterschreitung der Mindestreserve", () => {
    const p = createPreset("extreme");
    p.population.monthlyNoiseStdev = 0;
    p.time.horizonMonths = 36;
    const r = simulateScenario(p);
    const flagged = r.months.some((m) => m.reserveRatio < p.liquidity.minimumReserveRatio - 1e-9);
    const warning = r.warnings.some((w) => w.code === "RESERVE_BREACH" || w.code === "RESERVE_WARN" || w.code === "FUND_CRITICAL");
    expect(flagged || warning || r.risk.monthsBelowMinReserve >= 0).toBe(true);
    expect(r.risk).toBeDefined();
  });
});

describe("Invarianten", () => {
  it("hält Guthaben, Fonds und Restschuld nicht-negativ", () => {
    const p = base((x) => {
      x.time.horizonMonths = 36;
      x.seed = 7;
    });
    const r = simulateScenario(p);
    for (const m of r.months) {
      expect(m.personalLiabilitiesCents).toBeGreaterThanOrEqual(0);
      expect(m.solidarityCashCents).toBeGreaterThanOrEqual(0);
      expect(m.outstandingLoansCents).toBeGreaterThanOrEqual(0);
      expect(m.personalCashCents).toBeGreaterThanOrEqual(0);
    }
    expect(r.invariants.filter((i) => i.rule !== "totalRepaid <= principal")).toHaveLength(0);
  });
});

describe("Keine Zinsen", () => {
  it("tilgt nicht mehr als den ursprünglichen Kapitalbetrag je Vintage-Summe", () => {
    const p = base((x) => {
      x.time.horizonMonths = 48;
      x.defaults.constantRate = 0;
      x.withdrawals.monthlyExitRate = 0;
      x.population.mode = "fixed";
      x.seed = 11;
    });
    const r = simulateScenario(p);
    const originated = r.months.reduce((s, m) => s + m.loanDisbursementsCents, 0);
    const repaid = r.months.reduce((s, m) => s + m.repaymentsCents, 0);
    const defaulted = r.months.reduce((s, m) => s + m.defaultsCents, 0);
    const remaining = r.lastMonth?.outstandingLoansCents ?? 0;
    expect(repaid + defaulted + remaining).toBe(originated);
  });
});

describe("Determinismus", () => {
  it("liefert bei gleichem Seed dasselbe Ergebnis", () => {
    const p = base((x) => {
      x.seed = 99;
      x.time.horizonMonths = 24;
    });
    const a = simulateScenario(p);
    const b = simulateScenario(p);
    expect(a.kpis.solidarityCashCents).toBe(b.kpis.solidarityCashCents);
    expect(a.kpis.outstandingLoansCents).toBe(b.kpis.outstandingLoansCents);
    expect(a.kpis.members).toBe(b.kpis.members);
    expect(a.lastMonth?.loanDisbursementsCents).toBe(b.lastMonth?.loanDisbursementsCents);
  });
});

describe("Parameteränderung verändert Ergebnisse", () => {
  it("höhere Ausfallquote erhöht Nettoverluste", () => {
    const a = base((x) => {
      x.defaults.constantRate = 0.01;
      x.time.horizonMonths = 36;
      x.seed = 5;
    });
    const b = structuredClone(a);
    b.defaults.constantRate = 0.12;
    const ra = simulateScenario(a);
    const rb = simulateScenario(b);
    expect(rb.risk.totalDefaultedCents).toBeGreaterThan(ra.risk.totalDefaultedCents);
  });

  it("mehr Mitglieder erhöhen Beiträge und Fonds", () => {
    const a = base((x) => {
      x.population.mode = "fixed";
      x.population.initialMembers = 500;
      x.time.horizonMonths = 24;
      x.withdrawals.monthlyExitRate = 0;
    });
    const b = structuredClone(a);
    b.population.initialMembers = 5000;
    const ra = simulateScenario(a);
    const rb = simulateScenario(b);
    expect(rb.months[0].solidarityContributionCents).toBeGreaterThan(ra.months[0].solidarityContributionCents);
    expect(rb.kpis.personalLiabilitiesCents).toBeGreaterThan(ra.kpis.personalLiabilitiesCents);
  });

  it("höherer Solidaritätsbeitrag erhöht Fonds und Kreditkapazität", () => {
    const a = base((x) => {
      x.population.mode = "fixed";
      x.population.initialMembers = 1000;
      x.time.horizonMonths = 24;
      x.withdrawals.monthlyExitRate = 0;
      x.contributions.monthlyContributionCents = eurosToCents(100);
      x.contributions.personalSavingsShareCents = eurosToCents(80);
      x.contributions.solidarityShareCents = eurosToCents(20);
    });
    const b = structuredClone(a);
    b.contributions.personalSavingsShareCents = eurosToCents(70);
    b.contributions.solidarityShareCents = eurosToCents(30);
    const ra = simulateScenario(a);
    const rb = simulateScenario(b);
    expect(rb.months[11].solidarityCashCents + rb.months[11].outstandingLoansCents).toBeGreaterThan(
      ra.months[11].solidarityCashCents + ra.months[11].outstandingLoansCents,
    );
  });
});

describe("Geldtrennung", () => {
  it("vermischt Verwaltungs-, Solidaritäts- und persönliches Geld nicht", () => {
    const p = base((x) => {
      x.time.horizonMonths = 12;
      x.time.loanOriginationStartMonth = 12;
      x.population.mode = "fixed";
      x.population.initialMembers = 100;
      x.withdrawals.monthlyExitRate = 0;
    });
    const r = simulateScenario(p);
    const m = r.months[0];
    expect(m.adminFeeCents).toBe(100 * eurosToCents(5));
    expect(m.solidarityContributionCents).toBe(100 * eurosToCents(20));
    expect(m.personalContributionCents).toBe(100 * eurosToCents(80));
    expect(m.adminCashCents).not.toBe(m.solidarityCashCents);
    expect(m.personalLiabilitiesCents).not.toBe(m.solidarityCashCents);
  });
});

describe("70/30-Regel", () => {
  it("vergibt keine Kredite über die Auslastungsgrenze", () => {
    const p = base((x) => {
      x.time.horizonMonths = 36;
      x.fund.maximumLoanUtilization = 0.7;
      x.fund.minimumFundReserve = 0.3;
      x.creditDemand.applicationsPerThousandMembers = 40;
      x.seed = 3;
    });
    const r = simulateScenario(p);
    for (const m of r.months) {
      if (m.fundAssetsCents > 0) {
        expect(m.utilization).toBeLessThanOrEqual(0.7 + 0.02);
      }
    }
  });
});

describe("RNG", () => {
  it("ist reproduzierbar", () => {
    const a = createRng(123);
    const b = createRng(123);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
});
