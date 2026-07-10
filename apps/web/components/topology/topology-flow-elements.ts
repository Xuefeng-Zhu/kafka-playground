import type { RunSnapshot } from "@kplay/contracts";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { ScenarioVisualization } from "@/lib/client/scenario-visualization";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { toneForPartition } from "./topology-cards";
import type {
  ConsumerGroupNodeData,
  ProducerNodeData,
  ScenarioVisualNodeData,
  TopicNodeData,
} from "./topology-flow-nodes";
import { type TopologyLayoutMetrics } from "./topology-flow-helpers";

export type TopologyNode =
  | Node<ProducerNodeData, "producer">
  | Node<TopicNodeData, "topic">
  | Node<ConsumerGroupNodeData, "consumerGroup">
  | Node<ScenarioVisualNodeData, "scenarioVisual">;
export type TopologyEdge = Edge<Record<string, never>, "smoothstep">;

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
  scenarioVisualization,
  showScenarioVisual = true,
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
  scenarioVisualization: ScenarioVisualization;
  showScenarioVisual?: boolean;
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

  const visualNode: TopologyNode = {
    id: "scenarioVisual",
    type: "scenarioVisual",
    position: scenarioVisualPosition(metrics, isCompact),
    draggable: false,
    selectable: false,
    data: {
      visualization: scenarioVisualization,
      selectedNode,
      onSelectMessage,
      onSelectNode,
    },
    style: { width: isCompact ? 332 : 660 },
  };

  return showScenarioVisual ? [...coreNodes, visualNode] : coreNodes;
}

export function buildTopologyEdges({
  activeConsumerId,
  activePartition,
  assignmentByPartition,
  consumersLength,
  latestMessage,
  partitions,
  showScenarioVisual = true,
}: {
  activeConsumerId: string | null;
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  consumersLength: number;
  latestMessage: RunSnapshot["recentMessages"][number] | null;
  partitions: number[];
  showScenarioVisual?: boolean;
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

  if (showScenarioVisual) {
    nextEdges.push({
      id: "edge-topic-scenario-visual",
      type: "smoothstep",
      source: "topic",
      sourceHandle: "topic-empty-out",
      target: "scenarioVisual",
      targetHandle: "visual-in",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#0f766e" },
      className: latestMessage ? "kplay-flow-line" : undefined,
      style: {
        opacity: latestMessage ? 0.95 : 0.68,
        stroke: "#0f766e",
        strokeDasharray: "6 7",
        strokeWidth: latestMessage ? 2.1 : 1.7,
      },
      domAttributes: edgeTestId("topology-edge-topic-scenario-visual"),
    });
  }
  return nextEdges;
}

function scenarioVisualPosition(
  metrics: TopologyLayoutMetrics,
  isCompact: boolean,
) {
  if (isCompact) return { x: 390, y: 112 };
  return {
    x: metrics.consumerGroup.x + metrics.consumerGroupWidth + 56,
    y: 72,
  };
}

function edgeTestId(value: string): TopologyEdge["domAttributes"] {
  return { "data-testid": value } as TopologyEdge["domAttributes"];
}
