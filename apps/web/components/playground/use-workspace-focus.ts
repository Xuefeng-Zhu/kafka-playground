"use client";

import { useMemo } from "react";
import type { RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import { resolveExploreTopologyFocus } from "@/lib/client/explore-topology-focus";
import type {
  EntityDetailModel,
  FocusRef,
  ScenarioExperienceResolution,
} from "@/lib/client/scenario-experience";
import {
  evidenceFocusForRuntimeEvent,
  relatedGraphFocus,
} from "@/lib/client/scenario-experience/definition-helpers";

const emptyEntityDetails: Readonly<Record<string, EntityDetailModel>> = {};

type UseWorkspaceFocusOptions = {
  run: RunSnapshot | null;
  events: readonly RuntimeEvent[];
  focus: FocusRef | null;
  experienceResolution: ScenarioExperienceResolution | null;
};

export function useWorkspaceFocus({
  run,
  events,
  focus,
  experienceResolution,
}: UseWorkspaceFocusOptions) {
  const entityDetails =
    experienceResolution?.kind === "experience"
      ? experienceResolution.frame.entityDetails
      : emptyEntityDetails;
  const selectedEvent = useMemo(() => {
    if (focus?.kind !== "event") return null;
    return events.find((event) => event.eventId === focus.id) ?? null;
  }, [events, focus]);
  const selectedMessage = useMemo(() => {
    const messages = run?.recentMessages ?? [];
    if (focus?.kind === "message") {
      return messages.find((message) => message.messageId === focus.id) ?? null;
    }
    const eventMessageId =
      selectedEvent && "messageId" in selectedEvent
        ? selectedEvent.messageId
        : null;
    if (eventMessageId) {
      return (
        messages.find((message) => message.messageId === eventMessageId) ?? null
      );
    }
    if (focus !== null) return null;
    return messages.at(-1) ?? null;
  }, [focus, run?.recentMessages, selectedEvent]);
  const exploreTopologyFocus = useMemo(
    () =>
      run
        ? resolveExploreTopologyFocus({
            snapshot: run,
            focus,
            selectedEvent,
            entityDetails,
          })
        : {
            selectedMessageId: null,
            selectedCoreNode: null,
            selectedScenarioNodeId: null,
          },
    [entityDetails, focus, run, selectedEvent],
  );
  const entityDetail =
    focus?.kind === "entity" ? (entityDetails[focus.id] ?? null) : null;
  const evidenceFocus = useMemo(
    () => evidenceFocusForRuntimeEvent(focus, selectedEvent, entityDetails),
    [entityDetails, focus, selectedEvent],
  );
  const graphFocus = useMemo(
    () =>
      experienceResolution?.kind === "experience"
        ? relatedGraphFocus(
            evidenceFocus,
            selectedEvent,
            experienceResolution.frame.causalGraph.nodes.map((node) => node.id),
          )
        : focus,
    [evidenceFocus, experienceResolution, focus, selectedEvent],
  );

  return {
    entityDetail,
    entityDetails,
    evidenceFocus,
    exploreTopologyFocus,
    graphFocus,
    selectedEvent,
    selectedMessage,
  } as const;
}
