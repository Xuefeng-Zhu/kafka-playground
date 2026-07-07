import type { KeyStrategy, RunSnapshot } from "@kplay/contracts";
import type { ScenarioId } from "@kplay/scenario-engine";

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

type ScenarioActionBuilder = (snapshot: RunSnapshot) => ScenarioAction[];
type CustomActionScenarioId = Exclude<ScenarioId, "partitioning">;

const scenarioActionBuilders: Record<
  CustomActionScenarioId,
  ScenarioActionBuilder
> = {
  "fan-out-load-balancing": () => [
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
  ],
  "at-least-once-duplicates": () => [
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
  ],
  "retry-dead-letter-queues": (snapshot) => [
    {
      id: "trigger-retry-failure",
      label: "Trigger retry",
      description:
        "Produce enough records to hit the next deterministic retry/DLQ failure.",
      produceCount: countUntilMultiple(latestSequence(snapshot), 3),
    },
  ],
  "schema-evolution-karapace": (snapshot) => [
    {
      id: "trigger-schema-rejection",
      label: "Incompatible schema",
      description:
        "Produce enough records to hit the next incompatible schema version.",
      produceCount: countUntilMultiple(latestSequence(snapshot), 4),
      keyStrategy: { type: "random_user" },
    },
  ],
  "transactional-producers": () => [
    {
      id: "transaction-pair",
      label: "Transaction pair",
      description:
        "Produce an open/commit pair with the same transaction boundary.",
      produceCount: 2,
    },
  ],
  "event-replay-sourcing": () => [
    {
      id: "aggregate-events",
      label: "Aggregate events",
      description: "Produce several domain events to move the replay cursor.",
      produceCount: 3,
    },
  ],
  "consumer-lag-backpressure": () => [
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
  ],
  "hot-partitions-key-skew": () => [
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
  ],
  "log-compaction-tombstones": () => [
    {
      id: "compacted-key-series",
      label: "Key update series",
      description:
        "Produce five records so the compacted key series includes a tombstone.",
      keyStrategy: { type: "fixed", value: "account-42" },
      produceCount: 5,
    },
  ],
  "retention-data-loss": () => [
    {
      id: "retention-window",
      label: "Fill retention window",
      description: "Produce five records to move old offsets toward expiry.",
      produceCount: 5,
    },
  ],
  "cooperative-rebalancing": () => [
    {
      id: "cooperative-pressure",
      label: "Rebalance pressure",
      description:
        "Use three partitions and unkeyed records to make ownership movement visible.",
      keyStrategy: { type: "no_key" },
      produceCount: 3,
    },
  ],
  "streams-joins-windows": (snapshot) => [
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
      produceCount: countUntilMultiple(latestSequence(snapshot), 6),
    },
  ],
  "outbox-cdc": () => [
    {
      id: "cdc-batch",
      label: "CDC batch",
      description:
        "Produce several outbox rows with transaction log positions.",
      produceCount: 4,
    },
  ],
  "acl-least-privilege": (snapshot) => [
    {
      id: "trigger-acl-denial",
      label: "Denied operation",
      description:
        "Produce enough records to hit the next simulated authorization denial.",
      produceCount: countUntilMultiple(latestSequence(snapshot), 3),
      keyStrategy: { type: "random_user" },
    },
  ],
};

export function deriveScenarioActions(snapshot: RunSnapshot): ScenarioAction[] {
  if (hasCustomScenarioActions(snapshot.scenarioId)) {
    return scenarioActionBuilders[snapshot.scenarioId](snapshot);
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

function hasCustomScenarioActions(
  scenarioId: string,
): scenarioId is CustomActionScenarioId {
  return scenarioId in scenarioActionBuilders;
}

function latestSequence(snapshot: RunSnapshot) {
  const value = snapshot.recentMessages.at(-1)?.value.sequence;
  return typeof value === "number" ? value : 0;
}

function countUntilMultiple(current: number, multiple: number) {
  const remainder = current % multiple;
  return remainder === 0 ? multiple : multiple - remainder;
}
