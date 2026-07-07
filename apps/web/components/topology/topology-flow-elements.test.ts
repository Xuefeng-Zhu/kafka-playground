import { describe, expect, it, vi } from "vitest";
import { deriveScenarioTopology } from "@/lib/client/scenario-topology";
import { runSnapshot } from "@/lib/client/run-snapshot-test-fixtures";
import { partitionAssignments } from "./topology-cards";
import {
  buildTopologyEdges,
  buildTopologyNodes,
  parseSavedScenarioPositions,
} from "./topology-flow-elements";
import { topologyMetrics } from "./topology-flow-helpers";

describe("topology flow elements", () => {
  it("builds core and scenario nodes with persisted wide overlay positions", () => {
    const snapshot = runSnapshot({
      consumers: [
        {
          consumerId: "consumer-1",
          status: "running",
          assignments: [{ topic: "topic", partition: 0 }],
          processedCount: 0,
          committedCount: 0,
        },
      ],
    });
    const scenarioTopology = deriveScenarioTopology(snapshot);

    const nodes = buildTopologyNodes({
      activeConsumerId: "consumer-1",
      activePartition: 0,
      assignmentByPartition: partitionAssignments(snapshot.consumers),
      consumers: snapshot.consumers,
      isCompact: false,
      metrics: topologyMetrics("auto", false),
      onSelectMessage: vi.fn(),
      onSelectNode: vi.fn(),
      partitions: [0, 1],
      savedScenarioPositions: { "key-router": { x: 111, y: 222 } },
      scenarioTopology,
      selectedMessageId: null,
      selectedNode: null,
      snapshot,
      taskNowMs: Date.parse("2026-07-02T12:00:00.000Z"),
    });

    expect(nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "producer",
        "topic",
        "consumerGroup",
        "scenario-key-router",
      ]),
    );
    expect(
      nodes.find((node) => node.id === "scenario-key-router"),
    ).toMatchObject({
      draggable: true,
      position: { x: 111, y: 222 },
    });
  });

  it("builds ownership and scenario edges with stable test ids", () => {
    const snapshot = runSnapshot({
      consumers: [
        {
          consumerId: "consumer-1",
          status: "running",
          assignments: [{ topic: "topic", partition: 0 }],
          processedCount: 0,
          committedCount: 0,
        },
      ],
    });
    const scenarioTopology = deriveScenarioTopology(snapshot);

    const edges = buildTopologyEdges({
      activeConsumerId: "consumer-1",
      activePartition: 0,
      assignmentByPartition: partitionAssignments(snapshot.consumers),
      consumersLength: snapshot.consumers.length,
      latestMessage: snapshot.recentMessages.at(-1) ?? null,
      partitions: [0, 1],
      scenarioNodeIds: new Set(scenarioTopology.nodes.map((node) => node.id)),
      scenarioTopologyEdges: scenarioTopology.edges,
    });

    expect(edges.map((edge) => edge.id)).toEqual(
      expect.arrayContaining([
        "edge-producer-topic",
        "edge-partition-0-owner",
        "scenario-edge-producer-to-key-router",
      ]),
    );
    expect(
      edges.find((edge) => edge.id === "edge-partition-0-owner")?.domAttributes,
    ).toMatchObject({ "data-testid": "topology-edge-partition-0" });
  });

  it("ignores invalid saved scenario positions", () => {
    expect(parseSavedScenarioPositions("not json")).toEqual({});
    expect(
      parseSavedScenarioPositions(
        JSON.stringify({
          good: { x: 1, y: 2 },
          bad: { x: Number.NaN, y: 2 },
          alsoBad: ["x", "y"],
        }),
      ),
    ).toEqual({ good: { x: 1, y: 2 } });
  });
});
