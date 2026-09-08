import { create } from "zustand";
import { createDefaultParameters, createPreset, type PresetId } from "../domain/defaults";
import type {
  MonteCarloResult,
  SensitivityCell,
  SimulationParameters,
  SimulationResult,
  StoredScenario,
  StoredSimulation,
} from "../domain/types";
import { simulateScenario } from "../engine/simulation";
import { runMonteCarlo, runSensitivity } from "../engine/analyses";
import { loadPersisted, savePersisted } from "../services/persistence";

export type RunStatus = "idle" | "running" | "done" | "error";

type AppState = {
  parameters: SimulationParameters;
  result: SimulationResult | null;
  status: RunStatus;
  error: string | null;
  scenarios: StoredScenario[];
  simulations: StoredSimulation[];
  compareIds: string[];
  compareResults: SimulationResult[];
  monteCarlo: MonteCarloResult | null;
  sensitivity: SensitivityCell[] | null;
  theme: "light" | "dark";
  selectedMonth: number;
  selectedKpi: string | null;
  sidebarOpen: boolean;
  setParameters: (p: SimulationParameters) => void;
  patchParameters: (p: SimulationParameters) => void;
  loadPreset: (id: PresetId) => void;
  run: () => void;
  reset: () => void;
  saveScenario: (name?: string) => void;
  duplicateScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  deleteScenario: (id: string) => void;
  loadScenario: (id: string) => void;
  saveSimulation: () => void;
  deleteSimulation: (id: string) => void;
  loadSimulation: (id: string) => void;
  toggleCompare: (id: string) => void;
  runCompare: () => void;
  runMonteCarloNow: (runs?: number) => void;
  runSensitivityNow: () => void;
  setTheme: (theme: "light" | "dark") => void;
  setSelectedMonth: (m: number) => void;
  setSelectedKpi: (k: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
};

function persistSlice(state: AppState) {
  savePersisted({
    parameters: state.parameters,
    scenarios: state.scenarios,
    simulations: state.simulations.map((s) => ({
      ...s,
      result: {
        ...s.result,
        ledger: s.result.ledger.slice(0, 200),
        sampleLoans: s.result.sampleLoans.slice(0, 40),
        sampleMembers: s.result.sampleMembers.slice(0, 20),
      },
    })),
    theme: state.theme,
    lastResultId: state.result?.meta.simulationId ?? null,
  });
}

const persisted = typeof localStorage !== "undefined" ? loadPersisted() : null;

export const useAppStore = create<AppState>((set, get) => ({
  parameters: persisted?.parameters ?? createDefaultParameters(),
  result: null,
  status: "idle",
  error: null,
  scenarios: persisted?.scenarios ?? [],
  simulations: persisted?.simulations ?? [],
  compareIds: [],
  compareResults: [],
  monteCarlo: null,
  sensitivity: null,
  theme: persisted?.theme ?? "dark",
  selectedMonth: 1,
  selectedKpi: null,
  sidebarOpen: true,
  setParameters: (parameters) => {
    set({ parameters });
    persistSlice(get());
  },
  patchParameters: (parameters) => {
    set({ parameters });
    persistSlice(get());
  },
  loadPreset: (id) => {
    const parameters = createPreset(id);
    set({ parameters, result: null, status: "idle" });
    persistSlice(get());
  },
  run: () => {
    const { parameters } = get();
    set({ status: "running", error: null });
    try {
      const result = simulateScenario(parameters);
      set({
        result,
        status: "done",
        selectedMonth: result.months.length,
        error: null,
      });
      persistSlice(get());
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : "Simulation fehlgeschlagen",
      });
    }
  },
  reset: () => {
    set({
      result: null,
      status: "idle",
      error: null,
      monteCarlo: null,
      sensitivity: null,
      compareResults: [],
      selectedMonth: 1,
    });
  },
  saveScenario: (name) => {
    const { parameters, scenarios } = get();
    const now = new Date().toISOString();
    const item: StoredScenario = {
      id: `scn-${Date.now()}`,
      name: name ?? parameters.meta.name,
      createdAt: now,
      updatedAt: now,
      parameters: structuredClone(parameters),
    };
    set({ scenarios: [...scenarios, item] });
    persistSlice(get());
  },
  duplicateScenario: (id) => {
    const found = get().scenarios.find((s) => s.id === id);
    if (!found) return;
    const copy: StoredScenario = {
      ...structuredClone(found),
      id: `scn-${Date.now()}`,
      name: `${found.name} (Kopie)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set({ scenarios: [...get().scenarios, copy] });
    persistSlice(get());
  },
  renameScenario: (id, name) => {
    set({
      scenarios: get().scenarios.map((s) =>
        s.id === id ? { ...s, name, updatedAt: new Date().toISOString() } : s,
      ),
    });
    persistSlice(get());
  },
  deleteScenario: (id) => {
    set({ scenarios: get().scenarios.filter((s) => s.id !== id) });
    persistSlice(get());
  },
  loadScenario: (id) => {
    const found = get().scenarios.find((s) => s.id === id);
    if (!found) return;
    set({ parameters: structuredClone(found.parameters), result: null, status: "idle" });
    persistSlice(get());
  },
  saveSimulation: () => {
    const { result, simulations } = get();
    if (!result) return;
    const item: StoredSimulation = {
      id: result.meta.simulationId,
      savedAt: new Date().toISOString(),
      result,
    };
    set({ simulations: [item, ...simulations.filter((s) => s.id !== item.id)].slice(0, 20) });
    persistSlice(get());
  },
  deleteSimulation: (id) => {
    set({ simulations: get().simulations.filter((s) => s.id !== id) });
    persistSlice(get());
  },
  loadSimulation: (id) => {
    const found = get().simulations.find((s) => s.id === id);
    if (!found) return;
    set({
      result: found.result,
      parameters: found.result.parameters,
      status: "done",
      selectedMonth: found.result.months.length,
    });
  },
  toggleCompare: (id) => {
    const ids = get().compareIds;
    set({ compareIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 4) });
  },
  runCompare: () => {
    const { scenarios, compareIds, parameters } = get();
    const selected = scenarios.filter((s) => compareIds.includes(s.id));
    const toRun = selected.length ? selected.map((s) => s.parameters) : [parameters];
    set({ status: "running" });
    const compareResults = toRun.map((p) => simulateScenario(p));
    set({ compareResults, status: "done" });
  },
  runMonteCarloNow: (runs) => {
    set({ status: "running", error: null });
    try {
      const monteCarlo = runMonteCarlo(get().parameters, runs);
      set({ monteCarlo, status: "done" });
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : "Monte-Carlo fehlgeschlagen",
      });
    }
  },
  runSensitivityNow: () => {
    set({ status: "running" });
    const defaults = [0, 0.03, 0.05, 0.1, 0.15, 0.2];
    const exits = [0, 0.004, 0.01, 0.02, 0.03];
    const sensitivity = runSensitivity(get().parameters, defaults, exits);
    set({ sensitivity, status: "done" });
  },
  setTheme: (theme) => {
    set({ theme });
    persistSlice(get());
  },
  setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
  setSelectedKpi: (selectedKpi) => set({ selectedKpi }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
