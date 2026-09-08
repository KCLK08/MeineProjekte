import { centsToEuros } from "../domain/money";
import type { SimulationParameters, SimulationResult, StoredScenario } from "../domain/types";
import { downloadJson, downloadText } from "./persistence";

export function exportScenarioJson(scenario: StoredScenario): void {
  downloadJson(`${slug(scenario.name)}.json`, {
    name: scenario.name,
    version: 1,
    parameters: scenario.parameters,
    events: scenario.parameters.events,
    seed: scenario.parameters.seed,
  });
}

export function exportParametersJson(parameters: SimulationParameters): void {
  downloadJson(`${slug(parameters.meta.name)}.json`, {
    name: parameters.meta.name,
    version: 1,
    parameters,
    events: parameters.events,
    seed: parameters.seed,
  });
}

export function exportResultJson(result: SimulationResult): void {
  downloadJson(`${slug(result.meta.scenarioName)}-ergebnis.json`, result);
}

export function exportMonthsCsv(result: SimulationResult): void {
  const headers = [
    "Monat",
    "Datum",
    "Mitglieder",
    "Neue Mitglieder",
    "Austritte",
    "Beitraege_EUR",
    "Persoenliches_Guthaben_EUR",
    "Solidaritaetsbeitrag_EUR",
    "Verwaltungsgebuehren_EUR",
    "Neue_Kredite_EUR",
    "Kreditrueckzahlungen_EUR",
    "Ausfaelle_EUR",
    "Recovery_EUR",
    "Nettoverluste_EUR",
    "Kreditauszahlungen_EUR",
    "Guthabenauszahlung_bei_Kredit_EUR",
    "Guthabenauszahlungen_EUR",
    "Verwaltungskosten_EUR",
    "Solidaritaetsfonds_EUR",
    "Persoenliche_Verbindlichkeiten_EUR",
    "Verwaltungskonto_EUR",
    "Liquiditaet_EUR",
    "Reservequote",
    "Kreditnachfrage_EUR",
    "nicht_bediente_Nachfrage_EUR",
  ];
  const rows = result.months.map((m) =>
    [
      m.month,
      m.date,
      m.members,
      m.newMembers,
      m.exits,
      centsToEuros(m.contributionsCents),
      centsToEuros(m.personalLiabilitiesCents),
      centsToEuros(m.solidarityContributionCents),
      centsToEuros(m.adminFeeCents),
      centsToEuros(m.newLoanPrincipalCents),
      centsToEuros(m.repaymentsCents),
      centsToEuros(m.defaultsCents),
      centsToEuros(m.recoveryCents),
      centsToEuros(m.netLossCents),
      centsToEuros(m.loanDisbursementsCents),
      centsToEuros(m.loanLinkedPersonalPayoutsCents),
      centsToEuros(m.personalWithdrawalsCents),
      centsToEuros(m.adminCostCents),
      centsToEuros(m.solidarityCashCents),
      centsToEuros(m.personalLiabilitiesCents),
      centsToEuros(m.adminCashCents),
      centsToEuros(m.liquidityCents),
      m.reserveRatio,
      centsToEuros(m.creditDemandCents),
      centsToEuros(m.unmetDemandCents),
    ].join(";"),
  );
  downloadText(`${slug(result.meta.scenarioName)}-cashflow.csv`, [headers.join(";"), ...rows].join("\n"));
}

export function parseImportedScenario(text: string): { name: string; parameters: SimulationParameters } {
  const data = JSON.parse(text) as {
    name?: string;
    parameters?: SimulationParameters;
  };
  if (!data.parameters) {
    throw new Error("Die Datei enthält keine Parameter.");
  }
  return {
    name: data.name ?? data.parameters.meta.name,
    parameters: data.parameters,
  };
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "szenario";
}
