import { describe, expect, it } from "vitest";
import type { RunSnapshot } from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import { deriveScenarioCheckpoint } from "./scenario-checkpoints";

describe("deriveScenarioCheckpoint", () => {
  it("provides a valid checkpoint for every catalog scenario", () => {
    for (const scenario of SCENARIOS) {
      const checkpoint = deriveScenarioCheckpoint(
        snapshot({ scenarioId: scenario.id }),
      );
      const optionIds = checkpoint.options.map((option) => option.id);

      expect(checkpoint.id, scenario.id).toBeTruthy();
      expect(checkpoint.prompt, scenario.id).toBeTruthy();
      expect(checkpoint.explanation, scenario.id).toBeTruthy();
      expect(checkpoint.options.length, scenario.id).toBeGreaterThanOrEqual(2);
      expect(new Set(optionIds).size, scenario.id).toBe(optionIds.length);
      expect(optionIds, scenario.id).toContain(checkpoint.correctOptionId);
      if (scenario.id !== "partitioning") {
        expect(checkpoint.id, scenario.id).not.toBe("partitioning-commit-step");
      }
    }
  });

  it("prioritizes idle consumer checkpoints when members exceed partitions", () => {
    const checkpoint = deriveScenarioCheckpoint(
      snapshot({
        scenarioId: "partitioning",
        partitionCount: 2,
        consumers: [
          consumer({
            consumerId: "consumer-1",
            assignments: [{ topic: "kplay.test", partition: 0 }],
          }),
          consumer({
            consumerId: "consumer-2",
            assignments: [{ topic: "kplay.test", partition: 1 }],
          }),
          consumer({ consumerId: "consumer-3", assignments: [] }),
        ],
      }),
    );

    expect(checkpoint.id).toBe("idle-consumer-partition-limit");
    expect(checkpoint.correctOptionId).toBe("partition-limit");
    expect(checkpoint.explanation).toContain("2 partitions");
  });

  it("surfaces replay risk for received but uncommitted at-least-once messages", () => {
    const checkpoint = deriveScenarioCheckpoint(
      snapshot({
        scenarioId: "at-least-once-duplicates",
        recentMessages: [message({ state: "received", committedOffset: null })],
      }),
    );

    expect(checkpoint.id).toBe("at-least-once-replay-risk");
    expect(checkpoint.correctOptionId).toBe("replay");
  });

  it("does not treat crashed consumers as idle members", () => {
    const checkpoint = deriveScenarioCheckpoint(
      snapshot({
        scenarioId: "at-least-once-duplicates",
        consumers: [
          consumer({
            consumerId: "consumer-1",
            status: "crashed",
            assignments: [],
          }),
          consumer({
            consumerId: "consumer-2",
            assignments: [{ topic: "kplay.test", partition: 0 }],
          }),
        ],
        recentMessages: [message({ state: "received", committedOffset: null })],
      }),
    );

    expect(checkpoint.id).toBe("at-least-once-replay-risk");
  });

  it("surfaces retry routing once failures are visible", () => {
    const checkpoint = deriveScenarioCheckpoint(
      snapshot({
        scenarioId: "retry-dead-letter-queues",
        messageCounts: {
          produced: 3,
          received: 3,
          processed: 2,
          committed: 2,
          failed: 1,
        },
      }),
    );

    expect(checkpoint.id).toBe("retry-failure-routing");
    expect(checkpoint.correctOptionId).toBe("observe");
  });

  it("explains the busiest partition during hot-key skew", () => {
    const checkpoint = deriveScenarioCheckpoint(
      snapshot({
        scenarioId: "hot-partitions-key-skew",
        keyStrategy: { type: "fixed", value: "celebrity-user" },
        messageCounts: {
          produced: 5,
          received: 0,
          processed: 0,
          committed: 0,
          failed: 0,
          "3": 5,
        },
      }),
    );

    expect(checkpoint.id).toBe("hot-partition-detected");
    expect(checkpoint.prompt).toContain("P3");
    expect(checkpoint.correctOptionId).toBe("fixed-key");
  });

  it("does not blame key skew for unkeyed hot-partition comparisons", () => {
    const checkpoint = deriveScenarioCheckpoint(
      snapshot({
        scenarioId: "hot-partitions-key-skew",
        keyStrategy: { type: "no_key" },
        messageCounts: {
          produced: 4,
          received: 0,
          processed: 0,
          committed: 0,
          failed: 0,
          "0": 2,
          "1": 1,
          "2": 1,
        },
      }),
    );

    expect(checkpoint.id).toBe("hot-partition-key-choice");
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

function consumer(
  overrides: Partial<RunSnapshot["consumers"][number]>,
): RunSnapshot["consumers"][number] {
  return {
    consumerId: "consumer-1",
    status: "running",
    assignments: [],
    processedCount: 0,
    committedCount: 0,
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
