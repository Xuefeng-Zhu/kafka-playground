export type ScenarioTeachingCase = {
  scenarioId: string;
  question: string;
  primaryExperimentId: string;
  contrastExperimentId: string;
  extensionNodeId: string;
  causalEdgeId: string;
  initial: { revision: 0; status: "idle" };
  pivotal: { status: "completed"; experimentId: string };
  contrast: { status: "completed"; experimentId: string };
  mobileRequired: boolean;
};

function teachingCase(
  scenarioId: string,
  question: string,
  primaryExperimentId: string,
  contrastExperimentId: string,
  extensionNodeId: string,
  causalEdgeId: string,
  mobileRequired = false,
): ScenarioTeachingCase {
  return {
    scenarioId,
    question,
    primaryExperimentId,
    contrastExperimentId,
    extensionNodeId,
    causalEdgeId,
    initial: { revision: 0, status: "idle" },
    pivotal: { status: "completed", experimentId: primaryExperimentId },
    contrast: { status: "completed", experimentId: contrastExperimentId },
    mobileRequired,
  };
}

/**
 * This verification manifest is intentionally independent of the production
 * scenario registry. Adding or removing a production scenario cannot silently
 * change the required teaching coverage.
 */
export const scenarioTeachingManifest = [
  teachingCase(
    "partitioning",
    "Why did both A records share a partition, and who can process them?",
    "produce-keyed-record",
    "grow-consumer-group",
    "key-router",
    "producer-router",
    true,
  ),
  teachingCase(
    "fan-out-load-balancing",
    "How does adding a member change partition ownership?",
    "grow-consumer-group",
    "produce-unkeyed-burst",
    "group-balancer",
    "topic-balancer",
  ),
  teachingCase(
    "at-least-once-duplicates",
    "Why can one Kafka record cause two naive side effects?",
    "crash-and-redeliver",
    "duplicate-risk-records",
    "idempotent-handler",
    "group-handler",
    true,
  ),
  teachingCase(
    "retry-dead-letter-queues",
    "When does a failure retry, recover, or enter the DLQ?",
    "transient-recovery",
    "poison-to-dlq",
    "retry-topic",
    "group-retry",
  ),
  teachingCase(
    "schema-evolution-karapace",
    "Where is schema compatibility decided?",
    "compatible-schema",
    "trigger-schema-rejection",
    "schema-registry",
    "producer-registry",
  ),
  teachingCase(
    "transactional-producers",
    "Which staged records become visible to read-committed consumers?",
    "transaction-pair",
    "abort-and-dedupe",
    "transaction-coordinator",
    "producer-coordinator",
  ),
  teachingCase(
    "event-replay-sourcing",
    "How can a projection rebuild without producing new facts?",
    "aggregate-events",
    "rebuild-projection",
    "replay-cursor",
    "topic-cursor",
  ),
  teachingCase(
    "consumer-lag-backpressure",
    "Is the group falling behind or recovering, and why?",
    "build-lag",
    "recover-lag",
    "backlog-buffer",
    "topic-backlog",
  ),
  teachingCase(
    "hot-partitions-key-skew",
    "How does key strategy create or reduce skew?",
    "hot-key-burst",
    "balanced-comparison",
    "hot-key-router",
    "producer-router",
    true,
  ),
  teachingCase(
    "log-compaction-tombstones",
    "What survives compaction and later tombstone cleanup?",
    "run-compaction",
    "expire-tombstone",
    "compacted-state-store",
    "topic-state",
  ),
  teachingCase(
    "retention-data-loss",
    "What happens when a consumer requests an expired offset?",
    "advance-retention",
    "recover-retention",
    "retention-window",
    "topic-window",
  ),
  teachingCase(
    "cooperative-rebalancing",
    "Which partitions stop moving under cooperative-sticky assignment?",
    "compare-rebalance",
    "cooperative-pressure",
    "rebalance-coordinator",
    "topic-coordinator",
  ),
  teachingCase(
    "streams-joins-windows",
    "Why did two records join or remain unmatched?",
    "window-pair",
    "late-arrival",
    "orders-stream",
    "producer-orders",
    true,
  ),
  teachingCase(
    "outbox-cdc",
    "Where is the atomic boundary and how is retry duplication prevented?",
    "cdc-batch",
    "retry-cdc",
    "database-outbox",
    "outbox-wal",
  ),
  teachingCase(
    "acl-least-privilege",
    "Which exact permission allowed or denied this operation?",
    "trigger-acl-denial",
    "grant-required-permission",
    "authorization-gate",
    "principal-gate",
    true,
  ),
] as const satisfies readonly ScenarioTeachingCase[];
