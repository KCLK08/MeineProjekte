import { cn } from "../../utils/cn";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent-600 text-white hover:bg-accent-700",
        variant === "secondary" &&
          "border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:hover:bg-ink-800",
        variant === "ghost" && "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800",
        variant === "danger" && "bg-rose-700 text-white hover:bg-rose-800",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        "rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50",
        props.className,
      )}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950",
        className,
      )}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "yellow" | "orange" | "red" | "critical";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
        tone === "green" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
        tone === "yellow" && "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
        tone === "orange" && "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200",
        tone === "red" && "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
        tone === "critical" && "bg-rose-700 text-white",
      )}
    >
      {children}
    </span>
  );
}
