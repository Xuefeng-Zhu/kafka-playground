import "server-only";
import type { ScenarioState, ScenarioStateId } from "@kplay/contracts";
import type { StateFor } from "./types";

const idleExperiment = {
  status: "idle" as const,
  experimentId: null,
  stepIndex: 0,
  totalSteps: 0,
  startedAtVirtualMs: null,
  completedAtVirtualMs: null,
  error: null,
};

function base<const Id extends ScenarioStateId>(scenarioId: Id) {
  return {
    version: 1 as const,
    scenarioId,
    virtualTimeMs: 0,
    revision: 0,
    experiment: idleExperiment,
  };
}

type InitialScenarioStateFactory<Id extends ScenarioStateId> = (
  partitionCount: number,
) => StateFor<Id>;

function validatePartitionCount(partitionCount: number) {
  if (!Number.isInteger(partitionCount) || partitionCount <= 0) {
    throw new Error("Scenario partition count must be a positive integer.");
  }
}

function partitionIndexes(partitionCount: number) {
  return Array.from({ length: partitionCount }, (_, partition) => partition);
}

const initialScenarioStateFactories = {
  partitioning: (partitionCount) => ({
    ...base("partitioning"),
    routingTraces: [],
    partitionPositions: partitionIndexes(partitionCount).map((partition) => ({
      id: `partition-${partition}-position`,
      provenance: "simulated" as const,
      partition,
      processedOffset: null,
      committedOffset: null,
    })),
    consumers: [],
    assignmentEpoch: 0,
  }),
  "fan-out-load-balancing": () => ({
    ...base("fan-out-load-balancing"),
    epochs: [],
  }),
  "at-least-once-duplicates": () => ({
    ...base("at-least-once-duplicates"),
    deliveries: [],
    sideEffects: [],
  }),
  "retry-dead-letter-queues": () => ({
    ...base("retry-dead-letter-queues"),
    records: [],
  }),
  "schema-evolution-karapace": () => ({
    ...base("schema-evolution-karapace"),
    activeVersion: 1,
    topicRecordCount: 0,
    attempts: [],
  }),
  "transactional-producers": () => ({
    ...base("transactional-producers"),
    transactions: [],
  }),
  "event-replay-sourcing": () => ({
    ...base("event-replay-sourcing"),
    log: [],
    cursor: null,
    projection: {},
    rebuildInProgress: false,
    producedCount: 0,
  }),
  "consumer-lag-backpressure": (partitionCount) => ({
    ...base("consumer-lag-backpressure"),
    samples: [],
    partitions: partitionIndexes(partitionCount).map((partition) => ({
      id: `lag-partition-${partition}`,
      provenance: "simulated" as const,
      partition,
      endOffset: "0",
      committedOffset: "0",
      lag: 0,
    })),
    consumerCount: 1,
    drainEstimateMs: null,
  }),
  "hot-partitions-key-skew": () => ({
    ...base("hot-partitions-key-skew"),
    phases: [],
  }),
  "log-compaction-tombstones": () => ({
    ...base("log-compaction-tombstones"),
    rawLog: [],
    materialized: [],
    cleanerPasses: [],
  }),
  "retention-data-loss": () => ({
    ...base("retention-data-loss"),
    records: [],
    retentionMs: 60_000,
    cutoffVirtualMs: 0,
    logStartOffset: "0",
    committedOffset: "0",
    error: null,
    lastOffsetOutOfRange: null,
  }),
  "cooperative-rebalancing": () => ({
    ...base("cooperative-rebalancing"),
    comparisons: [],
  }),
  "streams-joins-windows": () => ({
    ...base("streams-joins-windows"),
    inputs: [],
    windows: [],
    joins: [],
    lateRecords: [],
  }),
  "outbox-cdc": () => ({
    ...base("outbox-cdc"),
    dbTransactions: [],
    wal: [],
    connectorAttempts: [],
    publishes: [],
    dedupeLedger: [],
  }),
  "acl-least-privilege": () => ({
    ...base("acl-least-privilege"),
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
  }),
} satisfies {
  [Id in ScenarioStateId]: InitialScenarioStateFactory<Id>;
};

export function createInitialScenarioState<Id extends ScenarioStateId>(
  scenarioId: Id,
  partitionCount: number,
): StateFor<Id>;
export function createInitialScenarioState(
  scenarioId: ScenarioStateId,
  partitionCount: number,
): ScenarioState {
  validatePartitionCount(partitionCount);
  return initialScenarioStateFactories[scenarioId](partitionCount);
}
