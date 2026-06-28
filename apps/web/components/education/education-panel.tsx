import type { PlaygroundMessage, RunSnapshot } from "@kplay/contracts";

export function EducationPanel({
  scenarioId,
  snapshot,
  selectedMessage,
}: {
  scenarioId: string;
  snapshot: RunSnapshot | null;
  selectedMessage: PlaygroundMessage | null;
}) {
  const text = explain(scenarioId, snapshot, selectedMessage);
  return (
    <section
      id="how-it-works"
      className="mt-4 scroll-mt-4 rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-4 shadow-[7px_7px_0_rgba(15,118,110,0.14)]"
    >
      <h2 className="kplay-section-title">What you are seeing</h2>
      <p className="mt-3 text-sm leading-6 text-[#31566a]">{text}</p>
    </section>
  );
}

const scenarioExplanations: Record<string, string> = {
  partitioning:
    "Use keyed messages and consumers to inspect partition ownership, per-partition ordering, and manual offset commits.",
  "fan-out-load-balancing":
    "Use no-key production and multiple consumers to compare partition load balancing inside one group.",
  "at-least-once-duplicates":
    "Produce, process, and stop consumers before commits to see where duplicate delivery can enter an at-least-once workflow.",
  "retry-dead-letter-queues":
    "Watch failed-processing events as the place where retry, backoff, and dead-letter routing decisions should be made.",
  "schema-evolution-karapace":
    "Treat message values as schema-versioned payloads and inspect how consumers would reject incompatible changes.",
  "transactional-producers":
    "Use produced and committed states to reason about idempotent writes and transaction boundaries.",
  "event-replay-sourcing":
    "Use offsets and commits as replay cursors for rebuilding derived state from the immutable event log.",
  "consumer-lag-backpressure":
    "Increase rate or latency to watch the gap between produced records and committed offsets grow.",
  "hot-partitions-key-skew":
    "Use the fixed hot key to see how skew concentrates traffic on one partition even with more partitions available.",
  "log-compaction-tombstones":
    "Read repeated keys as compacted-topic updates where the latest value or tombstone determines retained state.",
  "retention-data-loss":
    "Use latest and committed offsets to reason about what can be replayed before retention removes old records.",
  "cooperative-rebalancing":
    "Add and stop consumers to observe ownership movement during group rebalances.",
  "streams-joins-windows":
    "Treat event time and partition ownership as the basis for windowed joins and late-arriving records.",
  "outbox-cdc":
    "Treat produced records as database-change events moving from an outbox into Kafka through CDC.",
  "acl-least-privilege":
    "Use run errors and failed operations as the surface where missing Kafka permissions become visible.",
};

function explain(
  scenarioId: string,
  snapshot: RunSnapshot | null,
  selectedMessage: PlaygroundMessage | null,
) {
  const scenarioText =
    scenarioExplanations[scenarioId] ??
    "Use the topology and timeline to inspect the scenario behavior.";
  if (!snapshot) {
    return `Start a run to create this scenario's topic model. ${scenarioText}`;
  }
  if (!Array.isArray(snapshot.consumers)) {
    return "The run is changing state. Waiting for the next authoritative snapshot.";
  }
  if (
    snapshot.consumers.some((consumer) => consumer.assignments.length === 0)
  ) {
    return `This topic has ${snapshot.partitionCount} partitions, so only ${snapshot.partitionCount} members of this consumer group can consume actively. Extra members remain idle until an assignment becomes available.`;
  }
  if (snapshot.consumers.length >= 2) {
    return "Members of the same consumer group divide partitions among themselves. Each partition is assigned to only one member of the group at a time.";
  }
  if (
    selectedMessage?.state === "received" ||
    selectedMessage?.state === "processing"
  ) {
    return "The consumer has received the message, but the group committed position has not advanced yet.";
  }
  if (selectedMessage?.state === "committed") {
    return "The committed offset is the next offset the consumer group should read for this partition.";
  }
  if (snapshot.keyStrategy.type === "fixed") {
    return "Kafka hashes the message key to select a partition. Messages with the same key normally remain on the same partition while the topic partition count is unchanged.";
  }
  return scenarioText;
}
