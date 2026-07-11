import type { RuntimeEvent, ScenarioState } from "@kplay/contracts";
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

export function isScenarioExperienceSupported(
  scenarioId: string,
): scenarioId is ScenarioExperienceId {
  return isScenarioId(scenarioId);
}

export function resolveScenarioExperience(
  snapshot: ScenarioExperienceSnapshot,
  events: readonly RuntimeEvent[] = [],
): ScenarioExperienceResolution {
  if (!isScenarioExperienceSupported(snapshot.scenarioId)) {
    return { kind: "unavailable", reason: "unsupported-scenario" };
  }
  if (snapshot.scenarioState == null) {
    return { kind: "unavailable", reason: "missing-state" };
  }
  if (snapshot.scenarioState.scenarioId !== snapshot.scenarioId) {
    return { kind: "unavailable", reason: "mismatched-state" };
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
  switch (scenarioState.scenarioId) {
    case "partitioning":
      return partitioningExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "fan-out-load-balancing":
      return loadBalancingExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "at-least-once-duplicates":
      return duplicateExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "retry-dead-letter-queues":
      return retryExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "schema-evolution-karapace":
      return schemaExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "transactional-producers":
      return transactionExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "event-replay-sourcing":
      return replayExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "consumer-lag-backpressure":
      return lagExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "hot-partitions-key-skew":
      return hotPartitionExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "log-compaction-tombstones":
      return compactionExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "retention-data-loss":
      return retentionExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "cooperative-rebalancing":
      return cooperativeExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "streams-joins-windows":
      return streamsExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "outbox-cdc":
      return outboxExperience.project({
        snapshot,
        scenarioState,
        events,
      });
    case "acl-least-privilege":
      return aclExperience.project({
        snapshot,
        scenarioState,
        events,
      });
  }
}

function isScenarioId(scenarioId: string): scenarioId is ScenarioExperienceId {
  return Object.hasOwn(scenarioExperienceRegistry, scenarioId);
}
