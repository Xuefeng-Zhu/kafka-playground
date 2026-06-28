import type { RunSnapshot } from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import { describe, expect, it } from "vitest";
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
});

function hasEndpoint(id: string, scenarioNodeIds: Set<string>) {
  return coreNodeIds.has(id) || scenarioNodeIds.has(id);
}

function snapshotFor(scenarioId: string): RunSnapshot {
  return {
    runId: `run-${scenarioId}`,
    scenarioId,
    mode: "demo",
    status: "running",
    topicName: `kplay.${scenarioId}`,
    partitionCount: 3,
    consumerLimit: 3,
    consumerGroupId: `group-${scenarioId}`,
    producerStatus: "stopped",
    productionRate: 1,
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
  };
}
