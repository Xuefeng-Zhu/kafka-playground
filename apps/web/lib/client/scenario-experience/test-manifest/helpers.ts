import type {
  ScenarioExperimentId,
  ScenarioExperimentStatus,
  ScenarioState,
} from "@kplay/contracts";

type TeachingScenarioState<Id extends ScenarioState["scenarioId"]> = Extract<
  ScenarioState,
  { scenarioId: Id }
>;

type TeachingScenarioTestCaseFor<Id extends ScenarioState["scenarioId"]> = {
  scenarioId: Id;
  noviceQuestion: string;
  initial: TeachingScenarioState<Id>;
  primary: TeachingScenarioState<Id>;
  contrast: TeachingScenarioState<Id>;
  expectation: {
    lensKind:
      | "routing"
      | "assignment"
      | "lifecycle"
      | "pipeline"
      | "gate"
      | "transaction"
      | "projection"
      | "capacity"
      | "heatmap"
      | "window-join";
    initialFact: readonly [id: string, value: string | number];
    primaryFact: readonly [id: string, value: string | number];
    contrastFact: readonly [id: string, value: string | number];
  };
};

export type TeachingScenarioTestCase<
  Id extends ScenarioState["scenarioId"] = ScenarioState["scenarioId"],
> = Id extends ScenarioState["scenarioId"]
  ? TeachingScenarioTestCaseFor<Id>
  : never;

export const simulated = { provenance: "simulated" as const };

export function testCase<const Id extends ScenarioState["scenarioId"]>(
  scenarioId: Id,
  noviceQuestion: string,
  initial: TeachingScenarioState<Id>,
  primary: TeachingScenarioState<Id>,
  contrast: TeachingScenarioState<Id>,
  lensKind: TeachingScenarioTestCase["expectation"]["lensKind"],
  initialFact: readonly [string, string | number],
  primaryFact: readonly [string, string | number],
  contrastFact: readonly [string, string | number],
): TeachingScenarioTestCaseFor<Id> {
  return {
    scenarioId,
    noviceQuestion,
    initial,
    primary,
    contrast,
    expectation: { lensKind, initialFact, primaryFact, contrastFact },
  };
}

export function state<T extends ScenarioState>(value: T): T {
  return value;
}

export function base<const Id extends ScenarioState["scenarioId"]>(
  scenarioId: Id,
) {
  return {
    version: 1 as const,
    scenarioId,
    virtualTimeMs: 0,
    revision: 0,
    experiment: idle(),
  };
}

export function idle(): ScenarioExperimentStatus {
  return {
    status: "idle",
    experimentId: null,
    stepIndex: 0,
    totalSteps: 0,
    startedAtVirtualMs: null,
    completedAtVirtualMs: null,
    error: null,
  };
}

export function complete<const Id extends ScenarioExperimentId>(
  experimentId: Id,
  totalSteps = 1,
) {
  return {
    status: "completed" as const,
    experimentId,
    stepIndex: totalSteps,
    totalSteps,
    startedAtVirtualMs: 0,
    completedAtVirtualMs: totalSteps * 100,
    error: null,
  } satisfies ScenarioExperimentStatus;
}

export function position(
  partition: number,
  processedOffset: string | null,
  committedOffset: string | null,
) {
  return {
    ...simulated,
    id: `position-${partition}`,
    partition,
    processedOffset,
    committedOffset,
  };
}
export function route(
  id: string,
  messageId: string,
  key: string,
  partition: number,
  offset: string,
  sequence: number,
) {
  return { ...simulated, id, messageId, key, partition, offset, sequence };
}
export function consumer(
  consumerId: string,
  partitions: number[],
  status: "running" | "idle",
) {
  return {
    ...simulated,
    id: `state-${consumerId}`,
    consumerId,
    partitions,
    status,
    epoch: 1,
  };
}
export function epoch(
  value: number,
  partitionSets: number[][],
  idleConsumerIds: string[],
) {
  const memberIds = partitionSets.map((_, index) => `consumer-${index + 1}`);
  return {
    ...simulated,
    id: `epoch-${value}`,
    epoch: value,
    memberIds,
    assignments: partitionSets.map((partitions, index) => ({
      consumerId: memberIds[index],
      partitions,
    })),
    idleConsumerIds,
  };
}
