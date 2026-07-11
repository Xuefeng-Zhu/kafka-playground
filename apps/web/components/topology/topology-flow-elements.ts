import type { RunSnapshot } from "@kplay/contracts";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import {
  SCENARIO_EXPLORE_NODE_HEIGHT,
  SCENARIO_EXPLORE_NODE_WIDTH,
  type ScenarioExploreTopologyProjection,
} from "@/lib/client/scenario-experience/explore-topology";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { topologyProvenance } from "@/lib/client/topology-provenance";
import {
  scenarioCausalEdgeColor,
  type ScenarioCausalFlowEdge,
} from "./scenario-topology-edge";
import { toneForPartition } from "./topology-cards";
import type {
  ConsumerGroupNodeData,
  ProducerNodeData,
  ScenarioExploreNodeData,
  TopicNodeData,
} from "./topology-flow-nodes";
import {
  scenarioFlowNodeId,
  topologyEndpointId,
  type TopologyLayoutMetrics,
} from "./topology-flow-helpers";

export type TopologyNode =
  | Node<ProducerNodeData, "producer">
  | Node<TopicNodeData, "topic">
  | Node<ConsumerGroupNodeData, "consumerGroup">
  | Node<ScenarioExploreNodeData, "scenarioExplore">;

type CoreTopologyEdge = Edge<Record<string, never>, "smoothstep">;
export type TopologyEdge = CoreTopologyEdge | ScenarioCausalFlowEdge;

export function buildTopologyNodes({
  activeConsumerId,
  activePartition,
  assignmentByPartition,
  consumers,
  metrics,
  onSelectMessage,
  onSelectNode,
  partitions,
  scenarioTopology = null,
  selectedMessageId,
  selectedNode,
  snapshot,
  taskNowMs,
}: {
  activeConsumerId: string | null;
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  consumers: RunSnapshot["consumers"];
  metrics: TopologyLayoutMetrics;
  onSelectMessage: (messageId: string) => void;
  onSelectNode: (selection: TopologySelection) => void;
  partitions: number[];
  scenarioTopology?: ScenarioExploreTopologyProjection | null;
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  snapshot: RunSnapshot;
  taskNowMs: number;
}): TopologyNode[] {
  const coreNodes: TopologyNode[] = [
    {
      id: "producer",
      type: "producer",
      position: corePosition(scenarioTopology, "producer", metrics.producer),
      draggable: false,
      selectable: false,
      data: {
        status: snapshot.producerStatus,
        selected: selectedNode?.type === "producer",
        onSelectMessage,
        onSelectNode,
      },
      style: {
        width: scenarioTopology
          ? SCENARIO_EXPLORE_NODE_WIDTH
          : metrics.producerWidth,
      },
    },
    {
      id: "topic",
      type: "topic",
      position: corePosition(scenarioTopology, "topic", metrics.topic),
      draggable: false,
      selectable: false,
      data: {
        activePartition,
        assignmentByPartition,
        messageCounts: snapshot.messageCounts,
        onSelectMessage,
        onSelectNode,
        partitions,
        recentMessages: snapshot.recentMessages,
        selectedMessageId,
        selectedNode,
        snapshot,
        provenance: topologyProvenance(snapshot),
      },
      style: {
        width: scenarioTopology
          ? SCENARIO_EXPLORE_NODE_WIDTH
          : metrics.topicWidth,
      },
    },
    {
      id: "consumerGroup",
      type: "consumerGroup",
      position: corePosition(
        scenarioTopology,
        "consumerGroup",
        metrics.consumerGroup,
      ),
      draggable: false,
      selectable: false,
      data: {
        activeConsumerId,
        consumers,
        onSelectMessage,
        onSelectNode,
        partitions,
        selectedNode,
        snapshot,
        taskNowMs,
      },
      style: {
        width: scenarioTopology
          ? SCENARIO_EXPLORE_NODE_WIDTH
          : metrics.consumerGroupWidth,
      },
    },
  ].filter(
    (node) =>
      scenarioTopology === null || scenarioTopology.coreNodeIds.has(node.id),
  ) as TopologyNode[];

  const scenarioNodes: TopologyNode[] = (scenarioTopology?.nodes ?? [])
    .filter((node) => node.nodeKind === "scenario")
    .map((node) => ({
      id: scenarioFlowNodeId(node.id),
      type: "scenarioExplore" as const,
      position: node.position,
      draggable: false,
      selectable: false,
      data: {
        description: node.description,
        entityId: node.entityId,
        nodeId: node.id,
        onSelectNode,
        provenance: node.provenance,
        selected:
          selectedNode?.type === "scenarioNode" &&
          (selectedNode.nodeId === node.id ||
            selectedNode.nodeId === node.entityId),
        title: node.title,
        visualKind: node.visualKind,
        ...(node.metric ? { metric: node.metric } : {}),
        ...(node.state ? { state: node.state } : {}),
      },
      style: {
        height: SCENARIO_EXPLORE_NODE_HEIGHT,
        width: SCENARIO_EXPLORE_NODE_WIDTH,
      },
    }));

  return [...coreNodes, ...scenarioNodes];
}

export function buildTopologyEdges({
  activeConsumerId,
  activePartition,
  assignmentByPartition,
  consumersLength,
  latestMessage,
  partitions,
  scenarioTopology = null,
}: {
  activeConsumerId: string | null;
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  consumersLength: number;
  latestMessage: RunSnapshot["recentMessages"][number] | null;
  partitions: number[];
  scenarioTopology?: ScenarioExploreTopologyProjection | null;
}): TopologyEdge[] {
  const nextEdges: TopologyEdge[] = [];
  if (scenarioTopology === null) {
    nextEdges.push({
      id: "edge-producer-topic",
      type: "smoothstep",
      source: "producer",
      sourceHandle: "producer-out",
      target: "topic",
      targetHandle: "topic-in",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#0f766e" },
      className: latestMessage ? "kplay-flow-line" : undefined,
      style: {
        opacity: latestMessage ? 1 : 0.72,
        stroke: "#0f766e",
        strokeWidth: 2,
      },
      domAttributes: edgeTestId("topology-edge-producer-topic"),
    });
  } else if (scenarioTopology.coreProducerTopicRoute) {
    const route = scenarioTopology.coreProducerTopicRoute;
    nextEdges.push({
      id: "core-edge-producer-topic",
      type: "scenarioCausal",
      source: route.source,
      sourceHandle: "producer-out",
      target: route.target,
      targetHandle: "topic-in",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: scenarioCausalEdgeColor(route.kind),
      },
      data: {
        active: route.active,
        kind: route.kind,
        label: route.label,
        provenance: route.provenance,
      },
      domAttributes: {
        "aria-label": `${route.label}. Runtime ${route.kind} edge, ${route.provenance} state.`,
        "data-edge-kind": route.kind,
        "data-provenance": route.provenance,
        "data-testid": "topology-edge-core-producer-topic",
      } as TopologyEdge["domAttributes"],
    });
  }

  if (consumersLength === 0 && scenarioTopology === null) {
    nextEdges.push({
      id: "edge-empty-ownership",
      type: "smoothstep",
      source: "topic",
      sourceHandle: "topic-empty-out",
      target: "consumerGroup",
      targetHandle: "empty-in",
      style: {
        opacity: 0.75,
        stroke: "#94a3b8",
        strokeDasharray: "5 6",
        strokeWidth: 1.8,
      },
      domAttributes: edgeTestId("topology-edge-empty-ownership"),
    });
  } else {
    partitions.forEach((partition) => {
      const assignment = assignmentByPartition.get(partition);
      if (!assignment) return;
      const tone = toneForPartition(partition);
      const isActive =
        activePartition === partition ||
        activeConsumerId === assignment.consumerId;
      nextEdges.push({
        id: `edge-partition-${partition}-owner`,
        type: "smoothstep",
        source: "topic",
        sourceHandle: `partition-${partition}-out`,
        target: "consumerGroup",
        targetHandle: `partition-${partition}-in`,
        markerEnd: { type: MarkerType.ArrowClosed, color: tone.stroke },
        className: isActive ? "kplay-flow-line" : undefined,
        style: {
          opacity: isActive ? 1 : 0.78,
          stroke: tone.stroke,
          strokeWidth: isActive ? 2.3 : 1.9,
        },
        domAttributes: edgeTestId(`topology-edge-partition-${partition}`),
      });
    });
  }

  if (scenarioTopology) {
    for (const edge of scenarioTopology.edges) {
      const source = topologyEndpointId(
        edge.source,
        scenarioTopology.scenarioNodeIds,
      );
      const target = topologyEndpointId(
        edge.target,
        scenarioTopology.scenarioNodeIds,
      );
      const sourceIsScenario = scenarioTopology.scenarioNodeIds.has(
        edge.source,
      );
      const targetIsScenario = scenarioTopology.scenarioNodeIds.has(
        edge.target,
      );
      const sourceProjectionNode = scenarioTopology.nodes.find(
        (node) => node.id === edge.source,
      );
      const targetProjectionNode = scenarioTopology.nodes.find(
        (node) => node.id === edge.target,
      );
      const verticalScenarioEdge =
        sourceIsScenario &&
        targetIsScenario &&
        sourceProjectionNode?.rank === targetProjectionNode?.rank &&
        sourceProjectionNode?.lane !== targetProjectionNode?.lane;
      const color = scenarioCausalEdgeColor(edge.kind);
      nextEdges.push({
        id: `scenario-edge-${edge.id}`,
        type: "scenarioCausal",
        source,
        sourceHandle: sourceHandleFor(
          edge.kind,
          source,
          sourceIsScenario,
          verticalScenarioEdge,
        ),
        target,
        targetHandle: targetHandleFor(
          edge.kind,
          target,
          targetIsScenario,
          verticalScenarioEdge,
        ),
        markerEnd: { type: MarkerType.ArrowClosed, color },
        className: edge.active ? "kplay-flow-line" : undefined,
        data: {
          active: edge.active,
          kind: edge.kind,
          label: edge.label,
          provenance: edge.provenance,
        },
        domAttributes: scenarioEdgeAttributes(edge),
      });
    }
  }

  return nextEdges;
}

function corePosition(
  topology: ScenarioExploreTopologyProjection | null,
  entityId: "producer" | "topic" | "consumerGroup",
  fallback: { x: number; y: number },
) {
  return (
    topology?.nodes.find((node) => node.entityId === entityId)?.position ??
    fallback
  );
}

function sourceHandleFor(
  kind: ScenarioExploreTopologyProjection["edges"][number]["kind"],
  source: string,
  scenarioNode: boolean,
  verticalScenarioEdge = false,
) {
  if (scenarioNode) {
    if (verticalScenarioEdge) return "scenario-vertical-out";
    return kind === "feedback" ? "scenario-feedback-out" : "scenario-out";
  }
  if (source === "producer") return "producer-out";
  if (source === "topic") return "topic-empty-out";
  if (source === "consumerGroup") return "group-out";
  return undefined;
}

function targetHandleFor(
  kind: ScenarioExploreTopologyProjection["edges"][number]["kind"],
  target: string,
  scenarioNode: boolean,
  verticalScenarioEdge = false,
) {
  if (scenarioNode) {
    if (verticalScenarioEdge) return "scenario-vertical-in";
    return kind === "feedback" ? "scenario-feedback-in" : "scenario-in";
  }
  if (target === "producer") return "producer-in";
  if (target === "topic") return "topic-in";
  if (target === "consumerGroup") return "empty-in";
  return undefined;
}

function edgeTestId(value: string): TopologyEdge["domAttributes"] {
  return { "data-testid": value } as TopologyEdge["domAttributes"];
}

function scenarioEdgeAttributes(
  edge: ScenarioExploreTopologyProjection["edges"][number],
): TopologyEdge["domAttributes"] {
  return {
    "aria-label": `${edge.label}. ${edge.kind} edge, ${edge.provenance} evidence.`,
    "data-edge-kind": edge.kind,
    "data-provenance": edge.provenance,
    "data-testid": `topology-edge-scenario-${edge.id}`,
  } as TopologyEdge["domAttributes"];
}
