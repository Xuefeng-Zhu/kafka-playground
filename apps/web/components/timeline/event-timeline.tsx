"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeEvent } from "@kplay/contracts";
import { Trash2 } from "lucide-react";
import {
  formatTaskDuration,
  taskDurationForEvent,
} from "@/lib/client/current-consumer-task";

const filters = [
  "Messages",
  "Rebalances",
  "Commits",
  "Lifecycle",
  "Cleanup",
  "Errors",
] as const;
type TimelineFilter = (typeof filters)[number];

const filterTone: Record<TimelineFilter, string> = {
  Messages: "bg-sky-500",
  Rebalances: "bg-amber-500",
  Commits: "bg-emerald-500",
  Lifecycle: "bg-cyan-500",
  Cleanup: "bg-violet-500",
  Errors: "bg-rose-500",
};

const timelineGridClass =
  "grid min-w-full grid-cols-[54px_84px_92px_minmax(90px,1fr)] gap-x-2 sm:min-w-[860px] sm:grid-cols-[120px_180px_190px_minmax(300px,1fr)] sm:gap-x-4";

export function EventTimeline({
  events,
  hasSequenceGap,
  onSelect,
}: {
  events: RuntimeEvent[];
  hasSequenceGap: boolean;
  onSelect: (sequence: number) => void;
}) {
  const [activeFilters, setActiveFilters] = useState<Set<TimelineFilter>>(
    () => new Set(filters),
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [clearedThroughSequence, setClearedThroughSequence] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const unclearedEvents = useMemo(
    () => events.filter((event) => event.sequence > clearedThroughSequence),
    [clearedThroughSequence, events],
  );
  const visibleEvents = useMemo(
    () =>
      unclearedEvents
        .filter((event) => activeFilters.has(categoryFor(event)))
        .slice()
        .reverse(),
    [activeFilters, unclearedEvents],
  );
  const allFiltersSelected = activeFilters.size === filters.length;
  const emptyTimelineMessage =
    unclearedEvents.length === 0
      ? "Events will appear here after the run starts."
      : activeFilters.size === 0
        ? "Choose a filter to show timeline events."
        : "No events match the selected filters.";

  useEffect(() => {
    if (autoScroll) scrollRef.current?.scrollTo?.({ top: 0 });
  }, [autoScroll, visibleEvents.length]);

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

  function toggleAllFilters() {
    setActiveFilters((current) =>
      current.size === filters.length ? new Set() : new Set(filters),
    );
  }

  function clearVisibleEvents() {
    const latestSequence = events.at(-1)?.sequence ?? 0;
    setClearedThroughSequence(latestSequence);
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col px-3 pb-3"
      data-testid="event-timeline"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border-[3px] border-teal-700 bg-[#fff7ed] px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={allFiltersSelected}
            onClick={toggleAllFilters}
            className={
              allFiltersSelected
                ? "rounded-full border-2 border-sky-500 bg-sky-100 px-3 py-1 text-xs font-extrabold text-sky-800"
                : "rounded-full border-2 border-teal-700 bg-[#fffdf5] px-3 py-1 text-xs font-extrabold text-teal-800 hover:bg-teal-50"
            }
          >
            All
          </button>
          {filters.map((filter) => (
            <button
              key={filter}
              aria-pressed={activeFilters.has(filter)}
              onClick={() => toggleFilter(filter)}
              className={
                activeFilters.has(filter)
                  ? "inline-flex items-center gap-2 rounded-full border-2 border-sky-500 bg-sky-100 px-2 py-1 text-xs font-extrabold text-sky-800"
                  : "inline-flex items-center gap-2 rounded-full border-2 border-teal-700 bg-[#fffdf5] px-2 py-1 text-xs font-extrabold text-teal-800 hover:bg-teal-50"
              }
            >
              <span className={`size-3 rounded-full ${filterTone[filter]}`} />
              {filter}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs font-semibold text-[#466778]">
          {hasSequenceGap && (
            <span className="font-extrabold text-amber-700">
              Sequence gap detected
            </span>
          )}
          <button
            type="button"
            aria-pressed={autoScroll}
            onClick={() => setAutoScroll((current) => !current)}
            className="flex items-center gap-2 whitespace-nowrap rounded-xl px-1 py-1 focus:outline-none focus:ring-4 focus:ring-sky-200"
          >
            Auto scroll
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full ${
                autoScroll ? "bg-emerald-500" : "bg-slate-400"
              }`}
            >
              <span
                className={`size-4 rounded-full bg-white transition ${
                  autoScroll ? "ml-auto mr-0.5" : "ml-0.5"
                }`}
              />
            </span>
          </button>
          <button
            type="button"
            onClick={clearVisibleEvents}
            disabled={events.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1.5 font-extrabold text-teal-800 disabled:opacity-45"
          >
            <Trash2 size={14} aria-hidden /> Clear
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]"
      >
        <div
          className={`${timelineGridClass} border-b-[3px] border-teal-700 bg-[#fff7ed] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-teal-700`}
        >
          <span>Time</span>
          <span>Type</span>
          <span>Component</span>
          <span>Details</span>
        </div>
        {visibleEvents.length === 0 ? (
          <div className="p-4 text-sm text-[#466778]" role="status">
            {emptyTimelineMessage}
          </div>
        ) : (
          visibleEvents.map((event) => {
            const category = categoryFor(event);
            return (
              <button
                key={event.sequence}
                onClick={() => onSelect(event.sequence)}
                className={`${timelineGridClass} border-b-[3px] border-teal-700 px-4 py-2 text-left text-xs text-[#123047] hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-200`}
              >
                <span className="font-mono text-[#466778]">
                  {new Date(event.occurredAt).toLocaleTimeString()}
                </span>
                <span className="inline-flex min-w-0 items-center gap-2 font-extrabold text-[#123047]">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${filterTone[category]}`}
                  />
                  <span className="truncate">{event.type}</span>
                </span>
                <span className="truncate font-semibold text-[#31566a]">
                  {componentFor(event)}
                </span>
                <span className="truncate text-[#31566a]">
                  {detailsFor(event, events)}
                </span>
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
  if (
    event.type.startsWith("consumer.partitions_") ||
    event.type === "consumer.idle" ||
    event.type === "consumer.crashing" ||
    event.type === "consumer.crashed"
  ) {
    return "Rebalances";
  }
  if (event.type.startsWith("offset.")) return "Commits";
  if (event.type.startsWith("resource.cleanup")) return "Cleanup";
  if (event.type.endsWith(".failed") || event.type === "run.error")
    return "Errors";
  return "Lifecycle";
}

function componentFor(event: RuntimeEvent) {
  if ("consumerId" in event && event.consumerId) return event.consumerId;
  if ("actor" in event && event.actor) return event.actor;
  if (event.type.startsWith("message.")) return "Producer";
  if (event.type.startsWith("offset.")) return "Consumer";
  return "Coordinator";
}

function detailsFor(event: RuntimeEvent, events: RuntimeEvent[]) {
  if (event.type === "message.produced") {
    return `Produced message to ${event.topic} partition ${event.partition} offset ${event.offset}`;
  }
  if (event.type === "message.received") {
    return `Received message from ${event.topic} partition ${event.partition} offset ${event.offset}`;
  }
  if (event.type === "offset.committed") {
    return [
      `committed offset ${event.committedOffset} for ${event.topic} partition ${event.partition}`,
      durationSuffix(events, event),
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (event.type === "consumer.partitions_assigned") {
    return `Assigned ${event.assignments.map((item) => `P${item.partition}`).join(", ")}`;
  }
  if (event.type === "consumer.crashing") {
    return `${event.consumerId ?? "Consumer"} crash requested`;
  }
  if (event.type === "consumer.crashed") {
    return `${event.consumerId ?? "Consumer"} crashed; uncommitted work can replay`;
  }
  if (event.type === "message.processing_failed" && "message" in event) {
    return [event.message, durationSuffix(events, event)]
      .filter(Boolean)
      .join(" ");
  }
  if ("message" in event && event.message) return event.message;
  return `sequence #${event.sequence}`;
}

function durationSuffix(events: RuntimeEvent[], event: RuntimeEvent) {
  const duration = taskDurationForEvent(events, event);
  return duration ? `duration ${formatTaskDuration(duration)}` : "";
}
