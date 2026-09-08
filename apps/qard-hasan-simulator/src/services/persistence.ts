import type { StoredScenario, StoredSimulation, SimulationParameters } from "../domain/types";

const KEY = "qard-hasan-simulator:v1";

export type PersistedState = {
  parameters: SimulationParameters | null;
  scenarios: StoredScenario[];
  simulations: StoredSimulation[];
  theme: "light" | "dark";
  lastResultId: string | null;
};

export function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

export function savePersisted(state: PersistedState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string, type = "text/csv"): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
