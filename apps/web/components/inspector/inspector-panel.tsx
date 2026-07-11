"use client";

import type {
  PlaygroundMessage,
  RunSnapshot,
  RuntimeEvent,
} from "@kplay/contracts";
import { X } from "lucide-react";
import type { EntityDetailModel } from "@/lib/client/scenario-experience";
import { hasActiveConsumerTaskDuration } from "@/lib/client/current-consumer-task";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { useLiveTaskClock } from "@/lib/client/use-live-task-clock";
import { EntityDetails } from "./entity-details";
import { EventDetails } from "./event-details";
import { MessageDetails } from "./message-details";
import { TopologyDetails } from "./topology-details";

export type InspectorContent =
  | { kind: "empty" }
  | {
      kind: "topology";
      snapshot: RunSnapshot;
      selectedNode: TopologySelection;
    }
  | { kind: "entity"; detail: EntityDetailModel }
  | {
      kind: "event";
      snapshot: RunSnapshot;
      event: RuntimeEvent;
      relatedMessage: PlaygroundMessage | null;
    }
  | {
      kind: "message";
      snapshot: RunSnapshot;
      message: PlaygroundMessage | null;
      onPreviousMessage(): void;
      onNextMessage(): void;
    };

export const inspectorLabels = {
  empty: {
    title: "Message Inspector",
    dialog: "Message inspector",
    close: "Close message inspector",
  },
  topology: {
    title: "Topology Inspector",
    dialog: "Topology inspector",
    close: "Close topology inspector",
  },
  entity: {
    title: "Evidence Inspector",
    dialog: "Evidence inspector",
    close: "Close evidence inspector",
  },
  event: {
    title: "Event Inspector",
    dialog: "Event inspector",
    close: "Close event inspector",
  },
  message: {
    title: "Message Inspector",
    dialog: "Message inspector",
    close: "Close message inspector",
  },
} as const satisfies Record<
  InspectorContent["kind"],
  { title: string; dialog: string; close: string }
>;

export function InspectorPanel({
  content,
  onClose,
}: {
  content: InspectorContent;
  onClose(): void;
}) {
  const labels = inspectorLabels[content.kind];

  return (
    <div className="flex h-full flex-col text-[#123047]">
      <header className="flex items-center justify-between border-b-[3px] border-teal-700 bg-[#fff7ed] px-5 py-4">
        <h2 className="kplay-section-title">{labels.title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-teal-800 hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-sky-200 lg:size-8"
          aria-label={labels.close}
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <InspectorBody content={content} />
    </div>
  );
}

function InspectorBody({ content }: { content: InspectorContent }) {
  switch (content.kind) {
    case "empty":
      return (
        <div className="p-5 text-sm text-[#466778]">
          Start a run to inspect messages and events.
        </div>
      );
    case "topology":
      return (
        <TopologyInspectorDetails
          snapshot={content.snapshot}
          selectedNode={content.selectedNode}
        />
      );
    case "entity":
      return <EntityDetails detail={content.detail} />;
    case "event":
      return (
        <EventDetails
          snapshot={content.snapshot}
          event={content.event}
          relatedMessage={content.relatedMessage}
        />
      );
    case "message":
      return (
        <MessageDetails
          snapshot={content.snapshot}
          message={content.message}
          onPreviousMessage={content.onPreviousMessage}
          onNextMessage={content.onNextMessage}
        />
      );
  }
}

function TopologyInspectorDetails({
  snapshot,
  selectedNode,
}: {
  snapshot: RunSnapshot;
  selectedNode: TopologySelection;
}) {
  const taskNowMs = useLiveTaskClock(hasActiveConsumerTaskDuration(snapshot));
  return (
    <TopologyDetails
      snapshot={snapshot}
      selectedNode={selectedNode}
      taskNowMs={taskNowMs}
    />
  );
}
