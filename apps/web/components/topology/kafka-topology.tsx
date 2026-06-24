"use client";

import { ReactFlow, Background, Handle, Position, type Node, type Edge } from "@xyflow/react";
import type { RunSnapshot } from "@kplay/contracts";

export function KafkaTopology({
  snapshot,
  selectedMessageId,
  onSelectMessage
}: {
  snapshot: RunSnapshot;
  selectedMessageId: string | null;
  onSelectMessage: (messageId: string) => void;
}) {
  const nodes: Node[] = [
    {
      id: "producer",
      position: { x: 70, y: 90 },
      data: { title: "Producer", body: snapshot.producerStatus, tone: "sky" },
      type: "kplay"
    },
    {
      id: "topic",
      position: { x: 340, y: 80 },
      data: { title: snapshot.topicName, body: "Topic with 2 partitions", tone: "slate" },
      type: "kplay"
    },
    ...[0, 1].map((partition) => ({
      id: `partition-${partition}`,
      position: { x: 350, y: 220 + partition * 120 },
      data: {
        title: `Partition ${partition}`,
        body: `latest offset ${snapshot.latestPartitionOffsets[String(partition)] ?? "none"}`,
        tone: "amber"
      },
      type: "kplay"
    })),
    {
      id: "group",
      position: { x: 650, y: 125 },
      data: { title: "Consumer group", body: snapshot.consumerGroupId, tone: "green" },
      type: "kplay"
    },
    ...snapshot.consumers.map((consumer, index) => ({
      id: consumer.consumerId,
      position: { x: 680, y: 240 + index * 95 },
      data: {
        title: consumer.consumerId,
        body:
          consumer.assignments.length > 0
            ? consumer.assignments.map((item) => `P${item.partition}`).join(", ")
            : "idle - no assignment",
        tone: consumer.assignments.length > 0 ? "green" : "rose"
      },
      type: "kplay"
    }))
  ];

  const edges: Edge[] = [
    { id: "producer-topic", source: "producer", target: "topic", animated: snapshot.producerStatus === "running" },
    { id: "topic-p0", source: "topic", target: "partition-0", animated: true },
    { id: "topic-p1", source: "topic", target: "partition-1", animated: true },
    ...snapshot.consumers.flatMap((consumer) =>
      consumer.assignments.map((assignment) => ({
        id: `${assignment.partition}-${consumer.consumerId}`,
        source: `partition-${assignment.partition}`,
        target: consumer.consumerId,
        animated: true
      }))
    )
  ];

  const recent = snapshot.recentMessages.slice(-10);

  return (
    <div className="h-full">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={{ kplay: TopologyNode }} fitView minZoom={0.7} maxZoom={1.4}>
        <Background color="#1f2937" gap={24} />
      </ReactFlow>
      <div className="absolute right-5 top-5 w-64 rounded-lg border border-slate-800 bg-slate-950/90 p-3 shadow-2xl">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Assignments</h2>
        <div className="mt-2 space-y-2">
          {snapshot.consumers.length === 0 ? (
            <p className="text-xs text-slate-500">Add consumers to see partition ownership.</p>
          ) : (
            snapshot.consumers.map((consumer) => (
              <div key={consumer.consumerId} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-200">{consumer.consumerId}</span>
                <span className={consumer.assignments.length > 0 ? "text-emerald-300" : "text-rose-300"}>
                  {consumer.assignments.length > 0
                    ? consumer.assignments.map((item) => `P${item.partition}`).join(", ")
                    : "idle - no assignment"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2" aria-label="Recent messages">
        {recent.map((message) => (
          <button
            key={message.messageId}
            onClick={() => onSelectMessage(message.messageId)}
            className={`rounded-md border px-3 py-2 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-sky-300 ${
              selectedMessageId === message.messageId
                ? "border-sky-300 bg-sky-400/20 text-sky-100"
                : "border-slate-700 bg-slate-950/80 text-slate-300 hover:border-slate-500"
            }`}
          >
            <span className="block font-semibold">{message.key ?? "no key"}</span>
            <span className="font-mono text-[11px] text-slate-400">P{message.partition ?? "?"} / {message.offset ?? "?"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopologyNode({ data }: { data: { title: string; body: string; tone: "sky" | "slate" | "amber" | "green" | "rose" } }) {
  const tone = {
    sky: "border-sky-400/50 bg-sky-400/10 text-sky-100",
    slate: "border-slate-600 bg-slate-900 text-slate-100",
    amber: "border-amber-400/50 bg-amber-400/10 text-amber-100",
    green: "border-emerald-400/50 bg-emerald-400/10 text-emerald-100",
    rose: "border-rose-400/50 bg-rose-400/10 text-rose-100"
  }[data.tone];
  return (
    <div className={`min-w-48 rounded-lg border p-3 shadow-2xl ${tone}`}>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="text-sm font-semibold">{data.title}</div>
      <div className="mt-1 max-w-44 truncate font-mono text-[11px] opacity-80">{data.body}</div>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}
