"use client";

import { useMemo } from "react";
import type { RunSnapshot } from "@kplay/contracts";
import { hasActiveConsumerTaskDuration } from "@/lib/client/current-consumer-task";
import type { ScenarioExploreTopologyProjection } from "@/lib/client/scenario-experience/explore-topology";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { deriveRuntimeTopologyState } from "@/lib/client/runtime-topology-state";
import { topologyProvenance } from "@/lib/client/topology-provenance";
import { useLiveTaskClock } from "@/lib/client/use-live-task-clock";
import { CoreSemanticTopology } from "./semantic-topology-core";
import { ProjectedSemanticTopology } from "./semantic-topology-projected";

export function SemanticTopologyList({
  snapshot,
  scenarioTopology = null,
  selectedMessageId,
  selectedNode,
  selectedScenarioNodeId,
  onSelectMessage,
  onSelectNode,
}: {
  snapshot: RunSnapshot;
  scenarioTopology?: ScenarioExploreTopologyProjection | null;
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  selectedScenarioNodeId: string | null;
  onSelectMessage(messageId: string): void;
  onSelectNode(selection: TopologySelection): void;
}) {
  const {
    activeConsumerId,
    activePartition,
    assignmentByPartition,
    partitions,
  } = useMemo(() => deriveRuntimeTopologyState(snapshot), [snapshot]);
  const provenance = topologyProvenance(snapshot);
  const taskNowMs = useLiveTaskClock(hasActiveConsumerTaskDuration(snapshot));
  const sharedNodeProps = {
    activeConsumerId,
    activePartition,
    assignmentByPartition,
    onSelectMessage,
    onSelectNode,
    partitions,
    selectedMessageId,
    selectedNode,
    selectedScenarioNodeId,
    snapshot,
    taskNowMs,
  };

  return (
    <ol
      aria-label="Kafka runtime topology"
      className="space-y-3 p-3 sm:p-4"
      data-testid="semantic-topology-list"
    >
      {scenarioTopology ? (
        <ProjectedSemanticTopology
          projection={scenarioTopology}
          sharedNodeProps={sharedNodeProps}
        />
      ) : (
        <CoreSemanticTopology
          provenance={provenance}
          sharedNodeProps={sharedNodeProps}
        />
      )}
    </ol>
  );
}
