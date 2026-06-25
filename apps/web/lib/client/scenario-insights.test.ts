import { describe, expect, it } from "vitest";
import type { RunSnapshot } from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import { deriveScenarioInsight } from "./scenario-insights";

describe("deriveScenarioInsight", () => {
  it("provides scenario-specific insight copy for every non-primary scenario", () => {
    for (const scenario of SCENARIOS.filter((item) => item.id !== "partitioning")) {
      const insight = deriveScenarioInsight(snapshot({ scenarioId: scenario.id }));
      expect(insight.title, scenario.id).not.toBe("Partitioning run");
      expect(insight.summary, scenario.id).toBeTruthy();
      expect(insight.metrics.length, scenario.id).toBeGreaterThan(0);
      expect(insight.chips.length, scenario.id).toBeGreaterThan(0);
    }
  });

  it("surfaces hot partition skew from per-partition counts", () => {
    const insight = deriveScenarioInsight(
      snapshot({
        scenarioId: "hot-partitions-key-skew",
        keyStrategy: { type: "fixed", value: "celebrity-user" },
        messageCounts: { produced: 4, received: 0, processed: 0, committed: 0, failed: 0, "0": 1, "2": 3 }
      })
    );

    expect(insight.title).toBe("Hot partition detector");
    expect(insight.metrics).toContainEqual({ label: "Busiest partition", value: "P2", tone: "rose" });
  });

  it("summarizes retry and dead-letter failures", () => {
    const insight = deriveScenarioInsight(
      snapshot({
        scenarioId: "retry-dead-letter-queues",
        messageCounts: { produced: 3, received: 3, processed: 2, committed: 2, failed: 1 },
        recentMessages: [
          message({
            state: "failed",
            value: {
              payload: {
                retryTopic: "orders.retry.30s",
                deadLetterTopic: "orders.dlq"
              }
            }
          })
        ]
      })
    );

    expect(insight.title).toBe("Retry and dead-letter routing");
    expect(insight.metrics).toContainEqual({ label: "Failed", value: "1", tone: "rose" });
    expect(insight.metrics).toContainEqual({ label: "DLQ", value: "orders.dlq", tone: "rose" });
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
    consumerGroupId: "kplay.test.workers",
    producerStatus: "stopped",
    productionRate: 1,
    keyStrategy: { type: "round_robin_users" },
    processingLatencyMs: 500,
    consumers: [],
    latestPartitionOffsets: {},
    latestCommittedOffsets: {},
    messageCounts: { produced: 0, received: 0, processed: 0, committed: 0, failed: 0 },
    recentMessages: [],
    recentEvents: [],
    cleanupStatus: "not_requested",
    sequence: 0,
    ...overrides
  };
}

function message(overrides: Partial<RunSnapshot["recentMessages"][number]>): RunSnapshot["recentMessages"][number] {
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
    ...overrides
  };
}
