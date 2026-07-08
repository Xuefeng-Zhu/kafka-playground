import { describe, expect, it, vi } from "vitest";
import { deriveScenarioVisualization } from "@/lib/client/scenario-visualization";
import { runSnapshot } from "@/lib/client/run-snapshot-test-fixtures";
import { partitionAssignments } from "./topology-cards";
import {
  buildTopologyEdges,
  buildTopologyNodes,
} from "./topology-flow-elements";
import { topologyMetrics } from "./topology-flow-helpers";

describe("topology flow elements", () => {
  it("builds core nodes plus the custom scenario visual node", () => {
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
    const scenarioVisualization = deriveScenarioVisualization(snapshot);

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
      scenarioVisualization,
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
        "scenarioVisual",
      ]),
    );
    expect(nodes.find((node) => node.id === "scenarioVisual")).toMatchObject({
      draggable: false,
      type: "scenarioVisual",
    });
  });

  it("builds ownership and custom visual edges with stable test ids", () => {
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

    const edges = buildTopologyEdges({
      activeConsumerId: "consumer-1",
      activePartition: 0,
      assignmentByPartition: partitionAssignments(snapshot.consumers),
      consumersLength: snapshot.consumers.length,
      latestMessage: snapshot.recentMessages.at(-1) ?? null,
      partitions: [0, 1],
    });

    expect(edges.map((edge) => edge.id)).toEqual(
      expect.arrayContaining([
        "edge-producer-topic",
        "edge-partition-0-owner",
        "edge-topic-scenario-visual",
      ]),
    );
    expect(
      edges.find((edge) => edge.id === "edge-partition-0-owner")?.domAttributes,
    ).toMatchObject({ "data-testid": "topology-edge-partition-0" });
    expect(
      edges.find((edge) => edge.id === "edge-topic-scenario-visual")
        ?.domAttributes,
    ).toMatchObject({ "data-testid": "topology-edge-topic-scenario-visual" });
  });
});
