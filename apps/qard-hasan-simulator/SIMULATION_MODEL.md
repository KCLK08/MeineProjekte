# Simulationsmodell

Dieses Dokument beschreibt die Formeln der Engine in `src/engine`.  
Die Anwendung ist ein **Simulationswerkzeug**. Keine Garantie, keine Rendite, keine Aussage über Scharia-Konformität.

Geldbeträge intern in Cent. `100 € = 10_000`.

## Monatlicher Ablauf (dokumentierte Reihenfolge)

1. Ereignisse und Schocks des Monats anwenden  
2. Neue Mitglieder (dynamischer Modus)  
3. Beiträge und Verwaltungsgebühren der aktiven Mitglieder  
4. Verwaltungskosten  
5. Kreditrückzahlungen (lineare Tilgung)  
6. Ausfälle auf die Restschuld  
7. Recovery-Eingänge, die in diesem Monat fällig sind  
8. Austritte und Aufbau der Auszahlungsverbindlichkeit  
9. Auszahlung persönlicher Guthaben nach konfigurierter Regel  
10. Kreditnachfrage, Entscheidung, Auszahlung unter Liquiditätsregeln  
11. Monatsabschluss, KPIs, Warnungen  

Modellannahme: Mitglieder leisten den Beitrag im Austrittsmonat, bevor das Guthaben auszahlungspflichtig wird (`exitsContributeInExitMonth`).

## Persönliches Guthaben

```text
PersonalBalance_t
=
PersonalBalance_(t-1)
+
PersonalContribution_t
-
WithdrawalsAccrued_t
```

`PersonalContribution_t = aktive Mitglieder_t × personalSavingsShare`

Auszahlungen verringern den persönlichen Cash-Topf, nicht den Solidaritätsfonds.

## Kredit = Antrag minus persönliches Guthaben

Wer einen Kredit erhält, bekommt **gleichzeitig das persönliche Guthaben ausgezahlt** (Standard, abschaltbar).

```text
Solidaritätskredit = max(0, beantragter Betrag − persönliches Guthaben)
Persönliche Auszahlung bei Kredit = persönliches Guthaben
Auszahlung an das Mitglied = persönliches Guthaben + Solidaritätskredit
Offene Forderung des Fonds = nur der Solidaritätskredit
```

Beispiel: Antrag 10.000 €, Guthaben 3.000 € → 3.000 € aus dem persönlichen Topf, 7.000 € zinsfreier Fonds-Kredit. Die Kreditkapazität des Solidaritätsfonds gilt nur für die 7.000 €.

Persönliches Guthaben wird **nicht** dem Fonds zugeschlagen.

## Solidaritätsfonds (Cash)

```text
FundCash_t
=
FundCash_(t-1)
+
SolidarityContributions_t
+
Repayments_t
+
Recovery_t
-
LoanDisbursements_t
```

Realisierte Verluste reduzieren die Forderung, nicht erneut die bereits ausgezahlte Liquidität. Nettoverlust:

```text
NetLoss_t = Defaults_t − Recovery_t
```

Fondsaktiva (für die 70/30-Regel):

```text
FundAssets_t = FundCash_t + OutstandingLoans_t
```

## 70/30-Regel (konfigurierbar)

Standard-Modellannahme: `maximumLoanUtilization = 70 %`, `minimumFundReserve = 30 %`.

Neues Kreditvolumen `D` muss beide Grenzen einhalten:

```text
Outstanding_(t) + D  ≤  maximumLoanUtilization × FundAssets_t
FundCash_t − D       ≥  minimumFundReserve × FundAssets_t
D                    ≤  FundCash_t − minAbsoluteSolidarityCash
```

Wenn Auslastung + Reserve nicht 100 % ergeben, gilt die **engere** der beiden Grenzen (Warnung in der UI).

## Verwaltung

Die Gebühr hängt **nicht** vom Kreditbetrag, der Laufzeit oder der Restschuld ab.

```text
AdminBalance_t
=
AdminBalance_(t-1)
+
AdminFees_t
-
AdminCosts_t
```

`AdminFees_t = Mitglieder_t × feePerMember_t`

Ein negatives Verwaltungskonto ist ein Defizit, keine Entnahme aus dem Fonds.

## Offene Kredite

```text
OutstandingLoans_t
=
OutstandingLoans_(t-1)
+
NewLoans_t
-
PrincipalRepayments_t
-
DefaultedPrincipal_t
```

## Lineare Tilgung (zinsfrei)

Für Kapital `P` und Laufzeit `T` Monate:

```text
monthly = floor(P / T)
last    = P − monthly × (T − 1)
```

Die Summe aller Raten ist exakt `P`. Keine Zinsen, keine Gewinnmarge.

## Ausfall und Recovery (Beispiel)

Kredit 10.000 €, bereits 4.000 € getilgt, Rest 6.000 €, angenommene Recovery 70 %:

```text
Recovery = round(6.000 € × 0,70) = 4.200 €
Loss     = 6.000 € − 4.200 €     = 1.800 €
```

Die jährliche Ausfallquote wird bei `rateBasis = annual` als `annual / 12` monatlich angesetzt. Diese Umrechnung ist ein sichtbarer Parameter, keine versteckte Heuristik.

## Mitglieder

- **Mode A (fixed):** Bestand bleibt konstant, optional Ersatz für Austritte.  
- **Mode B (dynamic):** konstant, Prozent, Zeitreihe, Saison, Rauschen, Wellen, Wachstumsevents.

## Kreditnachfrage vs. Vergabe vs. Warteliste

Nachfrage, Zulässigkeit und Auszahlung sind strikt getrennt:

```text
TotalDemand     = Summe aller Anträge
Rejected        = Anträge, die Kreditregeln verfehlen (nicht „kein Geld“)
EligibleDemand  = zulässige Anträge inkl. Warteliste
Funded          = tatsächlich ausgezahlte Kredite
Waitlisted      = zulässig, aber ohne Kapazität
UnmetDemand     = EligibleDemand − Funded
FundingRate     = Funded / EligibleDemand
DemandPressure  = EligibleDemand / availableLoanCapacity
```

Ein zulässiger Antrag ohne Cash wird `WAITLISTED`, niemals `REJECTED`.

## Verfügbare Kreditkapazität

```text
availableLoanCapacity
=
min(
  utilizationBase × maxLoanUtilization − outstanding − committed,
  solidarityCash − minimumLiquidityReserve  (falls enforceMinimumLiquidity),
  maxMonthlyLoanDisbursement − alreadyDisbursed,
  solidarityCash
)
```

`utilizationBase` ist ein Parameter (`fundAssets` | `solidarityCash` | `averageFundAssets`), keine hart codierte Größe.

Mindestliquidität:

```text
minimumLiquidityReserve
=
max(cash × minimumLiquidityReservePercent, minimumLiquidityReserveAmount)
+ opexMonths × adminCost
+ personalBalances × personalBalanceReservePercent
+ expectedMemberExitAmount
```

Persönliche Guthaben werden dadurch **nicht** in den Fonds umgebucht; sie verengen nur die Auszahlungskapazität.

Unmet Demand ist **nicht** die Summe abgelehnter Anträge.

## Buchhaltung (keine Doppelzählung)

Auszahlung 10.000 €:

- Solidaritätscash −10.000 €  
- Kreditforderung +10.000 €  
- **kein** Verlust von 10.000 €

Rückzahlung 4.000 €:

- Cash +4.000 €  
- Forderung −4.000 €

Endgültiger Ausfall 6.000 €:

- Forderung −6.000 €  
- Bruttoverlust +6.000 €  
- später Recovery gegen den Verlust

## Liquiditätsreichweite

Aus dem durchschnittlichen Nettofluss der letzten Monate:

```text
Horizon = Liquidity / max(1, −avgNet)     falls avgNet < 0
```

sonst als „nicht begrenzt“ dargestellt. Interne Simulationsmetrik.

## System Health

Gewichtete 0–100-Metrik aus Liquidität, Fonds, Kreditrisiko, Mitgliedern, Verwaltung, Nachfrageerfüllung.  
**Kein wissenschaftlich validierter Score.**

## Reproduzierbarkeit

Gleicher `SimulationParameters`-Satz und gleicher `seed` → gleiches Ergebnis (LCG in `src/engine/rng.ts`).  
Monte-Carlo-Lauf `i` verwendet `seed + i × 9973`.

Engine-Version: `ENGINE_VERSION` in `src/domain/types.ts` (aktuell `1.0.0`).
