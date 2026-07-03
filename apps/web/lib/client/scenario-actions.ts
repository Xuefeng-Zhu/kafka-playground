import type { KeyStrategy, RunSnapshot } from "@kplay/contracts";

export type ScenarioAction = {
  id: string;
  label: string;
  description: string;
  keyStrategy?: KeyStrategy;
  settings?: {
    productionRate?: number;
    keyStrategy?: KeyStrategy;
    processingLatencyMs?: number;
  };
  produceCount?: number;
};

export function deriveScenarioActions(snapshot: RunSnapshot): ScenarioAction[] {
  const sequence = latestSequence(snapshot);
  if (snapshot.scenarioId === "fan-out-load-balancing") {
    return [
      {
        id: "produce-unkeyed-burst",
        label: "Unkeyed burst",
        description:
          "Produce three unkeyed records to show round-robin partition spread.",
        keyStrategy: { type: "no_key" },
        produceCount: 3,
      },
      {
        id: "balance-settings",
        label: "Balance setup",
        description:
          "Use no-key routing and moderate latency for load-balance comparison.",
        settings: { keyStrategy: { type: "no_key" }, processingLatencyMs: 500 },
      },
    ];
  }

  if (snapshot.scenarioId === "at-least-once-duplicates") {
    return [
      {
        id: "duplicate-risk-records",
        label: "Duplicate risk",
        description:
          "Produce two records with paired idempotency keys to surface duplicate risk.",
        produceCount: 2,
      },
      {
        id: "slow-commit-window",
        label: "Slow commit window",
        description:
          "Increase processing latency so pre-commit interruption is easier to see.",
        settings: { processingLatencyMs: 5000 },
      },
    ];
  }

  if (snapshot.scenarioId === "retry-dead-letter-queues") {
    return [
      {
        id: "trigger-retry-failure",
        label: "Trigger retry",
        description:
          "Produce enough records to hit the next deterministic retry/DLQ failure.",
        produceCount: countUntilMultiple(sequence, 3),
      },
    ];
  }

  if (snapshot.scenarioId === "schema-evolution-karapace") {
    return [
      {
        id: "trigger-schema-rejection",
        label: "Incompatible schema",
        description:
          "Produce enough records to hit the next incompatible schema version.",
        produceCount: countUntilMultiple(sequence, 4),
        keyStrategy: { type: "random_user" },
      },
    ];
  }

  if (snapshot.scenarioId === "transactional-producers") {
    return [
      {
        id: "transaction-pair",
        label: "Transaction pair",
        description:
          "Produce an open/commit pair with the same transaction boundary.",
        produceCount: 2,
      },
    ];
  }

  if (snapshot.scenarioId === "event-replay-sourcing") {
    return [
      {
        id: "aggregate-events",
        label: "Aggregate events",
        description: "Produce several domain events to move the replay cursor.",
        produceCount: 3,
      },
    ];
  }

  if (snapshot.scenarioId === "consumer-lag-backpressure") {
    return [
      {
        id: "build-lag",
        label: "Build lag",
        description:
          "Raise rate and latency, then produce a burst to make lag visible.",
        settings: {
          productionRate: 8,
          processingLatencyMs: 2000,
          keyStrategy: { type: "no_key" },
        },
        keyStrategy: { type: "no_key" },
        produceCount: 5,
      },
    ];
  }

  if (snapshot.scenarioId === "hot-partitions-key-skew") {
    return [
      {
        id: "hot-key-burst",
        label: "Hot-key burst",
        description:
          "Produce five records with the same key to concentrate load.",
        keyStrategy: { type: "fixed", value: "celebrity-user" },
        produceCount: 5,
      },
      {
        id: "balanced-comparison",
        label: "Balanced comparison",
        description:
          "Produce unkeyed records to compare against the hot-key partition.",
        keyStrategy: { type: "no_key" },
        produceCount: 4,
      },
    ];
  }

  if (snapshot.scenarioId === "log-compaction-tombstones") {
    return [
      {
        id: "compacted-key-series",
        label: "Key update series",
        description:
          "Produce five records so the compacted key series includes a tombstone.",
        keyStrategy: { type: "fixed", value: "account-42" },
        produceCount: 5,
      },
    ];
  }

  if (snapshot.scenarioId === "retention-data-loss") {
    return [
      {
        id: "retention-window",
        label: "Fill retention window",
        description: "Produce five records to move old offsets toward expiry.",
        produceCount: 5,
      },
    ];
  }

  if (snapshot.scenarioId === "cooperative-rebalancing") {
    return [
      {
        id: "cooperative-pressure",
        label: "Rebalance pressure",
        description:
          "Use three partitions and unkeyed records to make ownership movement visible.",
        keyStrategy: { type: "no_key" },
        produceCount: 3,
      },
    ];
  }

  if (snapshot.scenarioId === "streams-joins-windows") {
    return [
      {
        id: "window-pair",
        label: "Window pair",
        description: "Produce an orders/payments pair in the same join window.",
        produceCount: 2,
      },
      {
        id: "late-arrival",
        label: "Late arrival",
        description:
          "Produce enough records to mark a late-arriving window event.",
        produceCount: countUntilMultiple(sequence, 6),
      },
    ];
  }

  if (snapshot.scenarioId === "outbox-cdc") {
    return [
      {
        id: "cdc-batch",
        label: "CDC batch",
        description:
          "Produce several outbox rows with transaction log positions.",
        produceCount: 4,
      },
    ];
  }

  if (snapshot.scenarioId === "acl-least-privilege") {
    return [
      {
        id: "trigger-acl-denial",
        label: "Denied operation",
        description:
          "Produce enough records to hit the next simulated authorization denial.",
        produceCount: countUntilMultiple(sequence, 3),
        keyStrategy: { type: "random_user" },
      },
    ];
  }

  return [
    {
      id: "produce-keyed-record",
      label: "Keyed record",
      description:
        "Produce a normal keyed record for partition and offset inspection.",
      produceCount: 1,
    },
  ];
}

function latestSequence(snapshot: RunSnapshot) {
  const value = snapshot.recentMessages.at(-1)?.value.sequence;
  return typeof value === "number" ? value : 0;
}

function countUntilMultiple(current: number, multiple: number) {
  const remainder = current % multiple;
  return remainder === 0 ? multiple : multiple - remainder;
}
