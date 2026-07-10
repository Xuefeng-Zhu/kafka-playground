import "server-only";
import type { EvidenceProvenance, ScenarioState } from "@kplay/contracts";

type StateFor<ScenarioId extends ScenarioState["scenarioId"]> = Extract<
  ScenarioState,
  { scenarioId: ScenarioId }
>;

export type ScenarioExperimentTransition = {
  id: string;
  label: string;
  transition: string;
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

export const SCENARIO_EXPERIMENT_IDS = {
  partitioning: ["produce-keyed-record", "grow-consumer-group"],
  "fan-out-load-balancing": [
    "produce-unkeyed-burst",
    "balance-settings",
    "grow-consumer-group",
  ],
  "at-least-once-duplicates": [
    "duplicate-risk-records",
    "slow-commit-window",
    "crash-and-redeliver",
  ],
  "retry-dead-letter-queues": [
    "trigger-retry-failure",
    "transient-recovery",
    "poison-to-dlq",
  ],
  "schema-evolution-karapace": [
    "trigger-schema-rejection",
    "compatible-schema",
  ],
  "transactional-producers": ["transaction-pair", "abort-and-dedupe"],
  "event-replay-sourcing": ["aggregate-events", "rebuild-projection"],
  "consumer-lag-backpressure": ["build-lag", "recover-lag"],
  "hot-partitions-key-skew": ["hot-key-burst", "balanced-comparison"],
  "log-compaction-tombstones": [
    "compacted-key-series",
    "run-compaction",
    "expire-tombstone",
  ],
  "retention-data-loss": [
    "retention-window",
    "advance-retention",
    "recover-retention",
  ],
  "cooperative-rebalancing": ["cooperative-pressure", "compare-rebalance"],
  "streams-joins-windows": ["window-pair", "late-arrival"],
  "outbox-cdc": ["cdc-batch", "retry-cdc"],
  "acl-least-privilege": ["trigger-acl-denial", "grant-required-permission"],
} as const satisfies Record<ScenarioState["scenarioId"], readonly string[]>;

const SCENARIO_EXPERIMENT_PREREQUISITES: Record<
  ScenarioState["scenarioId"],
  Readonly<Record<string, string>>
> = {
  partitioning: { "grow-consumer-group": "produce-keyed-record" },
  "fan-out-load-balancing": {
    "produce-unkeyed-burst": "grow-consumer-group",
  },
  "at-least-once-duplicates": {
    "duplicate-risk-records": "crash-and-redeliver",
  },
  "retry-dead-letter-queues": {
    "poison-to-dlq": "transient-recovery",
  },
  "schema-evolution-karapace": {
    "trigger-schema-rejection": "compatible-schema",
  },
  "transactional-producers": { "abort-and-dedupe": "transaction-pair" },
  "event-replay-sourcing": { "rebuild-projection": "aggregate-events" },
  "consumer-lag-backpressure": { "recover-lag": "build-lag" },
  "hot-partitions-key-skew": { "balanced-comparison": "hot-key-burst" },
  "log-compaction-tombstones": { "expire-tombstone": "run-compaction" },
  "retention-data-loss": { "recover-retention": "advance-retention" },
  "cooperative-rebalancing": {
    "cooperative-pressure": "compare-rebalance",
  },
  "streams-joins-windows": { "late-arrival": "window-pair" },
  "outbox-cdc": { "retry-cdc": "cdc-batch" },
  "acl-least-privilege": {
    "grant-required-permission": "trigger-acl-denial",
  },
};

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

export function supportsScenarioExperiment(
  state: ScenarioState,
  experimentId: string,
) {
  return (
    SCENARIO_EXPERIMENT_IDS[state.scenarioId] as readonly string[]
  ).includes(experimentId);
}

export function scenarioExperimentPrerequisite(
  state: ScenarioState,
  experimentId: string,
): string | null {
  return (
    SCENARIO_EXPERIMENT_PREREQUISITES[state.scenarioId][experimentId] ?? null
  );
}

export function buildScenarioExperimentResult(input: {
  state: ScenarioState;
  experimentId: string;
  startedAtVirtualMs: number;
  observations?: ScenarioExperimentObservations;
}): { state: ScenarioState; transitions: ScenarioExperimentTransition[] } {
  const { state, experimentId, startedAtVirtualMs, observations } = input;
  const simulated = "simulated" as const;
  let transitions: ScenarioExperimentTransition[];
  let nextState: ScenarioState;

  switch (state.scenarioId) {
    case "partitioning": {
      const growGroup = experimentId === "grow-consumer-group";
      transitions = growGroup
        ? [
            step(
              "assign-consumers",
              "Assign three consumers",
              "group.assignment.changed",
              ["consumer-1", "consumer-2", "consumer-3"],
              100,
            ),
          ]
        : [
            step("route-key-a", "Route key A", "key.hashed", ["key-A"], 100),
            step("route-key-b", "Route key B", "key.hashed", ["key-B"], 100),
            step(
              "route-key-a-again",
              "Route key A again",
              "partition.order.extended",
              ["key-A"],
              100,
            ),
            step(
              "assign-primary-consumer",
              "Assign the processing consumer",
              "group.assignment_changed",
              ["consumer-1"],
              100,
            ),
          ];
      const observed = observations?.partitioning;
      const fallback: NonNullable<
        ScenarioExperimentObservations["partitioning"]
      > = {
        routingTraces: [
          route("routing-a-1", "partitioning-message-a-1", "A", 0, "0", 1),
          route("routing-b-1", "partitioning-message-b-1", "B", 1, "0", 2),
          route("routing-a-2", "partitioning-message-a-2", "A", 0, "1", 3),
        ],
        // Kafka commits the next offset to resume from. The second A is
        // processed at offset 1 but intentionally left uncommitted, so the
        // group would resume at that same offset after a restart.
        partitionPositions: [position(0, "1", "1"), position(1, "0", "1")],
        consumers: growGroup
          ? [
              consumer("consumer-1", [0], "running", 1),
              consumer("consumer-2", [1], "running", 1),
              consumer("consumer-3", [], "idle", 1),
            ]
          : [consumer("consumer-1", [0, 1], "running", 1)],
        assignmentEpoch: 1,
      };
      const partitioning = observed ?? {
        ...fallback,
        routingTraces: growGroup ? state.routingTraces : fallback.routingTraces,
        partitionPositions: growGroup
          ? state.partitionPositions
          : fallback.partitionPositions,
        assignmentEpoch: growGroup
          ? state.assignmentEpoch + 1
          : fallback.assignmentEpoch,
      };
      transitions = transitions.map((transition, index) => {
        const trace = transition.id.startsWith("route-")
          ? partitioning.routingTraces[index]
          : undefined;
        return trace
          ? {
              ...transition,
              entityIds: [
                trace.id,
                trace.messageId,
                `partition-${trace.partition}-position`,
                ...transition.entityIds,
              ],
              messageId: trace.messageId,
              partition: trace.partition,
              offset: trace.offset,
            }
          : transition.id === "assign-consumers" ||
              transition.id === "assign-primary-consumer"
            ? {
                ...transition,
                entityIds: [
                  ...partitioning.consumers.map((consumer) => consumer.id),
                  ...transition.entityIds,
                ],
              }
            : transition;
      });
      nextState = complete(
        {
          ...state,
          ...partitioning,
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "fan-out-load-balancing": {
      const unkeyedBurst = experimentId === "produce-unkeyed-burst";
      const settingsOnly = experimentId === "balance-settings";
      transitions = unkeyedBurst
        ? (observations?.loadBalancing?.routes.length
            ? observations.loadBalancing.routes
            : [0, 1, 2].map((partition) => ({
                messageId: `load-message-${partition + 1}`,
                partition,
                offset: "0",
              }))
          ).map((route, index) => ({
            ...step(
              `route-unkeyed-${index + 1}`,
              `Route unkeyed record ${index + 1}`,
              "record.partitioned",
              [route.messageId, `partition-${route.partition}`],
              100,
            ),
            messageId: route.messageId,
            partition: route.partition,
            offset: route.offset,
          }))
        : settingsOnly
          ? [
              step(
                "balance-settings",
                "Apply balance settings",
                "producer.settings_changed",
                ["producer"],
                100,
              ),
            ]
          : [1, 2, 3, 4].map((members) =>
              step(
                `members-${members}`,
                `Grow group to ${members}`,
                "group.assignment_changed",
                [
                  `assignment-epoch-${members}`,
                  ...Array.from(
                    { length: members },
                    (_, index) => `consumer-${index + 1}`,
                  ),
                ],
                100,
              ),
            );
      const fallbackEpochs = [
        epoch(1, [[0, 1, 2]], []),
        epoch(2, [[0, 2], [1]], []),
        epoch(3, [[0], [1], [2]], []),
        epoch(4, [[0], [1], [2], []], ["consumer-4"]),
      ];
      nextState = complete(
        {
          ...state,
          epochs:
            unkeyedBurst || settingsOnly
              ? state.epochs
              : observations?.loadBalancing?.epochs.length
                ? observations.loadBalancing.epochs
                : state.epochs.length
                  ? state.epochs
                  : fallbackEpochs,
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "at-least-once-duplicates": {
      const redeliver = experimentId === "crash-and-redeliver";
      const alreadyRedelivered = state.deliveries.some(
        (delivery) => delivery.attempt > 1,
      );
      const showRedelivery = redeliver || alreadyRedelivered;
      transitions = redeliver
        ? [
            {
              ...step(
                "deliver-first-attempt",
                "Deliver partition 0 offset 7",
                "record.delivered",
                ["delivery-1", "duplicate-message-42"],
                100,
              ),
              messageId: "duplicate-message-42",
              partition: 0,
              offset: "7",
            },
            step(
              "side-effect",
              "Apply side effect before commit",
              "side_effect.applied",
              ["payment-42", "ledger-payment-42", "delivery-1"],
              100,
            ),
            {
              ...step(
                "hold",
                "Hold before commit",
                "offset.commit_held",
                ["delivery-1", "duplicate-message-42"],
                100,
              ),
              messageId: "duplicate-message-42",
              partition: 0,
              offset: "7",
            },
            step(
              "crash",
              "Crash before commit",
              "consumer.crashed",
              ["consumer-1", "delivery-1"],
              100,
            ),
            {
              ...step(
                "redeliver",
                "Redeliver same offset",
                "record.redelivered",
                ["delivery-2", "duplicate-message-42"],
                100,
              ),
              messageId: "duplicate-message-42",
              partition: 0,
              offset: "7",
            },
            step(
              "dedupe",
              "Compare handlers",
              "idempotency.checked",
              ["ledger-payment-42", "payment-42"],
              100,
            ),
          ]
        : alreadyRedelivered
          ? [
              step(
                "compare-handlers",
                "Compare handler strategies",
                "idempotency.checked",
                ["ledger-payment-42", "delivery-1", "delivery-2"],
                100,
              ),
            ]
          : [
              step(
                "side-effect",
                "Apply side effect",
                "side_effect.applied",
                ["payment-42", "ledger-payment-42"],
                100,
              ),
              {
                ...step(
                  "hold",
                  "Hold before commit",
                  "offset.commit_held",
                  ["delivery-1"],
                  100,
                ),
                messageId: "duplicate-message-42",
                partition: 0,
                offset: "7",
              },
            ];
      const firstDelivery = {
        id: "delivery-1",
        provenance: simulated,
        messageId: "duplicate-message-42",
        partition: 0,
        offset: "7",
        attempt: 1,
        consumerId: "consumer-1",
        sideEffectApplied: true,
        committed: false,
      };
      const secondDelivery = {
        id: "delivery-2",
        provenance: simulated,
        messageId: "duplicate-message-42",
        partition: 0,
        offset: "7",
        attempt: 2,
        consumerId: "consumer-2",
        sideEffectApplied: true,
        committed: true,
      };
      nextState = complete(
        {
          ...state,
          deliveries: showRedelivery
            ? [firstDelivery, secondDelivery]
            : [firstDelivery],
          sideEffects: [
            {
              id: "ledger-payment-42",
              provenance: simulated,
              idempotencyKey: "payment-42",
              naiveCount: showRedelivery ? 2 : 1,
              idempotentCount: 1,
            },
          ],
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "retry-dead-letter-queues": {
      const transient = experimentId === "transient-recovery";
      transitions = transient
        ? [
            step(
              "transient-attempt-1",
              "Receive transient record (attempt 1 of 3)",
              "record.attempt_started",
              ["retry-transient"],
              100,
            ),
            step(
              "transient-fail",
              "Attempt 1 fails; schedule retry",
              "record.retry_scheduled",
              ["retry-transient"],
              100,
            ),
            step(
              "backoff",
              "Wait 1,000 ms backoff",
              "record.backoff_elapsed",
              ["retry-transient"],
              1_000,
            ),
            step(
              "transient-attempt-2",
              "Retry transient record (attempt 2 of 3)",
              "record.attempt_started",
              ["retry-transient"],
              100,
            ),
            step(
              "transient-success",
              "Attempt 2 succeeds",
              "record.succeeded",
              ["retry-transient"],
              100,
            ),
          ]
        : [
            step(
              "poison-attempt-1",
              "Receive poison record (attempt 1 of 3)",
              "record.attempt_started",
              ["retry-poison"],
              100,
            ),
            step(
              "poison-retry-1",
              "Attempt 1 fails; schedule retry",
              "record.retry_scheduled",
              ["retry-poison"],
              100,
            ),
            step(
              "poison-backoff-1",
              "Wait 1,000 ms backoff",
              "record.backoff_elapsed",
              ["retry-poison"],
              1_000,
            ),
            step(
              "poison-attempt-2",
              "Retry poison record (attempt 2 of 3)",
              "record.attempt_started",
              ["retry-poison"],
              100,
            ),
            step(
              "poison-retry-2",
              "Attempt 2 fails; schedule retry",
              "record.retry_scheduled",
              ["retry-poison"],
              100,
            ),
            step(
              "poison-backoff-2",
              "Wait 2,000 ms backoff",
              "record.backoff_elapsed",
              ["retry-poison"],
              2_000,
            ),
            step(
              "poison-attempt-3",
              "Retry poison record (attempt 3 of 3)",
              "record.attempt_started",
              ["retry-poison"],
              100,
            ),
            step(
              "poison-dlq",
              "Attempt 3 fails; route once to DLQ",
              "record.dead_lettered",
              ["retry-poison"],
              100,
            ),
          ];
      const transientRecord = retryRecord(
        "retry-transient",
        "transient",
        "succeeded",
        2,
        [
          ["main", startedAtVirtualMs + 100],
          ["retry", startedAtVirtualMs + 200],
          ["backoff", startedAtVirtualMs + 200],
          ["retry", startedAtVirtualMs + 1_300],
          ["succeeded", startedAtVirtualMs + 1_400],
        ],
      );
      const poisonRecord = retryRecord("retry-poison", "poison", "dlq", 3, [
        ["main", startedAtVirtualMs + 100],
        ["retry", startedAtVirtualMs + 200],
        ["backoff", startedAtVirtualMs + 200],
        ["retry", startedAtVirtualMs + 1_300],
        ["backoff", startedAtVirtualMs + 1_400],
        ["retry", startedAtVirtualMs + 3_500],
        ["dlq", startedAtVirtualMs + 3_600],
      ]);
      nextState = complete(
        {
          ...state,
          records: transient
            ? upsertById(state.records, transientRecord)
            : upsertById(state.records, poisonRecord),
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "schema-evolution-karapace": {
      const compatible = experimentId === "compatible-schema";
      transitions = compatible
        ? [
            step(
              "v2-diff",
              "Compare schema v2",
              "schema.diffed",
              ["schema-attempt-v2", "schema-v2"],
              100,
            ),
            step(
              "v2-accept",
              "Accept compatible v2",
              "schema.accepted",
              ["schema-attempt-v2", "schema-v2"],
              100,
            ),
          ]
        : [
            step(
              "v3-diff",
              "Compare schema v3",
              "schema.diffed",
              ["schema-attempt-v3", "schema-v3"],
              100,
            ),
            step(
              "v3-reject",
              "Reject incompatible v3",
              "schema.rejected",
              ["schema-attempt-v3", "schema-v3"],
              100,
            ),
          ];
      const attempt = compatible
        ? {
            id: "schema-attempt-v2",
            provenance: simulated,
            version: 2,
            compatible: true,
            fieldDiff: [
              {
                field: "displayName",
                before: null,
                after: "string?",
                compatibility: "compatible" as const,
              },
            ],
            gate: "accepted" as const,
            reachedTopic: true,
          }
        : {
            id: "schema-attempt-v3",
            provenance: simulated,
            version: 3,
            compatible: false,
            fieldDiff: [
              {
                field: "email",
                before: "string",
                after: "object",
                compatibility: "incompatible" as const,
              },
            ],
            gate: "rejected" as const,
            reachedTopic: false,
          };
      nextState = complete(
        {
          ...state,
          activeVersion: compatible ? 2 : state.activeVersion,
          topicRecordCount: state.topicRecordCount + (compatible ? 1 : 0),
          attempts: upsertById(state.attempts, attempt),
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "transactional-producers": {
      const contrast = experimentId === "abort-and-dedupe";
      transitions = contrast
        ? [
            step(
              "abort",
              "Abort second transaction",
              "transaction.aborted",
              ["transaction-row-txn-2", "txn-2", "txn-2-record-1"],
              100,
            ),
            step(
              "dedupe",
              "Suppress duplicate sequence",
              "producer.deduplicated",
              ["transaction-row-txn-3", "txn-3", "txn-3-record-1"],
              100,
            ),
          ]
        : [
            step(
              "stage",
              "Stage transaction records",
              "transaction.staged",
              ["transaction-row-txn-1", "txn-1-record-1", "txn-1-record-2"],
              100,
            ),
            step(
              "commit",
              "Commit atomically",
              "transaction.committed",
              ["transaction-row-txn-1", "txn-1"],
              100,
            ),
          ];
      const committed = transaction(
        "txn-1",
        "committed",
        [0, 1],
        [true, true],
        true,
      );
      const contrasted = [
        transaction("txn-2", "aborted", [2], [false], false),
        {
          ...transaction("txn-3", "committed", [3], [true], true),
          dedupe: [
            { producerSequence: 3, accepted: true },
            { producerSequence: 3, accepted: false },
          ],
        },
      ];
      nextState = complete(
        {
          ...state,
          transactions: contrast
            ? contrasted.reduce(upsertReducer, state.transactions)
            : upsertById(state.transactions, committed),
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "event-replay-sourcing": {
      const rebuild = experimentId === "rebuild-projection";
      transitions = rebuild
        ? [
            step(
              "clear",
              "Clear projection",
              "projection.cleared",
              ["cart-projection"],
              100,
            ),
            step(
              "reset",
              "Reset replay cursor",
              "cursor.reset",
              ["replay-cursor"],
              100,
            ),
            ...state.log.map((event) => ({
              ...step(
                `replay-${event.offset}`,
                `Replay offset ${event.offset}`,
                "event.replayed",
                [event.id],
                100,
              ),
              partition: 0,
              offset: event.offset,
            })),
          ]
        : [0, 1, 2].map((index) => {
            const offset = state.log.length + index;
            return step(
              `append-${offset}`,
              `Append event ${offset}`,
              "event.produced",
              [`event-${offset}`],
              100,
            );
          });
      const appended = [
        replayEvent(state.log.length, "cart-1", "ItemAdded", 1),
        replayEvent(state.log.length + 1, "cart-1", "ItemAdded", 1),
        replayEvent(state.log.length + 2, "cart-1", "ItemRemoved", -1),
      ];
      const log = rebuild ? state.log : [...state.log, ...appended];
      const projection = projectReplayLog(log);
      nextState = complete(
        {
          ...state,
          log,
          cursor: log.at(-1)?.offset ?? null,
          projection,
          rebuildInProgress: false,
          producedCount: rebuild
            ? state.producedCount
            : state.producedCount + appended.length,
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "consumer-lag-backpressure": {
      const recover = experimentId === "recover-lag";
      transitions = recover
        ? [
            step(
              "scale",
              "Add consumers",
              "capacity.increased",
              [
                "lag-sample-1",
                "consumer-2",
                "consumer-3",
                "lag-partition-0",
                "lag-partition-1",
                "lag-partition-2",
              ],
              100,
            ),
            step(
              "recover",
              "Drain backlog",
              "lag.decreased",
              [
                "lag-sample-2",
                "consumer-group",
                "lag-partition-0",
                "lag-partition-1",
                "lag-partition-2",
              ],
              5_000,
            ),
          ]
        : [
            step(
              "build",
              "Build lag",
              "lag.increased",
              [
                "lag-sample-0",
                "consumer-group",
                "lag-partition-0",
                "lag-partition-1",
                "lag-partition-2",
              ],
              5_000,
            ),
          ];
      const rising = sample(
        "lag-sample-0",
        startedAtVirtualMs + 5_000,
        8,
        2,
        18,
        "rising",
      );
      const recoveredSamples = [
        sample("lag-sample-1", startedAtVirtualMs + 100, 3, 9, 6, "falling"),
        sample("lag-sample-2", startedAtVirtualMs + 5_100, 3, 9, 0, "steady"),
      ];
      const samples = [
        ...(recover
          ? recoveredSamples.reduce(upsertReducer, state.samples)
          : upsertById(state.samples, rising)),
      ].sort((left, right) => left.atVirtualMs - right.atVirtualMs);
      nextState = complete(
        {
          ...state,
          samples,
          partitions: recover
            ? [
                lagPartition(0, 10, 10),
                lagPartition(1, 8, 8),
                lagPartition(2, 6, 6),
              ]
            : [
                lagPartition(0, 10, 3),
                lagPartition(1, 8, 3),
                lagPartition(2, 6, 0),
              ],
          consumerCount: recover ? 3 : 1,
          drainEstimateMs: recover ? 0 : 9_000,
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "hot-partitions-key-skew": {
      const balanced = experimentId === "balanced-comparison";
      transitions = balanced
        ? [
            step(
              "balanced",
              "Run no-key phase",
              "phase.completed",
              ["phase-balanced"],
              100,
            ),
            step(
              "compare",
              "Compare skew",
              "skew.compared",
              ["phase-hot", "phase-balanced"],
              100,
            ),
          ]
        : [
            step(
              "hot",
              "Run fixed-key phase",
              "phase.completed",
              ["phase-hot"],
              100,
            ),
          ];
      const hotPhase = phase(
        "phase-hot",
        "hot",
        [0, 8, 0, 0],
        [0, 100, 0, 0],
        8,
        "celebrity-user",
      );
      const balancedPhase = phase(
        "phase-balanced",
        "balanced",
        [2, 2, 2, 2],
        [25, 25, 25, 25],
        1,
        null,
      );
      nextState = complete(
        {
          ...state,
          phases: balanced
            ? upsertById(state.phases, balancedPhase)
            : upsertById(state.phases, hotPhase),
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "log-compaction-tombstones": {
      const append = experimentId === "compacted-key-series";
      const compact = experimentId === "run-compaction";
      transitions = append
        ? [
            step(
              "append",
              "Append key history",
              "log.appended",
              [
                "record-a1",
                "record-b1",
                "record-a2",
                "record-b-tombstone",
                "materialized-a",
                "materialized-b",
              ],
              100,
            ),
          ]
        : compact
          ? [
              ...(state.rawLog.length === 0
                ? [
                    step(
                      "materialize-log-history",
                      "Append A1, B1, A2, and tombstone B",
                      "log.appended",
                      [
                        "record-a1",
                        "record-b1",
                        "record-a2",
                        "record-b-tombstone",
                        "materialized-a",
                        "materialized-b",
                      ],
                      100,
                    ),
                  ]
                : []),
              step(
                "compact",
                "Run cleaner pass",
                "log.compacted",
                [
                  "cleaner-compaction",
                  "record-a1",
                  "record-b1",
                  "record-a2",
                  "record-b-tombstone",
                  "materialized-a",
                  "materialized-b",
                ],
                5_000,
              ),
            ]
          : [
              step(
                "cleanup",
                "Expire tombstone",
                "tombstone.expired",
                ["cleaner-tombstone", "record-b-tombstone", "materialized-b"],
                60_000,
              ),
            ];
      const appendedLog = [
        compactedRecord("record-a1", 0, "A", "A1", false, null),
        compactedRecord("record-b1", 1, "B", "B1", false, null),
        compactedRecord("record-a2", 2, "A", "A2", false, null),
        compactedRecord("record-b-tombstone", 3, "B", null, true, null),
      ];
      const sourceLog = state.rawLog.length > 0 ? state.rawLog : appendedLog;
      const rawLog = append
        ? appendedLog
        : sourceLog.map((record) => {
            if (compact && ["0", "1"].includes(record.offset)) {
              return { ...record, removedAtStage: "compaction" as const };
            }
            if (!compact && record.offset === "3") {
              return {
                ...record,
                removedAtStage: "tombstone_cleanup" as const,
              };
            }
            return record;
          });
      const cleanerCompletedAt =
        startedAtVirtualMs +
        transitions.reduce(
          (total, transition) => total + transition.advanceMs,
          0,
        );
      const cleanerPass = compact
        ? {
            id: "cleaner-compaction",
            provenance: simulated,
            stage: "compaction" as const,
            removedOffsets: ["0", "1"],
            atVirtualMs: cleanerCompletedAt,
          }
        : {
            id: "cleaner-tombstone",
            provenance: simulated,
            stage: "tombstone_cleanup" as const,
            removedOffsets: ["3"],
            atVirtualMs: cleanerCompletedAt,
          };
      nextState = complete(
        {
          ...state,
          rawLog,
          materialized: append
            ? [
                {
                  id: "materialized-a",
                  provenance: simulated,
                  key: "A",
                  value: "A2",
                  sourceOffset: "2",
                },
                {
                  id: "materialized-b",
                  provenance: simulated,
                  key: "B",
                  value: null,
                  sourceOffset: "3",
                },
              ]
            : compact
              ? [
                  {
                    id: "materialized-a",
                    provenance: simulated,
                    key: "A",
                    value: "A2",
                    sourceOffset: "2",
                  },
                  {
                    id: "materialized-b",
                    provenance: simulated,
                    key: "B",
                    value: null,
                    sourceOffset: "3",
                  },
                ]
              : [
                  {
                    id: "materialized-a",
                    provenance: simulated,
                    key: "A",
                    value: "A2",
                    sourceOffset: "2",
                  },
                ],
          cleanerPasses: append
            ? state.cleanerPasses
            : upsertById(state.cleanerPasses, cleanerPass),
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "retention-data-loss": {
      const fill = experimentId === "retention-window";
      const advance = experimentId === "advance-retention";
      const retentionEntityIds = [0, 1, 2, 3, 4].map(
        (offset) => `retention-record-${offset}`,
      );
      transitions = fill
        ? [
            step(
              "append",
              "Append retained records",
              "log.appended",
              ["retention-records", ...retentionEntityIds],
              500,
            ),
          ]
        : advance
          ? [
              ...(state.records.length === 0
                ? [
                    step(
                      "materialize-retention-window",
                      "Append records across the retention window",
                      "log.appended",
                      ["retention-records", ...retentionEntityIds],
                      500,
                    ),
                  ]
                : []),
              step(
                "advance",
                "Advance past retention",
                "virtual_time.advanced",
                ["retention-clock", ...retentionEntityIds],
                59_550,
              ),
              step(
                "expire",
                "Move log start offset",
                "retention.expired",
                ["log-start-offset", ...retentionEntityIds],
                100,
              ),
              step(
                "replay",
                "Attempt stale replay",
                "offset.out_of_range",
                ["consumer-group", ...retentionEntityIds],
                100,
              ),
            ]
          : [
              step(
                "recover",
                "Reset to earliest retained offset",
                "offset.recovered",
                ["consumer-group", ...retentionEntityIds],
                100,
              ),
            ];
      const records =
        state.records.length > 0
          ? state.records
          : [0, 1, 2, 3, 4].map((offset) => ({
              id: `retention-record-${offset}`,
              provenance: simulated,
              offset: String(offset),
              createdAtVirtualMs: offset * 100,
              expired: false,
            }));
      const completedAtVirtualMs =
        startedAtVirtualMs +
        transitions.reduce(
          (total, transition) => total + transition.advanceMs,
          0,
        );
      const cutoffVirtualMs = advance
        ? Math.max(0, completedAtVirtualMs - state.retentionMs)
        : state.cutoffVirtualMs;
      const retainedRecords = advance
        ? records.map((record) => ({
            ...record,
            expired: record.createdAtVirtualMs < cutoffVirtualMs,
          }))
        : records;
      const firstRetained = retainedRecords.find((record) => !record.expired);
      const nextLogStartOffset =
        firstRetained?.offset ??
        String(Number(retainedRecords.at(-1)?.offset ?? "-1") + 1);
      const committedOffset =
        state.records.length === 0 ? "1" : state.committedOffset;
      nextState = complete(
        {
          ...state,
          records: retainedRecords,
          cutoffVirtualMs,
          logStartOffset: advance ? nextLogStartOffset : state.logStartOffset,
          committedOffset: fill
            ? "1"
            : advance
              ? committedOffset
              : state.logStartOffset,
          error: advance
            ? {
                code: "offset_out_of_range",
                requestedOffset: committedOffset,
                recoveryOptions: ["earliest", "latest", "restore"],
                provenance: simulated,
              }
            : fill
              ? null
              : null,
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "cooperative-rebalancing": {
      const compare = experimentId === "compare-rebalance";
      transitions = compare
        ? [
            step(
              "eager",
              "Run eager rebalance",
              "rebalance.eager",
              ["eager-comparison"],
              100,
            ),
            step(
              "sticky",
              "Run cooperative-sticky rebalance",
              "rebalance.cooperative",
              ["sticky-comparison"],
              100,
            ),
            step(
              "compare",
              "Compare disruption",
              "rebalance.compared",
              ["eager-comparison", "sticky-comparison"],
              100,
            ),
          ]
        : [
            step(
              "eager",
              "Run eager rebalance",
              "rebalance.eager",
              ["eager-comparison"],
              100,
            ),
          ];
      const before = [{ consumerId: "consumer-1", partitions: [0, 1, 2] }];
      const after = [
        { consumerId: "consumer-1", partitions: [0, 2] },
        { consumerId: "consumer-2", partitions: [1] },
      ];
      const eager = {
        id: "eager-comparison",
        provenance: simulated,
        strategy: "eager" as const,
        before,
        after,
        keptPartitions: [],
        movedPartitions: [
          {
            partition: 1,
            fromConsumerId: "consumer-1",
            toConsumerId: "consumer-2",
          },
        ],
        revokedPartitions: [0, 1, 2],
        pausedPartitions: [0, 1, 2],
      };
      const sticky = {
        id: "sticky-comparison",
        provenance: simulated,
        strategy: "cooperative_sticky" as const,
        before,
        after,
        keptPartitions: [0, 2],
        movedPartitions: [
          {
            partition: 1,
            fromConsumerId: "consumer-1",
            toConsumerId: "consumer-2",
          },
        ],
        revokedPartitions: [1],
        pausedPartitions: [1],
      };
      nextState = complete(
        {
          ...state,
          comparisons: compare
            ? [eager, sticky].reduce(upsertReducer, state.comparisons)
            : upsertById(state.comparisons, eager),
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "streams-joins-windows": {
      const late = experimentId === "late-arrival";
      transitions = late
        ? [
            step(
              "late",
              "Reject after-grace arrival",
              "window.record_late",
              ["stream-input-payment-99", "payment-99", "window-state-0"],
              6_000,
            ),
          ]
        : [
            step(
              "order",
              "Buffer matching order",
              "window.record_buffered",
              ["stream-input-order-42", "order-42", "window-state-0"],
              100,
            ),
            step(
              "payment",
              "Join matching payment",
              "window.join_emitted",
              [
                "stream-input-payment-42",
                "join-row-42",
                "join-42",
                "window-state-0",
              ],
              100,
            ),
            step(
              "unmatched",
              "Buffer unmatched key",
              "window.record_unmatched",
              ["stream-input-order-99", "order-99", "window-state-0"],
              100,
            ),
          ];
      const baseInputs = [
        streamInput(
          "order-42",
          "orders",
          "42",
          1_000,
          1_000,
          "window-0",
          "joined",
        ),
        streamInput(
          "payment-42",
          "payments",
          "42",
          1_500,
          1_600,
          "window-0",
          "joined",
        ),
        streamInput(
          "order-99",
          "orders",
          "99",
          2_000,
          2_000,
          "window-0",
          "unmatched",
        ),
      ];
      const lateInput = streamInput(
        "payment-99",
        "payments",
        "99",
        2_200,
        7_500,
        "window-0",
        "late",
      );
      nextState = complete(
        {
          ...state,
          inputs: late
            ? upsertById(state.inputs, lateInput)
            : baseInputs.reduce(upsertReducer, state.inputs),
          windows: [
            {
              id: "window-state-0",
              provenance: simulated,
              windowId: "window-0",
              startMs: 0,
              endMs: 5_000,
              graceEndMs: 7_000,
              closed: late,
            },
          ],
          joins: late
            ? state.joins
            : [
                {
                  id: "join-row-42",
                  provenance: simulated,
                  joinId: "join-42",
                  key: "42",
                  orderRecordId: "order-42",
                  paymentRecordId: "payment-42",
                  windowId: "window-0",
                },
              ],
          lateRecords: late ? ["payment-99"] : state.lateRecords,
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "outbox-cdc": {
      const retry = experimentId === "retry-cdc";
      transitions = retry
        ? [
            step(
              "retry",
              "Retry connector delivery",
              "cdc.retry_deduplicated",
              [
                "connector-row-2",
                "cdc-attempt-2",
                "publish-row-1",
                "dedupe-outbox-order-1",
              ],
              100,
            ),
          ]
        : [
            step(
              "db",
              "Commit business and outbox rows",
              "database.transaction_committed",
              [
                "db-transaction-row-1",
                "db-txn-1",
                "business-order-1",
                "outbox-order-1",
              ],
              100,
            ),
            step(
              "wal",
              "Read WAL position",
              "wal.recorded",
              ["wal-row-100", "wal-100", "connector-row-1"],
              100,
            ),
            step(
              "publish",
              "Publish and acknowledge",
              "kafka.publish_acknowledged",
              ["publish-row-1", "cdc-message-1", "connector-row-1"],
              100,
            ),
          ];
      const firstAttempt = {
        id: "connector-row-1",
        provenance: simulated,
        attemptId: "cdc-attempt-1",
        outboxRowId: "outbox-order-1",
        lsn: "0/100",
        attempt: 1,
        status: "published" as const,
      };
      const retryAttempt = {
        id: "connector-row-2",
        provenance: simulated,
        attemptId: "cdc-attempt-2",
        outboxRowId: "outbox-order-1",
        lsn: "0/100",
        attempt: 2,
        status: "retried" as const,
      };
      const firstPublish = {
        id: "publish-row-1",
        provenance: simulated,
        messageId: "cdc-message-1",
        outboxRowId: "outbox-order-1",
        lsn: "0/100",
        acknowledged: true,
        deduplicated: false,
      };
      nextState = complete(
        {
          ...state,
          dbTransactions: retry
            ? state.dbTransactions
            : [
                {
                  id: "db-transaction-row-1",
                  provenance: simulated,
                  transactionId: "db-txn-1",
                  businessRowId: "business-order-1",
                  outboxRowId: "outbox-order-1",
                  committed: true,
                },
              ],
          wal: retry
            ? state.wal
            : [
                {
                  id: "wal-row-100",
                  provenance: simulated,
                  lsn: "0/100",
                  transactionId: "db-txn-1",
                  outboxRowId: "outbox-order-1",
                },
              ],
          connectorAttempts: upsertById(
            state.connectorAttempts,
            retry ? retryAttempt : firstAttempt,
          ),
          publishes: retry
            ? state.publishes
            : upsertById(state.publishes, firstPublish),
          dedupeLedger: retry
            ? [
                {
                  id: "dedupe-outbox-order-1",
                  provenance: simulated,
                  outboxRowId: "outbox-order-1",
                  acceptedMessageId: "cdc-message-1",
                  suppressedAttempts: 1,
                },
              ]
            : state.dedupeLedger,
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
    case "acl-least-privilege": {
      const grant = experimentId === "grant-required-permission";
      transitions = grant
        ? [
            step(
              "grant",
              "Grant only write",
              "acl.granted",
              ["policy-orders-write"],
              100,
            ),
            step(
              "retry",
              "Retry allowed operation",
              "acl.allowed",
              ["acl-attempt-2"],
              100,
            ),
          ]
        : [
            step(
              "evaluate",
              "Evaluate write permission",
              "acl.evaluated",
              ["acl-attempt-1", "acl-cell-write"],
              100,
            ),
            step(
              "deny",
              "Terminate denied path",
              "acl.denied",
              ["acl-attempt-1"],
              100,
            ),
          ];
      const writePolicy = {
        id: "policy-orders-write",
        provenance: simulated,
        principal: "orders-service",
        operation: "write" as const,
        resource: "orders",
        effect: "allow" as const,
      };
      const deniedAttempt = {
        id: "acl-attempt-1",
        provenance: simulated,
        principal: "orders-service",
        operation: "write" as const,
        resource: "orders",
        matchedPolicyId: null,
        decision: "denied" as const,
        terminatedBeforeKafka: true,
      };
      const allowedAttempt = {
        id: "acl-attempt-2",
        provenance: simulated,
        principal: "orders-service",
        operation: "write" as const,
        resource: "orders",
        matchedPolicyId: "policy-orders-write",
        decision: "allowed" as const,
        terminatedBeforeKafka: false,
      };
      nextState = complete(
        {
          ...state,
          policies: grant
            ? upsertById(state.policies, writePolicy)
            : state.policies,
          attempts: upsertById(
            state.attempts,
            grant ? allowedAttempt : deniedAttempt,
          ),
          lastHighlightedCell: {
            principal: "orders-service",
            operation: "write",
            resource: "orders",
          },
        },
        experimentId,
        startedAtVirtualMs,
        transitions,
      );
      break;
    }
  }

  return { state: nextState, transitions };
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const existingIndex = items.findIndex(
    (candidate) => candidate.id === item.id,
  );
  if (existingIndex < 0) return [...items, item];
  return items.map((candidate, index) =>
    index === existingIndex ? item : candidate,
  );
}

function upsertReducer<T extends { id: string }>(items: T[], item: T) {
  return upsertById(items, item);
}

function complete<T extends ScenarioState>(
  state: T,
  experimentId: string,
  startedAtVirtualMs: number,
  transitions: ScenarioExperimentTransition[],
): T {
  const elapsed = transitions.reduce(
    (total, item) => total + item.advanceMs,
    0,
  );
  return {
    ...state,
    virtualTimeMs: startedAtVirtualMs + elapsed,
    revision: state.revision + transitions.length,
    experiment: {
      status: "completed",
      experimentId,
      stepIndex: transitions.length,
      totalSteps: transitions.length,
      startedAtVirtualMs,
      completedAtVirtualMs: startedAtVirtualMs + elapsed,
      error: null,
    },
  };
}

function step(
  id: string,
  label: string,
  transition: string,
  entityIds: string[],
  advanceMs: number,
): ScenarioExperimentTransition {
  return {
    id,
    label,
    transition,
    entityIds,
    provenance: "simulated",
    advanceMs,
  };
}

function route(
  id: string,
  messageId: string,
  key: string,
  partition: number,
  offset: string,
  sequence: number,
) {
  return {
    id,
    provenance: "simulated" as const,
    messageId,
    key,
    partition,
    offset,
    sequence,
  };
}

function position(
  partition: number,
  processedOffset: string,
  committedOffset: string,
) {
  return {
    id: `partition-${partition}-position`,
    provenance: "simulated" as const,
    partition,
    processedOffset,
    committedOffset,
  };
}

function consumer(
  consumerId: string,
  partitions: number[],
  status: "running" | "idle",
  epoch: number,
) {
  return {
    id: `assignment-${consumerId}-${epoch}`,
    provenance: "simulated" as const,
    consumerId,
    partitions,
    status,
    epoch,
  };
}

function epoch(
  epochNumber: number,
  partitionSets: number[][],
  idleConsumerIds: string[],
) {
  const memberIds = partitionSets.map((_, index) => `consumer-${index + 1}`);
  return {
    id: `assignment-epoch-${epochNumber}`,
    provenance: "simulated" as const,
    epoch: epochNumber,
    memberIds,
    assignments: partitionSets.map((partitions, index) => ({
      consumerId: memberIds[index],
      partitions,
    })),
    idleConsumerIds,
  };
}

function retryRecord(
  id: string,
  kind: "transient" | "poison",
  status: "succeeded" | "dlq",
  attempt: number,
  route: Array<["main" | "retry" | "backoff" | "succeeded" | "dlq", number]>,
) {
  return {
    id,
    provenance: "simulated" as const,
    messageId: `${id}-message`,
    kind,
    status,
    attempt,
    maxAttempts: 3,
    backoffUntilVirtualMs: null,
    error: status === "dlq" ? "POISON_RECORD" : null,
    route: route.map(([stage, atVirtualMs]) => ({ stage, atVirtualMs })),
  };
}

function transaction(
  transactionId: string,
  status: "committed" | "aborted",
  sequences: number[],
  visibility: boolean[],
  offsetsCommitted: boolean,
) {
  const records = sequences.map((producerSequence, index) => ({
    recordId: `${transactionId}-record-${index + 1}`,
    producerSequence,
    staged: true,
    visible: visibility[index] ?? false,
  }));
  return {
    id: `transaction-row-${transactionId}`,
    provenance: "simulated" as const,
    transactionId,
    status,
    records,
    visibleRecordIds: records
      .filter((record) => record.visible)
      .map((record) => record.recordId),
    offsetsCommitted,
    dedupe: sequences.map((producerSequence) => ({
      producerSequence,
      accepted: true,
    })),
  };
}

function replayEvent(
  offset: number,
  aggregateId: string,
  eventName: string,
  delta: number,
) {
  return {
    id: `event-${offset}`,
    provenance: "simulated" as const,
    offset: String(offset),
    aggregateId,
    eventName,
    delta,
  };
}

function projectReplayLog(log: StateFor<"event-replay-sourcing">["log"]) {
  return log.reduce<Record<string, number>>((projection, event) => {
    projection[event.aggregateId] =
      (projection[event.aggregateId] ?? 0) + event.delta;
    return projection;
  }, {});
}

function sample(
  id: string,
  atVirtualMs: number,
  productionRate: number,
  processingRate: number,
  lag: number,
  trend: "rising" | "steady" | "falling",
) {
  return {
    id,
    provenance: "simulated" as const,
    atVirtualMs,
    productionRate,
    processingRate,
    lag,
    trend,
  };
}

function lagPartition(
  partition: number,
  endOffset: number,
  committedOffset: number,
) {
  return {
    id: `lag-partition-${partition}`,
    provenance: "simulated" as const,
    partition,
    endOffset: String(endOffset),
    committedOffset: String(committedOffset),
    lag: endOffset - committedOffset,
  };
}

function phase(
  id: string,
  kind: "hot" | "balanced",
  partitionCounts: number[],
  percentages: number[],
  skewRatio: number,
  key: string | null,
) {
  const routes = partitionCounts.flatMap((count, partition) =>
    Array.from({ length: count }, (_, index) => ({
      messageId: `${id}-message-${partition}-${index}`,
      key,
      partition,
    })),
  );
  return {
    id,
    provenance: "simulated" as const,
    kind,
    total: partitionCounts.reduce((sum, count) => sum + count, 0),
    partitionCounts,
    percentages,
    skewRatio,
    routes,
  };
}

function compactedRecord(
  id: string,
  offset: number,
  key: string,
  value: string | null,
  tombstone: boolean,
  removedAtStage: "compaction" | "tombstone_cleanup" | null,
) {
  return {
    id,
    provenance: "simulated" as const,
    offset: String(offset),
    key,
    value,
    tombstone,
    removedAtStage,
  };
}

function streamInput(
  recordId: string,
  stream: "orders" | "payments",
  key: string,
  eventTimeMs: number,
  arrivalTimeMs: number,
  windowId: string,
  status: "buffered" | "joined" | "unmatched" | "late",
) {
  return {
    id: `stream-input-${recordId}`,
    provenance: "simulated" as const,
    recordId,
    stream,
    key,
    eventTimeMs,
    arrivalTimeMs,
    windowId,
    status,
  };
}
