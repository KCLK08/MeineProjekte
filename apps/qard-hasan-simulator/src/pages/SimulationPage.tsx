import { useMemo, useState } from "react";
import { PARAM_GROUPS } from "../features/parameters/fields";
import { validateParameters } from "../domain/validation";
import { PRESET_INFO, type PresetId } from "../domain/defaults";
import { PageHeader, InfoHint } from "../components/ui/hints";
import { Button, Card, Input, Select } from "../components/ui/primitives";
import { useAppStore } from "../store/useAppStore";
import { getByPath, setByPath } from "../utils/cn";
import { eurosToCents, centsToEuros } from "../domain/money";
import type { SimulationParameters } from "../domain/types";

export function SimulationPage() {
  const parameters = useAppStore((s) => s.parameters);
  const setParameters = useAppStore((s) => s.setParameters);
  const loadPreset = useAppStore((s) => s.loadPreset);
  const run = useAppStore((s) => s.run);
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const [group, setGroup] = useState(PARAM_GROUPS[0].id);
  const issues = useMemo(() => validateParameters(parameters), [parameters]);
  const current = PARAM_GROUPS.find((g) => g.id === group) ?? PARAM_GROUPS[0];

  const onChange = (path: string, value: unknown) => {
    setParameters(setByPath(parameters, path, value));
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Neue Simulation"
        subtitle="Alle Modellannahmen sind Parameter. Nichts Wichtiges ist in der Engine versteckt."
        actions={
          <Button onClick={() => run()} disabled={status === "running"}>
            Simulation starten
          </Button>
        }
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(PRESET_INFO) as PresetId[]).map((id) => (
          <Button key={id} variant="secondary" onClick={() => loadPreset(id)}>
            {PRESET_INFO[id].label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-ink-500">
        Presets enthalten nur Parameter, keine eigene Logik. {PRESET_INFO[(parameters.meta.name.includes("Crisis") ? "crisis" : "base") as PresetId]?.description}
      </p>

      {issues.length ? (
        <Card className="border-amber-400">
          <p className="text-sm font-medium">Validierung</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {issues.map((i) => (
              <li key={i.path + i.message}>{i.message}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col" aria-label="Parametergruppen">
          {PARAM_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              className={`rounded-md px-3 py-2 text-left text-sm ${
                group === g.id
                  ? "bg-accent-700 text-white"
                  : "hover:bg-ink-100 dark:hover:bg-ink-800"
              }`}
            >
              {g.title}
            </button>
          ))}
        </nav>
        <Card>
          <h2 className="mb-4 text-lg font-semibold">{current.title}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {current.fields.map((f) => {
              const raw = getByPath(parameters, f.path);
              return (
                <label key={f.path} className="block text-sm">
                  <span className="mb-1 flex items-center gap-2 font-medium">
                    {f.label}
                    <InfoHint text={`${f.help}${f.min !== undefined ? ` Min ${f.min}.` : ""}${f.max !== undefined ? ` Max ${f.max}.` : ""}`} />
                  </span>
                  {f.type === "boolean" ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(raw)}
                      onChange={(e) => onChange(f.path, e.target.checked)}
                    />
                  ) : f.type === "select" ? (
                    <Select value={String(raw ?? "")} onChange={(e) => onChange(f.path, e.target.value)}>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : f.type === "euro" ? (
                    <Input
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={0.01}
                      value={centsToEuros(Number(raw ?? 0))}
                      onChange={(e) => onChange(f.path, eurosToCents(Number(e.target.value)))}
                    />
                  ) : f.type === "percent" ? (
                    <Input
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={0.1}
                      value={Number((Number(raw ?? 0) * 100).toFixed(4))}
                      onChange={(e) => onChange(f.path, Number(e.target.value) / 100)}
                    />
                  ) : f.type === "date" ? (
                    <Input type="date" value={String(raw ?? "")} onChange={(e) => onChange(f.path, e.target.value)} />
                  ) : (
                    <Input
                      type={f.type === "text" ? "text" : "number"}
                      min={f.min}
                      max={f.max}
                      step={f.step ?? 1}
                      value={raw as string | number}
                      onChange={(e) =>
                        onChange(
                          f.path,
                          f.type === "text" ? e.target.value : f.type === "int" ? Number(e.target.value) : Number(e.target.value),
                        )
                      }
                    />
                  )}
                  {f.unit ? <span className="mt-1 block text-xs text-ink-500">{f.unit}</span> : null}
                </label>
              );
            })}
          </div>
          {group === "admin" ? <AdminCostEditor parameters={parameters} onChange={setParameters} /> : null}
        </Card>
      </div>
    </div>
  );
}

function AdminCostEditor({
  parameters,
  onChange,
}: {
  parameters: SimulationParameters;
  onChange: (p: SimulationParameters) => void;
}) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-semibold">Verwaltungskosten nach Kategorie</h3>
      <div className="table-scroll">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-200 dark:border-ink-700">
              <th className="py-2">Kategorie</th>
              <th>Aktiv</th>
              <th>Fix/Monat</th>
              <th>Pro Mitglied</th>
              <th>Wachstum %/Monat</th>
              <th>Jährlich</th>
            </tr>
          </thead>
          <tbody>
            {parameters.administration.costs.map((c, idx) => (
              <tr key={c.id} className="border-b border-ink-100 dark:border-ink-800">
                <td className="py-2">{c.label}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => {
                      const next = structuredClone(parameters);
                      next.administration.costs[idx].enabled = e.target.checked;
                      onChange(next);
                    }}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    value={centsToEuros(c.fixedMonthlyCents)}
                    onChange={(e) => {
                      const next = structuredClone(parameters);
                      next.administration.costs[idx].fixedMonthlyCents = eurosToCents(Number(e.target.value));
                      onChange(next);
                    }}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    value={centsToEuros(c.perMemberCents)}
                    onChange={(e) => {
                      const next = structuredClone(parameters);
                      next.administration.costs[idx].perMemberCents = eurosToCents(Number(e.target.value));
                      onChange(next);
                    }}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    value={c.growthPercentPerMonth * 100}
                    onChange={(e) => {
                      const next = structuredClone(parameters);
                      next.administration.costs[idx].growthPercentPerMonth = Number(e.target.value) / 100;
                      onChange(next);
                    }}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    value={centsToEuros(c.annualCents)}
                    onChange={(e) => {
                      const next = structuredClone(parameters);
                      next.administration.costs[idx].annualCents = eurosToCents(Number(e.target.value));
                      onChange(next);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

