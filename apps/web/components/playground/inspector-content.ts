import type {
  PlaygroundMessage,
  RunSnapshot,
  RuntimeEvent,
} from "@kplay/contracts";
import type { InspectorContent } from "@/components/inspector/inspector-panel";
import type {
  EntityDetailModel,
  FocusRef,
} from "@/lib/client/scenario-experience";
import type { TopologySelection } from "@/lib/client/topology-selection";

export function resolveInspectorContent({
  run,
  focus,
  showGuidedView,
  selectedTopologyNode,
  entityDetail,
  selectedEvent,
  selectedMessage,
  onPreviousMessage,
  onNextMessage,
}: {
  run: RunSnapshot | null;
  focus: FocusRef | null;
  showGuidedView: boolean;
  selectedTopologyNode: TopologySelection | null;
  entityDetail: EntityDetailModel | null;
  selectedEvent: RuntimeEvent | null;
  selectedMessage: PlaygroundMessage | null;
  onPreviousMessage(): void;
  onNextMessage(): void;
}): InspectorContent {
  if (!run) return { kind: "empty" };
  if (focus?.kind === "entity") {
    if (!showGuidedView && selectedTopologyNode) {
      return {
        kind: "topology",
        snapshot: run,
        selectedNode: selectedTopologyNode,
      };
    }
    if (entityDetail) return { kind: "entity", detail: entityDetail };
  }
  if (focus?.kind === "event" && selectedEvent) {
    return {
      kind: "event",
      snapshot: run,
      event: selectedEvent,
      relatedMessage: selectedMessage,
    };
  }
  return {
    kind: "message",
    snapshot: run,
    message: selectedMessage,
    onPreviousMessage,
    onNextMessage,
  };
}
