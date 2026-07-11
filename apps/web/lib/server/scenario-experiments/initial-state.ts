import "server-only";
import type { ScenarioState } from "@kplay/contracts";

const idleExperiment = {
  status: "idle" as const,
  experimentId: null,
  stepIndex: 0,
  totalSteps: 0,
  startedAtVirtualMs: null,
  completedAtVirtualMs: null,
  error: null,
};

function base<const ScenarioId extends ScenarioState["scenarioId"]>(
  scenarioId: ScenarioId,
) {
  return {
    version: 1 as const,
    scenarioId,
    virtualTimeMs: 0,
    revision: 0,
    experiment: idleExperiment,
  };
}

export function createInitialScenarioState(
  scenarioId: string,
): ScenarioState | null {
  switch (scenarioId) {
    case "partitioning":
      return {
        ...base(scenarioId),
        routingTraces: [],
        partitionPositions: [0, 1].map((partition) => ({
          id: `partition-${partition}-position`,
          provenance: "simulated" as const,
          partition,
          processedOffset: null,
          committedOffset: null,
        })),
        consumers: [],
        assignmentEpoch: 0,
      };
    case "fan-out-load-balancing":
      return { ...base(scenarioId), epochs: [] };
    case "at-least-once-duplicates":
      return { ...base(scenarioId), deliveries: [], sideEffects: [] };
    case "retry-dead-letter-queues":
      return { ...base(scenarioId), records: [] };
    case "schema-evolution-karapace":
      return {
        ...base(scenarioId),
        activeVersion: 1,
        topicRecordCount: 0,
        attempts: [],
      };
    case "transactional-producers":
      return { ...base(scenarioId), transactions: [] };
    case "event-replay-sourcing":
      return {
        ...base(scenarioId),
        log: [],
        cursor: null,
        projection: {},
        rebuildInProgress: false,
        producedCount: 0,
      };
    case "consumer-lag-backpressure":
      return {
        ...base(scenarioId),
        samples: [],
        partitions: [0, 1, 2].map((partition) => ({
          id: `lag-partition-${partition}`,
          provenance: "simulated" as const,
          partition,
          endOffset: "0",
          committedOffset: "0",
          lag: 0,
        })),
        consumerCount: 1,
        drainEstimateMs: null,
      };
    case "hot-partitions-key-skew":
      return { ...base(scenarioId), phases: [] };
    case "log-compaction-tombstones":
      return {
        ...base(scenarioId),
        rawLog: [],
        materialized: [],
        cleanerPasses: [],
      };
    case "retention-data-loss":
      return {
        ...base(scenarioId),
        records: [],
        retentionMs: 60_000,
        cutoffVirtualMs: 0,
        logStartOffset: "0",
        committedOffset: "0",
        error: null,
        lastOffsetOutOfRange: null,
      };
    case "cooperative-rebalancing":
      return { ...base(scenarioId), comparisons: [] };
    case "streams-joins-windows":
      return {
        ...base(scenarioId),
        inputs: [],
        windows: [],
        joins: [],
        lateRecords: [],
      };
    case "outbox-cdc":
      return {
        ...base(scenarioId),
        dbTransactions: [],
        wal: [],
        connectorAttempts: [],
        publishes: [],
        dedupeLedger: [],
      };
    case "acl-least-privilege":
      return {
        ...base(scenarioId),
        policies: [
          {
            id: "policy-orders-read",
            provenance: "simulated",
            principal: "orders-service",
            operation: "read",
            resource: "orders",
            effect: "allow",
          },
        ],
        attempts: [],
        lastHighlightedCell: null,
      };
    default:
      return null;
  }
}
