import type { SimulationParameters } from "../domain/types";
import { simulateScenario } from "./simulation";

export type WorkerRequest =
  | { type: "simulate"; parameters: SimulationParameters }
  | { type: "ping" };

export type WorkerResponse =
  | { type: "result"; result: ReturnType<typeof simulateScenario> }
  | { type: "error"; message: string }
  | { type: "pong" };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === "ping") {
      (self as unknown as Worker).postMessage({ type: "pong" } satisfies WorkerResponse);
      return;
    }
    const result = simulateScenario(msg.parameters);
    (self as unknown as Worker).postMessage({ type: "result", result } satisfies WorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Simulationsfehler";
    (self as unknown as Worker).postMessage({ type: "error", message } satisfies WorkerResponse);
  }
};
