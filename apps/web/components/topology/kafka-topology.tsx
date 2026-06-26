"use client";

import { useMemo, useState, type PointerEvent } from "react";
import type { RunSnapshot } from "@kplay/contracts";
import { Maximize2, Minus, Network, Plus } from "lucide-react";
import type { TopologySelection } from "@/lib/client/topology-selection";
import {
  ConsumerCard,
  PartitionLane,
  ProducerCard,
  connectorPathForPartition,
  messagesForPartition,
  partitionAssignments,
  toneForPartition,
} from "./topology-cards";

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.35;
const ZOOM_STEP = 0.15;

type TopologyLayout = "auto" | "spread";
type TopologyPan = { x: number; y: number };
type DragState = TopologyPan & {
  originX: number;
  originY: number;
  pointerId: number;
};

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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<TopologyPan>({ x: 0, y: 0 });
  const [layout, setLayout] = useState<TopologyLayout>("auto");
  const [drag, setDrag] = useState<DragState | null>(null);
  const zoomPercent = Math.round(zoom * 100);
  const canvasTransform = {
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
  };
  const contentClass =
    layout === "auto"
      ? "lg:grid-cols-[170px_minmax(360px,1fr)_280px] lg:gap-8"
      : "lg:grid-cols-[190px_minmax(420px,1.08fr)_310px] lg:gap-12";

  function updateZoom(nextZoom: number) {
    setZoom(
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2)))),
    );
  }

  function fitView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  function toggleLayout() {
    fitView();
    setLayout((current) => (current === "auto" ? "spread" : "auto"));
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest("button,a,input,select")
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      originX: pan.x,
      originY: pan.y,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.originX + event.clientX - drag.x,
      y: drag.originY + event.clientY - drag.y,
    });
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }

  return (
    <div
      className={`kplay-grid-bg relative min-h-[620px] overflow-hidden lg:h-full lg:min-h-0 lg:touch-none ${drag ? "lg:cursor-grabbing" : "lg:cursor-grab"}`}
      data-testid="topology-canvas"
      onPointerCancel={stopDrag}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
    >
      <div className="absolute left-4 right-4 top-5 z-20 flex flex-wrap items-center justify-between gap-3 lg:left-6 lg:right-6">
        <div className="rounded-2xl border-2 border-teal-700 bg-[#fffdf5]/95 px-3 py-2 shadow-[4px_4px_0_rgba(15,118,110,0.14)]">
          <h2 className="text-sm font-extrabold text-[#123047]">
            Live topology canvas
          </h2>
          <p className="text-xs font-semibold text-[#31566a]">
            Producer to partition to assigned consumer to commit
          </p>
        </div>
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
              onClick={() => updateZoom(zoom - ZOOM_STEP)}
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
              onClick={() => updateZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <Plus size={15} aria-hidden />
            </button>
          </div>
          <button
            className="grid size-8 place-items-center rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-teal-800 shadow-[4px_4px_0_rgba(15,118,110,0.16)]"
            onClick={fitView}
            aria-label="Fit view"
          >
            <Maximize2 size={15} aria-hidden />
          </button>
        </div>
      </div>

      <svg
        className={`pointer-events-none absolute inset-0 z-0 hidden h-full w-full origin-center lg:block ${drag ? "" : "transition-transform duration-200 ease-out"}`}
        style={canvasTransform}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <marker
            id="kplay-arrow-flow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="7"
            refY="4"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#0f766e" />
          </marker>
        </defs>
        <path
          className={latestMessage ? "kplay-flow-line" : undefined}
          d="M18 54 C25 54, 29 54, 35 54"
          stroke="#0f766e"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          markerEnd="url(#kplay-arrow-flow)"
          opacity={latestMessage ? 1 : 0.72}
          data-testid="producer-topic-connector"
        />
        {consumers.length === 0 ? (
          <path
            d="M65 54 C73 54, 77 54, 83 54"
            stroke="#94a3b8"
            strokeDasharray="4 5"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
            opacity="0.75"
            data-testid="empty-ownership-connector"
          />
        ) : (
          partitions.map((partition) => {
            const assignment = assignmentByPartition.get(partition);
            if (!assignment) return null;
            const tone = toneForPartition(partition);
            const path = connectorPathForPartition(partition);
            const isActive =
              activePartition === partition ||
              activeConsumerId === assignment.consumerId;
            return (
              <path
                key={partition}
                className={isActive ? "kplay-flow-line" : undefined}
                d={path}
                stroke={tone.stroke}
                strokeWidth={isActive ? "2.3" : "1.9"}
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#kplay-arrow-flow)"
                opacity={isActive ? 1 : 0.78}
                data-testid={`ownership-connector-partition-${partition}`}
              />
            );
          })
        )}
      </svg>

      <div
        className={`relative z-10 mx-4 grid origin-center grid-cols-1 gap-4 pb-6 pt-24 lg:absolute lg:inset-x-6 lg:top-24 lg:mx-0 lg:items-center lg:p-0 ${contentClass} ${drag ? "" : "transition-transform duration-200 ease-out"}`}
        data-testid="topology-canvas-content"
        style={canvasTransform}
      >
        <ProducerCard
          status={snapshot.producerStatus}
          selected={selectedNode?.type === "producer"}
          onSelect={() => onSelectNode({ type: "producer" })}
        />

        <section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
          <button
            type="button"
            onClick={() => onSelectNode({ type: "topic" })}
            className={`mb-3 w-full rounded-2xl border-2 px-3 py-2 text-center focus:outline-none focus:ring-4 focus:ring-sky-200 ${
              selectedNode?.type === "topic"
                ? "border-teal-700 bg-teal-100 shadow-[0_0_0_5px_rgba(15,118,110,0.14)]"
                : "border-transparent hover:border-teal-700 hover:bg-teal-50"
            }`}
            aria-label="Inspect topic"
          >
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-teal-700">
              Topic
            </div>
            <div className="mt-1 break-words font-extrabold text-[#123047]">
              {snapshot.topicName}
            </div>
            <div className="text-xs font-semibold text-[#466778]">
              {snapshot.partitionCount} partitions
            </div>
          </button>
          <div className="space-y-3">
            {partitions.map((partition) => (
              <PartitionLane
                key={partition}
                partition={partition}
                messages={messagesForPartition(
                  snapshot.recentMessages,
                  partition,
                )}
                selectedMessageId={selectedMessageId}
                selected={
                  selectedNode?.type === "partition" &&
                  selectedNode.partition === partition
                }
                active={activePartition === partition}
                onSelect={() => onSelectNode({ type: "partition", partition })}
                onSelectMessage={onSelectMessage}
                latestOffset={
                  snapshot.latestPartitionOffsets[String(partition)]
                }
                committedOffset={
                  snapshot.latestCommittedOffsets[String(partition)]
                }
                owner={assignmentByPartition.get(partition)}
                messageCount={snapshot.messageCounts[String(partition)] ?? 0}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
          <div className="mb-3 min-w-0 text-center">
            <div className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#123047]">
              Consumer Group
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-[#466778]">
              {snapshot.consumerGroupId}
            </div>
            <div className="text-xs text-[#466778]">
              {consumers.length} consumers
            </div>
          </div>
          <div className="space-y-2">
            {consumers.length === 0 ? (
              <p className="rounded-2xl border-[3px] border-dashed border-teal-700 bg-[#fffdf5] p-3 text-xs font-semibold text-[#466778]">
                Add consumers to reveal partition ownership.
              </p>
            ) : (
              consumers.map((consumer) => (
                <ConsumerCard
                  key={consumer.consumerId}
                  consumer={consumer}
                  active={activeConsumerId === consumer.consumerId}
                  selected={
                    selectedNode?.type === "consumer" &&
                    selectedNode.consumerId === consumer.consumerId
                  }
                  onSelect={() =>
                    onSelectNode({
                      type: "consumer",
                      consumerId: consumer.consumerId,
                    })
                  }
                />
              ))
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#466778]">
            <span>Group protocol: consumer (v3)</span>
            {partitions.map((partition) => (
              <span
                key={partition}
                className={`rounded-full border-2 px-2 py-0.5 font-extrabold ${toneForPartition(partition).chip}`}
              >
                P{partition}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
