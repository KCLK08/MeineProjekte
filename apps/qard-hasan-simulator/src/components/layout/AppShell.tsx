import {
  BarChart3,
  ChevronLeft,
  LayoutDashboard,
  Menu,
  Moon,
  Play,
  RotateCcw,
  Save,
  Sun,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../ui/primitives";
import { cn } from "../../utils/cn";
import { useEffect } from "react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Simulation",
    children: [
      { to: "/simulation", label: "Neue Simulation" },
      { to: "/scenarios", label: "Szenarien" },
      { to: "/compare", label: "Vergleich" },
      { to: "/stress", label: "Stress Test" },
      { to: "/monte-carlo", label: "Monte Carlo" },
      { to: "/what-if", label: "What-if" },
      { to: "/goal-seek", label: "Ziel suchen" },
    ],
  },
  {
    label: "Finanzsystem",
    children: [
      { to: "/members", label: "Mitglieder" },
      { to: "/fund", label: "Solidaritätsfonds" },
      { to: "/personal", label: "Persönliche Guthaben" },
      { to: "/loans", label: "Kredite" },
      { to: "/liquidity", label: "Liquidität" },
      { to: "/admin", label: "Verwaltung" },
    ],
  },
  {
    label: "Analyse",
    children: [
      { to: "/cashflow", label: "Cashflow" },
      { to: "/balance", label: "Bilanz" },
      { to: "/risk", label: "Risiko" },
      { to: "/sensitivity", label: "Sensitivität" },
      { to: "/break-even", label: "Break-Even" },
    ],
  },
  {
    label: "Daten",
    children: [
      { to: "/ledger", label: "Ledger" },
      { to: "/simulations", label: "Simulationen" },
      { to: "/export", label: "Export / Import" },
    ],
  },
  { to: "/settings", label: "Einstellungen" },
];

export function AppShell() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const parameters = useAppStore((s) => s.parameters);
  const result = useAppStore((s) => s.result);
  const status = useAppStore((s) => s.status);
  const run = useAppStore((s) => s.run);
  const reset = useAppStore((s) => s.reset);
  const saveScenario = useAppStore((s) => s.saveScenario);
  const saveSimulation = useAppStore((s) => s.saveSimulation);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="flex min-h-screen bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <aside
        className={cn(
          "no-print sticky top-0 z-20 flex h-screen flex-col border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900",
          sidebarOpen ? "w-64" : "w-14",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-4">
          {sidebarOpen ? (
            <div>
              <p className="text-sm font-semibold">Qard-Hasan Simulator</p>
              <p className="text-[11px] text-ink-500">Simulationswerkzeug</p>
            </div>
          ) : null}
          <button
            type="button"
            className="rounded p-1 hover:bg-ink-100 dark:hover:bg-ink-800"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Navigation einklappen" : "Navigation ausklappen"}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-6" aria-label="Hauptnavigation">
          {NAV.map((item) => {
            if ("children" in item && item.children) {
              return (
                <div key={item.label} className="mb-3">
                  {sidebarOpen ? (
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                      {item.label}
                    </p>
                  ) : null}
                  {item.children.map((child) => (
                    <NavItem key={child.to} to={child.to} label={child.label} collapsed={!sidebarOpen} />
                  ))}
                </div>
              );
            }
            if ("to" in item) {
              return <NavItem key={item.to} to={item.to} label={item.label} collapsed={!sidebarOpen} />;
            }
            return null;
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 border-b border-ink-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-900/90">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{parameters.meta.name}</p>
              <p className="text-xs text-ink-500">
                Zeitraum: {parameters.time.horizonMonths} Monate · Status:{" "}
                {status === "done"
                  ? "Simulation abgeschlossen"
                  : status === "running"
                    ? "Berechnung läuft"
                    : status === "error"
                      ? "Fehler"
                      : "Bereit"}
                {result ? ` · Engine ${result.meta.engineVersion}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => run()} disabled={status === "running"}>
                <Play className="h-4 w-4" /> Simulation starten
              </Button>
              <Button variant="secondary" onClick={() => reset()}>
                <RotateCcw className="h-4 w-4" /> Zurücksetzen
              </Button>
              <Button variant="secondary" onClick={() => saveScenario()}>
                <Save className="h-4 w-4" /> Szenario speichern
              </Button>
              <Button variant="secondary" onClick={() => saveSimulation()} disabled={!result}>
                Ergebnis speichern
              </Button>
              <Button variant="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Dark Mode umschalten">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {status === "running" ? (
            <div className="mt-2 h-1 overflow-hidden rounded bg-ink-200 dark:bg-ink-800">
              <div className="h-full w-1/2 animate-pulse bg-accent-600" />
            </div>
          ) : null}
        </header>
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Dies ist ein <strong>Simulations- und Planungswerkzeug</strong>. Es ist keine Banksoftware, kein reales
          Finanzprodukt und keine rechtliche oder schariarechtliche Beratung. Dargestellte Strukturen sind
          Modellannahmen und müssen schariarechtlich geprüft werden.
        </div>
        <main className="flex-1 overflow-x-hidden p-4 md:p-6" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, label, collapsed }: { to: string; label: string; collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      title={label}
      className={({ isActive }) =>
        cn(
          "mb-0.5 flex items-center rounded-md px-2 py-1.5 text-sm",
          isActive
            ? "bg-accent-700/15 font-medium text-accent-700 dark:text-accent-400"
            : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800",
        )
      }
    >
      {collapsed ? <BarChart3 className="h-4 w-4" /> : label}
    </NavLink>
  );
}
