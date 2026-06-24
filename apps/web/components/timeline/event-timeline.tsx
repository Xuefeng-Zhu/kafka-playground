"use client";

import { useMemo, useState } from "react";
import type { RuntimeEvent } from "@kplay/contracts";
import { Trash2 } from "lucide-react";

const filters = ["Messages", "Rebalances", "Commits", "Lifecycle", "Cleanup", "Errors"] as const;
type TimelineFilter = (typeof filters)[number];

const filterTone: Record<TimelineFilter, string> = {
  Messages: "bg-sky-400",
  Rebalances: "bg-orange-400",
  Commits: "bg-emerald-400",
  Lifecycle: "bg-cyan-400",
  Cleanup: "bg-violet-400",
  Errors: "bg-red-400"
};

export function EventTimeline({
  events,
  hasSequenceGap,
  onSelect
}: {
  events: RuntimeEvent[];
  hasSequenceGap: boolean;
  onSelect: (sequence: number) => void;
}) {
  const [activeFilters, setActiveFilters] = useState<Set<TimelineFilter>>(
    () => new Set(filters)
  );
  const visibleEvents = useMemo(
    () => events.filter((event) => activeFilters.has(categoryFor(event))).slice().reverse(),
    [activeFilters, events]
  );

  function toggleFilter(filter: TimelineFilter) {
    setActiveFilters((current) => {
      const next = new Set(current);
      if (next.has(filter) && next.size > 1) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-700 bg-[#0b1218] px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300">All</button>
          {filters.map((filter) => (
            <button
              key={filter}
              aria-pressed={activeFilters.has(filter)}
              onClick={() => toggleFilter(filter)}
              className={
                activeFilters.has(filter)
                  ? "inline-flex items-center gap-2 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                  : "inline-flex items-center gap-2 rounded border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:text-slate-100"
              }
            >
              <span className={`size-3 rounded ${filterTone[filter]}`} />
              {filter}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-slate-300">
          {hasSequenceGap && <span className="text-amber-300">Sequence gap detected</span>}
          <label className="flex items-center gap-2 whitespace-nowrap">
            Auto scroll
            <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-emerald-500/80">
              <span className="ml-auto mr-0.5 size-4 rounded-full bg-white" />
            </span>
          </label>
          <button className="inline-flex items-center gap-2 rounded border border-slate-700 px-2 py-1.5 text-slate-300">
            <Trash2 size={14} aria-hidden /> Clear
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-800">
        <div className="grid min-w-[760px] grid-cols-[120px_160px_190px_minmax(260px,1fr)] border-b border-slate-800 bg-[#080d12] px-4 py-2 text-xs font-semibold text-slate-400">
          <span>Time</span>
          <span>Type</span>
          <span>Component</span>
          <span>Details</span>
        </div>
        {visibleEvents.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Events will appear here after the run starts.</div>
        ) : (
          visibleEvents.map((event) => {
            const category = categoryFor(event);
            return (
              <button
                key={event.sequence}
                onClick={() => onSelect(event.sequence)}
                className="grid min-w-[760px] grid-cols-[120px_160px_190px_minmax(260px,1fr)] border-b border-slate-800 px-4 py-2 text-left text-xs hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                <span className="font-mono text-slate-300">{new Date(event.occurredAt).toLocaleTimeString()}</span>
                <span className="inline-flex items-center gap-2 font-semibold text-slate-200">
                  <span className={`size-2.5 rounded-full ${filterTone[category]}`} />
                  {event.type}
                </span>
                <span className="truncate text-slate-300">{componentFor(event)}</span>
                <span className="truncate text-slate-300">{detailsFor(event)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function categoryFor(event: RuntimeEvent): TimelineFilter {
  if (event.type.startsWith("message.")) return "Messages";
  if (event.type.startsWith("consumer.partitions_") || event.type === "consumer.idle") {
    return "Rebalances";
  }
  if (event.type.startsWith("offset.")) return "Commits";
  if (event.type.startsWith("resource.cleanup")) return "Cleanup";
  if (event.type.endsWith(".failed") || event.type === "run.error") return "Errors";
  return "Lifecycle";
}

function componentFor(event: RuntimeEvent) {
  if ("consumerId" in event && event.consumerId) return event.consumerId;
  if ("actor" in event && event.actor) return event.actor;
  if (event.type.startsWith("message.")) return "Producer";
  if (event.type.startsWith("offset.")) return "Consumer";
  return "Coordinator";
}

function detailsFor(event: RuntimeEvent) {
  if (event.type === "message.produced") {
    return `Produced message to ${event.topic} partition ${event.partition} offset ${event.offset}`;
  }
  if (event.type === "message.received") {
    return `Received message from ${event.topic} partition ${event.partition} offset ${event.offset}`;
  }
  if (event.type === "offset.committed") {
    return `committed offset ${event.committedOffset} for ${event.topic} partition ${event.partition}`;
  }
  if (event.type === "consumer.partitions_assigned") {
    return `Assigned ${event.assignments.map((item) => `P${item.partition}`).join(", ")}`;
  }
  if ("message" in event && event.message) return event.message;
  return `sequence #${event.sequence}`;
}
