import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export function InfoHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3.5 w-3.5 text-ink-400" aria-hidden />
      <span className="sr-only">{text}</span>
      <span className="pointer-events-none absolute left-4 top-5 z-20 hidden w-72 rounded-md border border-ink-200 bg-white p-2 text-xs text-ink-700 shadow-lg group-hover:block group-focus:block dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200">
        {text}
      </span>
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 p-8 text-center dark:border-ink-700">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-ink-500">{text}</p>
    </div>
  );
}

export function Meaning({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-1 text-xs text-ink-500 dark:text-ink-400", className)}>
      <span className="font-medium text-ink-600 dark:text-ink-300">Was bedeutet das? </span>
      {children}
    </p>
  );
}
