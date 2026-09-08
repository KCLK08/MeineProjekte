import type {
  MonthlySnapshot,
  SimulationParameters,
  SystemHealth,
  Warning,
  InvariantViolation,
  RiskMetrics,
} from "../domain/types";

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function computeRisk(months: MonthlySnapshot[], params: SimulationParameters): RiskMetrics {
  const outstanding = months.map((m) => m.outstandingLoansCents);
  const util = months.map((m) => m.utilization);
  const demand = months.map((m) => m.creditDemandCents);
  const cash = months.map((m) => m.liquidityCents);
  const sol = months.map((m) => m.solidarityCashCents);
  const withdraw = months.map((m) => m.personalWithdrawalsCents);
  const personal = months.map((m) => m.personalLiabilitiesCents);
  const last = months[months.length - 1];

  const monthsBelow = months.filter(
    (m) => m.reserveRatio + 1e-9 < params.liquidity.minimumReserveRatio,
  ).length;
  const crises = months.filter(
    (m) => m.shortfallPersonalCents > 0 || m.solidarityCashCents < 0 || m.reserveRatio < 0.05,
  ).length;

  const recent = months.slice(-Math.min(6, months.length));
  const avgNet =
    avg(
      recent.map(
        (m) =>
          m.solidarityContributionCents +
          m.repaymentsCents +
          m.recoveryCents -
          m.loanDisbursementsCents -
          m.personalWithdrawalsCents,
      ),
    ) || 0;
  const horizon =
    avgNet >= 0
      ? 999
      : last
        ? last.liquidityCents / Math.max(1, -avgNet)
        : 0;

  return {
    maxOutstandingLoansCents: Math.max(0, ...outstanding),
    maxFundUtilization: Math.max(0, ...util),
    avgFundUtilization: avg(util),
    maxMonthlyDemandCents: Math.max(0, ...demand),
    totalUnmetDemandCents: months.reduce((s, m) => s + m.unmetDemandCents, 0),
    totalDefaultedCents: months.reduce((s, m) => s + m.defaultsCents, 0),
    totalRecoveryCents: months.reduce((s, m) => s + m.recoveryCents, 0),
    totalNetLossCents: last?.cumulativeNetLossCents ?? 0,
    maxLiquidityStressCents: Math.max(0, ...withdraw),
    minCashCents: cash.length ? Math.min(...cash) : 0,
    minSolidarityCashCents: sol.length ? Math.min(...sol) : 0,
    monthsBelowMinReserve: monthsBelow,
    liquidityCrisisCount: crises,
    maxWithdrawalOutflowCents: Math.max(0, ...withdraw),
    maxPersonalLiabilitiesCents: Math.max(0, ...personal),
    finalAdminBalanceCents: last?.adminCashCents ?? 0,
    liquidityHorizonMonths: horizon,
    avgFundingRate: avg(months.map((m) => m.fundingRate)),
    maxWaitlistCents: Math.max(0, ...months.map((m) => m.waitlistedAmountCents)),
    maxDemandPressure: Math.max(0, ...months.map((m) => m.demandPressure)),
    avgWaitMonths: avg(months.map((m) => m.averageWaitMonths)),
    structuralShortageMonths: months.filter((m) => m.structuralShortage).length,
  };
}

function clamp01(n: number): number {
  return Math.min(100, Math.max(0, n));
}

export function computeHealth(
  last: MonthlySnapshot | null,
  months: MonthlySnapshot[],
  params: SimulationParameters,
): SystemHealth {
  const disclaimer =
    "System Health ist eine interne Simulationsmetrik (0–100), kein wissenschaftlich validierter Score und keine Aussage über Sicherheit oder Scharia-Konformität.";
  if (!last) {
    return {
      score: 0,
      liquidity: 0,
      fund: 0,
      credit: 0,
      members: 0,
      admin: 0,
      demand: 0,
      waitlist: 0,
      funding: 0,
      label: "CRITICAL",
      disclaimer,
    };
  }
  const liquidity =
    last.shortfallPersonalCents > 0 || last.solidarityCashCents < 0
      ? 10
      : last.reserveRatio >= params.liquidity.warningReserveRatio
        ? 95
        : last.reserveRatio >= params.liquidity.minimumReserveRatio
          ? 65
          : last.solidarityCashCents > 0
            ? 35
            : 15;
  const fund = last.utilization <= params.fund.maximumLoanUtilization ? 90 - last.utilization * 20 : 25;
  const assumed = params.defaults.constantRate;
  const realized = months.length
    ? months.reduce((s, m) => s + m.defaultsCents, 0) /
      Math.max(
        1,
        months.reduce((s, m) => s + m.outstandingLoansCents, 0) / months.length,
      )
    : 0;
  const credit = clamp01(100 - (realized / Math.max(0.005, assumed)) * 25);
  const netMember = last.members / Math.max(1, params.population.initialMembers);
  const members = clamp01(50 + (netMember - 1) * 80);
  const admin = last.adminCashCents >= 0 ? 85 : last.adminCashCents > -5_000_00 ? 45 : 20;
  const demand = clamp01(last.fulfillmentRatio * 100);
  const waitlist = last.waitlistedAmountCents <= 0 ? 95 : last.structuralShortage ? 20 : last.demandPressureBand === "extreme" ? 25 : 55;
  const funding = clamp01(last.fundingRate * 100);
  const w = params.health;
  const score = clamp01(
    w.weightLiquidity * liquidity +
      w.weightFund * fund +
      w.weightCredit * credit +
      w.weightMembers * members +
      w.weightAdmin * admin +
      w.weightDemand * demand +
      w.weightWaitlist * waitlist +
      w.weightFunding * funding,
  );
  const label = score >= 80 ? "HEALTHY" : score >= 65 ? "WATCH" : score >= 45 ? "STRESSED" : "CRITICAL";
  return { score, liquidity, fund, credit, members, admin, demand, waitlist, funding, label, disclaimer };
}

export function computeWarnings(
  last: MonthlySnapshot | null,
  months: MonthlySnapshot[],
  params: SimulationParameters,
  invariants: InvariantViolation[],
): Warning[] {
  const out: Warning[] = [];
  if (!last) {
    return [{ level: "yellow", code: "EMPTY", title: "Keine Ergebnisse", detail: "Die Simulation hat keine Monatsdaten erzeugt." }];
  }

  const unmet = months.some((m) => m.unmetDemandCents > 0);
  const adminNeg = months.some((m) => m.cumulativeAdminCents < 0);
  const lowReserve = last.reserveRatio < params.liquidity.warningReserveRatio;
  const minReserve = last.reserveRatio < params.liquidity.minimumReserveRatio;
  const personalShort = last.shortfallPersonalCents > 0 || months.some((m) => m.shortfallPersonalCents > 0);
  const fundCritical = last.solidarityCashCents < params.liquidity.minAbsoluteSolidarityCashCents;
  const cannotPay = personalShort || last.solidarityCashCents < 0;

  if (cannotPay) {
    out.push({
      level: "critical",
      code: "OBLIGATIONS",
      title: "System kann Verpflichtungen nicht bedienen",
      detail:
        "In der Simulation reichen die zugeordneten Mittel nicht aus, um alle fälligen Auszahlungen vollständig zu leisten.",
    });
  }
  if (personalShort) {
    out.push({
      level: "red",
      code: "PERSONAL_PAYOUT",
      title: "Persönliche Auszahlungsverpflichtungen nicht ausreichend gedeckt",
      detail: "Auszahlungen persönlicher Guthaben konnten nicht vollständig aus dem persönlichen Cash-Topf geleistet werden.",
    });
  }
  if (last.solidarityCashCents < 0 || (minReserve && fundCritical)) {
    out.push({
      level: "red",
      code: "FUND_CRITICAL",
      title: "Solidaritätsfonds kritisch",
      detail: "Die simulierte Liquidität des Solidaritätsfonds unterschreitet die konfigurierte Mindestschwelle.",
    });
  }
  if (minReserve) {
    out.push({
      level: "red",
      code: "RESERVE_BREACH",
      title: "Liquiditätsreserve unterschritten",
      detail: `Reservequote ${ (last.reserveRatio * 100).toFixed(1) } % liegt unter der Mindestreserve von ${(params.liquidity.minimumReserveRatio * 100).toFixed(1)} %.`,
    });
  } else if (lowReserve) {
    out.push({
      level: "yellow",
      code: "RESERVE_WARN",
      title: "Fondsreserve niedrig",
      detail: "Die Reserve unterschreitet die Warnschwelle. Modellannahme, keine Prognose.",
    });
  }
  if (last.structuralShortage || months.filter((m) => m.structuralShortage).length >= 2) {
    out.push({
      level: "red",
      code: "STRUCTURAL_FUNDING_SHORTAGE",
      title: "⚠ STRUCTURAL FUNDING SHORTAGE",
      detail:
        "Die Kreditnachfrage wächst schneller als die Finanzierungskapazität. Die aktuelle Fondsgröße reicht bei der aktuellen Nachfrage langfristig nicht aus.",
    });
  } else if (last.waitlistedAmountCents > 0) {
    out.push({
      level: "orange",
      code: "WAITLIST",
      title: "Warteliste entsteht",
      detail: "Zulässige Anträge warten auf Kapazität. Das ist keine Ablehnung.",
    });
  }
  if (last.demandPressureBand === "extreme") {
    out.push({
      level: "red",
      code: "DEMAND_PRESSURE",
      title: "Extremer Nachfragedruck",
      detail: `Demand Pressure ${last.demandPressure.toFixed(2)}: zulässige Nachfrage übersteigt die verfügbare Kapazität deutlich.`,
    });
  } else if (last.demandPressureBand === "high") {
    out.push({
      level: "orange",
      code: "DEMAND_PRESSURE",
      title: "Hoher Nachfragedruck",
      detail: `Demand Pressure ${last.demandPressure.toFixed(2)}.`,
    });
  }
  if (unmet) {
    out.push({
      level: "yellow",
      code: "UNMET_DEMAND",
      title: "Nicht erfüllte zulässige Nachfrage",
      detail: "Unmet Demand = zulässige Nachfrage minus Auszahlung. Abgelehnte Anträge zählen nicht dazu.",
    });
  }
  if (
    params.allocation.enforceMinimumLiquidity &&
    last.solidarityCashCents + 1 < last.liquidityReserveCents &&
    last.loanDisbursementsCents > 0
  ) {
    out.push({
      level: "critical",
      code: "LIQUIDITY_FLOOR",
      title: "Liquiditätsreserve unterschritten",
      detail: "Nach Kreditauszahlungen liegt das Solidaritätscash unter der konfigurierten Mindestliquidität.",
    });
  }
  if (adminNeg) {
    out.push({
      level: "yellow",
      code: "ADMIN_DEFICIT",
      title: "Verwaltungskosten übersteigen Gebühren",
      detail: "Das Verwaltungskonto ist in der Simulation zeitweise oder dauerhaft defizitär.",
    });
  }
  if (invariants.length) {
    out.push({
      level: "red",
      code: "INVARIANT",
      title: "Invariante verletzt",
      detail: invariants[0].detail,
    });
  }

  if (!out.length) {
    out.push({
      level: "green",
      code: "STABLE",
      title: "System stabil",
      detail: "Unter den gesetzten Modellannahmen wurden keine Liquiditäts- oder Fonds-Warnschwellen verletzt.",
    });
  }
  return out;
}
