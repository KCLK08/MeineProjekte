import { formatEuro, formatNumber, formatPercent } from "../../domain/money";
import type { FormulaLine } from "../../domain/types";
import { Meaning } from "./hints";
import { Card } from "./primitives";

export function KpiCard({
  label,
  cents,
  value,
  hint,
  onClick,
  demo,
}: {
  label: string;
  cents?: number;
  value?: string;
  hint: string;
  onClick?: () => void;
  demo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-ink-200 bg-white p-4 text-left shadow-sm transition hover:border-accent-500 dark:border-ink-800 dark:bg-ink-900"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
        {demo ? <span className="ml-2 rounded bg-ink-100 px-1 py-0.5 text-[10px] normal-case dark:bg-ink-800">Beispieldaten</span> : null}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        {value ?? (cents === undefined ? "—" : formatEuro(cents))}
      </p>
      <Meaning>{hint}</Meaning>
    </button>
  );
}

export function FormulaList({ title, lines }: { title: string; lines: FormulaLine[] }) {
  return (
    <Card>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1 font-mono text-sm">
        {lines.map((line) => (
          <li key={line.label} className="flex justify-between gap-4">
            <span className="text-ink-600 dark:text-ink-300">
              {line.sign === "=" ? "=" : line.sign === "info" ? " " : line.sign} {line.label}
            </span>
            <span className="tabular-nums">{formatEuro(line.cents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export { formatEuro, formatNumber, formatPercent };
