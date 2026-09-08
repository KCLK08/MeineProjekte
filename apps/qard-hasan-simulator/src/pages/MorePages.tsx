import { useMemo, useState } from "react";
import { PageHeader, EmptyState, Meaning } from "../components/ui/hints";
import { Button, Card, Input } from "../components/ui/primitives";
import { MonthsLine } from "../components/charts/MonthsCharts";
import { formatEuro, formatNumber, formatPercent, eurosToCents } from "../domain/money";
import { PRESET_INFO } from "../domain/defaults";
import { useAppStore } from "../store/useAppStore";
import { exportMonthsCsv, exportParametersJson, exportResultJson, exportScenarioJson, parseImportedScenario } from "../services/export";
import { compareResults, calculateRequiredFundSize, goalSeek, runBreakEven, runReverseSimulation, runStressTest } from "../engine/analyses";
import { simulateScenario } from "../engine/simulation";
import { setByPath } from "../utils/cn";

function NeedResult() {
  const result = useAppStore((s) => s.result);
  if (!result) return <EmptyState title="Keine Simulation" text="Bitte zuerst eine Simulation starten." />;
  return null;
}

export function ScenariosPage() {
  const scenarios = useAppStore((s) => s.scenarios);
  const saveScenario = useAppStore((s) => s.saveScenario);
  const loadScenario = useAppStore((s) => s.loadScenario);
  const deleteScenario = useAppStore((s) => s.deleteScenario);
  const duplicateScenario = useAppStore((s) => s.duplicateScenario);
  const renameScenario = useAppStore((s) => s.renameScenario);
  const toggleCompare = useAppStore((s) => s.toggleCompare);
  const compareIds = useAppStore((s) => s.compareIds);
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <PageHeader title="Szenarien" subtitle="Speichern, duplizieren, umbenennen, löschen, exportieren." />
      <div className="flex gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => { saveScenario(name || undefined); setName(""); }}>Speichern</Button>
      </div>
      <div className="space-y-2">
        {scenarios.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <input
                className="bg-transparent font-medium"
                value={s.name}
                onChange={(e) => renameScenario(s.id, e.target.value)}
                aria-label="Szenarioname"
              />
              <p className="text-xs text-ink-500">{s.parameters.population.initialMembers} Mitglieder · {s.parameters.time.horizonMonths} Monate</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => loadScenario(s.id)}>Laden</Button>
              <Button variant="secondary" onClick={() => duplicateScenario(s.id)}>Duplizieren</Button>
              <Button variant="secondary" onClick={() => exportScenarioJson(s)}>Export JSON</Button>
              <Button variant={compareIds.includes(s.id) ? "primary" : "secondary"} onClick={() => toggleCompare(s.id)}>
                Vergleich
              </Button>
              <Button variant="danger" onClick={() => deleteScenario(s.id)}>Löschen</Button>
            </div>
          </Card>
        ))}
        {!scenarios.length ? <EmptyState title="Noch keine Szenarien" text="Speichern Sie das aktuelle Parameter-Set." /> : null}
      </div>
    </div>
  );
}

export function ComparePage() {
  const scenarios = useAppStore((s) => s.scenarios);
  const compareIds = useAppStore((s) => s.compareIds);
  const compareResults = useAppStore((s) => s.compareResults);
  const runCompare = useAppStore((s) => s.runCompare);
  const status = useAppStore((s) => s.status);
  const rows = compareResults.length ? compareResultsFn(compareResults) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Szenario-Vergleich" subtitle="Mehrere gespeicherte Szenarien gleichzeitig rechnen." actions={<Button onClick={() => runCompare()} disabled={status === "running"}>Vergleich rechnen</Button>} />
      <p className="text-sm text-ink-500">Ausgewählt: {compareIds.length || "aktuelles Parameter-Set"}</p>
      {rows ? (
        <div className="table-scroll">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className="text-left">Kennzahl</th>
                {rows.names.map((n) => <th key={n} className="text-right">{n}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.rows.map((r) => (
                <tr key={r.key} className="border-t border-ink-100 dark:border-ink-800">
                  <td>{labelKey(r.key)}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className="text-right font-mono">{formatValue(r.key, v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Noch kein Vergleich" text="Szenarien markieren und rechnen." />}
      {!scenarios.length ? <p className="text-sm">Speichern Sie zuerst Szenarien.</p> : null}
    </div>
  );
}

function compareResultsFn(results: ReturnType<typeof simulateScenario>[]) {
  return compareResults(results);
}

function labelKey(key: string): string {
  const map: Record<string, string> = {
    members: "Mitglieder",
    solidarityCashCents: "Fonds",
    outstandingLoansCents: "Kredite",
    netLossCents: "Verluste",
    liquidityCents: "Reserve / Liquidität",
    unmetDemandCents: "Nicht bediente Nachfrage",
    adminBalanceCents: "Verwaltung",
    personalLiabilitiesCents: "Persönliche Guthaben",
    utilization: "Auslastung",
    fulfillmentRatio: "Erfüllungsquote",
    fundingRate: "Funding Rate",
    waitlistedAmountCents: "Warteliste",
    demandPressure: "Demand Pressure",
    averageWaitMonths: "Ø Wartezeit",
  };
  return map[key] ?? key;
}
function formatValue(key: string, v: number): string {
  if (key.includes("Ratio") || key === "utilization" || key === "fundingRate" || key === "demandPressure") return formatPercent(v);
  if (key === "members" || key === "averageWaitMonths") return formatNumber(v);
  return formatEuro(Math.round(v));
}

export function StressPage() {
  const [rows, setRows] = useState<ReturnType<typeof runStressTest> | null>(null);
  const [busy, setBusy] = useState(false);
  const parameters = useAppStore((s) => s.parameters);
  const run = () => {
    setBusy(true);
    setRows(runStressTest(parameters));
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Stress Test" subtitle="Vordefinierte Presets BASE, Conservative, STRESS, CRISIS, EXTREME. Dieselbe Engine." actions={<Button onClick={run} disabled={busy}>Presets rechnen</Button>} />
      {rows ? (
        <div className="table-scroll">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr>
                <th className="text-left">Szenario</th>
                <th className="text-right">Mitglieder</th>
                <th className="text-right">Fonds</th>
                <th className="text-right">Kredite</th>
                <th className="text-right">Verluste</th>
                <th className="text-right">Funding</th>
                <th className="text-right">Warteliste</th>
                <th className="text-right">Unmet</th>
                <th className="text-right">Health</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ink-100 dark:border-ink-800">
                  <td>{PRESET_INFO[r.id].label}<div className="text-xs text-ink-500">{PRESET_INFO[r.id].description}</div></td>
                  <td className="text-right font-mono">{formatNumber(r.members)}</td>
                  <td className="text-right font-mono">{formatEuro(r.fund)}</td>
                  <td className="text-right font-mono">{formatEuro(r.loans)}</td>
                  <td className="text-right font-mono">{formatEuro(r.loss)}</td>
                  <td className="text-right font-mono">{formatPercent(r.fundingRate)}</td>
                  <td className="text-right font-mono">{formatEuro(r.waitlist)}</td>
                  <td className="text-right font-mono">{formatEuro(r.unmet)}</td>
                  <td className="text-right font-mono">{Math.round(r.health)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Noch nicht gerechnet" text="Die Engine verwendet dieselben Formeln wie die Hauptsimulation." />}
    </div>
  );
}

export function MonteCarloPage() {
  const monteCarlo = useAppStore((s) => s.monteCarlo);
  const runMonteCarloNow = useAppStore((s) => s.runMonteCarloNow);
  const parameters = useAppStore((s) => s.parameters);
  const status = useAppStore((s) => s.status);
  return (
    <div className="space-y-4">
      <PageHeader title="Monte Carlo" subtitle="Zufallsparameter sind über den Seed reproduzierbar." actions={<Button onClick={() => runMonteCarloNow(Math.min(200, parameters.monteCarlo.runs))} disabled={status === "running"}>Monte Carlo starten</Button>} />
      {monteCarlo ? (
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Kennzahl", "Mittel", "Min", "Max", "5 %", "25 %", "Median", "75 %", "95 %"].map((h) => (
                  <th key={h} className="text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(monteCarlo.metrics).map(([k, v]) => (
                <tr key={k} className="border-t border-ink-100 dark:border-ink-800">
                  <td>{k}</td>
                  {[v.mean, v.min, v.max, v.p5, v.p25, v.p50, v.p75, v.p95].map((x, i) => (
                    <td key={i} className="text-right font-mono">{k.includes("utilization") || k.includes("Rate") ? formatPercent(x) : k === "members" || k.includes("Wait") ? (k.includes("Wait") ? x.toFixed(2) : formatNumber(x)) : formatEuro(Math.round(x))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-500">{monteCarlo.runs} Läufe · Seed {monteCarlo.seed} · {monteCarlo.durationMs} ms. Keine Prognose, simuliertes Risiko.</p>
        </div>
      ) : <EmptyState title="Noch keine Verteilung" text="Startet mehrere reproduzierbare Simulationsläufe." />}
    </div>
  );
}

export function MembersPage() {
  const result = useAppStore((s) => s.result);
  if (!result) return <NeedResult />;
  return (
    <div className="space-y-4">
      <PageHeader title="Mitglieder" subtitle="Aggregierte Kohorten. Bei großen Simulationen keine Einzelperson je Member." />
      <MonthsLine title="Mitglieder, Zugänge, Austritte" months={result.months} series={[
        { key: "members", name: "Bestand", color: "#14745a" },
        { key: "newMembers", name: "Zugänge", color: "#2563eb" },
        { key: "exits", name: "Austritte", color: "#be123c" },
      ]} />
      <Card>
        <h3 className="mb-2 text-sm font-semibold">Beispielmitglieder (Stichprobe)</h3>
        <div className="table-scroll">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr>
                <th className="text-left">ID</th>
                <th>Status</th>
                <th className="text-right">Guthaben</th>
                <th className="text-right">Solidarität kumuliert</th>
                <th className="text-right">Beitritt Monat</th>
              </tr>
            </thead>
            <tbody>
              {result.sampleMembers.map((m) => (
                <tr key={m.id} className="border-t border-ink-100 dark:border-ink-800">
                  <td>{m.id}</td>
                  <td>{m.status}</td>
                  <td className="text-right font-mono">{formatEuro(m.personalBalanceCents)}</td>
                  <td className="text-right font-mono">{formatEuro(m.solidarityContributionsCents)}</td>
                  <td className="text-right">{m.joinDateMonth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function FundPage() {
  const result = useAppStore((s) => s.result);
  const month = result?.lastMonth;
  if (!result || !month) return <NeedResult />;
  return (
    <div className="space-y-4">
      <PageHeader title="Solidaritätsfonds" subtitle="Getrennt von persönlichem Vermögen und Verwaltung." />
      <MonthsLine title="Fonds-Cash und offene Kredite" months={result.months} series={[
        { key: "solidarityCashCents", name: "Cash", color: "#14745a", euro: true },
        { key: "outstandingLoansCents", name: "Forderungen", color: "#b45309", euro: true },
        { key: "fundAssetsCents", name: "Aktiva", color: "#2563eb", euro: true },
      ]} />
      <Card>
        <p>Theoretische Kreditkapazität: {formatEuro(month.theoreticalCapacityCents)}</p>
        <p>Gebundene Kredite: {formatEuro(month.outstandingLoansCents)}</p>
        <p>Noch verfügbar: {formatEuro(month.availableLoanCapacityCents)}</p>
        <Meaning>Die Auslastung {formatPercent(month.utilization)} bedeutet, dass dieser Anteil der Fondsaktiva als Kredite gebunden ist. Modellannahme, kein Sicherheitsversprechen.</Meaning>
      </Card>
    </div>
  );
}

export function PersonalPage() {
  const result = useAppStore((s) => s.result);
  if (!result) return <NeedResult />;
  return (
    <div className="space-y-4">
      <PageHeader title="Persönliche Guthaben" subtitle="Verpflichtung gegenüber Mitgliedern. Wird nicht automatisch zur Kreditvergabe verwendet." />
      <MonthsLine title="Guthaben und Auszahlungen" months={result.months} series={[
        { key: "personalLiabilitiesCents", name: "Verbindlichkeiten", color: "#14745a", euro: true },
        { key: "personalWithdrawalsCents", name: "Auszahlungen", color: "#be123c", euro: true },
      ]} />
    </div>
  );
}

export function LoansPage() {
  const result = useAppStore((s) => s.result);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!result) return <NeedResult />;
  const loan = result.sampleLoans.find((l) => l.id === openId);
  return (
    <div className="space-y-4">
      <PageHeader title="Kredite" subtitle="Stichprobe ausgezahlter Kredite. Große Läufe aggregiert die Engine intern." />
      <MonthsLine title="Nachfrage vs. Auszahlung" months={result.months} series={[
        { key: "creditDemandCents", name: "Nachfrage", color: "#7c3aed", euro: true },
        { key: "loanDisbursementsCents", name: "Finanziert", color: "#14745a", euro: true },
        { key: "unmetDemandCents", name: "Nicht finanziert", color: "#be123c", euro: true },
      ]} />
      <Card>
        <div className="table-scroll">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr>
                <th className="text-left">Kredit</th>
                <th>Klasse</th>
                <th>Zweck</th>
                <th className="text-right">Betrag</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Restschuld</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.sampleLoans.map((l) => (
                <tr key={l.id} className="cursor-pointer border-t border-ink-100 dark:border-ink-800" onClick={() => setOpenId(l.id)}>
                  <td>{l.id}</td>
                  <td>{l.creditClass}</td>
                  <td>{l.purpose}</td>
                  <td className="text-right font-mono">{formatEuro(l.principalCents)}</td>
                  <td className="text-right font-mono">{formatEuro(l.monthlyPaymentCents)}</td>
                  <td className="text-right font-mono">{formatEuro(l.remainingPrincipalCents)}</td>
                  <td>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loan ? (
          <div className="mt-4 text-sm">
            <p className="font-medium">{loan.id}</p>
            <p>Mitglied {loan.memberId} · Auszahlung Monat {loan.disbursementDate} · Laufzeit {loan.termMonths}</p>
            <p>Bisher zurückgezahlt {formatEuro(loan.amountRepaidCents)} · Recovery {formatEuro(loan.recoveryAmountCents)} · Verlust {formatEuro(loan.lossAmountCents)}</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export function WaitlistPage() {
  const result = useAppStore((s) => s.result);
  const [sort, setSort] = useState<"rank" | "amount" | "score" | "wait">("rank");
  const [filter, setFilter] = useState("");
  if (!result) return <NeedResult />;
  const rows = [...result.waitlist]
    .filter((a) => {
      const q = filter.trim().toLowerCase();
      if (!q) return true;
      return `${a.id} ${a.memberId} ${a.purpose} ${a.status}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "amount") return b.remainingAmountCents - a.remainingAmountCents;
      if (sort === "score") return b.priorityScore - a.priorityScore;
      if (sort === "wait") return (a.waitlistDate ?? a.applicationDate) - (b.waitlistDate ?? b.applicationDate);
      return a.queuePosition - b.queuePosition;
    });
  return (
    <div className="space-y-4">
      <PageHeader title="Warteliste" subtitle="Zulässige Anträge ohne aktuelle Kapazität. Keine Ablehnung." />
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="rounded-md border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="rank">Rang</option>
          <option value="amount">Betrag</option>
          <option value="score">Score</option>
          <option value="wait">Wartezeit</option>
        </select>
      </div>
      <div className="table-scroll rounded-xl border border-ink-200 dark:border-ink-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr>
              <th className="text-left">Rang</th>
              <th className="text-left">Antrag</th>
              <th className="text-left">Mitglied</th>
              <th>Bedarf</th>
              <th className="text-right">Betrag</th>
              <th className="text-right">Score</th>
              <th className="text-right">Wartezeit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-ink-100 dark:border-ink-800">
                <td>{a.queuePosition}</td>
                <td>{a.id}</td>
                <td>{a.memberId}</td>
                <td>{a.purpose}</td>
                <td className="text-right font-mono">{formatEuro(a.remainingAmountCents)}</td>
                <td className="text-right font-mono">{a.priorityScore.toFixed(1)}</td>
                <td className="text-right">{Math.max(0, (result.lastMonth?.month ?? a.applicationDate) - (a.waitlistDate ?? a.applicationDate))} Monate</td>
                <td>{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <EmptyState title="Leere Warteliste" text="Aktuell wartet kein zulässiger Antrag auf Kapazität." /> : null}
    </div>
  );
}

export function LiquidityPage() {
  const result = useAppStore((s) => s.result);
  if (!result) return <NeedResult />;
  const last = result.lastMonth;
  return (
    <div className="space-y-4">
      <PageHeader title="Liquidität" subtitle="Drei Töpfe bleiben getrennt: persönlich, Solidarität, Verwaltung." />
      <MonthsLine title="Liquide Mittel" months={result.months} series={[
        { key: "personalCashCents", name: "Persönlich", color: "#4d6d6b", euro: true },
        { key: "solidarityCashCents", name: "Solidarität", color: "#14745a", euro: true },
        { key: "adminCashCents", name: "Verwaltung", color: "#b45309", euro: true },
      ]} />
      {last ? (
        <Card>
          <p>Liquiditätsreichweite: {result.risk.liquidityHorizonMonths >= 900 ? "nicht begrenzt (positiver Nettofluss)" : `${result.risk.liquidityHorizonMonths.toFixed(1)} Monate`}</p>
          <p>Min Cash: {formatEuro(result.risk.minCashCents)} · Monate unter Mindestreserve: {result.risk.monthsBelowMinReserve}</p>
          <Meaning>Die Reichweite schätzt, wie lange der aktuelle Bestand einen negativen Nettofluss decken könnte. Interne Simulationsmetrik.</Meaning>
        </Card>
      ) : null}
    </div>
  );
}

export function AdminPage() {
  const result = useAppStore((s) => s.result);
  if (!result) return <NeedResult />;
  return (
    <div className="space-y-4">
      <PageHeader title="Verwaltung" subtitle="Gebühren sind unabhängig vom Kreditbetrag. Kosten sind ein eigenes Modell." />
      <MonthsLine title="Verwaltungskonto" months={result.months} series={[
        { key: "adminFeeCents", name: "Einnahmen", color: "#14745a", euro: true },
        { key: "adminCostCents", name: "Ausgaben", color: "#be123c", euro: true },
        { key: "adminCashCents", name: "Saldo kumuliert", color: "#2563eb", euro: true },
      ]} />
    </div>
  );
}

export function CashflowPage() {
  const result = useAppStore((s) => s.result);
  if (!result) return <NeedResult />;
  return (
    <div className="space-y-4">
      <PageHeader title="Cashflow" subtitle="Monatstabelle. Horizontal scrollbar." />
      <div className="table-scroll rounded-xl border border-ink-200 dark:border-ink-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-ink-100 dark:bg-ink-900">
              {["Monat","Mitglieder","Neue","Austritte","Beiträge","Persönlich","Solidarität","Verw.gebühr","Verw.kosten","Fonds auf","Rückzahlung","Recovery","Neue Nachfrage","Zulässig","Bewilligt","Auszahlung","Offene Kredite","Zugesagt","Kapazität","Warteliste","Abgelehnt","Unmet","Funding","Pressure","Ausfälle","Verluste","Liquiditätsreserve","Pers. Verb."].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-2 text-right first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.months.map((m) => (
              <tr key={m.month} className="border-t border-ink-100 dark:border-ink-800">
                {[m.month, m.members, m.newMembers, m.exits].map((v, i) => <td key={i} className="px-2 py-1 text-right font-mono">{v}</td>)}
                {[m.contributionsCents, m.personalContributionCents, m.solidarityContributionCents, m.adminFeeCents, m.adminCostCents, m.solidarityCashCents, m.repaymentsCents, m.recoveryCents, m.creditDemandCents, m.eligibleDemandCents, m.approvedCents, m.loanDisbursementsCents, m.outstandingLoansCents, m.committedLoansCents, m.availableLoanCapacityCents, m.waitlistedAmountCents, m.rejectedCents, m.unmetDemandCents].map((v, i) => (
                  <td key={`e${i}`} className="px-2 py-1 text-right font-mono">{formatEuro(v, 0)}</td>
                ))}
                <td className="px-2 py-1 text-right font-mono">{formatPercent(m.fundingRate, 0)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatPercent(Math.min(m.demandPressure, 9.99), 0)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatEuro(m.defaultsCents, 0)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatEuro(m.netLossCents, 0)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatEuro(m.liquidityReserveCents, 0)}</td>
                <td className="px-2 py-1 text-right font-mono">{formatEuro(m.personalLiabilitiesCents, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BalancePage() {
  const result = useAppStore((s) => s.result);
  const last = result?.lastMonth;
  if (!last) return <NeedResult />;
  const assets = last.personalCashCents + last.solidarityCashCents + Math.max(0, last.adminCashCents) + last.outstandingLoansCents;
  const equityAdmin = last.adminCashCents;
  const liabilities = last.personalLiabilitiesCents + last.withdrawalPayablesCents;
  const fundEquity = last.solidarityCashCents + last.outstandingLoansCents;
  return (
    <div className="space-y-4">
      <PageHeader title="Monatliche Bilanz" subtitle="Vereinfachte Darstellung: Wo ist jeder Euro? Keine handelsrechtliche Bilanz." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="font-semibold">Aktiva</h3>
          <p>Liquide Mittel persönlich {formatEuro(last.personalCashCents)}</p>
          <p>Liquide Mittel Solidarität {formatEuro(last.solidarityCashCents)}</p>
          <p>Liquide Mittel Verwaltung {formatEuro(Math.max(0, last.adminCashCents))}</p>
          <p>Offene Kreditforderungen {formatEuro(last.outstandingLoansCents)}</p>
          <p className="mt-2 font-medium">Summe {formatEuro(assets)}</p>
        </Card>
        <Card>
          <h3 className="font-semibold">Passiva / Verpflichtungen</h3>
          <p>Persönliche Mitgliederguthaben {formatEuro(last.personalLiabilitiesCents)}</p>
          <p>Auszahlungsverbindlichkeiten {formatEuro(last.withdrawalPayablesCents)}</p>
          <p>Solidaritätsvermögen (Cash + Forderungen) {formatEuro(fundEquity)}</p>
          <p>Verwaltungssaldo {formatEuro(equityAdmin)}</p>
          <p className="mt-2 font-medium">Summe Verpflichtungen + Fonds + Verwaltung {formatEuro(liabilities + fundEquity + equityAdmin)}</p>
        </Card>
      </div>
      <Meaning>Eine Kreditauszahlung verringert Cash und erhöht die Forderung in gleicher Höhe. Das ist kein Verlust.</Meaning>
    </div>
  );
}

export function RiskPage() {
  const result = useAppStore((s) => s.result);
  if (!result) return <NeedResult />;
  const r = result.risk;
  return (
    <div className="space-y-4">
      <PageHeader title="Risiko" subtitle="Simuliertes Risiko unter den gesetzten Annahmen. Keine Garantie, nicht risikofrei." />
      <Card className="grid gap-2 sm:grid-cols-2">
        <p>Max. offene Kredite {formatEuro(r.maxOutstandingLoansCents)}</p>
        <p>Max. Fonds-Auslastung {formatPercent(r.maxFundUtilization)}</p>
        <p>Durchschn. Auslastung {formatPercent(r.avgFundUtilization)}</p>
        <p>Höchste monatliche Nachfrage {formatEuro(r.maxMonthlyDemandCents)}</p>
        <p>Nicht bediente Nachfrage {formatEuro(r.totalUnmetDemandCents)}</p>
        <p>Ausfallbetrag {formatEuro(r.totalDefaultedCents)}</p>
        <p>Recovery {formatEuro(r.totalRecoveryCents)}</p>
        <p>Nettoverlust {formatEuro(r.totalNetLossCents)}</p>
        <p>Max. Austrittsbelastung {formatEuro(r.maxWithdrawalOutflowCents)}</p>
        <p>Minimum Cash {formatEuro(r.minCashCents)}</p>
        <p>Monate unter Mindestreserve {r.monthsBelowMinReserve}</p>
        <p>Ø Funding Rate {formatPercent(r.avgFundingRate)}</p>
        <p>Max. Warteliste {formatEuro(r.maxWaitlistCents)}</p>
        <p>Max. Demand Pressure {r.maxDemandPressure.toFixed(2)}</p>
        <p>Ø Wartezeit {r.avgWaitMonths.toFixed(1)} Monate</p>
        <p>Monate mit strukturellem Engpass {r.structuralShortageMonths}</p>
      </Card>
    </div>
  );
}

export function SensitivityPage() {
  const sensitivity = useAppStore((s) => s.sensitivity);
  const runSensitivityNow = useAppStore((s) => s.runSensitivityNow);
  const status = useAppStore((s) => s.status);
  const maxLoss = Math.max(...(sensitivity?.map((c) => c.lossCents) ?? [1]), 1);
  return (
    <div className="space-y-4">
      <PageHeader title="Sensitivität" subtitle="Heatmap: angenommene Ausfallquote × Austrittsquote." actions={<Button onClick={() => runSensitivityNow()} disabled={status === "running"}>Heatmap rechnen</Button>} />
      {sensitivity ? (
        <div className="overflow-auto">
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(6, minmax(90px, 1fr))" }}>
            {sensitivity.map((c) => (
              <div
                key={`${c.defaultRate}-${c.exitRate}`}
                className="rounded p-2 text-[11px] text-white"
                style={{ background: `rgba(190,18,60,${0.15 + 0.85 * (c.lossCents / maxLoss)})` }}
              >
                <div>Ausfall {formatPercent(c.defaultRate, 0)}</div>
                <div>Austritt {formatPercent(c.exitRate, 1)}</div>
                <div>Fonds {formatEuro(c.fundCents, 0)}</div>
                <div>Liquidität {formatEuro(c.liquidityCents, 0)}</div>
                <div>Verlust {formatEuro(c.lossCents, 0)}</div>
                <div>Unmet {formatEuro(c.unmetCents, 0)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : <EmptyState title="Keine Heatmap" text="Die Rechnung nutzt die echte Engine, keine Dummy-Werte." />}
    </div>
  );
}

export function BreakEvenPage() {
  const parameters = useAppStore((s) => s.parameters);
  const [out, setOut] = useState<ReturnType<typeof runBreakEven> | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Break-Even" subtitle="Zielgrößen per binärer Suche über die Simulationsengine." actions={<Button onClick={() => setOut(runBreakEven(parameters))}>Analysen rechnen</Button>} />
      {out ? (
        <Card className="space-y-2 text-sm">
          <p>Mitglieder für Kostendeckung Verwaltung: {out.membersToCoverAdmin ?? "—"}</p>
          <p>Ausfallquote bis Warnstufe rot/kritisch: {out.maxDefaultRateBeforeCritical !== null ? formatPercent(out.maxDefaultRateBeforeCritical) : "—"}</p>
          <p>Solidaritätsbeitrag für sehr hohe Monatsvergabe (Suchziel intern 1 Mio. €): {out.solidarityShareForTargetOrigination !== null ? formatEuro(out.solidarityShareForTargetOrigination) : "—"}</p>
          <p>Peak-Guthabenauszahlung (Reserve-Hinweis bei Austritten): {out.reserveForExitRate !== null ? formatEuro(out.reserveForExitRate) : "—"}</p>
          <p>Nachfrage je 1.000 Mitglieder, ab der Unmet entsteht: {out.maxDemandBeforeUnmet?.toFixed(2)}</p>
        </Card>
      ) : <EmptyState title="Noch nicht gerechnet" text="Mehrere Engine-Läufe, kann einen Moment dauern." />}
    </div>
  );
}

export function WhatIfPage() {
  const parameters = useAppStore((s) => s.parameters);
  const [defaults, setDefaults] = useState(parameters.defaults.constantRate);
  const [members, setMembers] = useState(parameters.population.initialMembers);
  const [contrib, setContrib] = useState(parameters.contributions.monthlyContributionCents);
  const [fee, setFee] = useState(parameters.administration.feePerMemberCents);
  const result = useMemo(() => {
    const p = structuredClone(parameters);
    p.defaults.constantRate = defaults;
    p.population.initialMembers = members;
    p.population.mode = "fixed";
    const sol = p.contributions.solidarityShareCents;
    const pers = p.contributions.personalSavingsShareCents;
    const sum = sol + pers;
    if (sum > 0) {
      p.contributions.monthlyContributionCents = contrib;
      p.contributions.solidarityShareCents = Math.round((sol / sum) * contrib);
      p.contributions.personalSavingsShareCents = contrib - p.contributions.solidarityShareCents;
    }
    p.administration.feePerMemberCents = fee;
    p.time.horizonMonths = Math.min(36, p.time.horizonMonths);
    return simulateScenario(p);
  }, [parameters, defaults, members, contrib, fee]);
  return (
    <div className="space-y-4">
      <PageHeader title="What-if" subtitle="Slider verändern die Annahmen und rechnen die Engine neu. Keine Dummy-Werte." />
      <Card className="grid gap-4 md:grid-cols-2">
        <label>Ausfallquote {formatPercent(defaults)}
          <input type="range" min={0} max={0.2} step={0.005} value={defaults} onChange={(e) => setDefaults(Number(e.target.value))} className="w-full" />
        </label>
        <label>Mitglieder {formatNumber(members)}
          <input type="range" min={100} max={50000} step={100} value={members} onChange={(e) => setMembers(Number(e.target.value))} className="w-full" />
        </label>
        <label>Beitrag {formatEuro(contrib)}
          <input type="range" min={2000} max={30000} step={100} value={contrib} onChange={(e) => setContrib(Number(e.target.value))} className="w-full" />
        </label>
        <label>Gebühr {formatEuro(fee)}
          <input type="range" min={0} max={2000} step={50} value={fee} onChange={(e) => setFee(Number(e.target.value))} className="w-full" />
        </label>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>Fonds {formatEuro(result.kpis.solidarityCashCents)}</Card>
        <Card>Liquidität {formatEuro(result.kpis.liquidityCents)}</Card>
        <Card>Verluste {formatEuro(result.kpis.netLossCents)}</Card>
        <Card>Kreditvergabe (letzter Monat) {formatEuro(result.lastMonth?.loanDisbursementsCents ?? 0)}</Card>
        <Card>Warnungen {result.warnings[0]?.title}</Card>
      </div>
    </div>
  );
}

export function GoalSeekPage() {
  const parameters = useAppStore((s) => s.parameters);
  const [target, setTarget] = useState(0.9);
  const [out, setOut] = useState<ReturnType<typeof goalSeek> | null>(null);
  const [reverse, setReverse] = useState<ReturnType<typeof runReverseSimulation> | null>(null);
  const [required, setRequired] = useState<ReturnType<typeof calculateRequiredFundSize> | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Ziel suchen / Reverse Simulation" subtitle="Die Engine sucht Parameter, die ein Ziel unter Modellannahmen erfüllen." />
      <Card className="space-y-3">
        <label className="block text-sm">Ziel-Funding-Rate
          <Input type="number" step={0.05} min={0} max={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </label>
        <Button onClick={() => setOut(goalSeek(parameters, { param: "members", metric: "fulfillment", target, min: 100, max: 50000 }))}>
          Mitgliederzahl suchen
        </Button>
        {out ? <p>Gefunden: {formatNumber(Math.round(out.value))} Mitglieder · Metrik {out.metric.toFixed(3)} · {out.iterations} Iterationen</p> : null}
      </Card>
      <Card className="space-y-3">
        <p className="text-sm">Wie groß muss der Solidaritätsfonds sein, um die Ziel-Funding-Rate und die max. Wartezeit zu erreichen?</p>
        <Button onClick={() => setRequired(calculateRequiredFundSize(parameters, target, parameters.allocation.maxWaitMonths))}>
          Erforderlichen Fonds rechnen
        </Button>
        {required ? (
          <div className="text-sm">
            <p>Erforderlicher Startfonds (Näherung): {formatEuro(required.requiredFundCents)}</p>
            <p>Oder monatlicher Solidaritätsbeitrag: {formatEuro(required.requiredSolidarityShareCents)}</p>
            <p>Oder Mitgliederzahl (bei fixer Nachfrage): {formatNumber(required.requiredMembers)}</p>
            <p>Erreichte Funding Rate: {formatPercent(required.achievedFundingRate)} · max. Wartezeit {required.achievedMaxWaitMonths.toFixed(1)} Monate</p>
            {required.notes.map((n) => <p key={n} className="text-xs text-ink-500">{n}</p>)}
          </div>
        ) : null}
      </Card>
      <Card className="space-y-3">
        <p className="text-sm">Reverse: 10.000 Mitglieder und 1 Mio. € monatliche Qard-Hasan-Vergabe (Modellziel).</p>
        <Button onClick={() => setReverse(runReverseSimulation(10000, eurosToCents(1_000_000), parameters))}>Reverse rechnen</Button>
        {reverse ? (
          <div className="text-sm">
            <p>Benötigte Fondsgröße (Näherung): {formatEuro(reverse.requiredFundCents)}</p>
            <p>Benötigte Mitglieder: {formatNumber(reverse.requiredMembers)}</p>
            <p>Benötigter Solidaritätsbeitrag: {formatEuro(reverse.requiredSolidarityShareCents)}</p>
            <p>Max. monatliche zulässige Nachfrage (simuliert): {formatEuro(reverse.maxMonthlyDemandCents)}</p>
            <p>Benötigte Reserve: {formatEuro(reverse.requiredReserveCents)}</p>
            <p>Max. tragbare Ausfallquote (bis rot): {formatPercent(reverse.maxBearableDefaultRate)}</p>
            {reverse.notes.map((n) => <p key={n} className="text-xs text-ink-500">{n}</p>)}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export function LedgerPage() {
  const result = useAppStore((s) => s.result);
  if (!result) return <NeedResult />;
  return (
    <div className="space-y-4">
      <PageHeader title="Buchungsledger" subtitle="Aggregierte Buchungen je Monat und Konto. Grundlage für eine spätere echte Anwendung." />
      <div className="table-scroll rounded-xl border border-ink-200 dark:border-ink-800">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr>
              <th className="text-left">ID</th><th>Monat</th><th>Typ</th><th>Konto</th>
              <th className="text-right">Soll</th><th className="text-right">Haben</th><th>Memo</th>
            </tr>
          </thead>
          <tbody>
            {result.ledger.map((e) => (
              <tr key={e.id} className="border-t border-ink-100 dark:border-ink-800">
                <td>{e.id}</td>
                <td>{e.date}</td>
                <td>{e.type}</td>
                <td>{e.account}</td>
                <td className="text-right font-mono">{formatEuro(e.debitCents)}</td>
                <td className="text-right font-mono">{formatEuro(e.creditCents)}</td>
                <td>{e.memo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SimulationsPage() {
  const simulations = useAppStore((s) => s.simulations);
  const loadSimulation = useAppStore((s) => s.loadSimulation);
  const deleteSimulation = useAppStore((s) => s.deleteSimulation);
  return (
    <div className="space-y-4">
      <PageHeader title="Gespeicherte Simulationen" subtitle="Audit-Trail: Parameter, Seed, Engine-Version, Zeitpunkt." />
      {simulations.map((s) => (
        <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">{s.result.meta.scenarioName}</p>
            <p className="text-xs text-ink-500">
              {s.result.meta.simulationId} · {s.result.meta.createdAt} · Engine {s.result.meta.engineVersion} · Seed {s.result.meta.seed}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => loadSimulation(s.id)}>Öffnen</Button>
            <Button variant="danger" onClick={() => deleteSimulation(s.id)}>Löschen</Button>
          </div>
        </Card>
      ))}
      {!simulations.length ? <EmptyState title="Keine gespeicherten Läufe" text="Nach einer Simulation „Ergebnis speichern“ wählen." /> : null}
    </div>
  );
}

export function ExportPage() {
  const parameters = useAppStore((s) => s.parameters);
  const result = useAppStore((s) => s.result);
  const setParameters = useAppStore((s) => s.setParameters);
  return (
    <div className="space-y-4">
      <PageHeader title="Export / Import" subtitle="Szenarien vollständig als JSON. Cashflow als CSV." />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => exportParametersJson(parameters)}>Parameter JSON</Button>
        <Button variant="secondary" disabled={!result} onClick={() => result && exportResultJson(result)}>Ergebnis JSON</Button>
        <Button variant="secondary" disabled={!result} onClick={() => result && exportMonthsCsv(result)}>Cashflow CSV</Button>
      </div>
      <Card>
        <p className="mb-2 text-sm font-medium">Import JSON</p>
        <input
          type="file"
          accept="application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            const parsed = parseImportedScenario(text);
            setParameters(parsed.parameters);
          }}
        />
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const parameters = useAppStore((s) => s.parameters);
  const setParameters = useAppStore((s) => s.setParameters);
  return (
    <div className="space-y-4">
      <PageHeader title="Einstellungen" subtitle="Darstellung und Demo-Kennzeichnung." />
      <Card className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          Dark Mode
          <input type="checkbox" checked={theme === "dark"} onChange={(e) => setTheme(e.target.checked ? "dark" : "light")} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Als Beispieldaten markieren
          <input
            type="checkbox"
            checked={parameters.meta.isDemo}
            onChange={(e) => setParameters(setByPath(parameters, "meta.isDemo", e.target.checked))}
          />
        </label>
        <p className="text-xs text-ink-500">Persistenz: LocalStorage. Später durch ein Backend ersetzbar.</p>
      </Card>
    </div>
  );
}
