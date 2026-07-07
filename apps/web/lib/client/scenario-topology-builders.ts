import type { RunSnapshot } from "@kplay/contracts";
import type { ScenarioId } from "@kplay/scenario-engine";
import {
  buildAtLeastOnceDuplicatesTopology,
  buildConsumerLagBackpressureTopology,
  buildDefaultTopology,
  buildFanOutLoadBalancingTopology,
  buildHotPartitionsKeySkewTopology,
  buildRetryDeadLetterQueuesTopology,
} from "./scenario-topology-foundation-builders";
import {
  buildEventReplaySourcingTopology,
  buildLogCompactionTombstonesTopology,
  buildOutboxCdcTopology,
  buildRetentionDataLossTopology,
  buildSchemaEvolutionKarapaceTopology,
  buildTransactionalProducersTopology,
} from "./scenario-topology-state-builders";
import {
  buildAclLeastPrivilegeTopology,
  buildCooperativeRebalancingTopology,
  buildStreamsJoinsWindowsTopology,
} from "./scenario-topology-coordination-builders";
import {
  createScenarioTopologyContext,
  type ScenarioTopologyContext,
  type ScenarioTopologyModel,
} from "./scenario-topology-model";

type ScenarioTopologyBuilder = (
  context: ScenarioTopologyContext,
) => ScenarioTopologyModel;
type CustomTopologyScenarioId = Exclude<ScenarioId, "partitioning">;

const scenarioTopologyBuilders: Record<
  CustomTopologyScenarioId,
  ScenarioTopologyBuilder
> = {
  "fan-out-load-balancing": buildFanOutLoadBalancingTopology,
  "at-least-once-duplicates": buildAtLeastOnceDuplicatesTopology,
  "retry-dead-letter-queues": buildRetryDeadLetterQueuesTopology,
  "schema-evolution-karapace": buildSchemaEvolutionKarapaceTopology,
  "transactional-producers": buildTransactionalProducersTopology,
  "event-replay-sourcing": buildEventReplaySourcingTopology,
  "consumer-lag-backpressure": buildConsumerLagBackpressureTopology,
  "hot-partitions-key-skew": buildHotPartitionsKeySkewTopology,
  "log-compaction-tombstones": buildLogCompactionTombstonesTopology,
  "retention-data-loss": buildRetentionDataLossTopology,
  "cooperative-rebalancing": buildCooperativeRebalancingTopology,
  "streams-joins-windows": buildStreamsJoinsWindowsTopology,
  "outbox-cdc": buildOutboxCdcTopology,
  "acl-least-privilege": buildAclLeastPrivilegeTopology,
};

export function buildScenarioTopology(
  snapshot: RunSnapshot,
): ScenarioTopologyModel {
  const context = createScenarioTopologyContext(snapshot);
  const builder = hasCustomScenarioTopology(snapshot.scenarioId)
    ? scenarioTopologyBuilders[snapshot.scenarioId]
    : null;
  return (builder ?? buildDefaultTopology)(context);
}

function hasCustomScenarioTopology(
  scenarioId: string,
): scenarioId is CustomTopologyScenarioId {
  return scenarioId in scenarioTopologyBuilders;
}
