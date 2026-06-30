import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@kplay/scenario-engine";
import { playgroundMessage, runSnapshot } from "./run-snapshot-test-fixtures";
import { deriveScenarioInsight } from "./scenario-insights";

describe("deriveScenarioInsight", () => {
  it("provides scenario-specific insight copy for every non-primary scenario", () => {
    for (const scenario of SCENARIOS.filter(
      (item) => item.id !== "partitioning",
    )) {
      const insight = deriveScenarioInsight(
        runSnapshot({ scenarioId: scenario.id }),
      );
      expect(insight.title, scenario.id).not.toBe("Partitioning run");
      expect(insight.summary, scenario.id).toBeTruthy();
      expect(insight.metrics.length, scenario.id).toBeGreaterThan(0);
      expect(insight.chips.length, scenario.id).toBeGreaterThan(0);
      const metricLabels = insight.metrics.map((metric) => metric.label);
      expect(new Set(metricLabels).size, scenario.id).toBe(metricLabels.length);
      expect(new Set(insight.chips).size, scenario.id).toBe(
        insight.chips.length,
      );
    }
  });

  it("surfaces hot partition skew from per-partition counts", () => {
    const insight = deriveScenarioInsight(
      runSnapshot({
        scenarioId: "hot-partitions-key-skew",
        keyStrategy: { type: "fixed", value: "celebrity-user" },
        messageCounts: {
          produced: 4,
          received: 0,
          processed: 0,
          committed: 0,
          failed: 0,
          "0": 1,
          "2": 3,
        },
      }),
    );

    expect(insight.title).toBe("Hot partition detector");
    expect(insight.metrics).toContainEqual({
      label: "Busiest partition",
      value: "P2",
      tone: "rose",
    });
  });

  it("summarizes retry and dead-letter failures", () => {
    const insight = deriveScenarioInsight(
      runSnapshot({
        scenarioId: "retry-dead-letter-queues",
        messageCounts: {
          produced: 3,
          received: 3,
          processed: 2,
          committed: 2,
          failed: 1,
        },
        recentMessages: [
          playgroundMessage({
            state: "failed",
            value: {
              payload: {
                retryTopic: "orders.retry.30s",
                deadLetterTopic: "orders.dlq",
              },
            },
          }),
        ],
      }),
    );

    expect(insight.title).toBe("Retry and dead-letter routing");
    expect(insight.metrics).toContainEqual({
      label: "Failed",
      value: "1",
      tone: "rose",
    });
    expect(insight.metrics).toContainEqual({
      label: "DLQ",
      value: "orders.dlq",
      tone: "rose",
    });
  });
});
