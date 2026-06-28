"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import type {
  ConsumerSnapshot,
  PlaygroundMessage,
  RunSnapshot,
} from "@kplay/contracts";
import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  useViewport,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock3,
  Database,
  Flame,
  Gauge,
  GitBranch,
  Layers3,
  Link2,
  LockKeyhole,
  Maximize2,
  Minus,
  Network,
  Plus,
  Repeat2,
  Route,
  Rows3,
  ShieldCheck,
  Shuffle,
  Split,
  type LucideIcon,
} from "lucide-react";
import {
  deriveScenarioTopology,
  type ScenarioTopologyEdge,
  type ScenarioTopologyIcon,
  type ScenarioTopologyNode as ScenarioTopologyNodeModel,
  type ScenarioTopologyTone,
} from "@/lib/client/scenario-topology";
import type { TopologySelection } from "@/lib/client/topology-selection";
import {
  ConsumerCard,
  PartitionLane,
  ProducerCard,
  messagesForPartition,
  partitionAssignments,
  toneForPartition,
} from "./topology-cards";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.35;
const ZOOM_STEP = 0.15;

type TopologyLayout = "auto" | "spread";
type TopologyCallbacks = {
  onSelectMessage: (messageId: string) => void;
  onSelectNode: (selection: TopologySelection) => void;
};
type ProducerNodeData = TopologyCallbacks & {
  status: RunSnapshot["producerStatus"];
  selected: boolean;
};
type TopicNodeData = TopologyCallbacks & {
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  messageCounts: RunSnapshot["messageCounts"];
  partitions: number[];
  recentMessages: PlaygroundMessage[];
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  snapshot: RunSnapshot;
};
type ConsumerGroupNodeData = TopologyCallbacks & {
  activeConsumerId: string | null;
  consumers: ConsumerSnapshot[];
  partitions: number[];
  selectedNode: TopologySelection | null;
  snapshot: RunSnapshot;
};
type ScenarioNodeData = TopologyCallbacks & {
  model: ScenarioTopologyNodeModel;
  selected: boolean;
};
type TopologyNode =
  | Node<ProducerNodeData, "producer">
  | Node<TopicNodeData, "topic">
  | Node<ConsumerGroupNodeData, "consumerGroup">
  | Node<ScenarioNodeData, "scenarioNode">;
type TopologyEdge = Edge<Record<string, never>, "smoothstep">;
type LayoutMetrics = {
  producer: { x: number; y: number };
  producerWidth: number;
  topic: { x: number; y: number };
  topicWidth: number;
  consumerGroup: { x: number; y: number };
  consumerGroupWidth: number;
};

const handleClass =
  "!h-3 !w-3 !border-2 !border-teal-700 !bg-[#fffdf5] !opacity-0";
const topologyNodeTypes = {
  producer: ProducerFlowNode,
  topic: TopicFlowNode,
  consumerGroup: ConsumerGroupFlowNode,
  scenarioNode: ScenarioOverlayFlowNode,
} satisfies NodeTypes;

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
    (event: WheelEvent<HTMLDivElement>) => {
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
      className="kplay-grid-bg relative min-h-[620px] overflow-hidden lg:h-full lg:min-h-0"
      data-testid="topology-canvas"
      onWheelCapture={handleWheelZoom}
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
          noDragClassName="nodrag"
          noPanClassName="nopan"
          className="kplay-topology-flow"
          data-testid="topology-flow"
        />
      </div>
    </div>
  );
}

function ProducerFlowNode({ data }: NodeProps<Node<ProducerNodeData>>) {
  return (
    <div
      className="nodrag pointer-events-auto relative"
      data-testid="topology-node-producer"
    >
      <ProducerCard
        status={data.status}
        selected={data.selected}
        onSelect={() => data.onSelectNode({ type: "producer" })}
      />
      <Handle
        id="producer-out"
        type="source"
        position={Position.Right}
        className={handleClass}
      />
    </div>
  );
}

function TopicFlowNode({ id, data }: NodeProps<Node<TopicNodeData>>) {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [data.partitions.length, id, updateNodeInternals]);

  return (
    <section
      className="nodrag pointer-events-auto relative rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]"
      data-testid="topology-node-topic"
    >
      <Handle
        id="topic-in"
        type="target"
        position={Position.Left}
        className={handleClass}
      />
      <Handle
        id="topic-empty-out"
        type="source"
        position={Position.Right}
        className={handleClass}
      />
      <button
        type="button"
        onClick={() => data.onSelectNode({ type: "topic" })}
        className={`mb-3 w-full rounded-2xl border-2 px-3 py-2 text-center focus:outline-none focus:ring-4 focus:ring-sky-200 ${
          data.selectedNode?.type === "topic"
            ? "border-teal-700 bg-teal-100 shadow-[0_0_0_5px_rgba(15,118,110,0.14)]"
            : "border-transparent hover:border-teal-700 hover:bg-teal-50"
        }`}
        aria-label="Inspect topic"
      >
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-teal-700">
          Topic
        </div>
        <div className="mt-1 break-words font-extrabold text-[#123047]">
          {data.snapshot.topicName}
        </div>
        <div className="text-xs font-semibold text-[#466778]">
          {data.snapshot.partitionCount} partitions
        </div>
      </button>
      <div className="space-y-3">
        {data.partitions.map((partition) => (
          <div key={partition} className="relative">
            <PartitionLane
              partition={partition}
              messages={messagesForPartition(data.recentMessages, partition)}
              selectedMessageId={data.selectedMessageId}
              selected={
                data.selectedNode?.type === "partition" &&
                data.selectedNode.partition === partition
              }
              active={data.activePartition === partition}
              onSelect={() =>
                data.onSelectNode({ type: "partition", partition })
              }
              onSelectMessage={data.onSelectMessage}
              latestOffset={
                data.snapshot.latestPartitionOffsets[String(partition)]
              }
              committedOffset={
                data.snapshot.latestCommittedOffsets[String(partition)]
              }
              owner={data.assignmentByPartition.get(partition)}
              messageCount={data.messageCounts[String(partition)] ?? 0}
            />
            <Handle
              id={`partition-${partition}-out`}
              type="source"
              position={Position.Right}
              className={handleClass}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ConsumerGroupFlowNode({
  id,
  data,
}: NodeProps<Node<ConsumerGroupNodeData>>) {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [
    data.consumers,
    data.consumers.length,
    data.partitions.length,
    id,
    updateNodeInternals,
  ]);

  return (
    <section
      className="nodrag pointer-events-auto relative rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]"
      data-testid="topology-node-consumer-group"
    >
      <Handle
        id="empty-in"
        type="target"
        position={Position.Left}
        className={handleClass}
      />
      <div className="mb-3 min-w-0 text-center">
        <div className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#123047]">
          Consumer Group
        </div>
        <div className="mt-1 truncate text-xs font-semibold text-[#466778]">
          {data.snapshot.consumerGroupId}
        </div>
        <div className="text-xs text-[#466778]">
          {data.consumers.length} consumers
        </div>
      </div>
      <div className="space-y-2">
        {data.consumers.length === 0 ? (
          <p className="rounded-2xl border-[3px] border-dashed border-teal-700 bg-[#fffdf5] p-3 text-xs font-semibold text-[#466778]">
            Add consumers to reveal partition ownership.
          </p>
        ) : (
          data.consumers.map((consumer) => (
            <div key={consumer.consumerId} className="relative">
              {consumer.assignments.map((assignment, index) => (
                <Handle
                  key={assignment.partition}
                  id={`partition-${assignment.partition}-in`}
                  type="target"
                  position={Position.Left}
                  className={handleClass}
                  style={{
                    top: `${assignmentHandleTop(
                      index,
                      consumer.assignments.length,
                    )}%`,
                  }}
                />
              ))}
              <ConsumerCard
                consumer={consumer}
                active={data.activeConsumerId === consumer.consumerId}
                selected={
                  data.selectedNode?.type === "consumer" &&
                  data.selectedNode.consumerId === consumer.consumerId
                }
                onSelect={() =>
                  data.onSelectNode({
                    type: "consumer",
                    consumerId: consumer.consumerId,
                  })
                }
              />
            </div>
          ))
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#466778]">
        <span>Group protocol: consumer (v3)</span>
        {data.partitions.map((partition) => (
          <span
            key={partition}
            className={`rounded-full border-2 px-2 py-0.5 font-extrabold ${toneForPartition(partition).chip}`}
          >
            P{partition}
          </span>
        ))}
      </div>
    </section>
  );
}

function ScenarioOverlayFlowNode({ data }: NodeProps<Node<ScenarioNodeData>>) {
  const { model } = data;
  const Icon = scenarioIconMap[model.icon];
  const tone = scenarioToneClass[model.tone];

  return (
    <div
      className="nodrag pointer-events-auto relative"
      data-testid={`topology-scenario-node-${model.id}`}
    >
      <button
        type="button"
        onClick={() =>
          data.onSelectNode({ type: "scenarioNode", nodeId: model.id })
        }
        aria-label={`Inspect ${model.title}`}
        className={`min-h-24 w-full rounded-xl border-[3px] bg-[#fffdf5]/95 p-3 text-left shadow-[6px_6px_0_rgba(15,118,110,0.13)] focus:outline-none focus:ring-4 focus:ring-sky-200 ${
          data.selected ? "ring-4 ring-sky-200" : ""
        } ${tone.border}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`grid size-9 shrink-0 place-items-center rounded-xl border-2 bg-white ${tone.border} ${tone.text}`}
          >
            <Icon size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
              {model.eyebrow}
            </div>
            <div className="mt-0.5 text-sm font-extrabold leading-tight text-[#123047]">
              {model.title}
            </div>
          </div>
        </div>
        <div className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-[#466778]">
          {model.description}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
            {model.metricLabel}
          </span>
          <span
            className={`max-w-24 truncate rounded-full border-2 px-2 py-0.5 text-xs font-extrabold ${tone.chip}`}
          >
            {model.metricValue}
          </span>
        </div>
      </button>
      <Handle
        id="left-in"
        type="target"
        position={Position.Left}
        className={handleClass}
      />
      <Handle
        id="left-out"
        type="source"
        position={Position.Left}
        className={handleClass}
        style={{ top: "68%" }}
      />
      <Handle
        id="right-in"
        type="target"
        position={Position.Right}
        className={handleClass}
        style={{ top: "32%" }}
      />
      <Handle
        id="right-out"
        type="source"
        position={Position.Right}
        className={handleClass}
      />
      <Handle
        id="top-in"
        type="target"
        position={Position.Top}
        className={handleClass}
      />
      <Handle
        id="top-out"
        type="source"
        position={Position.Top}
        className={handleClass}
        style={{ left: "64%" }}
      />
      <Handle
        id="bottom-in"
        type="target"
        position={Position.Bottom}
        className={handleClass}
        style={{ left: "36%" }}
      />
      <Handle
        id="bottom-out"
        type="source"
        position={Position.Bottom}
        className={handleClass}
      />
    </div>
  );
}

function clampZoom(nextZoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
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

function topologyEndpointId(id: string, scenarioNodeIds: Set<string>) {
  return scenarioNodeIds.has(id) ? scenarioFlowNodeId(id) : id;
}

function scenarioFlowNodeId(id: string) {
  return `scenario-${id}`;
}

const scenarioToneColor: Record<ScenarioTopologyTone, string> = {
  amber: "#f59e0b",
  emerald: "#10b981",
  rose: "#e11d48",
  sky: "#0ea5e9",
  teal: "#0f766e",
  violet: "#8b5cf6",
};

const scenarioToneClass: Record<
  ScenarioTopologyTone,
  { border: string; chip: string; text: string }
> = {
  amber: {
    border: "border-amber-500",
    chip: "border-amber-500 bg-amber-100 text-amber-900",
    text: "text-amber-700",
  },
  emerald: {
    border: "border-emerald-500",
    chip: "border-emerald-500 bg-emerald-100 text-emerald-900",
    text: "text-emerald-700",
  },
  rose: {
    border: "border-rose-500",
    chip: "border-rose-500 bg-rose-100 text-rose-900",
    text: "text-rose-700",
  },
  sky: {
    border: "border-sky-500",
    chip: "border-sky-500 bg-sky-100 text-sky-900",
    text: "text-sky-700",
  },
  teal: {
    border: "border-teal-700",
    chip: "border-teal-700 bg-teal-100 text-teal-900",
    text: "text-teal-700",
  },
  violet: {
    border: "border-violet-500",
    chip: "border-violet-500 bg-violet-100 text-violet-900",
    text: "text-violet-700",
  },
};

const scenarioIconMap: Record<ScenarioTopologyIcon, LucideIcon> = {
  acl: LockKeyhole,
  balance: Shuffle,
  commit: CheckCircle2,
  compact: Layers3,
  database: Database,
  dlq: AlertTriangle,
  handler: Box,
  hot: Flame,
  lag: Gauge,
  projection: Rows3,
  rebalance: GitBranch,
  retention: Clock3,
  retry: Repeat2,
  route: Route,
  schema: ShieldCheck,
  stream: Split,
  transaction: Link2,
};

function topologyMetrics(
  layout: TopologyLayout,
  compact: boolean,
): LayoutMetrics {
  if (compact) {
    return {
      producer: { x: 26, y: 116 },
      producerWidth: 170,
      topic: { x: 26, y: 320 },
      topicWidth: 332,
      consumerGroup: { x: 26, y: 610 },
      consumerGroupWidth: 332,
    };
  }

  return layout === "auto"
    ? {
        producer: { x: 28, y: 214 },
        producerWidth: 170,
        topic: { x: 312, y: 124 },
        topicWidth: 520,
        consumerGroup: { x: 860, y: 182 },
        consumerGroupWidth: 280,
      }
    : {
        producer: { x: 24, y: 236 },
        producerWidth: 190,
        topic: { x: 344, y: 112 },
        topicWidth: 560,
        consumerGroup: { x: 950, y: 172 },
        consumerGroupWidth: 310,
      };
}

function assignmentHandleTop(index: number, assignmentCount: number) {
  if (assignmentCount <= 1) return 50;
  const first = 40;
  const last = 60;
  return first + (index * (last - first)) / (assignmentCount - 1);
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
