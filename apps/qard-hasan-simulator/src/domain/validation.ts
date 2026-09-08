import { z } from "zod";
import type { SimulationParameters } from "./types";

export type ValidationIssue = {
  path: string;
  message: string;
};

const share = z.number().min(0).max(2);

export function validateParameters(params: SimulationParameters): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  const c = params.contributions;
  if (c.personalSavingsShareCents + c.solidarityShareCents !== c.monthlyContributionCents) {
    add(
      "contributions",
      "Der Solidaritätsanteil + persönliche Anteil muss exakt dem Monatsbeitrag entsprechen.",
    );
  }
  if (c.monthlyContributionCents < 0 || c.personalSavingsShareCents < 0 || c.solidarityShareCents < 0) {
    add("contributions", "Beiträge dürfen nicht negativ sein.");
  }

  if (params.time.horizonMonths < 1 || params.time.horizonMonths > 480) {
    add("time.horizonMonths", "Die Simulationsdauer muss zwischen 1 und 480 Monaten liegen.");
  }
  if (params.time.loanOriginationStartMonth < 1) {
    add("time.loanOriginationStartMonth", "Der Startmonat der Kreditvergabe muss mindestens 1 sein.");
  }
  if (params.time.loanOriginationStartMonth > params.time.horizonMonths) {
    add(
      "time.loanOriginationStartMonth",
      "Der Startmonat der Kreditvergabe darf nicht nach dem Simulationsende liegen.",
    );
  }

  if (params.population.initialMembers < 0) {
    add("population.initialMembers", "Die Anfangsmitgliederzahl darf nicht negativ sein.");
  }
  if (params.population.maxMembers < params.population.initialMembers) {
    add("population.maxMembers", "Die maximale Mitgliederzahl darf nicht unter der Anfangszahl liegen.");
  }

  const util = params.fund.maximumLoanUtilization;
  const reserve = params.fund.minimumFundReserve;
  if (util < 0 || util > 1) {
    add("fund.maximumLoanUtilization", "Die maximale Fonds-Auslastung darf nicht größer als 100 % sein.");
  }
  if (reserve < 0 || reserve > 1) {
    add("fund.minimumFundReserve", "Die Mindestreserve muss zwischen 0 % und 100 % liegen.");
  }
  if (Math.abs(util + reserve - 1) > 0.001) {
    add(
      "fund",
      "Modellannahme: maximale Fonds-Auslastung + Mindestreserve sollten zusammen 100 % ergeben (z. B. 70/30). Es wird die jeweils engere der beiden Grenzen verwendet.",
    );
  }

  if (params.administration.feePerMemberCents < 0) {
    add("administration.feePerMemberCents", "Die Verwaltungsgebühr darf nicht negativ sein.");
  }

  const mix = params.creditDemand.classMix.reduce((s, x) => s + x.share, 0);
  if (params.creditDemand.classMix.length > 0 && Math.abs(mix - 1) > 0.02) {
    add("creditDemand.classMix", "Die Anteile der Kreditklassen sollten zusammen etwa 100 % ergeben.");
  }
  const needMix = params.needClasses.reduce((s, x) => s + x.share, 0);
  if (params.needClasses.length > 0 && Math.abs(needMix - 1) > 0.05) {
    add("needClasses", "Die Anteile der Bedarfsklassen sollten zusammen etwa 100 % ergeben.");
  }

  if (params.defaults.constantRate < 0 || params.defaults.constantRate > 1) {
    add("defaults.constantRate", "Die angenommene Ausfallquote muss zwischen 0 % und 100 % liegen.");
  }
  if (params.recovery.fixedRate < 0 || params.recovery.fixedRate > 1) {
    add("recovery.fixedRate", "Die angenommene Recovery-Rate muss zwischen 0 % und 100 % liegen.");
  }
  if (params.withdrawals.monthlyExitRate < 0 || params.withdrawals.monthlyExitRate > 1) {
    add("withdrawals.monthlyExitRate", "Die Austrittsquote muss zwischen 0 % und 100 % liegen.");
  }

  const w = params.prioritization;
  if (w.strategy === "weighted") {
    const sum = w.weightScore + w.weightNeed + w.weightTenure + w.weightFifo;
    if (Math.abs(sum - 1) > 0.02) {
      add("prioritization", "Die Gewichtungen der Priorisierung sollten zusammen 100 % ergeben.");
    }
  }

  if (params.loans.defaultTermMonths < 1) {
    add("loans.defaultTermMonths", "Die Kreditlaufzeit muss mindestens 1 Monat betragen.");
  }
  if (!params.loans.allowedTerms.includes(params.loans.defaultTermMonths)) {
    add("loans.defaultTermMonths", "Die Standardlaufzeit muss in der Liste erlaubter Laufzeiten stehen.");
  }

  if (Number.isNaN(Date.parse(params.time.startDate))) {
    add("time.startDate", "Das Startdatum ist ungültig.");
  }

  if (params.seed === 0) {
    add("seed", "Seed 0 wird intern auf 1 gesetzt, damit die Simulation reproduzierbar bleibt.");
  }

  share.parse(1);
  return issues;
}

export function assertValidParameters(params: SimulationParameters): void {
  const hard = validateParameters(params).filter((i) =>
    [
      "Der Solidaritätsanteil + persönliche Anteil muss exakt dem Monatsbeitrag entsprechen.",
      "Beiträge dürfen nicht negativ sein.",
      "Die Simulationsdauer muss zwischen 1 und 480 Monaten liegen.",
      "Der Startmonat der Kreditvergabe muss mindestens 1 sein.",
      "Die maximale Fonds-Auslastung darf nicht größer als 100 % sein.",
      "Die Verwaltungsgebühr darf nicht negativ sein.",
      "Die angenommene Ausfallquote muss zwischen 0 % und 100 % liegen.",
      "Die angenommene Recovery-Rate muss zwischen 0 % und 100 % liegen.",
    ].includes(i.message),
  );
  const unique = [...new Map(hard.map((e) => [e.message, e])).values()];
  if (unique.length) {
    const err = new Error(unique.map((e) => e.message).join(" "));
    (err as Error & { issues: ValidationIssue[] }).issues = unique;
    throw err;
  }
}

export const parameterPatchSchema = z.record(z.string(), z.unknown());
