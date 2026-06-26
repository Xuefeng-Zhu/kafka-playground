import { describe, expect, it } from "vitest";
import type { RunSnapshot } from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import { deriveScenarioActions } from "./scenario-actions";

describe("deriveScenarioActions", () => {
  it("provides a guided action for every catalog scenario", () => {
    for (const scenario of SCENARIOS) {
      const actions = deriveScenarioActions(
        snapshot({ scenarioId: scenario.id }),
      );
      expect(actions.length, scenario.id).toBeGreaterThan(0);
      expect(
        actions.every((action) => action.label && action.description),
      ).toBe(true);
      if (scenario.id !== "partitioning") {
        expect(
          actions.some((action) => action.id === "produce-keyed-record"),
          scenario.id,
        ).toBe(false);
      }
    }
  });

  it("produces enough retry records to reach the next deterministic failure", () => {
    expect(
      deriveScenarioActions(
        snapshot({
          scenarioId: "retry-dead-letter-queues",
          recentMessages: [message({ value: { sequence: 2 } })],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: "trigger-retry-failure",
        produceCount: 1,
      }),
    );

    expect(
      deriveScenarioActions(
        snapshot({ scenarioId: "retry-dead-letter-queues" }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: "trigger-retry-failure",
        produceCount: 3,
      }),
    );
  });

  it("offers hot-key and balanced comparison actions for skew scenarios", () => {
    const actions = deriveScenarioActions(
      snapshot({ scenarioId: "hot-partitions-key-skew" }),
    );

    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "hot-key-burst",
        keyStrategy: { type: "fixed", value: "celebrity-user" },
        produceCount: 5,
      }),
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "balanced-comparison",
        keyStrategy: { type: "no_key" },
        produceCount: 4,
      }),
    );
  });
});

function snapshot(overrides: Partial<RunSnapshot>): RunSnapshot {
  return {
    runId: "run-1",
    scenarioId: "partitioning",
    mode: "demo",
    status: "running",
    topicName: "kplay.test",
    partitionCount: 2,
    consumerLimit: 3,
    consumerGroupId: "kplay.test.workers",
    producerStatus: "stopped",
    productionRate: 1,
    keyStrategy: { type: "round_robin_users" },
    processingLatencyMs: 500,
    consumers: [],
    latestPartitionOffsets: {},
    latestCommittedOffsets: {},
    messageCounts: {
      produced: 0,
      received: 0,
      processed: 0,
      committed: 0,
      failed: 0,
    },
    recentMessages: [],
    recentEvents: [],
    cleanupStatus: "not_requested",
    sequence: 0,
    ...overrides,
  };
}

function message(
  overrides: Partial<RunSnapshot["recentMessages"][number]>,
): RunSnapshot["recentMessages"][number] {
  return {
    messageId: "message-1",
    runId: "run-1",
    topic: "kplay.test",
    partition: 0,
    offset: "0",
    key: "user-1",
    value: {},
    headers: {},
    timestamp: new Date(0).toISOString(),
    state: "produced",
    assignedConsumerId: null,
    committedOffset: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}
