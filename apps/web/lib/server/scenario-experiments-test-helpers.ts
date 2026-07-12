import type { ScenarioExperimentIdFor } from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import {
  buildScenarioExperimentResult,
  createInitialScenarioState,
} from "./scenario-experiments";

export const primaryExperiments = {
  partitioning: "produce-keyed-record",
  "fan-out-load-balancing": "grow-consumer-group",
  "at-least-once-duplicates": "crash-and-redeliver",
  "retry-dead-letter-queues": "transient-recovery",
  "schema-evolution-karapace": "compatible-schema",
  "transactional-producers": "transaction-pair",
  "event-replay-sourcing": "aggregate-events",
  "consumer-lag-backpressure": "build-lag",
  "hot-partitions-key-skew": "hot-key-burst",
  "log-compaction-tombstones": "run-compaction",
  "retention-data-loss": "advance-retention",
  "cooperative-rebalancing": "compare-rebalance",
  "streams-joins-windows": "window-pair",
  "outbox-cdc": "cdc-batch",
  "acl-least-privilege": "trigger-acl-denial",
} as const;

export function run<Id extends keyof typeof primaryExperiments>(
  scenarioId: Id,
  experimentId: ScenarioExperimentIdFor<NoInfer<Id>>,
) {
  const state = createInitialScenarioState(
    scenarioId,
    partitionCountForScenario(scenarioId),
  );
  return buildScenarioExperimentResult({
    state,
    experimentId,
    startedAtVirtualMs: 0,
  }).state as Extract<typeof state, { scenarioId: Id }>;
}

export function rerun<State extends ReturnType<typeof run>>(
  state: State,
  experimentId: ScenarioExperimentIdFor<NoInfer<State["scenarioId"]>>,
) {
  return buildScenarioExperimentResult({
    state,
    experimentId,
    startedAtVirtualMs: state.virtualTimeMs,
  }).state as State;
}

export function collectRowIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectRowIds);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.id === "string" ? [record.id] : []),
    ...Object.values(record).flatMap(collectRowIds),
  ];
}

function partitionCountForScenario(
  scenarioId: keyof typeof primaryExperiments,
) {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`Missing ${scenarioId}`);
  return scenario.topic.partitions;
}
