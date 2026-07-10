import type {
  RunSnapshot,
  RuntimeEvent,
  ScenarioState,
} from "@kplay/contracts";
import {
  duplicateExperience,
  retryExperience,
  transactionExperience,
} from "./scenarios/delivery";
import {
  cooperativeExperience,
  hotPartitionExperience,
  lagExperience,
  loadBalancingExperience,
  partitioningExperience,
} from "./scenarios/fundamentals";
import { aclExperience, schemaExperience } from "./scenarios/gates";
import {
  compactionExperience,
  replayExperience,
  retentionExperience,
} from "./scenarios/history";
import { outboxExperience, streamsExperience } from "./scenarios/pipelines";
import type {
  ScenarioExperienceDefinitionRegistry,
  ScenarioExperienceId,
  ScenarioExperienceFrame,
  ScenarioExperienceResolution,
  ScenarioExperienceSnapshot,
} from "./model";

export const scenarioExperienceRegistry = {
  partitioning: partitioningExperience,
  "fan-out-load-balancing": loadBalancingExperience,
  "at-least-once-duplicates": duplicateExperience,
  "retry-dead-letter-queues": retryExperience,
  "schema-evolution-karapace": schemaExperience,
  "transactional-producers": transactionExperience,
  "event-replay-sourcing": replayExperience,
  "consumer-lag-backpressure": lagExperience,
  "hot-partitions-key-skew": hotPartitionExperience,
  "log-compaction-tombstones": compactionExperience,
  "retention-data-loss": retentionExperience,
  "cooperative-rebalancing": cooperativeExperience,
  "streams-joins-windows": streamsExperience,
  "outbox-cdc": outboxExperience,
  "acl-least-privilege": aclExperience,
} satisfies ScenarioExperienceDefinitionRegistry;

export const SCENARIO_EXPERIENCE_ALLOWLIST: ReadonlySet<ScenarioExperienceId> =
  new Set([
    "partitioning",
    "fan-out-load-balancing",
    "at-least-once-duplicates",
    "retry-dead-letter-queues",
    "schema-evolution-karapace",
    "transactional-producers",
    "event-replay-sourcing",
    "consumer-lag-backpressure",
    "hot-partitions-key-skew",
    "log-compaction-tombstones",
    "retention-data-loss",
    "cooperative-rebalancing",
    "streams-joins-windows",
    "outbox-cdc",
    "acl-least-privilege",
  ]);

export function isScenarioExperienceEnabled(
  scenarioId: string,
): scenarioId is ScenarioExperienceId {
  return (
    isScenarioId(scenarioId) && SCENARIO_EXPERIENCE_ALLOWLIST.has(scenarioId)
  );
}

export function resolveScenarioExperience(
  snapshot: ScenarioExperienceSnapshot,
  events: readonly RuntimeEvent[] = [],
): ScenarioExperienceResolution {
  if (!isScenarioExperienceEnabled(snapshot.scenarioId)) {
    return { kind: "legacy", reason: "disabled" };
  }
  if (snapshot.scenarioState == null) {
    return { kind: "legacy", reason: "missing-state" };
  }
  if (snapshot.scenarioState.scenarioId !== snapshot.scenarioId) {
    return { kind: "legacy", reason: "mismatched-state" };
  }
  const frame = projectScenarioExperience(
    snapshot,
    snapshot.scenarioState,
    events,
  );
  return {
    kind: "experience",
    definition: scenarioExperienceRegistry[snapshot.scenarioId],
    frame,
  };
}

export function projectScenarioExperience(
  snapshot: ScenarioExperienceSnapshot,
  scenarioState: ScenarioState,
  events: readonly RuntimeEvent[] = [],
): ScenarioExperienceFrame {
  if (snapshot.scenarioId !== scenarioState.scenarioId) {
    throw new Error(
      `Scenario experience mismatch: snapshot=${snapshot.scenarioId}, state=${scenarioState.scenarioId}`,
    );
  }
  // Scenario projectors currently read only the stable fields declared by
  // ScenarioExperienceSnapshot. Keep their broader RunSnapshot input during
  // migration while the workspace omits sequence-only SSE churn.
  const projectorSnapshot = snapshot as RunSnapshot;
  switch (scenarioState.scenarioId) {
    case "partitioning":
      return partitioningExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "fan-out-load-balancing":
      return loadBalancingExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "at-least-once-duplicates":
      return duplicateExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "retry-dead-letter-queues":
      return retryExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "schema-evolution-karapace":
      return schemaExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "transactional-producers":
      return transactionExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "event-replay-sourcing":
      return replayExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "consumer-lag-backpressure":
      return lagExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "hot-partitions-key-skew":
      return hotPartitionExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "log-compaction-tombstones":
      return compactionExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "retention-data-loss":
      return retentionExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "cooperative-rebalancing":
      return cooperativeExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "streams-joins-windows":
      return streamsExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "outbox-cdc":
      return outboxExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
    case "acl-least-privilege":
      return aclExperience.project({
        snapshot: projectorSnapshot,
        scenarioState,
        events,
      });
  }
}

function isScenarioId(scenarioId: string): scenarioId is ScenarioExperienceId {
  return Object.hasOwn(scenarioExperienceRegistry, scenarioId);
}
