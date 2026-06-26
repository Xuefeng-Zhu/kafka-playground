import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import { logger } from "./logger";
import { emitRuntimeEvent, subscribeToRun } from "./runtime-event-hub";

describe("runtime event hub", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes subscribers that fail on initial snapshot enqueue", () => {
    const state = eventState();

    const unsubscribe = subscribeToRun(state, snapshotFixture, null, {
      id: "broken",
      enqueue: () => {
        throw new Error("stream closed");
      },
    });
    unsubscribe();

    expect(state.subscribers.has("broken")).toBe(false);
  });

  it("stops replaying missed events after an enqueue failure", () => {
    const state = eventState([
      runtimeEvent(1, "run.started"),
      runtimeEvent(2, "producer.started"),
    ]);
    const enqueue = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("stream closed");
      });

    subscribeToRun(state, snapshotFixture, 0, { id: "broken", enqueue });

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(state.subscribers.has("broken")).toBe(false);
  });

  it("trims event history while keeping healthy subscribers", () => {
    const state = eventState();
    const enqueue = vi.fn();
    state.subscribers.set("healthy", { id: "healthy", enqueue });

    emitRuntimeEvent(state, "run.started", {}, 1);
    emitRuntimeEvent(state, "producer.started", {}, 1);

    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.type).toBe("producer.started");
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});

function eventState(events: RuntimeEvent[] = []) {
  return {
    runId: "run-1",
    sequence: events.length,
    events,
    subscribers: new Map(),
  };
}

function runtimeEvent(
  sequence: number,
  type: "run.started" | "producer.started",
): RuntimeEvent {
  return {
    eventId: `event-${sequence}`,
    runId: "run-1",
    sequence,
    occurredAt: "2026-06-26T00:00:00.000Z",
    type,
  };
}

const snapshotFixture = {
  runId: "run-1",
  scenarioId: "partitioning",
  mode: "demo",
  status: "running",
  topicName: "topic",
  partitionCount: 2,
  consumerLimit: 3,
  consumerGroupId: "group",
  producerStatus: "stopped",
  productionRate: 1,
  keyStrategy: { type: "round_robin_users" },
  processingLatencyMs: 500,
  consumers: [],
  recentMessages: [],
  recentEvents: [],
  latestPartitionOffsets: {},
  latestCommittedOffsets: {},
  messageCounts: { produced: 0 },
  cleanupStatus: "not_requested",
  sequence: 0,
} satisfies RunSnapshot;
