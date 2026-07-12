import type { RuntimeEvent } from "@kplay/contracts";
import type { FocusRef } from "./scenario-experience/model";

export function runtimeEventMatchesFocus(
  event: RuntimeEvent,
  focus: FocusRef | null,
) {
  if (!focus) return false;
  if (focus.kind === "event") return focus.id === event.eventId;

  const associations = runtimeEventFocusAssociations(event);
  if (focus.kind === "message") return focus.id === associations.messageId;

  return [focus.id, focus.graphEntityId]
    .filter((entityId): entityId is string => entityId != null)
    .some((entityId) => associations.entityIds.has(entityId));
}

export function runtimeEventFocusAssociations(event: RuntimeEvent) {
  const explicitEntityIds = "entityIds" in event ? [...event.entityIds] : [];
  const entityIds = new Set(explicitEntityIds);
  const messageId =
    "messageId" in event && event.messageId ? event.messageId : null;
  const consumerId =
    "consumerId" in event && event.consumerId ? event.consumerId : null;
  const partition =
    "partition" in event && typeof event.partition === "number"
      ? event.partition
      : null;

  if (consumerId) {
    entityIds.add(consumerId);
    entityIds.add(`consumer:${consumerId}`);
  }
  if (partition !== null) entityIds.add(`partition-${partition}`);
  if ("assignments" in event) {
    for (const assignment of event.assignments) {
      entityIds.add(`partition-${assignment.partition}`);
    }
  }

  return {
    consumerId,
    entityIds,
    explicitEntityIds,
    messageId,
    partition,
  };
}
