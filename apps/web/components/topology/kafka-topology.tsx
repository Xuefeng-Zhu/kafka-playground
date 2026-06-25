"use client";

import { useState, type PointerEvent } from "react";
import type { PlaygroundMessage, RunSnapshot } from "@kplay/contracts";
import { Code2, Maximize2, Minus, Network, Plus, Users } from "lucide-react";

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
  onSelectMessage
}: {
  snapshot: RunSnapshot;
  selectedMessageId: string | null;
  onSelectMessage: (messageId: string) => void;
}) {
  const partitions = Array.from({ length: snapshot.partitionCount }, (_, partition) => partition);
  const consumers = snapshot.consumers;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<TopologyPan>({ x: 0, y: 0 });
  const [layout, setLayout] = useState<TopologyLayout>("auto");
  const [drag, setDrag] = useState<DragState | null>(null);
  const zoomPercent = Math.round(zoom * 100);
  const canvasTransform = {
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
  };
  const contentClass =
    layout === "auto"
      ? "lg:grid-cols-[150px_minmax(280px,1fr)_230px] lg:gap-6"
      : "lg:grid-cols-[180px_minmax(360px,1.15fr)_260px] lg:gap-10";

  function updateZoom(nextZoom: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2)))));
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
    if (event.target instanceof Element && event.target.closest("button,a,input,select")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      originX: pan.x,
      originY: pan.y,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    });
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.originX + event.clientX - drag.x,
      y: drag.originY + event.clientY - drag.y
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
      className={`kplay-grid-bg relative min-h-[560px] overflow-hidden lg:h-full lg:min-h-0 lg:touch-none ${drag ? "lg:cursor-grabbing" : "lg:cursor-grab"}`}
      data-testid="topology-canvas"
      onPointerCancel={stopDrag}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
    >
      <div className="absolute left-4 right-4 top-5 z-10 flex flex-wrap items-center justify-between gap-3 lg:left-6 lg:right-6">
        <div>
          <h2 className="text-sm font-extrabold text-[#123047]">Live topology canvas</h2>
          <p className="text-xs text-[#466778]">Message path: producer → topic partition → assigned consumer → offset commit</p>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
          <button
            className="inline-flex h-8 items-center gap-2 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-3 text-xs font-extrabold text-teal-800 shadow-[4px_4px_0_rgba(15,118,110,0.16)]"
            onClick={toggleLayout}
            aria-pressed={layout === "spread"}
          >
            <Network size={15} aria-hidden /> {layout === "auto" ? "Auto layout" : "Spread layout"}
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
            <div className="grid w-16 place-items-center" aria-live="polite">{zoomPercent}%</div>
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
        className={`pointer-events-none absolute inset-0 hidden h-full w-full origin-center lg:block ${drag ? "" : "transition-transform duration-200 ease-out"}`}
        style={canvasTransform}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <marker id="kplay-arrow-blue" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 Z" fill="#0ea5e9" />
          </marker>
          <marker id="kplay-arrow-purple" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 Z" fill="#8b5cf6" />
          </marker>
        </defs>
        <path d="M18 49 C26 49, 25 47, 32 47" stroke="#0ea5e9" strokeWidth="2" vectorEffect="non-scaling-stroke" markerEnd="url(#kplay-arrow-blue)" />
        <path d="M59 42 C65 42, 65 34, 72 34" stroke="#0ea5e9" strokeWidth="2" vectorEffect="non-scaling-stroke" markerEnd="url(#kplay-arrow-blue)" />
        <path d="M59 57 C65 57, 65 50, 72 50" stroke="#8b5cf6" strokeWidth="2" vectorEffect="non-scaling-stroke" markerEnd="url(#kplay-arrow-purple)" />
        <path d="M59 64 C65 64, 65 66, 72 66" stroke="#0f766e" strokeDasharray="5 5" strokeWidth="1.7" vectorEffect="non-scaling-stroke" markerEnd="url(#kplay-arrow-blue)" />
      </svg>

      <div
        className={`relative mx-4 grid origin-center grid-cols-1 gap-4 pb-6 pt-24 lg:absolute lg:inset-x-6 lg:top-24 lg:mx-0 lg:items-center lg:p-0 ${contentClass} ${drag ? "" : "transition-transform duration-200 ease-out"}`}
        data-testid="topology-canvas-content"
        style={canvasTransform}
      >
        <ProducerCard status={snapshot.producerStatus} />

        <section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
          <div className="mb-3 text-center">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-teal-700">Topic</div>
            <div className="mt-1 break-words font-extrabold text-[#123047]">{snapshot.topicName}</div>
            <div className="text-xs font-semibold text-[#466778]">{snapshot.partitionCount} partitions</div>
          </div>
          <div className="space-y-3">
            {partitions.map((partition) => (
              <PartitionLane
                key={partition}
                partition={partition}
                messages={messagesForPartition(snapshot.recentMessages, partition)}
                selectedMessageId={selectedMessageId}
                onSelectMessage={onSelectMessage}
                latestOffset={snapshot.latestPartitionOffsets[String(partition)]}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
          <div className="mb-3 min-w-0 text-center">
            <div className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#123047]">Consumer Group</div>
            <div className="mt-1 truncate text-xs font-semibold text-[#466778]">{snapshot.consumerGroupId}</div>
            <div className="text-xs text-[#466778]">{consumers.length} consumers</div>
          </div>
          <div className="space-y-2">
            {consumers.length === 0 ? (
              <p className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 text-xs text-[#466778]">Add consumers to see partition ownership.</p>
            ) : (
              consumers.map((consumer, index) => {
                const hasAssignments = consumer.assignments.length > 0;
                const idle = !hasAssignments;
                return (
                  <div
                    key={consumer.consumerId}
                    className={`rounded-2xl border-[3px] p-3 ${
                      idle
                        ? "border-amber-500 bg-amber-100"
                        : index === 1
                          ? "border-violet-500 bg-violet-100"
                          : "border-emerald-500 bg-emerald-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`grid size-8 place-items-center rounded-full border-2 ${hasAssignments ? "border-teal-700 bg-white text-teal-700" : "border-amber-600 bg-white text-amber-700"}`}>
                        <Users size={16} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-extrabold text-[#123047]">{consumer.consumerId.replace("consumer-", "C")}</div>
                        <div className="text-xs text-[#466778]">{consumer.consumerId}</div>
                      </div>
                      <span className="rounded-full border-2 border-teal-700 bg-[#fffdf5] px-2 py-1 font-mono text-xs font-extrabold text-teal-800">
                        {hasAssignments ? consumer.assignments.map((item) => `P${item.partition}`).join(",") : "idle"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className={`size-2 rounded-full ${consumer.status === "running" ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <span className="font-semibold text-[#31566a]">
                        {hasAssignments ? "Active assignment" : "idle - no partition available"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-4 text-xs font-semibold text-[#466778]">Group protocol: consumer (v3)</div>
        </section>
      </div>
    </div>
  );
}

function ProducerCard({ status }: { status: RunSnapshot["producerStatus"] }) {
  return (
    <section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-5 text-center shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border-[3px] border-teal-700 bg-amber-200 text-teal-700 shadow-[5px_5px_0_rgba(15,118,110,0.18)]">
        <Code2 size={28} aria-hidden />
      </div>
      <div className="mt-4 text-sm font-extrabold text-[#123047]">Producer</div>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs font-extrabold text-emerald-700">
        <span className={`size-2 rounded-full ${status === "running" ? "bg-emerald-500" : "bg-amber-500"}`} />
        {status}
      </div>
    </section>
  );
}

function PartitionLane({
  partition,
  messages,
  selectedMessageId,
  latestOffset,
  onSelectMessage
}: {
  partition: number;
  messages: PlaygroundMessage[];
  selectedMessageId: string | null;
  latestOffset?: string;
  onSelectMessage: (messageId: string) => void;
}) {
  const placeholders = messages.length > 0 ? [] : offsetsAround(latestOffset);
  const laneClass = partition === 0 ? "border-sky-500 bg-sky-50" : "border-violet-500 bg-violet-50";
  const labelClass = partition === 0 ? "text-sky-800" : "text-violet-800";
  return (
    <div className={`rounded-2xl border-[3px] p-2 ${laneClass}`}>
      <div className={`mb-1 text-sm font-extrabold ${labelClass}`}>
        Partition {partition}
      </div>
      <div className="flex items-center gap-1 overflow-hidden">
        {messages.map((message) => (
          <button
            key={message.messageId}
            onClick={() => onSelectMessage(message.messageId)}
            className={`min-w-9 rounded-xl border-2 px-2 py-1 font-mono text-xs font-extrabold ${
              selectedMessageId === message.messageId
                ? "border-rose-700 bg-rose-400 text-white shadow-[0_0_0_5px_rgba(251,113,133,0.16)]"
                : partition === 0
                  ? "border-teal-700 bg-teal-100 text-teal-800"
                  : "border-violet-500 bg-violet-100 text-violet-800"
            }`}
          >
            {message.offset ?? "?"}
          </button>
        ))}
        {placeholders.map((offset) => (
          <span key={offset} className="min-w-9 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1 text-center font-mono text-xs font-extrabold text-teal-800">
            {offset}
          </span>
        ))}
        <span className={partition === 0 ? "ml-auto size-2.5 rounded-full bg-sky-500" : "ml-auto size-2.5 rounded-full bg-violet-500"} />
      </div>
    </div>
  );
}

function messagesForPartition(messages: PlaygroundMessage[], partition: number) {
  return messages.filter((message) => message.partition === partition).slice(-7);
}

function offsetsAround(latestOffset?: string) {
  const latest = Number(latestOffset);
  const end = Number.isFinite(latest) ? latest : 104;
  return Array.from({ length: 7 }, (_, index) => String(Math.max(0, end - 6 + index)));
}
