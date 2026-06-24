"use client";

import type { PlaygroundMessage, RunSnapshot } from "@kplay/contracts";
import { Code2, Maximize2, Minus, Network, Plus, Users } from "lucide-react";

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

  return (
    <div className="kplay-grid-bg relative min-h-[560px] overflow-hidden lg:h-full lg:min-h-0">
      <div className="absolute left-4 right-4 top-5 z-10 flex flex-wrap items-center justify-between gap-3 lg:left-6 lg:right-6">
        <h2 className="text-sm font-semibold text-slate-100">Topology</h2>
        <div className="flex items-center gap-2 lg:gap-4">
          <button className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-3 text-xs text-slate-200">
            <Network size={15} aria-hidden /> Auto layout
          </button>
          <div className="flex h-8 overflow-hidden rounded-md border border-slate-700 bg-slate-950/60 text-xs text-slate-200">
            <button className="grid w-10 place-items-center border-r border-slate-700" aria-label="Zoom out"><Minus size={15} aria-hidden /></button>
            <div className="grid w-16 place-items-center">100%</div>
            <button className="grid w-10 place-items-center border-l border-slate-700" aria-label="Zoom in"><Plus size={15} aria-hidden /></button>
          </div>
          <button className="grid size-8 place-items-center rounded-md border border-slate-700 bg-slate-950/60 text-slate-200" aria-label="Fit view">
            <Maximize2 size={15} aria-hidden />
          </button>
        </div>
      </div>

      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" aria-hidden>
        <defs>
          <marker id="kplay-arrow-blue" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 Z" fill="#2f8cff" />
          </marker>
          <marker id="kplay-arrow-purple" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 Z" fill="#9b5cff" />
          </marker>
        </defs>
        <path d="M18% 49% C26% 49%, 25% 47%, 32% 47%" stroke="#8b96a8" strokeWidth="1.5" markerEnd="url(#kplay-arrow-blue)" />
        <path d="M59% 42% C65% 42%, 65% 34%, 72% 34%" stroke="#2f8cff" strokeWidth="1.5" markerEnd="url(#kplay-arrow-blue)" />
        <path d="M59% 57% C65% 57%, 65% 50%, 72% 50%" stroke="#9b5cff" strokeWidth="1.5" markerEnd="url(#kplay-arrow-purple)" />
        <path d="M59% 64% C65% 64%, 65% 66%, 72% 66%" stroke="#8b96a8" strokeDasharray="5 5" strokeWidth="1.5" markerEnd="url(#kplay-arrow-blue)" />
      </svg>

      <div className="relative mx-4 grid grid-cols-1 gap-4 pb-6 pt-24 lg:absolute lg:inset-x-6 lg:top-24 lg:mx-0 lg:grid-cols-[150px_minmax(280px,1fr)_230px] lg:items-center lg:gap-6 lg:p-0">
        <ProducerCard status={snapshot.producerStatus} />

        <section className="rounded-lg border border-slate-600 bg-[#0b1219]/95 p-3 shadow-2xl">
          <div className="mb-3 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">Topic</div>
            <div className="mt-1 font-semibold text-slate-100">{snapshot.topicName}</div>
            <div className="text-xs text-slate-400">{snapshot.partitionCount} partitions</div>
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

        <section className="rounded-lg border border-slate-600 bg-[#0b1219]/95 p-3 shadow-2xl">
          <div className="mb-3 min-w-0 text-center">
            <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-100">Consumer Group</div>
            <div className="mt-1 truncate text-xs text-slate-400">{snapshot.consumerGroupId}</div>
            <div className="text-xs text-slate-400">{consumers.length} consumers</div>
          </div>
          <div className="space-y-2">
            {consumers.length === 0 ? (
              <p className="rounded-md border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-500">Add consumers to see partition ownership.</p>
            ) : (
              consumers.map((consumer, index) => (
                <div
                  key={consumer.consumerId}
                  className={`rounded-md border p-3 ${
                    index === 1
                      ? "border-violet-400 bg-violet-500/10"
                      : consumer.assignments.length > 0
                        ? "border-sky-500 bg-sky-500/10"
                        : "border-slate-600 bg-slate-950/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`grid size-8 place-items-center rounded-full ${consumer.assignments.length > 0 ? "bg-sky-500/20 text-sky-300" : "bg-slate-700/40 text-slate-400"}`}>
                      <Users size={16} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-100">{consumer.consumerId.replace("consumer-", "Consumer ")}</div>
                      <div className="text-xs text-slate-400">{consumer.consumerId}</div>
                    </div>
                    <span className="rounded border border-sky-500/50 bg-sky-500/10 px-2 py-1 text-xs font-mono text-sky-200">
                      {consumer.assignments.length > 0 ? consumer.assignments.map((item) => `P${item.partition}`).join(",") : "-"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className={`size-2 rounded-full ${consumer.status === "running" ? "bg-emerald-400" : "bg-slate-500"}`} />
                    <span className={consumer.assignments.length > 0 ? "text-emerald-300" : "text-slate-400"}>
                      {consumer.assignments.length > 0 ? "Active" : "idle - no assignment"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 text-xs text-slate-500">Group protocol: consumer (v3)</div>
        </section>
      </div>
    </div>
  );
}

function ProducerCard({ status }: { status: RunSnapshot["producerStatus"] }) {
  return (
    <section className="rounded-lg border border-slate-600 bg-[#0b1219]/95 p-5 text-center shadow-2xl">
      <div className="mx-auto grid size-14 place-items-center rounded-full border border-sky-500 bg-sky-500/10 text-sky-300">
        <Code2 size={28} aria-hidden />
      </div>
      <div className="mt-4 text-sm font-semibold text-slate-100">Producer</div>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-emerald-300">
        <span className={`size-2 rounded-full ${status === "running" ? "bg-emerald-400" : "bg-amber-400"}`} />
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
  return (
    <div className="rounded-md border border-slate-700 bg-slate-950/45 p-2">
      <div className={partition === 0 ? "mb-1 text-sm font-semibold text-sky-300" : "mb-1 text-sm font-semibold text-violet-300"}>
        Partition {partition}
      </div>
      <div className="flex items-center gap-1 overflow-hidden">
        {messages.map((message) => (
          <button
            key={message.messageId}
            onClick={() => onSelectMessage(message.messageId)}
            className={`min-w-9 rounded border px-2 py-1 font-mono text-xs ${
              selectedMessageId === message.messageId
                ? "border-sky-300 bg-sky-500 text-white"
                : partition === 0
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
                  : "border-violet-500/40 bg-violet-500/10 text-violet-100"
            }`}
          >
            {message.offset ?? "?"}
          </button>
        ))}
        {placeholders.map((offset) => (
          <span key={offset} className="min-w-9 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-center font-mono text-xs text-slate-400">
            {offset}
          </span>
        ))}
        <span className={partition === 0 ? "ml-auto size-2.5 rounded-full bg-sky-400" : "ml-auto size-2.5 rounded-full bg-violet-400"} />
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
