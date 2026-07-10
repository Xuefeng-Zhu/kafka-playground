import { scenarioCheckpointForId } from "../scenario-checkpoints";
import { scenarioExperienceCopy } from "./copy";
import { getScenarioExploreTopologyDefinition } from "./explore-topology";
import type {
  EntityDetailModel,
  EvidenceFact,
  FocusRef,
  ScenarioExperienceDefinition,
  ScenarioExperienceFrame,
  ScenarioExperienceProjectionInput,
  ScenarioExperimentEvidence,
  ScenarioExperienceId,
  ScenarioExperimentTransitionTrailItem,
} from "./model";
import type { RuntimeEvent } from "@kplay/contracts";

export type ScenarioProjector<Id extends ScenarioExperienceId> = (
  definition: ScenarioExperienceDefinition<Id>,
  input: ScenarioExperienceProjectionInput<Id>,
) => ScenarioExperienceFrame<Id>;

export function experienceDefinition<Id extends ScenarioExperienceId>(
  scenarioId: Id,
  projector: ScenarioProjector<Id>,
): ScenarioExperienceDefinition<Id> {
  const definition: ScenarioExperienceDefinition<Id> = {
    scenarioId,
    ...scenarioExperienceCopy[scenarioId],
    checkpoint: scenarioCheckpointForId(scenarioId),
    exploreTopology: getScenarioExploreTopologyDefinition(scenarioId),
    project(input) {
      return projector(definition, input);
    },
  };
  return definition;
}

export function experimentEvidence<Id extends ScenarioExperienceId>(
  definition: ScenarioExperienceDefinition<Id>,
  input: ScenarioExperienceProjectionInput<Id>,
  current: readonly EvidenceFact[],
  before: readonly EvidenceFact[] = [],
  after: readonly EvidenceFact[] = [],
): ScenarioExperimentEvidence {
  const completedOrRunningId = input.scenarioState.experiment.experimentId;
  const activeId = completedOrRunningId ?? definition.experiments.primary.id;
  const metadata =
    definition.experiments.contrast.id === activeId
      ? definition.experiments.contrast
      : definition.experiments.primary;
  const status = input.scenarioState.experiment.status;
  const completedExperimentIds = completedExperiments(
    definition,
    activeId,
    status,
  );
  return {
    experimentId: completedOrRunningId,
    status,
    error: input.scenarioState.experiment.error,
    completedExperimentIds,
    hypothesis: metadata.hypothesis,
    before,
    current,
    after,
  };
}

function completedExperiments<Id extends ScenarioExperienceId>(
  definition: ScenarioExperienceDefinition<Id>,
  activeId: string | null,
  status: ScenarioExperimentEvidence["status"],
): readonly string[] {
  const { primary, contrast } = definition.experiments;
  if (status !== "completed") return [];
  if (activeId === contrast.id) return [primary.id, contrast.id];
  return activeId === primary.id ? [primary.id] : [];
}

export function experimentTransitionTrail(
  events: readonly RuntimeEvent[],
  scenarioId: string,
  experimentId: string | null,
): ScenarioExperimentTransitionTrailItem[] {
  const transitions = events.filter(
    (
      event,
    ): event is Extract<
      RuntimeEvent,
      { type: "scenario.experiment.transition" }
    > =>
      event.type === "scenario.experiment.transition" &&
      event.scenarioId === scenarioId,
  );
  const activeExperimentId =
    experimentId ?? transitions.at(-1)?.experimentId ?? null;
  if (activeExperimentId === null) return [];
  const latestStartSequence = events
    .filter(
      (event) =>
        event.type === "scenario.experiment.started" &&
        event.scenarioId === scenarioId &&
        event.experimentId === activeExperimentId,
    )
    .at(-1)?.sequence;

  return transitions
    .filter(
      (event) =>
        event.experimentId === activeExperimentId &&
        (latestStartSequence === undefined ||
          event.sequence > latestStartSequence),
    )
    .map((event) => ({
      id: event.eventId,
      experimentId: event.experimentId,
      stepLabel: event.step.label,
      stepIndex: event.step.index,
      totalSteps: event.step.total,
      virtualTimeMs: event.virtualTimeMs,
      provenance: event.provenance,
      transition: event.transition,
      focus: { kind: "event", id: event.eventId },
    }));
}

export function evidenceFocusForRuntimeEvent(
  focus: FocusRef | null,
  event: RuntimeEvent | null,
  entityDetails: Readonly<Record<string, EntityDetailModel>>,
): FocusRef | null {
  if (focus?.kind !== "event" || !event) return focus;
  if ("entityIds" in event) {
    const matchingEntityId = event.entityIds.find(
      (candidate) => candidate in entityDetails,
    );
    if (matchingEntityId) {
      const detail = entityDetails[matchingEntityId];
      return {
        kind: "entity",
        id: matchingEntityId,
        ...(detail?.graphEntityId
          ? { graphEntityId: detail.graphEntityId }
          : {}),
      };
    }
  }
  if ("messageId" in event && event.messageId) {
    return {
      kind: "message",
      id: event.messageId,
      ...("partition" in event && typeof event.partition === "number"
        ? { partition: event.partition }
        : {}),
      ...("offset" in event && typeof event.offset === "string"
        ? { offset: event.offset }
        : {}),
    };
  }
  if (!("entityIds" in event)) return focus;
  const entityId =
    event.entityIds.find((candidate) => candidate in entityDetails) ??
    event.entityIds[0];
  if (!entityId) return focus;
  const detail = entityDetails[entityId];
  return {
    kind: "entity",
    id: entityId,
    ...(detail?.graphEntityId ? { graphEntityId: detail.graphEntityId } : {}),
  };
}

export function relatedGraphFocus(
  focus: FocusRef | null,
  event: RuntimeEvent | null,
  graphNodeIds: readonly string[],
): FocusRef | null {
  if (!focus) return null;
  const nodeIds = new Set(graphNodeIds);
  if (focus.kind === "entity") {
    return focus.graphEntityId && nodeIds.has(focus.graphEntityId)
      ? { kind: "entity", id: focus.graphEntityId }
      : focus;
  }
  if (focus.kind === "message") {
    const partitionId =
      focus.partition == null ? null : `partition-${focus.partition}`;
    if (partitionId && nodeIds.has(partitionId)) {
      return { kind: "entity", id: partitionId };
    }
    return nodeIds.has(focus.id) ? { kind: "entity", id: focus.id } : focus;
  }
  if (event && "entityIds" in event) {
    const entityId = event.entityIds.find((id) => nodeIds.has(id));
    if (entityId) return { kind: "entity", id: entityId };
  }
  if (
    event &&
    "partition" in event &&
    typeof event.partition === "number" &&
    nodeIds.has(`partition-${event.partition}`)
  ) {
    return { kind: "entity", id: `partition-${event.partition}` };
  }
  return focus;
}
