import type { RunSnapshot } from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import { describe, expect, it } from "vitest";
import { playgroundMessage, runSnapshot } from "./run-snapshot-test-fixtures";
import { deriveScenarioTopology } from "./scenario-topology";

const coreNodeIds = new Set(["producer", "topic", "consumerGroup"]);
const sourceHandles = new Set([
  "producer-out",
  "topic-empty-out",
  "left-out",
  "right-out",
  "top-out",
  "bottom-out",
]);
const targetHandles = new Set([
  "topic-in",
  "empty-in",
  "left-in",
  "right-in",
  "top-in",
  "bottom-in",
]);

describe("deriveScenarioTopology", () => {
  it("builds coherent topology models for every catalog scenario", () => {
    for (const scenario of SCENARIOS) {
      const topology = deriveScenarioTopology(snapshotFor(scenario.id));
      const nodeIds = new Set(topology.nodes.map((node) => node.id));

      expect(topology.nodes.length, scenario.id).toBeGreaterThanOrEqual(2);
      expect(topology.edges.length, scenario.id).toBeGreaterThanOrEqual(2);
      expect(nodeIds.size, scenario.id).toBe(topology.nodes.length);
      expect(
        new Set(topology.edges.map((edge) => edge.id)).size,
        scenario.id,
      ).toBe(topology.edges.length);
      if (scenario.id !== "partitioning") {
        expect(nodeIds.has("key-router"), scenario.id).toBe(false);
        expect(nodeIds.has("commit-progress"), scenario.id).toBe(false);
      }

      for (const node of topology.nodes) {
        expect(node.title, node.id).not.toHaveLength(0);
        expect(node.metricLabel, node.id).not.toHaveLength(0);
        expect(Number.isFinite(node.position.x), node.id).toBe(true);
        expect(Number.isFinite(node.position.y), node.id).toBe(true);
        expect(Number.isFinite(node.compactPosition.x), node.id).toBe(true);
        expect(Number.isFinite(node.compactPosition.y), node.id).toBe(true);
      }

      for (const edge of topology.edges) {
        expect(hasEndpoint(edge.source, nodeIds), edge.id).toBe(true);
        expect(hasEndpoint(edge.target, nodeIds), edge.id).toBe(true);
        if (edge.sourceHandle) {
          expect(sourceHandles.has(edge.sourceHandle), edge.id).toBe(true);
        }
        if (edge.targetHandle) {
          expect(targetHandles.has(edge.targetHandle), edge.id).toBe(true);
        }
      }
    }
  });

  it("derives retry and DLQ labels from failed message payloads", () => {
    const topology = deriveScenarioTopology(
      snapshotFor("retry-dead-letter-queues", {
        messageCounts: {
          produced: 3,
          received: 2,
          processed: 1,
          committed: 1,
          failed: 1,
        },
        recentMessages: [
          message("retry-1", {
            retryTopic: "orders.retry.5m",
            deadLetterTopic: "orders.dead",
          }),
        ],
      }),
    );

    expect(
      topology.nodes.find((node) => node.id === "retry-topic"),
    ).toMatchObject({
      metricValue: "1",
      details: expect.arrayContaining([["Retry topic", "orders.retry.5m"]]),
    });
    expect(
      topology.nodes.find((node) => node.id === "dead-letter-topic"),
    ).toMatchObject({
      metricValue: "active",
      details: expect.arrayContaining([["DLQ", "orders.dead"]]),
    });
  });

  it("keeps right-side overlay defaults clear of the spread consumer group", () => {
    const topology = deriveScenarioTopology(snapshotFor("partitioning"));
    const rightOverlay = topology.nodes[1];

    expect(rightOverlay.position.x).toBeGreaterThanOrEqual(1260);
  });

  it("surfaces hot partition counts from per-partition message totals", () => {
    const topology = deriveScenarioTopology(
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

    expect(
      topology.nodes.find((node) => node.id === "hottest-partition"),
    ).toMatchObject({
      metricLabel: "P1",
      metricValue: "5",
      tone: "rose",
    });
  });

  it("counts denied ACL records from payload authorization flags", () => {
    const topology = deriveScenarioTopology(
      snapshotFor("acl-least-privilege", {
        recentMessages: [
          message("acl-1", { authorized: false, principal: "svc-a" }),
          message("acl-2", { authorized: true, principal: "svc-a" }),
          message("acl-3", { authorized: false, principal: "svc-b" }),
        ],
      }),
    );

    expect(
      topology.nodes.find((node) => node.id === "authorization-gate"),
    ).toMatchObject({
      metricValue: "2",
      tone: "rose",
      details: expect.arrayContaining([["Denied", "2"]]),
    });
  });
});

function hasEndpoint(id: string, scenarioNodeIds: Set<string>) {
  return coreNodeIds.has(id) || scenarioNodeIds.has(id);
}

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
