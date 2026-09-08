import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { MonthsBar, MonthsLine } from "../components/charts/MonthsCharts";
import { PageHeader } from "../components/ui/hints";
import { FormulaList, KpiCard } from "../components/ui/kpi";
import { Badge, Button, Card } from "../components/ui/primitives";
import { formatEuro, formatNumber, formatPercent } from "../domain/money";
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
        <KpiCard label="Offene Kredite" cents={k.outstandingLoansCents} hint="Restschuld zinsfreier Qard-Hasan-Darlehen (Forderungen)." />
        <KpiCard label="Liquiditätsreserve" cents={month?.solidarityCashCents ?? 0} hint="Liquide Mittel des Solidaritätsfonds nach der 70/30-Modellannahme." onClick={() => setSelectedKpi("liquidity")} />
        <KpiCard label="Kreditnachfrage" cents={month?.creditDemandCents ?? 0} hint="Simulierte Nachfrage im ausgewählten Monat." />
        <KpiCard label="Nicht bediente Nachfrage" cents={month?.unmetDemandCents ?? 0} hint="Nachfrage minus ausgezahlte Kredite im Monat." />
        <KpiCard label="Ausfallquote" value={formatPercent(month?.defaultRateRealized ?? 0)} hint="Realisierte angenommene Ausfälle relativ zum Restbestand im Monat." />
        <KpiCard label="Nettoverluste" cents={k.netLossCents} hint="Kumulierte Ausfälle minus Recovery. Kein Zinsertrag, keine Gewinnmarge." />
        <KpiCard label="Verwaltungssaldo" cents={k.adminBalanceCents} hint="Gebühren minus Kosten, getrennt vom Fonds." onClick={() => setSelectedKpi("admin")} />
      </div>

      {breakdown ? <FormulaList title="Nachvollziehbarkeit der ausgewählten Kennzahl" lines={breakdown} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {result.warnings.map((w) => (
          <Badge key={w.code} tone={w.level}>
            {w.title}
          </Badge>
        ))}
        <Badge tone="neutral">System Health {Math.round(result.health.score)}/100 (interne Metrik)</Badge>
      </div>
      <p className="text-xs text-ink-500">{result.health.disclaimer}</p>

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
            <Item k="Genehmigte Kredite" v={formatEuro(month.approvedCents)} />
            <Item k="Abgelehnte Kredite" v={formatEuro(month.rejectedCents)} />
            <Item k="Ausgezahlte Kredite" v={formatEuro(month.loanDisbursementsCents)} />
            <Item k="Rückzahlungen" v={formatEuro(month.repaymentsCents)} />
            <Item k="Ausfälle" v={formatEuro(month.defaultsCents)} />
            <Item k="Recovery" v={formatEuro(month.recoveryCents)} />
            <Item k="Verluste" v={formatEuro(month.netLossCents)} />
            <Item k="Guthabenauszahlungen" v={formatEuro(month.personalWithdrawalsCents)} />
            <Item k="Verwaltungskosten" v={formatEuro(month.adminCostCents)} />
            <Item k="Endbestand persönlich" v={formatEuro(month.personalLiabilitiesCents)} />
            <Item k="Endbestand Solidaritätsfonds" v={formatEuro(month.solidarityCashCents)} />
            <Item k="Endbestand Verwaltung" v={formatEuro(month.adminCashCents)} />
            <Item k="Liquiditätsreserve" v={formatEuro(month.solidarityCashCents)} />
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
