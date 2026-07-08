import type { RunSnapshot } from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import { describe, expect, it } from "vitest";
import { playgroundMessage, runSnapshot } from "./run-snapshot-test-fixtures";
import {
  deriveScenarioVisualization,
  type ScenarioVisualizationKind,
} from "./scenario-visualization";

const expectedKinds: Record<string, ScenarioVisualizationKind> = {
  partitioning: "partitioning-routing",
  "fan-out-load-balancing": "fanout-assignment",
  "at-least-once-duplicates": "duplicate-commit-timeline",
  "retry-dead-letter-queues": "retry-dlq-conveyor",
  "schema-evolution-karapace": "schema-compatibility-gate",
  "transactional-producers": "transaction-envelope",
  "event-replay-sourcing": "event-replay-projection",
  "consumer-lag-backpressure": "lag-backpressure-meter",
  "hot-partitions-key-skew": "hot-partition-heatmap",
  "log-compaction-tombstones": "compaction-state-table",
  "retention-data-loss": "retention-window-timeline",
  "cooperative-rebalancing": "cooperative-rebalance-board",
  "streams-joins-windows": "streams-window-join",
  "outbox-cdc": "outbox-cdc-pipeline",
  "acl-least-privilege": "acl-permission-matrix",
};

describe("deriveScenarioVisualization", () => {
  it("builds a custom visualization model for every catalog scenario", () => {
    for (const scenario of SCENARIOS) {
      const visualization = deriveScenarioVisualization(
        snapshotFor(scenario.id),
      );

      expect(visualization.kind, scenario.id).toBe(expectedKinds[scenario.id]);
      expect(visualization.title, scenario.id).toBeTruthy();
      expect(visualization.summary, scenario.id).toBeTruthy();
      expect(visualization.metrics.length, scenario.id).toBeGreaterThan(0);
      expect(visualization.hotspots.length, scenario.id).toBeGreaterThan(0);
      expect(
        visualization.lanes.length +
          visualization.rows.length +
          visualization.steps.length,
        scenario.id,
      ).toBeGreaterThan(0);

      for (const hotspot of visualization.hotspots) {
        expect(hotspot.id, scenario.id).toBeTruthy();
        expect(hotspot.title, hotspot.id).toBeTruthy();
        expect(hotspot.metricLabel, hotspot.id).toBeTruthy();
      }
    }
  });

  it("derives Outbox CDC rows from existing payload fields", () => {
    const visualization = deriveScenarioVisualization(
      snapshotFor("outbox-cdc", {
        messageCounts: {
          produced: 1,
          received: 0,
          processed: 0,
          committed: 0,
          failed: 0,
        },
        recentMessages: [
          message("cdc-1", {
            table: "orders",
            operation: "update",
            outboxId: "outbox-row-1",
            lsn: "0/3EA",
          }),
        ],
      }),
    );

    expect(visualization.kind).toBe("outbox-cdc-pipeline");
    expect(visualization.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "LSN", value: "0/3EA" }),
      ]),
    );
    expect(visualization.rows[0]?.cells).toEqual(
      expect.arrayContaining(["orders", "update", "0/3EA"]),
    );
  });

  it("keeps fan-out empty state aligned with real consumers", () => {
    const visualization = deriveScenarioVisualization(
      snapshotFor("fan-out-load-balancing", { consumers: [] }),
    );

    expect(visualization.kind).toBe("fanout-assignment");
    expect(visualization.lanes).toEqual([]);
    expect(visualization.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Active", value: "0" }),
        expect.objectContaining({ label: "Idle", value: "0" }),
      ]),
    );
  });

  it("keeps old topology inspector hotspot ids available", () => {
    const visualization = deriveScenarioVisualization(
      snapshotFor("hot-partitions-key-skew", {
        messageCounts: {
          produced: 7,
          received: 0,
          processed: 0,
          committed: 0,
          failed: 0,
          "0": 1,
          "1": 5,
          "2": 1,
        },
      }),
    );

    expect(visualization.hotspots.map((hotspot) => hotspot.id)).toEqual(
      expect.arrayContaining(["hot-key-router", "hottest-partition"]),
    );
    expect(
      visualization.hotspots.find(
        (hotspot) => hotspot.id === "hottest-partition",
      ),
    ).toMatchObject({
      metricLabel: "P1",
      metricValue: "5",
      tone: "rose",
    });
  });
});

function snapshotFor(
  scenarioId: string,
  overrides: Partial<RunSnapshot> = {},
): RunSnapshot {
  return runSnapshot({
    runId: `run-${scenarioId}`,
    scenarioId,
    topicName: `kplay.${scenarioId}`,
    partitionCount: 3,
    consumerGroupId: `group-${scenarioId}`,
    keyStrategy: { type: "fixed", value: "user-1" },
    processingLatencyMs: 250,
    consumers: [
      {
        consumerId: "consumer-1",
        status: "running",
        assignments: [{ topic: `kplay.${scenarioId}`, partition: 0 }],
        processedCount: 0,
        committedCount: 0,
      },
    ],
    ...overrides,
  });
}

function message(
  messageId: string,
  payload: Record<string, unknown>,
): RunSnapshot["recentMessages"][number] {
  return playgroundMessage({
    messageId,
    runId: "run",
    topic: "topic",
    partition: 0,
    offset: "0",
    key: "user-1",
    value: { payload },
    headers: {},
    timestamp: "2026-06-26T00:00:00.000Z",
    state: "committed",
    assignedConsumerId: "consumer-1",
    committedOffset: "1",
  });
}
