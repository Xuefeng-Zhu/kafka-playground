import type {
  ScenarioExperimentIdForRole,
  ScenarioState,
} from "@kplay/contracts";

export type ScenarioTeachingCase<
  Id extends ScenarioState["scenarioId"] = ScenarioState["scenarioId"],
> = {
  scenarioId: Id;
  primaryExperimentId: ScenarioExperimentIdForRole<Id, "primary">;
  contrastExperimentId: ScenarioExperimentIdForRole<Id, "contrast">;
  extensionNodeId: string;
  causalEdgeId: string;
  initial: { revision: 0; status: "idle" };
  primary: {
    status: "completed";
    experimentId: ScenarioExperimentIdForRole<Id, "primary">;
  };
  contrast: {
    status: "completed";
    experimentId: ScenarioExperimentIdForRole<Id, "contrast">;
  };
  renderedEvidence: {
    primary: RenderedEvidenceExpectation;
    contrast: RenderedEvidenceExpectation;
  };
  mobileRequired: boolean;
};

export type RenderedEvidenceExpectation = {
  label: string;
  value: string | number;
};

function renderedEvidence(
  label: string,
  value: string | number,
): RenderedEvidenceExpectation {
  return { label, value };
}

function teachingCase<const Id extends ScenarioState["scenarioId"]>(
  scenarioId: Id,
  primaryExperimentId: ScenarioExperimentIdForRole<Id, "primary">,
  contrastExperimentId: ScenarioExperimentIdForRole<Id, "contrast">,
  extensionNodeId: string,
  causalEdgeId: string,
  primaryEvidence: RenderedEvidenceExpectation,
  contrastEvidence: RenderedEvidenceExpectation,
  mobileRequired = false,
): ScenarioTeachingCase<Id> {
  return {
    scenarioId,
    primaryExperimentId,
    contrastExperimentId,
    extensionNodeId,
    causalEdgeId,
    initial: { revision: 0, status: "idle" },
    primary: { status: "completed", experimentId: primaryExperimentId },
    contrast: { status: "completed", experimentId: contrastExperimentId },
    renderedEvidence: {
      primary: primaryEvidence,
      contrast: contrastEvidence,
    },
    mobileRequired,
  };
}

/**
 * This verification manifest is intentionally independent of the production
 * scenario registry. Adding or removing a production scenario cannot silently
 * change the required teaching coverage.
 */
const scenarioTeachingCases = {
  partitioning: teachingCase(
    "partitioning",
    "produce-keyed-record",
    "grow-consumer-group",
    "key-router",
    "producer-router",
    renderedEvidence("Routed records", 3),
    renderedEvidence("Idle consumers", 1),
    true,
  ),
  "fan-out-load-balancing": teachingCase(
    "fan-out-load-balancing",
    "grow-consumer-group",
    "produce-unkeyed-burst",
    "group-balancer",
    "topic-balancer",
    renderedEvidence("Members", 4),
    renderedEvidence("Unkeyed routes recorded", 3),
  ),
  "at-least-once-duplicates": teachingCase(
    "at-least-once-duplicates",
    "crash-and-redeliver",
    "duplicate-risk-records",
    "idempotent-handler",
    "group-handler",
    renderedEvidence("Redeliveries", 1),
    renderedEvidence("Naïve side effects", 2),
    true,
  ),
  "retry-dead-letter-queues": teachingCase(
    "retry-dead-letter-queues",
    "transient-recovery",
    "poison-to-dlq",
    "retry-topic",
    "group-retry",
    renderedEvidence("Transient recovered", 1),
    renderedEvidence("Dead-lettered", 1),
  ),
  "schema-evolution-karapace": teachingCase(
    "schema-evolution-karapace",
    "compatible-schema",
    "trigger-schema-rejection",
    "schema-registry",
    "producer-registry",
    renderedEvidence("Topic records", 1),
    renderedEvidence("Rejected before Kafka", 1),
  ),
  "transactional-producers": teachingCase(
    "transactional-producers",
    "transaction-pair",
    "abort-and-dedupe",
    "transaction-coordinator",
    "producer-coordinator",
    renderedEvidence("Visible records", 2),
    renderedEvidence("Suppressed resends", 1),
  ),
  "event-replay-sourcing": teachingCase(
    "event-replay-sourcing",
    "aggregate-events",
    "rebuild-projection",
    "replay-cursor",
    "topic-cursor",
    renderedEvidence("Produced facts", 3),
    renderedEvidence("Produced facts", 3),
  ),
  "consumer-lag-backpressure": teachingCase(
    "consumer-lag-backpressure",
    "build-lag",
    "recover-lag",
    "backlog-buffer",
    "topic-backlog",
    renderedEvidence("Total lag", 18),
    renderedEvidence("Total lag", 0),
  ),
  "hot-partitions-key-skew": teachingCase(
    "hot-partitions-key-skew",
    "hot-key-burst",
    "balanced-comparison",
    "hot-key-router",
    "producer-router",
    renderedEvidence("Hot phase size", 8),
    renderedEvidence("Equal-size comparison", "Yes"),
    true,
  ),
  "log-compaction-tombstones": teachingCase(
    "log-compaction-tombstones",
    "run-compaction",
    "expire-tombstone",
    "compacted-state-store",
    "topic-state",
    renderedEvidence("Removed by compaction", 2),
    renderedEvidence("Tombstones cleaned later", 1),
  ),
  "retention-data-loss": teachingCase(
    "retention-data-loss",
    "advance-retention",
    "recover-retention",
    "retention-window",
    "topic-window",
    renderedEvidence("Replay status", "offset_out_of_range"),
    renderedEvidence("Replay status", "Available"),
  ),
  "cooperative-rebalancing": teachingCase(
    "cooperative-rebalancing",
    "compare-rebalance",
    "cooperative-pressure",
    "rebalance-coordinator",
    "topic-coordinator",
    renderedEvidence("Eager revoked", 3),
    renderedEvidence("Cooperative kept", 1),
  ),
  "streams-joins-windows": teachingCase(
    "streams-joins-windows",
    "window-pair",
    "late-arrival",
    "orders-stream",
    "producer-orders",
    renderedEvidence("Valid joined outputs", 1),
    renderedEvidence("After grace", 1),
    true,
  ),
  "outbox-cdc": teachingCase(
    "outbox-cdc",
    "cdc-batch",
    "retry-cdc",
    "database-outbox",
    "outbox-wal",
    renderedEvidence("Acknowledged publishes", 1),
    renderedEvidence("Suppressed retry attempts", 1),
  ),
  "acl-least-privilege": teachingCase(
    "acl-least-privilege",
    "trigger-acl-denial",
    "grant-required-permission",
    "authorization-gate",
    "principal-gate",
    renderedEvidence("Denied before Kafka", 1),
    renderedEvidence("Allowed to Kafka", 1),
    true,
  ),
} as const satisfies {
  [Id in ScenarioState["scenarioId"]]: ScenarioTeachingCase<Id>;
};

export const scenarioTeachingManifest = Object.values(scenarioTeachingCases);
