"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunSnapshot } from "@kplay/contracts";
import {
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  useViewport,
  type Edge,
  type Node,
} from "@xyflow/react";
import { Maximize2, Minus, Network, Plus } from "lucide-react";
import {
  deriveScenarioTopology,
  type ScenarioTopologyEdge,
} from "@/lib/client/scenario-topology";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { partitionAssignments, toneForPartition } from "./topology-cards";
import {
  topologyNodeTypes,
  type ConsumerGroupNodeData,
  type ProducerNodeData,
  type ScenarioNodeData,
  type TopicNodeData,
} from "./topology-flow-nodes";
import {
  scenarioFlowNodeId,
  scenarioToneColor,
  topologyEndpointId,
  topologyMetrics,
  type TopologyLayout,
} from "./topology-flow-helpers";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.35;
const ZOOM_STEP = 0.15;

type TopologyNode =
  | Node<ProducerNodeData, "producer">
  | Node<TopicNodeData, "topic">
  | Node<ConsumerGroupNodeData, "consumerGroup">
  | Node<ScenarioNodeData, "scenarioNode">;
type TopologyEdge = Edge<Record<string, never>, "smoothstep">;

export function KafkaTopology({
  snapshot,
  selectedMessageId,
  selectedNode,
  onSelectMessage,
  onSelectNode,
}: {
  snapshot: RunSnapshot;
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  onSelectMessage: (messageId: string) => void;
  onSelectNode: (selection: TopologySelection) => void;
}) {
  return (
    <ReactFlowProvider>
      <KafkaTopologyFlow
        snapshot={snapshot}
        selectedMessageId={selectedMessageId}
        selectedNode={selectedNode}
        onSelectMessage={onSelectMessage}
        onSelectNode={onSelectNode}
      />
    </ReactFlowProvider>
  );
}

function KafkaTopologyFlow({
  snapshot,
  selectedMessageId,
  selectedNode,
  onSelectMessage,
  onSelectNode,
}: {
  snapshot: RunSnapshot;
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  onSelectMessage: (messageId: string) => void;
  onSelectNode: (selection: TopologySelection) => void;
}) {
  const partitions = Array.from(
    { length: snapshot.partitionCount },
    (_, partition) => partition,
  );
  const consumers = snapshot.consumers;
  const assignmentByPartition = useMemo(
    () => partitionAssignments(consumers),
    [consumers],
  );
  const latestMessage = snapshot.recentMessages.at(-1) ?? null;
  const activePartition =
    typeof latestMessage?.partition === "number"
      ? latestMessage.partition
      : null;
  const activeConsumerId =
    activePartition === null
      ? null
      : (latestMessage?.assignedConsumerId ??
        assignmentByPartition.get(activePartition)?.consumerId ??
        null);
  const [layout, setLayout] = useState<TopologyLayout>("auto");
  const hasMountedRef = useRef(false);
  const topologyCanvasRef = useRef<HTMLDivElement | null>(null);
  const isCompact = useCompactTopology();
  const flow = useReactFlow<TopologyNode, TopologyEdge>();
  const updateNodeInternals = useUpdateNodeInternals();
  const viewport = useViewport();
  const zoom = clampZoom(viewport.zoom);
  const zoomPercent = Math.round(zoom * 100);
  const metrics = useMemo(
    () => topologyMetrics(layout, isCompact),
    [isCompact, layout],
  );
  const scenarioTopology = useMemo(
    () => deriveScenarioTopology(snapshot),
    [snapshot],
  );
  const scenarioTopologyMembership = scenarioTopology.nodes
    .map((node) => node.id)
    .join(",");
  const scenarioNodeIds = useMemo(
    () => new Set(scenarioTopology.nodes.map((node) => node.id)),
    [scenarioTopology.nodes],
  );
  const fitNodeIds = useMemo(
    () => [
      "producer",
      "topic",
      "consumerGroup",
      ...scenarioTopologyMembership
        .split(",")
        .filter(Boolean)
        .map((id) => scenarioFlowNodeId(id)),
    ],
    [scenarioTopologyMembership],
  );
  const fitViewNodeOptions = useMemo(
    () => fitNodeIds.map((id) => ({ id })),
    [fitNodeIds],
  );
  const flowKey = useMemo(
    () =>
      [
        snapshot.runId,
        snapshot.partitionCount,
        consumers.map((consumer) => consumer.consumerId).join(","),
        layout,
        isCompact ? "compact" : "wide",
        scenarioTopologyMembership,
      ].join(":"),
    [
      consumers,
      isCompact,
      layout,
      scenarioTopologyMembership,
      snapshot.partitionCount,
      snapshot.runId,
    ],
  );
  const setViewportHome = useCallback(() => {
    void flow.fitView({
      duration: 120,
      maxZoom: 1,
      minZoom: MIN_ZOOM,
      nodes: fitViewNodeOptions,
      padding: { x: 32, y: 28 },
    });
  }, [fitViewNodeOptions, flow]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setViewportHome();
  }, [isCompact, layout, setViewportHome]);

  useEffect(() => {
    let secondFrame = 0;
    const refreshNodeInternals = () => {
      fitNodeIds.forEach((id) => updateNodeInternals(id));
    };
    const firstFrame = requestAnimationFrame(() => {
      refreshNodeInternals();
      secondFrame = requestAnimationFrame(refreshNodeInternals);
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [
    consumers.length,
    fitNodeIds,
    isCompact,
    layout,
    partitions.length,
    snapshot.sequence,
    updateNodeInternals,
  ]);

  const updateZoom = useCallback(
    (nextZoom: number | ((current: number) => number)) => {
      const current = clampZoom(flow.getZoom());
      const next = clampZoom(
        typeof nextZoom === "function" ? nextZoom(current) : nextZoom,
      );
      void flow.zoomTo(next);
    },
    [flow],
  );

  const handleWheelZoom = useCallback(
    (event: WheelEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("button,a,input,select")
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      updateZoom(
        (current) => current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
      );
    },
    [updateZoom],
  );

  useEffect(() => {
    const canvas = topologyCanvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheelZoom, {
      capture: true,
      passive: false,
    });
    return () => {
      canvas.removeEventListener("wheel", handleWheelZoom, { capture: true });
    };
  }, [handleWheelZoom]);

  const toggleLayout = useCallback(() => {
    setLayout((current) => (current === "auto" ? "spread" : "auto"));
  }, []);

  const nodes = useMemo<TopologyNode[]>(() => {
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
        },
        style: { width: metrics.consumerGroupWidth },
      },
    ];

    const overlayNodes: TopologyNode[] = scenarioTopology.nodes.map(
      (model) => ({
        id: scenarioFlowNodeId(model.id),
        type: "scenarioNode",
        position: isCompact ? model.compactPosition : model.position,
        draggable: false,
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
      }),
    );

    return [...coreNodes, ...overlayNodes];
  }, [
    activeConsumerId,
    activePartition,
    assignmentByPartition,
    consumers,
    isCompact,
    metrics,
    onSelectMessage,
    onSelectNode,
    partitions,
    scenarioTopology.nodes,
    selectedMessageId,
    selectedNode,
    snapshot,
  ]);

  const edges = useMemo<TopologyEdge[]>(() => {
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

    if (consumers.length === 0) {
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
    scenarioTopology.edges.forEach((scenarioEdge) => {
      nextEdges.push(toReactFlowScenarioEdge(scenarioEdge, scenarioNodeIds));
    });
    return nextEdges;
  }, [
    activeConsumerId,
    activePartition,
    assignmentByPartition,
    consumers.length,
    latestMessage,
    partitions,
    scenarioNodeIds,
    scenarioTopology.edges,
  ]);

  return (
    <div
      ref={topologyCanvasRef}
      className="kplay-grid-bg relative min-h-[620px] overflow-hidden lg:h-full lg:min-h-0"
      data-testid="topology-canvas"
    >
      <div className="absolute left-4 right-4 top-5 z-20 flex flex-wrap items-center justify-end gap-3 lg:left-6 lg:right-6">
        <div className="flex items-center gap-2 lg:gap-3">
          <button
            className="inline-flex h-8 items-center gap-2 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-3 text-xs font-extrabold text-teal-800 shadow-[4px_4px_0_rgba(15,118,110,0.16)]"
            onClick={toggleLayout}
            aria-pressed={layout === "spread"}
          >
            <Network size={15} aria-hidden />{" "}
            {layout === "auto" ? "Auto layout" : "Spread layout"}
          </button>
          <div className="flex h-8 overflow-hidden rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-xs font-extrabold text-teal-800 shadow-[4px_4px_0_rgba(15,118,110,0.16)]">
            <button
              className="grid w-10 place-items-center border-r-2 border-teal-700 disabled:opacity-45"
              onClick={() => updateZoom((current) => current - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              <Minus size={15} aria-hidden />
            </button>
            <div className="grid w-16 place-items-center" aria-live="polite">
              {zoomPercent}%
            </div>
            <button
              className="grid w-10 place-items-center border-l-2 border-teal-700 disabled:opacity-45"
              onClick={() => updateZoom((current) => current + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <Plus size={15} aria-hidden />
            </button>
          </div>
          <button
            className="grid size-8 place-items-center rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-teal-800 shadow-[4px_4px_0_rgba(15,118,110,0.16)]"
            onClick={setViewportHome}
            aria-label="Fit view"
          >
            <Maximize2 size={15} aria-hidden />
          </button>
        </div>
      </div>

      <div className="absolute inset-0" data-testid="topology-canvas-content">
        <ReactFlow<TopologyNode, TopologyEdge>
          key={flowKey}
          nodes={nodes}
          edges={edges}
          nodeTypes={topologyNodeTypes}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling
          fitView
          fitViewOptions={{
            maxZoom: 1,
            minZoom: MIN_ZOOM,
            nodes: fitViewNodeOptions,
            padding: { x: 32, y: 28 },
          }}
          onError={handleReactFlowError}
          noDragClassName="nodrag"
          noPanClassName="nopan"
          className="kplay-topology-flow"
          data-testid="topology-flow"
        />
      </div>
    </div>
  );
}

function clampZoom(nextZoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
}

function edgeTestId(value: string): TopologyEdge["domAttributes"] {
  return { "data-testid": value } as TopologyEdge["domAttributes"];
}

function handleReactFlowError(code: string, message: string) {
  if (code === "013") return;
  console.warn(`[React Flow ${code}] ${message}`);
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

function useCompactTopology() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return compact;
}
