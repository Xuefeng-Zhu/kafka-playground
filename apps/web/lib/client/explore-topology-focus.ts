import type { RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import type { EntityDetailModel, FocusRef } from "./scenario-experience/model";
import type { TopologySelection } from "./topology-selection";

export type ExploreTopologyFocus = {
  selectedMessageId: string | null;
  selectedCoreNode: Exclude<TopologySelection, { type: "scenarioNode" }> | null;
  selectedScenarioNodeId: string | null;
};

type ResolveExploreTopologyFocusInput = {
  snapshot: RunSnapshot;
  focus: FocusRef | null;
  selectedEvent: RuntimeEvent | null;
  entityDetails?: Readonly<Record<string, EntityDetailModel>>;
  scenarioNodeIds?: ReadonlySet<string>;
};

export function focusForTopologySelection(
  selection: TopologySelection,
): FocusRef {
  if (
    selection.type === "producer" ||
    selection.type === "topic" ||
    selection.type === "consumerGroup"
  ) {
    return { kind: "entity", id: selection.type };
  }
  if (selection.type === "partition") {
    return { kind: "entity", id: `partition-${selection.partition}` };
  }
  if (selection.type === "consumer") {
    return { kind: "entity", id: `consumer:${selection.consumerId}` };
  }
  return { kind: "entity", id: selection.nodeId };
}

export function resolveExploreTopologyFocus({
  snapshot,
  focus,
  selectedEvent,
  entityDetails = {},
  scenarioNodeIds = emptyNodeIds,
}: ResolveExploreTopologyFocusInput): ExploreTopologyFocus {
  if (!focus) return emptyFocus;

  if (focus.kind === "message") {
    return focusForMessage(snapshot, focus.id, focus.partition);
  }

  if (focus.kind === "entity") {
    const alias =
      focus.graphEntityId ?? entityDetails[focus.id]?.graphEntityId ?? focus.id;
    return focusForEntity(snapshot, alias, scenarioNodeIds);
  }

  if (!selectedEvent || selectedEvent.eventId !== focus.id) return emptyFocus;

  const messageId =
    "messageId" in selectedEvent && selectedEvent.messageId
      ? selectedEvent.messageId
      : null;
  const partition =
    "partition" in selectedEvent && typeof selectedEvent.partition === "number"
      ? selectedEvent.partition
      : null;
  if (messageId) {
    const messageFocus = focusForMessage(snapshot, messageId, partition);
    if (messageFocus.selectedMessageId || messageFocus.selectedCoreNode) {
      return messageFocus;
    }
  }

  if (partition != null) {
    const selectedCoreNode = selectionForEntity(
      snapshot,
      `partition-${partition}`,
    );
    if (selectedCoreNode) {
      return {
        selectedMessageId: null,
        selectedCoreNode,
        selectedScenarioNodeId: null,
      };
    }
  }

  const consumerId =
    "consumerId" in selectedEvent && selectedEvent.consumerId
      ? selectedEvent.consumerId
      : null;
  if (consumerId) {
    const selectedCoreNode = selectionForEntity(
      snapshot,
      `consumer:${consumerId}`,
    );
    if (selectedCoreNode) {
      return {
        selectedMessageId: null,
        selectedCoreNode,
        selectedScenarioNodeId: null,
      };
    }
  }

  if ("entityIds" in selectedEvent) {
    for (const entityId of selectedEvent.entityIds) {
      const alias = entityDetails[entityId]?.graphEntityId ?? entityId;
      const entityFocus = focusForEntity(snapshot, alias, scenarioNodeIds);
      if (entityFocus.selectedCoreNode || entityFocus.selectedScenarioNodeId) {
        return entityFocus;
      }
    }
  }

  return emptyFocus;
}

function focusForMessage(
  snapshot: RunSnapshot,
  messageId: string,
  fallbackPartition?: number | null,
): ExploreTopologyFocus {
  const message = snapshot.recentMessages.find(
    (candidate) => candidate.messageId === messageId,
  );
  const partition = message?.partition ?? fallbackPartition ?? null;
  return {
    selectedMessageId: message ? messageId : null,
    selectedCoreNode:
      partition == null
        ? null
        : selectionForEntity(snapshot, `partition-${partition}`),
    selectedScenarioNodeId: null,
  };
}

function focusForEntity(
  snapshot: RunSnapshot,
  entityId: string,
  scenarioNodeIds: ReadonlySet<string>,
): ExploreTopologyFocus {
  const selectedCoreNode = selectionForEntity(snapshot, entityId);
  return {
    selectedMessageId: null,
    selectedCoreNode,
    selectedScenarioNodeId:
      selectedCoreNode === null && scenarioNodeIds.has(entityId)
        ? entityId
        : null,
  };
}

function selectionForEntity(
  snapshot: RunSnapshot,
  entityId: string,
): Exclude<TopologySelection, { type: "scenarioNode" }> | null {
  if (entityId === "producer" || entityId === "topic") {
    return { type: entityId };
  }
  if (entityId === "consumerGroup" || entityId === "consumer-group") {
    return { type: "consumerGroup" };
  }
  if (entityId.startsWith("partition-")) {
    const partition = Number(entityId.slice("partition-".length));
    if (
      Number.isInteger(partition) &&
      partition >= 0 &&
      partition < snapshot.partitionCount
    ) {
      return { type: "partition", partition };
    }
  }
  if (entityId.startsWith("consumer:")) {
    const consumerId = entityId.slice("consumer:".length);
    if (
      snapshot.consumers.some((consumer) => consumer.consumerId === consumerId)
    ) {
      return { type: "consumer", consumerId };
    }
  }
  return null;
}

const emptyFocus: ExploreTopologyFocus = {
  selectedMessageId: null,
  selectedCoreNode: null,
  selectedScenarioNodeId: null,
};

const emptyNodeIds: ReadonlySet<string> = new Set();
