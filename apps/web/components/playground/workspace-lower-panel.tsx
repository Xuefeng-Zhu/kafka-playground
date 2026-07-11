"use client";

import type {
  ComponentProps,
  KeyboardEvent,
  KeyboardEventHandler,
  MutableRefObject,
  PointerEventHandler,
} from "react";
import type { RunSnapshot } from "@kplay/contracts";
import { List, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { ControlsPanel } from "@/components/controls/controls-panel";
import { EventTimeline } from "@/components/timeline/event-timeline";
import type { LowerPanelTab } from "./use-lower-panel-tabs";
import {
  MAX_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
} from "./use-timeline-resize";

const lowerPanelTabs = [
  { id: "controls", label: "Controls", Icon: SlidersHorizontal },
  { id: "timeline", label: "Timeline", Icon: List },
] as const satisfies ReadonlyArray<{
  id: LowerPanelTab;
  label: string;
  Icon: LucideIcon;
}>;

type ControlsPanelProps = ComponentProps<typeof ControlsPanel>;
type EventTimelineProps = ComponentProps<typeof EventTimeline>;

type WorkspaceLowerPanelProps = {
  run: RunSnapshot;
  disabled: boolean;
  activeTab: LowerPanelTab;
  tabRefs: MutableRefObject<
    Partial<Record<LowerPanelTab, HTMLButtonElement | null>>
  >;
  timelineHeight: number;
  events: EventTimelineProps["events"];
  focus: EventTimelineProps["focus"];
  hasSequenceGap: EventTimelineProps["hasSequenceGap"];
  onFocus: EventTimelineProps["onFocus"];
  onNavigateTabs(
    event: KeyboardEvent<HTMLButtonElement>,
    tab: LowerPanelTab,
  ): void;
  onSelectTab(tab: LowerPanelTab): void;
  onMutate(path: string, init?: RequestInit): void | Promise<void>;
  onProduceOne: ControlsPanelProps["onProduceOne"];
  onUpdateSettings: ControlsPanelProps["onUpdateSettings"];
  onResizeKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onResizePointerCancel: PointerEventHandler<HTMLDivElement>;
  onResizePointerDown: PointerEventHandler<HTMLDivElement>;
  onResizePointerMove: PointerEventHandler<HTMLDivElement>;
  onResizePointerUp: PointerEventHandler<HTMLDivElement>;
};

export function WorkspaceLowerPanel({
  run,
  disabled,
  activeTab,
  tabRefs,
  timelineHeight,
  events,
  focus,
  hasSequenceGap,
  onFocus,
  onNavigateTabs,
  onSelectTab,
  onMutate,
  onProduceOne,
  onUpdateSettings,
  onResizeKeyDown,
  onResizePointerCancel,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
}: WorkspaceLowerPanelProps) {
  return (
    <section
      className="flex min-h-[520px] flex-col bg-[#fff7ed] lg:min-h-0 lg:border-r-[3px] lg:border-t-[3px] lg:border-teal-700"
      data-testid="timeline-region"
    >
      <div
        aria-label="Resize lower panel"
        aria-orientation="horizontal"
        aria-valuemax={MAX_TIMELINE_HEIGHT}
        aria-valuemin={MIN_TIMELINE_HEIGHT}
        aria-valuenow={timelineHeight}
        className="hidden h-3 shrink-0 cursor-row-resize items-center justify-center border-b-2 border-teal-700 bg-[#fff7ed] focus:outline-none focus:ring-4 focus:ring-sky-200 lg:flex"
        data-testid="timeline-resize-handle"
        onKeyDown={onResizeKeyDown}
        onPointerCancel={onResizePointerCancel}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        role="separator"
        tabIndex={0}
      >
        <span className="h-1 w-12 rounded-full bg-teal-700/55" />
      </div>
      <div className="flex min-h-0 flex-1" data-testid="lower-panel-tabs">
        <div
          aria-label="Run workspace panels"
          className="flex w-14 shrink-0 flex-col items-center gap-2 border-r-2 border-teal-700 bg-[#fff7ed] px-1.5 py-2 lg:w-12"
          role="tablist"
        >
          {lowerPanelTabs.map((tab) => {
            const Icon = tab.Icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[tab.id] = element;
                }}
                aria-controls={`lower-panel-${tab.id}`}
                aria-label={tab.label}
                aria-selected={isActive}
                className={`grid size-11 place-items-center rounded-xl border-2 text-teal-800 transition focus:outline-none focus:ring-4 focus:ring-sky-200 lg:size-9 ${
                  isActive
                    ? "border-sky-500 bg-sky-100 shadow-[3px_3px_0_rgba(14,165,233,0.18)]"
                    : "border-teal-700 bg-[#fffdf5] hover:bg-teal-50"
                }`}
                data-testid={`lower-panel-tab-${tab.id}`}
                id={`lower-panel-tab-${tab.id}`}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(event) => onNavigateTabs(event, tab.id)}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                title={tab.label}
                type="button"
              >
                <Icon size={17} aria-hidden />
              </button>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            aria-labelledby="lower-panel-tab-controls"
            className="min-h-0 flex-1 overflow-auto"
            data-testid="lower-panel-controls"
            hidden={activeTab !== "controls"}
            id="lower-panel-controls"
            role="tabpanel"
          >
            <ControlsPanel
              snapshot={run}
              disabled={disabled}
              onStartProducer={() =>
                onMutate("/producer/start", { method: "POST" })
              }
              onPauseProducer={() =>
                onMutate("/producer/pause", { method: "POST" })
              }
              onStopProducer={() =>
                onMutate("/producer/stop", { method: "POST" })
              }
              onProduceOne={onProduceOne}
              onAddConsumer={() => onMutate("/consumers", { method: "POST" })}
              onStopConsumer={(consumerId) =>
                onMutate(`/consumers/${consumerId}`, { method: "DELETE" })
              }
              onCrashConsumer={(consumerId) =>
                onMutate(`/consumers/${consumerId}/crash`, { method: "POST" })
              }
              onUpdateSettings={onUpdateSettings}
            />
          </div>
          <div
            aria-labelledby="lower-panel-tab-timeline"
            className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3"
            data-testid="lower-panel-timeline"
            hidden={activeTab !== "timeline"}
            id="lower-panel-timeline"
            role="tabpanel"
          >
            <EventTimeline
              events={events}
              focus={focus}
              hasSequenceGap={hasSequenceGap}
              onFocus={onFocus}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
