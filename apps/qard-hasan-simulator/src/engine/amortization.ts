import type { Cents } from "../domain/money";

export type Amortization = {
  monthly: Cents;
  last: Cents;
  termMonths: number;
  principal: Cents;
};

export function linearAmortization(principal: Cents, termMonths: number): Amortization {
  if (termMonths < 1) {
    throw new Error("Die Kreditlaufzeit muss mindestens 1 Monat betragen.");
  }
  if (principal < 0) {
    throw new Error("Der Kreditbetrag darf nicht negativ sein.");
  }
  if (termMonths === 1) {
    return { monthly: principal, last: principal, termMonths, principal };
  }
  const monthly = Math.floor(principal / termMonths);
  const last = principal - monthly * (termMonths - 1);
  return { monthly, last, termMonths, principal };
}

export function paymentDue(schedule: Amortization, paymentIndex: number): Cents {
  if (paymentIndex < 1 || paymentIndex > schedule.termMonths) return 0;
  return paymentIndex === schedule.termMonths ? schedule.last : schedule.monthly;
}

export function totalScheduled(schedule: Amortization): Cents {
  return schedule.monthly * (schedule.termMonths - 1) + schedule.last;
}
