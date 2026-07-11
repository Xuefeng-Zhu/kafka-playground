"use client";

import { useReducer } from "react";
import type { RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import {
  applyRuntimeEvent,
  initializeFromSnapshot,
  initialVisualizationState,
  mergeSnapshot,
} from "@/lib/client/visualization-reducer";

type PlaygroundVisualizationAction =
  | { type: "snapshot"; snapshot: RunSnapshot }
  | { type: "event"; event: RuntimeEvent }
  | { type: "clear" };

function playgroundVisualizationReducer(
  state: typeof initialVisualizationState,
  action: PlaygroundVisualizationAction,
) {
  if (action.type === "snapshot") {
    return state.snapshot
      ? mergeSnapshot(state, action.snapshot)
      : initializeFromSnapshot(action.snapshot);
  }
  if (action.type === "event") return applyRuntimeEvent(state, action.event);
  return initialVisualizationState;
}

export function usePlaygroundVisualization() {
  return useReducer(playgroundVisualizationReducer, initialVisualizationState);
}
