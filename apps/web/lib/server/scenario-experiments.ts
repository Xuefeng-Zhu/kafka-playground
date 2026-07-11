import "server-only";
import {
  isScenarioExperimentIdFor,
  type ScenarioExperimentId,
  type ScenarioExperimentIdFor,
  type ScenarioState,
} from "@kplay/contracts";
import {
  SCENARIO_EXPERIMENT_IDS,
  scenarioExperimentPrerequisite,
  supportsScenarioExperiment,
} from "./scenario-experiments/catalog";
import {
  buildAclExperiment,
  buildSchemaEvolutionExperiment,
  buildTransactionalProducerExperiment,
} from "./scenario-experiments/consistency";
import {
  buildEventReplayExperiment,
  buildLogCompactionExperiment,
  buildRetentionExperiment,
} from "./scenario-experiments/data-lifecycle";
import {
  buildAtLeastOnceExperiment,
  buildConsumerLagExperiment,
  buildRetryDeadLetterExperiment,
} from "./scenario-experiments/delivery";
import { createInitialScenarioState } from "./scenario-experiments/initial-state";
import {
  buildOutboxCdcExperiment,
  buildStreamsJoinExperiment,
} from "./scenario-experiments/pipelines";
import {
  buildCooperativeRebalancingExperiment,
  buildHotPartitionExperiment,
  buildLoadBalancingExperiment,
  buildPartitioningExperiment,
} from "./scenario-experiments/routing";
import type {
  ScenarioExperimentHandler,
  ScenarioExperimentInput,
  ScenarioExperimentObservations,
  ScenarioExperimentResult,
  ScenarioExperimentTransition,
  ScenarioId,
  StateFor,
} from "./scenario-experiments/types";

export {
  createInitialScenarioState,
  SCENARIO_EXPERIMENT_IDS,
  scenarioExperimentPrerequisite,
  supportsScenarioExperiment,
};
export type { ScenarioExperimentObservations, ScenarioExperimentTransition };

export function buildScenarioExperimentResult<Id extends ScenarioId>(
  input: ScenarioExperimentInput<Id>,
): ScenarioExperimentResult<Id>;
export function buildScenarioExperimentResult(input: {
  state: ScenarioState;
  experimentId: ScenarioExperimentId;
  startedAtVirtualMs: number;
  observations?: ScenarioExperimentObservations;
}): {
  state: ScenarioState;
  transitions: ScenarioExperimentTransition[];
} {
  const { state, experimentId, startedAtVirtualMs, observations } = input;

  switch (state.scenarioId) {
    case "partitioning":
      return dispatchScenarioExperiment(
        buildPartitioningExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "fan-out-load-balancing":
      return dispatchScenarioExperiment(
        buildLoadBalancingExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "at-least-once-duplicates":
      return dispatchScenarioExperiment(
        buildAtLeastOnceExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "retry-dead-letter-queues":
      return dispatchScenarioExperiment(
        buildRetryDeadLetterExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "schema-evolution-karapace":
      return dispatchScenarioExperiment(
        buildSchemaEvolutionExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "transactional-producers":
      return dispatchScenarioExperiment(
        buildTransactionalProducerExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "event-replay-sourcing":
      return dispatchScenarioExperiment(
        buildEventReplayExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "consumer-lag-backpressure":
      return dispatchScenarioExperiment(
        buildConsumerLagExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "hot-partitions-key-skew":
      return dispatchScenarioExperiment(
        buildHotPartitionExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "log-compaction-tombstones":
      return dispatchScenarioExperiment(
        buildLogCompactionExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "retention-data-loss":
      return dispatchScenarioExperiment(
        buildRetentionExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "cooperative-rebalancing":
      return dispatchScenarioExperiment(
        buildCooperativeRebalancingExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "streams-joins-windows":
      return dispatchScenarioExperiment(
        buildStreamsJoinExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "outbox-cdc":
      return dispatchScenarioExperiment(
        buildOutboxCdcExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
    case "acl-least-privilege":
      return dispatchScenarioExperiment(
        buildAclExperiment,
        state,
        experimentId,
        startedAtVirtualMs,
        observations,
      );
  }

  return assertNever(state);
}

function dispatchScenarioExperiment<Id extends ScenarioId>(
  handler: ScenarioExperimentHandler<Id>,
  state: StateFor<Id>,
  experimentId: ScenarioExperimentId,
  startedAtVirtualMs: number,
  observations?: ScenarioExperimentObservations,
): ScenarioExperimentResult<Id> {
  return handler({
    state,
    experimentId: requireScenarioExperimentId(state.scenarioId, experimentId),
    startedAtVirtualMs,
    observations,
  });
}

function requireScenarioExperimentId<Id extends ScenarioId>(
  scenarioId: Id,
  experimentId: ScenarioExperimentId,
): ScenarioExperimentIdFor<Id> {
  if (!isScenarioExperimentIdFor(scenarioId, experimentId)) {
    throw new Error(
      `Experiment ${experimentId} does not belong to ${scenarioId}.`,
    );
  }
  return experimentId;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported scenario state: ${JSON.stringify(value)}`);
}
