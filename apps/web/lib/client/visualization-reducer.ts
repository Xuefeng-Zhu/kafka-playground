import type {
  RunSnapshot,
  RuntimeEvent,
  PlaygroundMessage,
} from "@kplay/contracts";

export type VisualizationState = {
  snapshot: RunSnapshot | null;
  events: RuntimeEvent[];
  messages: PlaygroundMessage[];
  lastSequence: number;
  hasSequenceGap: boolean;
  selectedMessageId: string | null;
  selectedEventSequence: number | null;
};

export const initialVisualizationState: VisualizationState = {
  snapshot: null,
  events: [],
  messages: [],
  lastSequence: 0,
  hasSequenceGap: false,
  selectedMessageId: null,
  selectedEventSequence: null,
};

export function initializeFromSnapshot(
  snapshot: RunSnapshot,
): VisualizationState {
  return {
    ...initialVisualizationState,
    snapshot,
    events: snapshot.recentEvents,
    messages: snapshot.recentMessages,
    lastSequence: snapshot.sequence,
  };
}

export function applyRuntimeEvent(
  state: VisualizationState,
  event: RuntimeEvent,
): VisualizationState {
  if (
    event.sequence <= state.lastSequence &&
    state.events.some((item) => item.sequence === event.sequence)
  ) {
    return state;
  }
  const hasSequenceGap =
    state.lastSequence > 0 && event.sequence > state.lastSequence + 1
      ? true
      : state.hasSequenceGap;
  const events = [...state.events, event].slice(-1000);
  const snapshot = state.snapshot
    ? {
        ...state.snapshot,
        sequence: Math.max(state.snapshot.sequence, event.sequence),
      }
    : null;
  return {
    ...state,
    snapshot,
    events,
    hasSequenceGap,
    lastSequence: Math.max(state.lastSequence, event.sequence),
  };
}

export function mergeSnapshot(
  state: VisualizationState,
  snapshot: RunSnapshot,
): VisualizationState {
  const deduped = new Map<number, RuntimeEvent>();
  for (const event of [...state.events, ...snapshot.recentEvents])
    deduped.set(event.sequence, event);
  return {
    ...state,
    snapshot,
    events: [...deduped.values()]
      .sort((a, b) => a.sequence - b.sequence)
      .slice(-1000),
    messages: snapshot.recentMessages,
    lastSequence: Math.max(state.lastSequence, snapshot.sequence),
  };
}
