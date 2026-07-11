import "server-only";
import type { ScenarioState } from "@kplay/contracts";

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
