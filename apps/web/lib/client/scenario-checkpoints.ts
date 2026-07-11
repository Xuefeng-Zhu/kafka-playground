import type { ScenarioId } from "@kplay/scenario-engine";
import type { ScenarioCheckpoint } from "./scenario-experience/model";

const scenarioCheckpointCatalog = {
  partitioning: {
    id: "partitioning-commit-step",
    prompt: "What does committing an offset tell Kafka?",
    options: [
      { id: "record-written", label: "The producer wrote a new record." },
      {
        id: "next-read",
        label: "The group can resume after processed records.",
      },
      { id: "partition-added", label: "A new partition is available." },
    ],
    correctOptionId: "next-read",
    explanation:
      "A committed offset records consumer progress. If the group restarts, it resumes from the committed position.",
  },
  "fan-out-load-balancing": {
    id: "fan-out-group-sharing",
    prompt: "How does one consumer group use multiple members?",
    options: [
      { id: "copy-all", label: "Every member receives every record." },
      { id: "share-partitions", label: "Members divide partition ownership." },
      { id: "change-topic", label: "Members create more topic partitions." },
    ],
    correctOptionId: "share-partitions",
    explanation:
      "Within a single group, each partition is assigned to one active member at a time.",
  },
  "at-least-once-duplicates": {
    id: "at-least-once-idempotency",
    prompt: "Why do at-least-once consumers need idempotent handlers?",
    options: [
      { id: "schema", label: "Schemas cannot evolve without idempotency." },
      { id: "replay", label: "Processed work can be replayed before commit." },
      { id: "partitions", label: "Idempotency adds more partitions." },
    ],
    correctOptionId: "replay",
    explanation:
      "If a consumer stops after processing but before committing, Kafka may deliver the same record again.",
  },
  "retry-dead-letter-queues": {
    id: "retry-dlq-purpose",
    prompt: "What is the main purpose of a dead-letter topic?",
    options: [
      { id: "terminal", label: "Store records that cannot be handled safely." },
      { id: "speed", label: "Make the main topic process faster." },
      { id: "rebalance", label: "Prevent consumer group rebalances." },
    ],
    correctOptionId: "terminal",
    explanation:
      "Dead-letter topics keep terminal failures observable without blocking the main processing path.",
  },
  "schema-evolution-karapace": {
    id: "schema-compatibility",
    prompt: "When should an incompatible payload fail?",
    options: [
      { id: "before-processing", label: "Before unsafe consumer processing." },
      { id: "after-commit", label: "Only after the offset is committed." },
      { id: "never", label: "Kafka should silently rewrite it." },
    ],
    correctOptionId: "before-processing",
    explanation:
      "Schema compatibility checks protect consumers by rejecting unsafe payloads before handler logic runs.",
  },
  "transactional-producers": {
    id: "transaction-boundary",
    prompt: "What does a transaction boundary group together?",
    options: [
      { id: "records-offsets", label: "Records and related offset commits." },
      { id: "members", label: "All consumers in the group." },
      { id: "topics", label: "Every topic in the cluster." },
    ],
    correctOptionId: "records-offsets",
    explanation:
      "Kafka transactions make related writes and offset commits visible as one committed unit.",
  },
  "event-replay-sourcing": {
    id: "event-replay-source",
    prompt: "What is the source of truth during event replay?",
    options: [
      { id: "projection", label: "The current projection state." },
      { id: "log", label: "The immutable event log." },
      { id: "producer-rate", label: "The producer rate setting." },
    ],
    correctOptionId: "log",
    explanation:
      "Replay rebuilds derived state from historical log records instead of treating the projection as authoritative.",
  },
  "consumer-lag-backpressure": {
    id: "lag-capacity",
    prompt: "What usually makes consumer lag grow?",
    options: [
      { id: "outpace", label: "Production outpaces processing and commits." },
      { id: "idle", label: "Consumers commit faster than production." },
      { id: "acl", label: "ACLs grant too many permissions." },
    ],
    correctOptionId: "outpace",
    explanation:
      "Lag is the gap between produced work and committed progress, so it grows when processing capacity falls behind.",
  },
  "hot-partitions-key-skew": {
    id: "hot-partition-key-choice",
    prompt: "Why can one partition become hot?",
    options: [
      { id: "dominant-key", label: "A dominant key keeps hashing to it." },
      { id: "offset", label: "Committed offsets choose partitions." },
      { id: "dlq", label: "Dead-letter topics force skew." },
    ],
    correctOptionId: "dominant-key",
    explanation:
      "Key-based routing preserves ordering for a key, but a dominant key can concentrate traffic on one partition.",
  },
  "log-compaction-tombstones": {
    id: "compaction-tombstone",
    prompt: "What does a tombstone record mean in a compacted topic?",
    options: [
      { id: "delete", label: "The key is marked for deletion." },
      { id: "rebalance", label: "The group must rebalance." },
      { id: "retry", label: "The record should be retried later." },
    ],
    correctOptionId: "delete",
    explanation:
      "A tombstone is a null-value delete marker; compaction can later remove older values for that key.",
  },
  "retention-data-loss": {
    id: "retention-window",
    prompt: "What does retention limit?",
    options: [
      { id: "rewind", label: "How far consumers can rewind and replay." },
      { id: "consumer-count", label: "How many consumers can join." },
      { id: "key-choice", label: "Which key strategy producers use." },
    ],
    correctOptionId: "rewind",
    explanation:
      "Retention can delete old records, so offsets may point behind data that is still replayable.",
  },
  "cooperative-rebalancing": {
    id: "cooperative-revoke",
    prompt: "What does cooperative rebalancing try to reduce?",
    options: [
      { id: "full-stop", label: "Full-stop partition revocations." },
      { id: "partitions", label: "The topic partition count." },
      { id: "schemas", label: "Schema compatibility checks." },
    ],
    correctOptionId: "full-stop",
    explanation:
      "Cooperative assignment moves ownership incrementally so fewer partitions stop at once.",
  },
  "streams-joins-windows": {
    id: "stream-window-join",
    prompt: "What does a windowed join group by?",
    options: [
      { id: "event-time", label: "Matching keys within an event-time window." },
      { id: "consumer-id", label: "The current consumer id." },
      { id: "committed-offset", label: "Only the committed offset value." },
    ],
    correctOptionId: "event-time",
    explanation:
      "Kafka Streams uses keys, event time, and the window/grace configuration to decide whether records can join.",
  },
  "outbox-cdc": {
    id: "outbox-atomicity",
    prompt: "Why use an outbox table with CDC?",
    options: [
      { id: "atomic", label: "Bridge database commits to Kafka publication." },
      { id: "partition", label: "Increase Kafka partitions automatically." },
      { id: "acl", label: "Bypass Kafka authorization." },
    ],
    correctOptionId: "atomic",
    explanation:
      "The outbox pattern records publishable events in the same database transaction as business state.",
  },
  "acl-least-privilege": {
    id: "acl-permission",
    prompt: "What causes an authorization failure?",
    options: [
      {
        id: "missing-permission",
        label: "The principal lacks the required permission.",
      },
      { id: "lag", label: "Consumer lag is too low." },
      { id: "transaction", label: "The producer uses transactions." },
    ],
    correctOptionId: "missing-permission",
    explanation:
      "Kafka ACLs evaluate the principal, resource, and operation before allowing producer, consumer, or admin work.",
  },
} satisfies Record<ScenarioId, ScenarioCheckpoint>;

export function scenarioCheckpointForId(
  scenarioId: ScenarioId,
): ScenarioCheckpoint {
  return scenarioCheckpointCatalog[scenarioId];
}
