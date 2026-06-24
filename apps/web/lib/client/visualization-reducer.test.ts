import { describe, expect, it } from "vitest";
import { applyRuntimeEvent, initializeFromSnapshot } from "./visualization-reducer";
import type { RunSnapshot, RuntimeEvent } from "@kplay/contracts";

const snapshot: RunSnapshot = {
  runId: "run",
  scenarioId: "partitioning",
  mode: "demo",
  status: "running",
  topicName: "topic",
  partitionCount: 2,
  consumerGroupId: "group",
  producerStatus: "stopped",
  productionRate: 1,
  keyStrategy: { type: "round_robin_users" },
  processingLatencyMs: 500,
  consumers: [],
  latestPartitionOffsets: {},
  latestCommittedOffsets: {},
  messageCounts: { produced: 0, received: 0, processed: 0, committed: 0 },
  recentMessages: [],
  recentEvents: [],
  cleanupStatus: "not_requested",
  sequence: 0
};

function event(sequence: number): RuntimeEvent {
  return {
    eventId: `event-${sequence}`,
    runId: "run",
    sequence,
    occurredAt: new Date().toISOString(),
    type: "producer.started"
  };
}

describe("visualization reducer", () => {
  it("ignores duplicate event sequences", () => {
    let state = initializeFromSnapshot(snapshot);
    state = applyRuntimeEvent(state, event(1));
    state = applyRuntimeEvent(state, event(1));
    expect(state.events).toHaveLength(1);
  });

  it("detects sequence gaps", () => {
    let state = initializeFromSnapshot(snapshot);
    state = applyRuntimeEvent(state, event(1));
    state = applyRuntimeEvent(state, event(3));
    expect(state.hasSequenceGap).toBe(true);
  });
});
