import {
  scenarioStateIds,
  type RuntimeEvent,
  type ScenarioState,
} from "@kplay/contracts";
import {
  duplicateExperience,
  retryExperience,
  transactionExperience,
} from "./scenarios/delivery";
import {
  cooperativeExperience,
  hotPartitionExperience,
  lagExperience,
  loadBalancingExperience,
  partitioningExperience,
} from "./scenarios/fundamentals";
import { aclExperience, schemaExperience } from "./scenarios/gates";
import {
  compactionExperience,
  replayExperience,
  retentionExperience,
} from "./scenarios/history";
import { outboxExperience, streamsExperience } from "./scenarios/pipelines";
import type {
  ScenarioExperienceDefinition,
  ScenarioExperienceDefinitionRegistry,
  ScenarioExperienceId,
  ScenarioExperienceFrame,
  ScenarioExperienceResolution,
  ScenarioExperienceSnapshot,
} from "./model";

const scenarioExperienceDefinitions = [
  partitioningExperience,
  loadBalancingExperience,
  duplicateExperience,
  retryExperience,
  schemaExperience,
  transactionExperience,
  replayExperience,
  lagExperience,
  hotPartitionExperience,
  compactionExperience,
  retentionExperience,
  cooperativeExperience,
  streamsExperience,
  outboxExperience,
  aclExperience,
] as const;

type AnyScenarioExperienceDefinition =
  ScenarioExperienceDefinitionRegistry[ScenarioExperienceId];

type RegistryFor<
  Definitions extends readonly AnyScenarioExperienceDefinition[],
> = {
  [Definition in Definitions[number] as Definition["scenarioId"]]: Definition;
};

export function createScenarioExperienceDefinitionRegistry<
  const Definitions extends readonly AnyScenarioExperienceDefinition[],
>(definitions: Definitions): RegistryFor<Definitions> {
  const registry: Partial<
    Record<ScenarioExperienceId, AnyScenarioExperienceDefinition>
  > = {};

  for (const definition of definitions) {
    if (Object.hasOwn(registry, definition.scenarioId)) {
      throw new Error(
        `Duplicate scenario experience definition: ${definition.scenarioId}.`,
      );
    }
    registry[definition.scenarioId] = definition;
  }

  const missingScenarioIds = scenarioStateIds.filter(
    (scenarioId) => !Object.hasOwn(registry, scenarioId),
  );
  if (missingScenarioIds.length > 0) {
    throw new Error(
      `Missing scenario experience definitions: ${missingScenarioIds.join(", ")}.`,
    );
  }

  // Duplicate and completeness checks above make this the exact registry
  // represented by the input tuple, while insertion order remains unchanged.
  return registry as RegistryFor<Definitions>;
}

export const scenarioExperienceRegistry =
  createScenarioExperienceDefinitionRegistry(
    scenarioExperienceDefinitions,
  ) satisfies ScenarioExperienceDefinitionRegistry;

export function isScenarioExperienceSupported(
  scenarioId: string,
): scenarioId is ScenarioExperienceId {
  return isScenarioId(scenarioId);
}

export function resolveScenarioExperience(
  snapshot: ScenarioExperienceSnapshot,
  events: readonly RuntimeEvent[] = [],
): ScenarioExperienceResolution {
  if (!isScenarioExperienceSupported(snapshot.scenarioId)) {
    return { kind: "unavailable", reason: "unsupported-scenario" };
  }
  if (snapshot.scenarioState == null) {
    return { kind: "unavailable", reason: "missing-state" };
  }
  if (snapshot.scenarioState.scenarioId !== snapshot.scenarioId) {
    return { kind: "unavailable", reason: "mismatched-state" };
  }
  const frame = projectScenarioExperience(
    snapshot,
    snapshot.scenarioState,
    events,
  );
  return {
    kind: "experience",
    definition: scenarioExperienceRegistry[snapshot.scenarioId],
    frame,
  };
}

export function projectScenarioExperience(
  snapshot: ScenarioExperienceSnapshot,
  scenarioState: ScenarioState,
  events: readonly RuntimeEvent[] = [],
): ScenarioExperienceFrame {
  if (snapshot.scenarioId !== scenarioState.scenarioId) {
    throw new Error(
      `Scenario experience mismatch: snapshot=${snapshot.scenarioId}, state=${scenarioState.scenarioId}`,
    );
  }
  // The equality guard above establishes the snapshot/state correlation at
  // runtime. TypeScript cannot retain that relationship through a computed
  // registry lookup, so widen the selected definition only at this boundary.
  const definition = scenarioExperienceRegistry[
    scenarioState.scenarioId
  ] as ScenarioExperienceDefinition;
  return definition.project({ snapshot, scenarioState, events });
}

function isScenarioId(scenarioId: string): scenarioId is ScenarioExperienceId {
  return Object.hasOwn(scenarioExperienceRegistry, scenarioId);
}
