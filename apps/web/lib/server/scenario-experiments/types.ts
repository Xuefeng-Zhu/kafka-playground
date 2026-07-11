import type {
  EvidenceProvenance,
  ScenarioExperimentIdFor,
  ScenarioExperimentTransitionId,
  ScenarioState,
} from "@kplay/contracts";

export type ScenarioId = ScenarioState["scenarioId"];

export type StateFor<ScenarioIdValue extends ScenarioId> = Extract<
  ScenarioState,
  { scenarioId: ScenarioIdValue }
>;

export type ScenarioExperimentTransition = {
  id: string;
  label: string;
  transition: ScenarioExperimentTransitionId;
  entityIds: string[];
  provenance: EvidenceProvenance;
  advanceMs: number;
  messageId?: string;
  partition?: number;
  offset?: string;
};

export type ScenarioExperimentObservations = {
  partitioning?: Pick<
    StateFor<"partitioning">,
    "routingTraces" | "partitionPositions" | "consumers" | "assignmentEpoch"
  >;
  loadBalancing?: Pick<StateFor<"fan-out-load-balancing">, "epochs"> & {
    routes: Array<{
      messageId: string;
      partition: number;
      offset: string;
    }>;
  };
};

export type ScenarioExperimentInput<ScenarioIdValue extends ScenarioId> = {
  state: StateFor<ScenarioIdValue>;
  experimentId: ScenarioExperimentIdFor<NoInfer<ScenarioIdValue>>;
  startedAtVirtualMs: number;
  observations?: ScenarioExperimentObservations;
};

export type ScenarioExperimentResult<ScenarioIdValue extends ScenarioId> = {
  state: StateFor<ScenarioIdValue>;
  transitions: ScenarioExperimentTransition[];
};

export type ScenarioExperimentHandler<ScenarioIdValue extends ScenarioId> = (
  input: ScenarioExperimentInput<ScenarioIdValue>,
) => ScenarioExperimentResult<ScenarioIdValue>;
