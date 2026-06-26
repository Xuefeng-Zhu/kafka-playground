"use client";

import type { PlaygroundMessage, RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import { InspectorPanel } from "@/components/inspector/inspector-panel";
import type { TopologySelection } from "@/lib/client/topology-selection";

export function InspectorDrawer({
  message,
  event,
  snapshot,
  selectedNode,
  onPreviousMessage,
  onNextMessage,
  onClose,
}: {
  message: PlaygroundMessage | null;
  event: RuntimeEvent | null;
  snapshot: RunSnapshot | null;
  selectedNode: TopologySelection | null;
  onPreviousMessage: () => void;
  onNextMessage: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[#123047]/25"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        id="message-inspector-drawer"
        className="fixed bottom-0 right-0 top-0 z-50 w-[min(100vw,390px)] overflow-y-auto border-l-[3px] border-teal-700 bg-[#fff7ed] shadow-[-14px_0_0_rgba(15,118,110,0.16)]"
      >
        <InspectorPanel
          message={message}
          event={event}
          snapshot={snapshot}
          selectedNode={selectedNode}
          onPreviousMessage={onPreviousMessage}
          onNextMessage={onNextMessage}
          onClose={onClose}
        />
      </aside>
    </>
  );
}
