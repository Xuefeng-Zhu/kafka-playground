import "server-only";
import {
  isScenarioExperimentIdFor,
  scenarioExperimentDescriptorFor,
  scenarioExperimentIds,
  type ScenarioExperimentId,
  type ScenarioState,
} from "@kplay/contracts";

export const SCENARIO_EXPERIMENT_IDS = scenarioExperimentIds;

export function supportsScenarioExperiment(
  state: ScenarioState,
  experimentId: string,
): experimentId is ScenarioExperimentId {
  return isScenarioExperimentIdFor(state.scenarioId, experimentId);
}

export function scenarioExperimentPrerequisite(
  state: ScenarioState,
  experimentId: string,
): ScenarioExperimentId | null {
  return (
    scenarioExperimentDescriptorFor(state.scenarioId, experimentId)
      ?.prerequisite ?? null
  );
}
