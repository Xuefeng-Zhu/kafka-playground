"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
import { Maximize2, Minus, Network, Plus } from "lucide-react";
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
type TopologyNode =
  | Node<ProducerNodeData, "producer">
  | Node<TopicNodeData, "topic">
  | Node<ConsumerGroupNodeData, "consumerGroup">;
type TopologyEdge = Edge<Record<string, never>, "smoothstep">;
type LayoutMetrics = {
  groupWidth: number;
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
  const homeZoom = snapshot.partitionCount >= 3 && !isCompact ? MIN_ZOOM : 1;

  const setViewportHome = useCallback(() => {
    void flow.setViewport({ x: 0, y: 0, zoom: homeZoom });
  }, [flow, homeZoom]);

  useEffect(() => {
    setViewportHome();
  }, [isCompact, layout, setViewportHome]);

  useEffect(() => {
    let secondFrame = 0;
    const refreshNodeInternals = () => {
      updateNodeInternals("producer");
      updateNodeInternals("topic");
      updateNodeInternals("consumerGroup");
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
    isCompact,
    layout,
    partitions.length,
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

  const nodes = useMemo<TopologyNode[]>(
    () => [
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
    ],
    [
      activeConsumerId,
      activePartition,
      assignmentByPartition,
      consumers,
      metrics,
      onSelectMessage,
      onSelectNode,
      partitions,
      selectedMessageId,
      selectedNode,
      snapshot,
    ],
  );

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
        animated: Boolean(latestMessage),
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
      return nextEdges;
    }

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
        animated: isActive,
        className: isActive ? "kplay-flow-line" : undefined,
        style: {
          opacity: isActive ? 1 : 0.78,
          stroke: tone.stroke,
          strokeWidth: isActive ? 2.3 : 1.9,
        },
        domAttributes: edgeTestId(`topology-edge-partition-${partition}`),
      });
    });
    return nextEdges;
  }, [
    activeConsumerId,
    activePartition,
    assignmentByPartition,
    consumers.length,
    latestMessage,
    partitions,
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
          fitView={false}
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

function clampZoom(nextZoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
}

function edgeTestId(value: string): TopologyEdge["domAttributes"] {
  return { "data-testid": value } as TopologyEdge["domAttributes"];
}

function topologyMetrics(
  layout: TopologyLayout,
  compact: boolean,
): LayoutMetrics {
  if (compact) {
    return {
      groupWidth: 360,
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
        groupWidth: 1140,
        producer: { x: 28, y: 214 },
        producerWidth: 170,
        topic: { x: 312, y: 124 },
        topicWidth: 520,
        consumerGroup: { x: 860, y: 182 },
        consumerGroupWidth: 280,
      }
    : {
        groupWidth: 1260,
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
