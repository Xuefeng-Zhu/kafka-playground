import type { RunSnapshot } from "@kplay/contracts";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type {
  ScenarioTopologyEdge,
  ScenarioTopologyModel,
} from "@/lib/client/scenario-topology";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { toneForPartition } from "./topology-cards";
import type {
  ConsumerGroupNodeData,
  ProducerNodeData,
  ScenarioNodeData,
  TopicNodeData,
} from "./topology-flow-nodes";
import {
  scenarioFlowNodeId,
  scenarioToneColor,
  topologyEndpointId,
  type TopologyLayoutMetrics,
} from "./topology-flow-helpers";

export type TopologyNode =
  | Node<ProducerNodeData, "producer">
  | Node<TopicNodeData, "topic">
  | Node<ConsumerGroupNodeData, "consumerGroup">
  | Node<ScenarioNodeData, "scenarioNode">;
export type TopologyEdge = Edge<Record<string, never>, "smoothstep">;
export type Position = { x: number; y: number };
export type SavedScenarioPositions = Record<string, Position>;

export function buildTopologyNodes({
  activeConsumerId,
  activePartition,
  assignmentByPartition,
  consumers,
  isCompact,
  metrics,
  onSelectMessage,
  onSelectNode,
  partitions,
  savedScenarioPositions,
  scenarioTopology,
  selectedMessageId,
  selectedNode,
  snapshot,
  taskNowMs,
}: {
  activeConsumerId: string | null;
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  consumers: RunSnapshot["consumers"];
  isCompact: boolean;
  metrics: TopologyLayoutMetrics;
  onSelectMessage: (messageId: string) => void;
  onSelectNode: (selection: TopologySelection) => void;
  partitions: number[];
  savedScenarioPositions: SavedScenarioPositions;
  scenarioTopology: ScenarioTopologyModel;
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  snapshot: RunSnapshot;
  taskNowMs: number;
}): TopologyNode[] {
  const coreNodes: TopologyNode[] = [
    {
      id: "producer",
      type: "producer",
      position: metrics.producer,
      draggable: false,
      selectable: false,
      data: {
        status: snapshot.producerStatus,
        selected: selectedNode?.type === "producer",
        onSelectMessage,
        onSelectNode,
      },
      style: { width: metrics.producerWidth },
    },
    {
      id: "topic",
      type: "topic",
      position: metrics.topic,
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
      },
      style: { width: metrics.topicWidth },
    },
    {
      id: "consumerGroup",
      type: "consumerGroup",
      position: metrics.consumerGroup,
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
      style: { width: metrics.consumerGroupWidth },
    },
  ];

  const overlayNodes: TopologyNode[] = scenarioTopology.nodes.map((model) => ({
    id: scenarioFlowNodeId(model.id),
    type: "scenarioNode",
    position: isCompact
      ? model.compactPosition
      : (savedScenarioPositions[model.id] ?? model.position),
    draggable: !isCompact,
    selectable: false,
    data: {
      model,
      selected:
        selectedNode?.type === "scenarioNode" &&
        selectedNode.nodeId === model.id,
      onSelectMessage,
      onSelectNode,
    },
    style: { width: isCompact ? 180 : 190 },
  }));

  return [...coreNodes, ...overlayNodes];
}

export function buildTopologyEdges({
  activeConsumerId,
  activePartition,
  assignmentByPartition,
  consumersLength,
  latestMessage,
  partitions,
  scenarioNodeIds,
  scenarioTopologyEdges,
}: {
  activeConsumerId: string | null;
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  consumersLength: number;
  latestMessage: RunSnapshot["recentMessages"][number] | null;
  partitions: number[];
  scenarioNodeIds: Set<string>;
  scenarioTopologyEdges: ScenarioTopologyEdge[];
}): TopologyEdge[] {
  const nextEdges: TopologyEdge[] = [
    {
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
    },
  ];

  if (consumersLength === 0) {
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

  scenarioTopologyEdges.forEach((scenarioEdge) => {
    nextEdges.push(toReactFlowScenarioEdge(scenarioEdge, scenarioNodeIds));
  });
  return nextEdges;
}

export function parseSavedScenarioPositions(
  value: string | null,
): SavedScenarioPositions {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, Position] => {
        const [, position] = entry;
        return (
          !!position &&
          typeof position === "object" &&
          !Array.isArray(position) &&
          Number.isFinite((position as Position).x) &&
          Number.isFinite((position as Position).y)
        );
      }),
    );
  } catch {
    return {};
  }
}

function edgeTestId(value: string): TopologyEdge["domAttributes"] {
  return { "data-testid": value } as TopologyEdge["domAttributes"];
}

function toReactFlowScenarioEdge(
  edge: ScenarioTopologyEdge,
  scenarioNodeIds: Set<string>,
): TopologyEdge {
  const color = scenarioToneColor[edge.tone];
  return {
    id: `scenario-edge-${edge.id}`,
    type: "smoothstep",
    source: topologyEndpointId(edge.source, scenarioNodeIds),
    sourceHandle: edge.sourceHandle,
    target: topologyEndpointId(edge.target, scenarioNodeIds),
    targetHandle: edge.targetHandle,
    markerEnd: { type: MarkerType.ArrowClosed, color },
    className: edge.active ? "kplay-flow-line" : undefined,
    style: {
      opacity: edge.active ? 0.95 : 0.62,
      stroke: color,
      strokeDasharray: edge.dashed ? "6 7" : undefined,
      strokeWidth: edge.active ? 2.2 : 1.7,
    },
    domAttributes: edgeTestId(`topology-scenario-edge-${edge.id}`),
  };
}
