"use client";

import dynamic from "next/dynamic";
import { useCallback, useId, useMemo } from "react";
import type { RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import {
  focusForTopologySelection,
  resolveExploreTopologyFocus,
} from "@/lib/client/explore-topology-focus";
import type {
  EntityDetailModel,
  FocusRef,
  ScenarioExperienceFrame,
} from "@/lib/client/scenario-experience/model";
import { projectScenarioExploreTopology } from "@/lib/client/scenario-experience/explore-topology";
import { topologyProvenance } from "@/lib/client/topology-provenance";
import { useMobileTopology } from "@/lib/client/use-mobile-topology";
import { SemanticTopologyList } from "./semantic-topology-list";

const DesktopKafkaTopology = dynamic(
  () => import("./kafka-topology").then((module) => module.KafkaTopology),
  {
    ssr: false,
    loading: () => (
      <div
        className="grid min-h-[420px] place-items-center p-6 text-sm font-bold text-[#466778]"
        data-testid="topology-loading"
        role="status"
      >
        Loading interactive topology…
      </div>
    ),
  },
);

export type ExploreTopologyProps = {
  snapshot: RunSnapshot;
  focus: FocusRef | null;
  selectedEvent: RuntimeEvent | null;
  entityDetails?: Readonly<Record<string, EntityDetailModel>>;
  scenarioFrame?: ScenarioExperienceFrame;
  onFocus: (focus: FocusRef) => void;
};

export function ExploreTopology({
  snapshot,
  focus,
  selectedEvent,
  entityDetails = {},
  scenarioFrame,
  onFocus,
}: ExploreTopologyProps) {
  const isMobile = useMobileTopology();
  const provenance = topologyProvenance(snapshot);
  const topologyDescriptionId = useId();
  const topologyLabel =
    provenance === "simulated"
      ? "Simulated runtime topology"
      : "Observed broker topology";
  const topologyDescription =
    provenance === "simulated"
      ? "Free Explore actions update this deterministic demo run. Guided evidence changes only when you run a guided experiment."
      : "This topology reports broker and runtime state. Unsupported teaching experiments remain disabled.";
  const scenarioTopology = useMemo(
    () => projectScenarioExploreTopology(scenarioFrame),
    [scenarioFrame],
  );
  const resolvedFocus = useMemo(
    () =>
      resolveExploreTopologyFocus({
        snapshot,
        focus,
        selectedEvent,
        entityDetails,
        scenarioNodeIds: scenarioTopology?.scenarioNodeIds,
      }),
    [entityDetails, focus, scenarioTopology, selectedEvent, snapshot],
  );
  const desktopSelectedNode =
    resolvedFocus.selectedCoreNode ??
    (resolvedFocus.selectedScenarioNodeId
      ? {
          type: "scenarioNode" as const,
          nodeId: resolvedFocus.selectedScenarioNodeId,
        }
      : null);
  const selectMessage = useCallback(
    (messageId: string) => {
      const message = snapshot.recentMessages.find(
        (candidate) => candidate.messageId === messageId,
      );
      onFocus({
        kind: "message",
        id: messageId,
        ...(message?.partition == null ? {} : { partition: message.partition }),
        ...(message?.offset == null ? {} : { offset: message.offset }),
      });
    },
    [onFocus, snapshot.recentMessages],
  );
  const selectNode = useCallback(
    (selection: Parameters<typeof focusForTopologySelection>[0]) => {
      onFocus(focusForTopologySelection(selection));
    },
    [onFocus],
  );

  return (
    <section
      aria-label={topologyLabel}
      aria-describedby={topologyDescriptionId}
      className="flex min-h-0 flex-col bg-[#ecfeff] md:h-full"
      data-provenance={provenance}
      data-testid="explore-topology"
    >
      <p className="sr-only" id={topologyDescriptionId}>
        {topologyDescription}
      </p>

      <div className="min-h-0 flex-1">
        {isMobile === null ? (
          <div className="grid min-h-40 place-items-center p-6 text-sm font-bold text-[#466778]">
            Preparing topology…
          </div>
        ) : isMobile ? (
          <SemanticTopologyList
            snapshot={snapshot}
            selectedMessageId={resolvedFocus.selectedMessageId}
            selectedNode={resolvedFocus.selectedCoreNode}
            selectedScenarioNodeId={resolvedFocus.selectedScenarioNodeId}
            scenarioTopology={scenarioTopology}
            onSelectMessage={selectMessage}
            onSelectNode={selectNode}
          />
        ) : (
          <DesktopKafkaTopology
            snapshot={snapshot}
            selectedMessageId={resolvedFocus.selectedMessageId}
            selectedNode={desktopSelectedNode}
            scenarioTopology={scenarioTopology}
            onSelectMessage={selectMessage}
            onSelectNode={selectNode}
          />
        )}
      </div>
    </section>
  );
}
