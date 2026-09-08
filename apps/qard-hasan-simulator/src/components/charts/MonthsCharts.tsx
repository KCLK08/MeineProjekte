import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { centsToEuros } from "../../domain/money";
import type { MonthlySnapshot } from "../../domain/types";
import { Card } from "../ui/primitives";

const tooltipStyle = {
  background: "var(--tooltip-bg, #152222)",
  border: "1px solid #3c5655",
  fontSize: 12,
};

export function euroTick(v: number): string {
  return new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function MonthsLine({
  title,
  months,
  series,
}: {
  title: string;
  months: MonthlySnapshot[];
  series: { key: keyof MonthlySnapshot; name: string; color: string; euro?: boolean; ratio?: boolean }[];
}) {
  const data = months.map((m) => {
    const row: Record<string, number> = { month: m.month };
    for (const s of series) {
      const raw = m[s.key];
      const n = typeof raw === "number" ? raw : 0;
      row[s.key] = s.euro ? centsToEuros(n) : s.ratio ? n * 100 : n;
    }
    return row;
  });
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2f4443" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={euroTick} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function MonthsBar({
  title,
  months,
  series,
}: {
  title: string;
  months: MonthlySnapshot[];
  series: { key: keyof MonthlySnapshot; name: string; color: string }[];
}) {
  const data = months.map((m) => {
    const row: Record<string, number> = { month: m.month };
    for (const s of series) {
      const raw = m[s.key];
      row[s.key] = centsToEuros(typeof raw === "number" ? raw : 0);
    }
    return row;
  });
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2f4443" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={euroTick} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
