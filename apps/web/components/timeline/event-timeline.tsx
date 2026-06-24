"use client";

import { useMemo, useState } from "react";
import type { RuntimeEvent } from "@kplay/contracts";

const filters = ["Messages", "Rebalances", "Commits", "Lifecycle", "Cleanup", "Errors"] as const;
type TimelineFilter = (typeof filters)[number];

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
    () => events.filter((event) => activeFilters.has(categoryFor(event))),
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
    <div className="h-[205px] overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Event timeline</h2>
        {hasSequenceGap && <span className="text-xs text-amber-300">Sequence gap detected</span>}
      </div>
      <div className="mb-2 flex gap-2">
        {filters.map((filter) => (
          <button
            key={filter}
            aria-pressed={activeFilters.has(filter)}
            onClick={() => toggleFilter(filter)}
            className={
              activeFilters.has(filter)
                ? "rounded-md border border-sky-500/50 bg-sky-500/10 px-2 py-1 text-xs text-sky-100"
                : "rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:text-slate-100"
            }
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="h-36 overflow-auto rounded-md border border-slate-800">
        {visibleEvents.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Events will appear here after the run starts.</div>
        ) : (
          visibleEvents.slice().reverse().map((event) => (
            <button
              key={event.sequence}
              onClick={() => onSelect(event.sequence)}
              className="grid w-full grid-cols-[70px_1fr_100px_80px] gap-2 border-b border-slate-800 px-3 py-2 text-left text-xs hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <span className="font-mono text-slate-500">#{event.sequence}</span>
              <span className="font-semibold text-slate-200">{event.type}</span>
              <span className="truncate text-slate-400">{"actor" in event ? event.actor : ""}</span>
              <span className="font-mono text-slate-500">{new Date(event.occurredAt).toLocaleTimeString()}</span>
            </button>
          ))
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
