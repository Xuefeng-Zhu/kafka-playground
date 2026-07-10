import { describe, expect, it, vi } from "vitest";
import {
  getScenarioExploreTopologyDefinition,
  SCENARIO_EXPLORE_COLUMN_GAP,
  SCENARIO_EXPLORE_NODE_WIDTH,
  type ScenarioExploreTopologyProjection,
} from "@/lib/client/scenario-experience/explore-topology";
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

  it("omits scenario-derived nodes and edges for observed-only remote views", () => {
    const snapshot = runSnapshot();
    const common = {
      activeConsumerId: null,
      activePartition: null,
      assignmentByPartition: partitionAssignments(snapshot.consumers),
      consumers: snapshot.consumers,
      isCompact: false,
      metrics: topologyMetrics("auto", false),
      onSelectMessage: vi.fn(),
      onSelectNode: vi.fn(),
      partitions: [0, 1],
      scenarioVisualization: deriveScenarioVisualization(snapshot),
      selectedMessageId: null,
      selectedNode: null,
      snapshot,
      taskNowMs: Date.parse("2026-07-02T12:00:00.000Z"),
    };

    expect(
      buildTopologyNodes({ ...common, showScenarioVisual: false }).map(
        (node) => node.id,
      ),
    ).toEqual(["producer", "topic", "consumerGroup"]);
    expect(
      buildTopologyEdges({
        activeConsumerId: null,
        activePartition: null,
        assignmentByPartition: common.assignmentByPartition,
        consumersLength: 0,
        latestMessage: null,
        partitions: common.partitions,
        showScenarioVisual: false,
      }).some((edge) => edge.id === "edge-topic-scenario-visual"),
    ).toBe(false);
  });

  it("projects ranked scenario nodes beside the preserved core node components", () => {
    const snapshot = runSnapshot();
    const scenarioTopology = scenarioProjection();

    const nodes = buildTopologyNodes({
      activeConsumerId: null,
      activePartition: null,
      assignmentByPartition: partitionAssignments(snapshot.consumers),
      consumers: snapshot.consumers,
      isCompact: false,
      metrics: topologyMetrics("auto", false),
      onSelectMessage: vi.fn(),
      onSelectNode: vi.fn(),
      partitions: [0, 1],
      scenarioTopology,
      scenarioVisualization: deriveScenarioVisualization(snapshot),
      showScenarioVisual: false,
      selectedMessageId: null,
      selectedNode: { type: "scenarioNode", nodeId: "key-router" },
      snapshot,
      taskNowMs: Date.parse("2026-07-02T12:00:00.000Z"),
    });

    expect(nodes.map((node) => node.id)).toEqual([
      "producer",
      "topic",
      "consumerGroup",
      "scenario-key-router",
      "scenario-replay-loop",
    ]);
    expect(nodes.find((node) => node.id === "producer")).toMatchObject({
      position: { x: 0, y: 0 },
      style: { width: SCENARIO_EXPLORE_NODE_WIDTH },
      type: "producer",
    });
    expect(
      nodes.find((node) => node.id === "scenario-key-router"),
    ).toMatchObject({
      data: {
        entityId: "key-router",
        provenance: "derived",
        selected: true,
        title: "Key router",
        visualKind: "route",
      },
      draggable: false,
      position: {
        x: SCENARIO_EXPLORE_NODE_WIDTH + SCENARIO_EXPLORE_COLUMN_GAP,
        y: 0,
      },
      type: "scenarioExplore",
    });
    expect(nodes.some((node) => node.id === "scenarioVisual")).toBe(false);
  });

  it("replaces the baseline route with labeled causal edges and keeps ownership secondary", () => {
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
      latestMessage: null,
      partitions: [0, 1],
      scenarioTopology: scenarioProjection(),
      showScenarioVisual: false,
    });

    expect(edges.some((edge) => edge.id === "edge-producer-topic")).toBe(false);
    expect(
      edges.find((edge) => edge.id === "scenario-edge-producer-router"),
    ).toMatchObject({
      data: {
        active: true,
        kind: "data",
        label: "record and key",
        provenance: "simulated",
      },
      domAttributes: {
        "aria-label": "record and key. data edge, simulated evidence.",
        "data-edge-kind": "data",
        "data-provenance": "simulated",
        "data-testid": "topology-edge-scenario-producer-router",
      },
      source: "producer",
      sourceHandle: "producer-out",
      target: "scenario-key-router",
      targetHandle: "scenario-in",
      type: "scenarioCausal",
    });
    expect(
      edges.find((edge) => edge.id === "scenario-edge-replay-group"),
    ).toMatchObject({
      data: { kind: "feedback" },
      source: "scenario-replay-loop",
      sourceHandle: "scenario-feedback-out",
      target: "consumerGroup",
      targetHandle: "empty-in",
    });
    expect(
      edges.find((edge) => edge.id === "edge-partition-0-owner"),
    ).toMatchObject({
      source: "topic",
      target: "consumerGroup",
      type: "smoothstep",
    });
  });

  it("does not duplicate a projected direct producer-to-topic route", () => {
    const projection = scenarioProjection();
    const directProjection: ScenarioExploreTopologyProjection = {
      ...projection,
      edges: [
        {
          id: "producer-topic",
          source: "producer",
          target: "topic",
          label: "append",
          kind: "data",
          provenance: "simulated",
          scope: "current",
          active: false,
        },
      ],
      replacesCoreProducerTopicEdge: false,
    };

    const edges = buildTopologyEdges({
      activeConsumerId: null,
      activePartition: null,
      assignmentByPartition: new Map(),
      consumersLength: 0,
      latestMessage: null,
      partitions: [0, 1],
      scenarioTopology: directProjection,
      showScenarioVisual: false,
    });

    expect(edges.some((edge) => edge.id === "edge-producer-topic")).toBe(false);
    expect(
      edges
        .filter((edge) => edge.source === "producer" && edge.target === "topic")
        .map((edge) => edge.id),
    ).toEqual(["scenario-edge-producer-topic"]);
  });

  it("renders a provenance-labelled core route without an empty ownership bypass", () => {
    const projection = scenarioProjection();
    const cooperativeProjection: ScenarioExploreTopologyProjection = {
      ...projection,
      coreProducerTopicRoute: {
        id: "core-producer-topic",
        source: "producer",
        target: "topic",
        label: "Routes records to the topic",
        kind: "data",
        provenance: "simulated",
        scope: "current",
        active: false,
      },
      replacesCoreProducerTopicEdge: false,
    };

    const edges = buildTopologyEdges({
      activeConsumerId: null,
      activePartition: null,
      assignmentByPartition: new Map(),
      consumersLength: 0,
      latestMessage: null,
      partitions: [0, 1],
      scenarioTopology: cooperativeProjection,
      showScenarioVisual: false,
    });

    expect(edges).toContainEqual(
      expect.objectContaining({
        id: "core-edge-producer-topic",
        data: expect.objectContaining({ provenance: "simulated" }),
        type: "scenarioCausal",
      }),
    );
    expect(edges.some((edge) => edge.id === "edge-empty-ownership")).toBe(
      false,
    );
  });

  it("does not fabricate a generic producer when the causal pipeline omits it", () => {
    const snapshot = runSnapshot();
    const projection = scenarioProjection();
    const pipelineProjection: ScenarioExploreTopologyProjection = {
      ...projection,
      nodes: projection.nodes.filter((node) => node.id !== "producer"),
      coreNodeIds: new Set(["topic", "consumerGroup"]),
      coreProducerTopicRoute: null,
    };

    const nodes = buildTopologyNodes({
      activeConsumerId: null,
      activePartition: null,
      assignmentByPartition: new Map(),
      consumers: [],
      isCompact: false,
      metrics: topologyMetrics("auto", false),
      onSelectMessage: vi.fn(),
      onSelectNode: vi.fn(),
      partitions: [0, 1],
      scenarioTopology: pipelineProjection,
      scenarioVisualization: deriveScenarioVisualization(snapshot),
      showScenarioVisual: false,
      selectedMessageId: null,
      selectedNode: null,
      snapshot,
      taskNowMs: Date.parse("2026-07-02T12:00:00.000Z"),
    });

    expect(nodes.some((node) => node.id === "producer")).toBe(false);
    expect(nodes.some((node) => node.id === "topic")).toBe(true);
  });

  it("routes same-rank scenario branches through vertical handles", () => {
    const projection = scenarioProjection();
    const upper = projection.nodes.find((node) => node.id === "key-router")!;
    const lower = {
      ...upper,
      id: "tombstone-marker",
      entityId: "tombstone-marker",
      focus: { kind: "entity" as const, id: "tombstone-marker" },
      lane: 1,
      position: { x: upper.position.x, y: 240 },
      title: "Tombstone lifecycle",
    };
    const verticalProjection: ScenarioExploreTopologyProjection = {
      ...projection,
      nodes: [...projection.nodes, lower],
      edges: [
        {
          id: "tombstone-state",
          source: lower.id,
          target: upper.id,
          label: "remove after cleanup",
          kind: "control",
          provenance: "simulated",
          scope: "current",
          active: true,
        },
      ],
      scenarioNodeIds: new Set([...projection.scenarioNodeIds, lower.id]),
    };

    const edges = buildTopologyEdges({
      activeConsumerId: null,
      activePartition: null,
      assignmentByPartition: new Map(),
      consumersLength: 0,
      latestMessage: null,
      partitions: [0, 1],
      scenarioTopology: verticalProjection,
      showScenarioVisual: false,
    });

    expect(
      edges.find((edge) => edge.id === "scenario-edge-tombstone-state"),
    ).toMatchObject({
      sourceHandle: "scenario-vertical-out",
      targetHandle: "scenario-vertical-in",
    });
  });
});

function scenarioProjection(): ScenarioExploreTopologyProjection {
  return {
    scenarioId: "partitioning",
    definition: getScenarioExploreTopologyDefinition("partitioning"),
    nodes: [
      projectedNode({
        id: "producer",
        nodeKind: "core",
        position: { x: 0, y: 0 },
        title: "Producer boundary",
        visualKind: "producer",
      }),
      projectedNode({
        id: "key-router",
        nodeKind: "scenario",
        position: {
          x: SCENARIO_EXPLORE_NODE_WIDTH + SCENARIO_EXPLORE_COLUMN_GAP,
          y: 0,
        },
        provenance: "derived",
        title: "Key router",
        visualKind: "route",
      }),
      projectedNode({
        id: "topic",
        nodeKind: "core",
        position: {
          x: 2 * (SCENARIO_EXPLORE_NODE_WIDTH + SCENARIO_EXPLORE_COLUMN_GAP),
          y: 0,
        },
        title: "Kafka topic",
        visualKind: "topic",
      }),
      projectedNode({
        id: "consumerGroup",
        nodeKind: "core",
        position: {
          x: 3 * (SCENARIO_EXPLORE_NODE_WIDTH + SCENARIO_EXPLORE_COLUMN_GAP),
          y: 0,
        },
        title: "Consumer group",
        visualKind: "consumer-group",
      }),
      projectedNode({
        id: "replay-loop",
        nodeKind: "scenario",
        position: {
          x: 4 * (SCENARIO_EXPLORE_NODE_WIDTH + SCENARIO_EXPLORE_COLUMN_GAP),
          y: 0,
        },
        title: "Redelivery loop",
        visualKind: "retry",
      }),
    ],
    edges: [
      {
        id: "producer-router",
        source: "producer",
        target: "key-router",
        label: "record and key",
        kind: "data",
        provenance: "simulated",
        scope: "current",
        active: true,
      },
      {
        id: "router-topic",
        source: "key-router",
        target: "topic",
        label: "chosen partition",
        kind: "control",
        provenance: "derived",
        scope: "current",
        active: true,
      },
      {
        id: "replay-group",
        source: "replay-loop",
        target: "consumerGroup",
        label: "same offset",
        kind: "feedback",
        provenance: "simulated",
        scope: "current",
        active: true,
      },
    ],
    scenarioNodeIds: new Set(["key-router", "replay-loop"]),
    coreNodeIds: new Set(["producer", "topic", "consumerGroup"]),
    replacesCoreProducerTopicEdge: true,
    coreProducerTopicRoute: null,
  };
}

function projectedNode({
  id,
  nodeKind,
  position,
  provenance = "simulated",
  title,
  visualKind,
}: {
  id: string;
  nodeKind: "core" | "scenario";
  position: { x: number; y: number };
  provenance?: "observed" | "derived" | "simulated";
  title: string;
  visualKind: ScenarioExploreTopologyProjection["nodes"][number]["visualKind"];
}): ScenarioExploreTopologyProjection["nodes"][number] {
  return {
    id,
    entityId: id,
    nodeKind,
    visualKind,
    title,
    description: `${title} description`,
    provenance,
    focus: { kind: "entity", id },
    rank: Math.round(
      position.x / (SCENARIO_EXPLORE_NODE_WIDTH + SCENARIO_EXPLORE_COLUMN_GAP),
    ),
    lane: 0,
    position,
  };
}
