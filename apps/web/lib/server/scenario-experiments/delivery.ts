import "server-only";
import { complete, step, upsertById, upsertReducer } from "./shared";
import type { ScenarioExperimentHandler } from "./types";

export const buildAtLeastOnceExperiment: ScenarioExperimentHandler<
  "at-least-once-duplicates"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const simulated = "simulated" as const;

  const redeliver = experimentId === "crash-and-redeliver";
  const alreadyRedelivered = state.deliveries.some(
    (delivery) => delivery.attempt > 1,
  );
  const showRedelivery = redeliver || alreadyRedelivered;
  const transitions = redeliver
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
  const nextState = complete(
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

  return { state: nextState, transitions };
};

export const buildRetryDeadLetterExperiment: ScenarioExperimentHandler<
  "retry-dead-letter-queues"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const transient = experimentId === "transient-recovery";
  const transitions = transient
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
  const nextState = complete(
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

  return { state: nextState, transitions };
};

export const buildConsumerLagExperiment: ScenarioExperimentHandler<
  "consumer-lag-backpressure"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const recover = experimentId === "recover-lag";
  const partitionEntityIds = state.partitions.map(({ id }) => id);
  const transitions = recover
    ? [
        step(
          "scale",
          "Add consumers",
          "capacity.increased",
          ["lag-sample-1", "consumer-2", "consumer-3", ...partitionEntityIds],
          100,
        ),
        step(
          "recover",
          "Drain backlog",
          "lag.decreased",
          ["lag-sample-2", "consumer-group", ...partitionEntityIds],
          5_000,
        ),
      ]
    : [
        step(
          "build",
          "Build lag",
          "lag.increased",
          ["lag-sample-0", "consumer-group", ...partitionEntityIds],
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
  const modeledOffsets: Record<
    number,
    { endOffset: number; committedOffset: number }
  > = recover
    ? {
        0: { endOffset: 10, committedOffset: 10 },
        1: { endOffset: 8, committedOffset: 8 },
        2: { endOffset: 6, committedOffset: 6 },
      }
    : {
        0: { endOffset: 10, committedOffset: 3 },
        1: { endOffset: 8, committedOffset: 3 },
        2: { endOffset: 6, committedOffset: 0 },
      };
  const partitions = state.partitions.map((partition) => {
    const modeled = modeledOffsets[partition.partition];
    if (!modeled) {
      return recover
        ? { ...partition, committedOffset: partition.endOffset, lag: 0 }
        : partition;
    }
    return {
      ...partition,
      endOffset: String(modeled.endOffset),
      committedOffset: String(modeled.committedOffset),
      lag: modeled.endOffset - modeled.committedOffset,
    };
  });
  const nextState = complete(
    {
      ...state,
      samples,
      partitions,
      consumerCount: recover ? 3 : 1,
      drainEstimateMs: recover ? 0 : 9_000,
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

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
