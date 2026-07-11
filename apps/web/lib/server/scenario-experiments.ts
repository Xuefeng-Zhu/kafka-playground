import "server-only";
import type { ScenarioState } from "@kplay/contracts";
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
  ScenarioExperimentObservations,
  ScenarioExperimentTransition,
} from "./scenario-experiments/types";

export {
  createInitialScenarioState,
  SCENARIO_EXPERIMENT_IDS,
  scenarioExperimentPrerequisite,
  supportsScenarioExperiment,
};
export type { ScenarioExperimentObservations, ScenarioExperimentTransition };

export function buildScenarioExperimentResult(input: {
  state: ScenarioState;
  experimentId: string;
  startedAtVirtualMs: number;
  observations?: ScenarioExperimentObservations;
}): { state: ScenarioState; transitions: ScenarioExperimentTransition[] } {
  const { state, experimentId, startedAtVirtualMs, observations } = input;
  const handlerInput = {
    experimentId,
    startedAtVirtualMs,
    observations,
  };

  switch (state.scenarioId) {
    case "partitioning":
      return buildPartitioningExperiment({ ...handlerInput, state });
    case "fan-out-load-balancing":
      return buildLoadBalancingExperiment({ ...handlerInput, state });
    case "at-least-once-duplicates":
      return buildAtLeastOnceExperiment({ ...handlerInput, state });
    case "retry-dead-letter-queues":
      return buildRetryDeadLetterExperiment({ ...handlerInput, state });
    case "schema-evolution-karapace":
      return buildSchemaEvolutionExperiment({ ...handlerInput, state });
    case "transactional-producers":
      return buildTransactionalProducerExperiment({ ...handlerInput, state });
    case "event-replay-sourcing":
      return buildEventReplayExperiment({ ...handlerInput, state });
    case "consumer-lag-backpressure":
      return buildConsumerLagExperiment({ ...handlerInput, state });
    case "hot-partitions-key-skew":
      return buildHotPartitionExperiment({ ...handlerInput, state });
    case "log-compaction-tombstones":
      return buildLogCompactionExperiment({ ...handlerInput, state });
    case "retention-data-loss":
      return buildRetentionExperiment({ ...handlerInput, state });
    case "cooperative-rebalancing":
      return buildCooperativeRebalancingExperiment({
        ...handlerInput,
        state,
      });
    case "streams-joins-windows":
      return buildStreamsJoinExperiment({ ...handlerInput, state });
    case "outbox-cdc":
      return buildOutboxCdcExperiment({ ...handlerInput, state });
    case "acl-least-privilege":
      return buildAclExperiment({ ...handlerInput, state });
  }

  return assertNever(state);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported scenario state: ${JSON.stringify(value)}`);
}
