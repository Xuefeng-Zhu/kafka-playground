import "server-only";
import type {
  ScenarioExperimentTransitionId,
  ScenarioState,
} from "@kplay/contracts";
import type { ScenarioExperimentTransition } from "./types";

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const existingIndex = items.findIndex(
    (candidate) => candidate.id === item.id,
  );
  if (existingIndex < 0) return [...items, item];
  return items.map((candidate, index) =>
    index === existingIndex ? item : candidate,
  );
}

export function upsertReducer<T extends { id: string }>(items: T[], item: T) {
  return upsertById(items, item);
}

export function complete<T extends ScenarioState>(
  state: T,
  experimentId: string,
  startedAtVirtualMs: number,
  transitions: ScenarioExperimentTransition[],
): T {
  const elapsed = transitions.reduce(
    (total, item) => total + item.advanceMs,
    0,
  );
  return {
    ...state,
    virtualTimeMs: startedAtVirtualMs + elapsed,
    revision: state.revision + transitions.length,
    experiment: {
      status: "completed",
      experimentId,
      stepIndex: transitions.length,
      totalSteps: transitions.length,
      startedAtVirtualMs,
      completedAtVirtualMs: startedAtVirtualMs + elapsed,
      error: null,
    },
  };
}

export function step(
  id: string,
  label: string,
  transition: ScenarioExperimentTransitionId,
  entityIds: string[],
  advanceMs: number,
): ScenarioExperimentTransition {
  return {
    id,
    label,
    transition,
    entityIds,
    provenance: "simulated",
    advanceMs,
  };
}
