import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { MonthsBar, MonthsLine } from "../components/charts/MonthsCharts";
import { PageHeader } from "../components/ui/hints";
import { FormulaList, KpiCard } from "../components/ui/kpi";
import { Badge, Button, Card } from "../components/ui/primitives";
import { formatEuro, formatNumber, formatPercent } from "../domain/money";
import { estimateIfAllMembersApplied } from "../engine/capacity";
import { useAppStore } from "../store/useAppStore";

export function DashboardPage() {
  const result = useAppStore((s) => s.result);
  const parameters = useAppStore((s) => s.parameters);
  const selectedMonth = useAppStore((s) => s.selectedMonth);
  const setSelectedMonth = useAppStore((s) => s.setSelectedMonth);
  const selectedKpi = useAppStore((s) => s.selectedKpi);
  const setSelectedKpi = useAppStore((s) => s.setSelectedKpi);
  const run = useAppStore((s) => s.run);
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);

  useEffect(() => {
    if (!result && status === "idle") run();
  }, [result, status, run]);

  const month = useMemo(
    () => result?.months.find((m) => m.month === selectedMonth) ?? result?.lastMonth ?? null,
    [result, selectedMonth],
  );

  if (!result) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          subtitle="Starten Sie die Beispielsimulation oder passen Sie Parameter an."
          actions={
            <Button onClick={() => run()} disabled={status === "running"}>
              Beispielsimulation starten
            </Button>
          }
        />
        {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}
        <Card>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Geladen: <strong>{parameters.meta.name}</strong> ({parameters.population.initialMembers} Mitglieder,{" "}
            {parameters.time.horizonMonths} Monate). Die Werte sind als Beispieldaten gekennzeichnet.
          </p>
          <p className="mt-2 text-sm">
            <Link className="text-accent-700 underline dark:text-accent-400" to="/simulation">
              Parameter öffnen
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  const k = result.kpis;
  const breakdown =
    selectedKpi === "fund"
      ? month?.fundBreakdown
      : selectedKpi === "personal"
        ? month?.personalBreakdown
        : selectedKpi === "admin"
          ? month?.adminBreakdown
          : selectedKpi === "liquidity"
            ? month?.liquidityBreakdown
            : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle={`${result.meta.scenarioName} · ${result.meta.startDate} bis ${result.meta.endDate} · Seed ${result.meta.seed}`}
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Mitglieder" value={formatNumber(k.members)} hint="Aktueller Mitgliederbestand am Simulationsende." demo={parameters.meta.isDemo} />
        <KpiCard label="Persönliches Guthaben" cents={k.personalLiabilitiesCents} hint="Summe der Verpflichtungen gegenüber Mitgliedern. Kein Fondsvermögen." onClick={() => setSelectedKpi("personal")} />
        <KpiCard label="Solidaritätsfonds" cents={k.solidarityCashCents} hint="Liquides Solidaritätscash. Offene Kredite sind separat ausgewiesen." onClick={() => setSelectedKpi("fund")} />
        <KpiCard label="Offene Kredite" cents={k.outstandingLoansCents} hint="Restschuld der zinsfreien Kredite (Forderungen)." />
        <KpiCard label="Liquiditätsreserve" cents={month?.solidarityCashCents ?? 0} hint="Liquide Mittel des Solidaritätsfonds nach der 70/30-Modellannahme." onClick={() => setSelectedKpi("liquidity")} />
        <KpiCard label="Kreditnachfrage" cents={month?.creditDemandCents ?? 0} hint="Simulierte Nachfrage im ausgewählten Monat." />
        <KpiCard label="Nicht bediente Nachfrage" cents={month?.unmetDemandCents ?? 0} hint="Nachfrage minus ausgezahlte Kredite im Monat." />
        <KpiCard label="Ausfallquote" value={formatPercent(month?.defaultRateRealized ?? 0)} hint="Realisierte angenommene Ausfälle relativ zum Restbestand im Monat." />
        <KpiCard label="Nettoverluste" cents={k.netLossCents} hint="Kumulierte Ausfälle minus Recovery. Kein Zinsertrag, keine Gewinnmarge." />
        <KpiCard label="Verfügbare Kreditkapazität" cents={k.availableCapacityCents} hint="Echtzeit: min(Auslastung, Liquiditätsreserve, Monatslimit, Cash) minus ausstehend und zugesagt." />
        <KpiCard label="Zugesagte Kredite" cents={k.committedLoansCents} hint="Bewilligt, aber noch nicht ausgezahlt. Reduziert die freie Kapazität." />
        <KpiCard label="Warteliste" cents={k.waitlistedAmountCents} hint="Zulässig, aber nicht finanzierbar. Keine Ablehnung." />
        <KpiCard label="Funding Rate" value={formatPercent(k.fundingRate)} hint="Ausgezahlt / zulässige Nachfrage. Abgelehnte Anträge zählen nicht." />
        <KpiCard label="Demand Pressure" value={formatPercent(Math.min(k.demandPressure, 9.99))} hint="Zulässige Nachfrage / verfügbare Kapazität." />
      </div>

      {breakdown ? <FormulaList title="Nachvollziehbarkeit der ausgewählten Kennzahl" lines={breakdown} /> : null}

      <div className="flex flex-wrap items-center gap-2">
          {result.warnings.map((w) => (
          <Badge key={`${w.code}-${w.title}`} tone={w.level}>
            {w.title}
          </Badge>
        ))}
        <Badge tone="neutral">
          System Health {Math.round(result.health.score)}/100 · {result.health.label}
        </Badge>
      </div>
      <p className="text-xs text-ink-500">{result.health.disclaimer}</p>

      {result.recommendations.length ? (
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Empfehlungen (nur Szenarien, keine Automatik)</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {result.recommendations.map((rec) => (
              <li key={rec}>{rec}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Kreditnachfrage</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Kreditanträge diesen Monat" value={formatNumber(month?.creditDemandCount ?? 0)} hint="Alle gestellten Anträge, unabhängig von Zulässigkeit." />
          <KpiCard label="Nachfragevolumen" cents={month?.creditDemandCents ?? 0} hint="Summe beantragter Beträge." />
          <KpiCard label="Zulässige Nachfrage" cents={month?.eligibleDemandCents ?? 0} hint="Nur Anträge, die die Kreditkriterien erfüllen, inkl. Warteliste." />
          <KpiCard label="Bewilligt" cents={month?.approvedCents ?? 0} hint="Zulässig. Kann trotzdem auf der Warteliste stehen." />
          <KpiCard label="Ausgezahlt (Fonds)" cents={month?.loanDisbursementsCents ?? 0} hint="Nur der Solidaritätskredit. Persönliches Guthaben wird separat ausgezahlt." />
        <KpiCard label="Guthaben bei Kredit" cents={month?.loanLinkedPersonalPayoutsCents ?? 0} hint="Persönliches Guthaben, das bei der Kreditvergabe mit ausgezahlt wurde. Kein Fonds-Kredit." />
          <KpiCard label="Warteliste" cents={month?.waitlistedAmountCents ?? 0} hint={`${month?.waitlistedCount ?? 0} Anträge.`} />
          <KpiCard label="Abgelehnt" cents={month?.rejectedCents ?? 0} hint="Kreditregeln, nicht fehlendes Geld." />
          <KpiCard label="Nicht erfüllte Nachfrage" cents={month?.unmetDemandCents ?? 0} hint="Zulässig minus ausgezahlt. Ungleich abgelehnt." />
          <KpiCard label="Funding Rate" value={formatPercent(month?.fundingRate ?? 0)} hint="finanziert / zulässig." />
          <KpiCard
            label="Demand Pressure"
            value={`${((month?.demandPressure ?? 0) * 100).toFixed(0)} % · ${bandLabel(month?.demandPressureBand)}`}
            hint="Schwellen konfigurierbar."
          />
        </div>
      </Card>

      {month ? (
        <UniversalDemand monthMembers={month.members} capacity={month.availableLoanCapacityCents} clearance={month.queueClearanceMonths} />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <MonthsLine title="Mitgliederentwicklung" months={result.months} series={[{ key: "members", name: "Mitglieder", color: "#14745a" }]} />
        <MonthsLine title="Solidaritätsfonds (Cash)" months={result.months} series={[{ key: "solidarityCashCents", name: "Fonds-Cash", color: "#1f8f6d", euro: true }]} />
        <MonthsLine title="Persönliche Guthaben" months={result.months} series={[{ key: "personalLiabilitiesCents", name: "Verbindlichkeiten", color: "#4d6d6b", euro: true }]} />
        <MonthsLine title="Offene Kredite" months={result.months} series={[{ key: "outstandingLoansCents", name: "Restschuld", color: "#b45309", euro: true }]} />
        <MonthsLine title="Liquiditätsreserve" months={result.months} series={[{ key: "solidarityCashCents", name: "Solidaritätscash", color: "#2563eb", euro: true }]} />
        <MonthsLine
          title="Kreditnachfrage vs. Kreditvergabe"
          months={result.months}
          series={[
            { key: "creditDemandCents", name: "Nachfrage", color: "#7c3aed", euro: true },
            { key: "loanDisbursementsCents", name: "Auszahlung", color: "#14745a", euro: true },
          ]}
        />
        <MonthsBar title="Ausfälle" months={result.months} series={[{ key: "defaultsCents", name: "Ausfälle", color: "#be123c" }]} />
        <MonthsBar
          title="Verwaltungseinnahmen vs. -kosten"
          months={result.months}
          series={[
            { key: "adminFeeCents", name: "Gebühren", color: "#14745a" },
            { key: "adminCostCents", name: "Kosten", color: "#b45309" },
          ]}
        />
        <MonthsLine title="Fonds-Auslastung" months={result.months} series={[{ key: "utilization", name: "Auslastung %", color: "#0f766e", ratio: true }]} />
        <MonthsLine
          title="Kreditnachfrage vs. Finanzierungskapazität"
          months={result.months}
          series={[
            { key: "eligibleDemandCents", name: "Zulässige Nachfrage", color: "#7c3aed", euro: true },
            { key: "capacityAtAllocationCents", name: "Kapazität", color: "#14745a", euro: true },
            { key: "loanDisbursementsCents", name: "Auszahlung", color: "#0f766e", euro: true },
          ]}
        />
        <MonthsLine title="Warteliste über Zeit" months={result.months} series={[{ key: "waitlistedAmountCents", name: "Warteliste", color: "#b45309", euro: true }]} />
        <MonthsLine title="Funding Rate" months={result.months} series={[{ key: "fundingRate", name: "Funding Rate", color: "#14745a", ratio: true }]} />
        <MonthsLine
          title="Fondsgröße vs. ausstehende Kredite"
          months={result.months}
          series={[
            { key: "fundAssetsCents", name: "Fondsaktiva", color: "#2563eb", euro: true },
            { key: "outstandingLoansCents", name: "Offene Kredite", color: "#b45309", euro: true },
          ]}
        />
        <MonthsLine
          title="Liquiditätsreserve"
          months={result.months}
          series={[
            { key: "liquidityReserveCents", name: "Mindestreserve", color: "#be123c", euro: true },
            { key: "solidarityCashCents", name: "Solidaritätscash", color: "#14745a", euro: true },
          ]}
        />
        <MonthsLine title="Durchschnittliche Wartezeit" months={result.months} series={[{ key: "averageWaitMonths", name: "Monate", color: "#7c3aed" }]} />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Monatliche Detailtabelle</h3>
          <label className="text-sm">
            Monat
            <input
              className="ml-2 w-24 rounded border border-ink-300 bg-transparent px-2 py-1 dark:border-ink-700"
              type="number"
              min={1}
              max={result.months.length}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            />
          </label>
        </div>
        {month ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Item k="Mitglieder" v={formatNumber(month.members)} />
            <Item k="Neue Mitglieder" v={formatNumber(month.newMembers)} />
            <Item k="Austritte" v={formatNumber(month.exits)} />
            <Item k="Persönliche Einzahlungen" v={formatEuro(month.personalContributionCents)} />
            <Item k="Solidaritätsbeiträge" v={formatEuro(month.solidarityContributionCents)} />
            <Item k="Verwaltungsgebühren" v={formatEuro(month.adminFeeCents)} />
            <Item k="Kreditnachfrage" v={formatEuro(month.creditDemandCents)} />
            <Item k="Zulässige Nachfrage" v={formatEuro(month.eligibleDemandCents)} />
            <Item k="Genehmigte Kredite" v={formatEuro(month.approvedCents)} />
            <Item k="Abgelehnte Kredite" v={formatEuro(month.rejectedCents)} />
            <Item k="Ausgezahlte Fonds-Kredite" v={formatEuro(month.loanDisbursementsCents)} />
            <Item k="Guthabenauszahlung bei Kredit" v={formatEuro(month.loanLinkedPersonalPayoutsCents)} />
            <Item k="Offene Kredite" v={formatEuro(month.outstandingLoansCents)} />
            <Item k="Zugesagte Kredite" v={formatEuro(month.committedLoansCents)} />
            <Item k="Verfügbare Kapazität" v={formatEuro(month.availableLoanCapacityCents)} />
            <Item k="Warteliste" v={formatEuro(month.waitlistedAmountCents)} />
            <Item k="Nicht erfüllte Nachfrage" v={formatEuro(month.unmetDemandCents)} />
            <Item k="Funding Rate" v={formatPercent(month.fundingRate)} />
            <Item k="Demand Pressure" v={formatPercent(Math.min(month.demandPressure, 9.99))} />
            <Item k="Queue Clearance" v={`${month.queueClearanceMonths.toFixed(1)} Monate`} />
            <Item k="Ø Wartezeit" v={`${month.averageWaitMonths.toFixed(1)} Monate`} />
            <Item k="Rückzahlungen" v={formatEuro(month.repaymentsCents)} />
            <Item k="Ausfälle" v={formatEuro(month.defaultsCents)} />
            <Item k="Recovery" v={formatEuro(month.recoveryCents)} />
            <Item k="Verluste" v={formatEuro(month.netLossCents)} />
            <Item k="Guthabenauszahlungen" v={formatEuro(month.personalWithdrawalsCents)} />
            <Item k="Verwaltungskosten" v={formatEuro(month.adminCostCents)} />
            <Item k="Endbestand persönlich" v={formatEuro(month.personalLiabilitiesCents)} />
            <Item k="Endbestand Solidaritätsfonds" v={formatEuro(month.solidarityCashCents)} />
            <Item k="Endbestand Verwaltung" v={formatEuro(month.adminCashCents)} />
            <Item k="Liquiditätsreserve (Regel)" v={formatEuro(month.liquidityReserveCents)} />
            <Item k="Reservequote" v={formatPercent(month.reserveRatio)} />
            <Item k="Erfüllungsquote Nachfrage" v={formatPercent(month.fulfillmentRatio)} />
          </dl>
        ) : null}
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold">Simulationslog</h3>
        <ol className="space-y-1 font-mono text-xs text-ink-600 dark:text-ink-300">
          {result.log.map((l) => (
            <li key={l.message}>
              +{l.atMs} ms · {l.message}
            </li>
          ))}
          <li>Laufzeit {result.meta.durationMs} ms</li>
        </ol>
      </Card>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-ink-100 py-1 dark:border-ink-800">
      <dt className="text-ink-500">{k}</dt>
      <dd className="font-mono tabular-nums">{v}</dd>
    </div>
  );
}

function bandLabel(band?: string) {
  if (band === "normal") return "🟢 NORMAL";
  if (band === "border") return "🟡 GRENZBEREICH";
  if (band === "high") return "🟠 HOHER DRUCK";
  if (band === "extreme") return "🔴 EXTREMER DRUCK";
  return "—";
}

function UniversalDemand({
  monthMembers,
  capacity,
  clearance,
}: {
  monthMembers: number;
  capacity: number;
  clearance: number;
}) {
  const parameters = useAppStore((s) => s.parameters);
  const snap = estimateIfAllMembersApplied(parameters, monthMembers, capacity, capacity);
  return (
    <Card>
      <h3 className="mb-2 text-sm font-semibold">Wenn heute alle Mitglieder einen Kredit beantragen würden</h3>
      <p className="text-sm">
        Zulässige Nachfrage (Ø-Betrag × Mitglieder): {formatEuro(snap.eligibleDemandCents)}. Davon finanzierbar:{" "}
        {formatEuro(snap.fundedCents)} ({formatPercent(snap.fundingRate)}). Auf der Warteliste:{" "}
        {formatEuro(snap.waitlistedCents)}. Geschätzter Abbau:{" "}
        {snap.queueClearanceMonths >= 900 ? "nicht absehbar bei anhaltender Neu-Nachfrage" : `${snap.queueClearanceMonths.toFixed(1)} Monate`}.
        Aktuelle Queue-Clearance der echten Warteliste: {clearance >= 900 ? "∞" : `${clearance.toFixed(1)} Monate`}.
      </p>
    </Card>
  );
}
