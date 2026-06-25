import type { PlaygroundMessage, RunSnapshot } from "@kplay/contracts";

export type ScenarioInsight = {
  title: string;
  summary: string;
  metrics: Array<{ label: string; value: string; tone?: "amber" | "emerald" | "rose" | "sky" | "violet" }>;
  chips: string[];
};

export function deriveScenarioInsight(snapshot: RunSnapshot): ScenarioInsight {
  const messages = snapshot.recentMessages;
  const failed = messages.filter((message) => message.state === "failed").length;
  const committed = snapshot.messageCounts.committed ?? 0;
  const produced = snapshot.messageCounts.produced ?? 0;
  const lag = Math.max(0, produced - committed - failed);
  const latest = messages.at(-1);

  if (snapshot.scenarioId === "fan-out-load-balancing") {
    return {
      title: "Fan-out / load balance",
      summary: "Compare how one consumer group divides partitions while unkeyed events spread across lanes.",
      metrics: [
        { label: "Partitions", value: String(snapshot.partitionCount), tone: "sky" },
        { label: "Active members", value: String(snapshot.consumers.filter((consumer) => consumer.assignments.length > 0).length), tone: "emerald" },
        { label: "Idle members", value: String(snapshot.consumers.filter((consumer) => consumer.assignments.length === 0).length), tone: "amber" }
      ],
      chips: ["single group", "unkeyed spread", "partition sharing"]
    };
  }

  if (snapshot.scenarioId === "at-least-once-duplicates") {
    const duplicateRisks = countPayload(messages, "duplicateRisk", true);
    return {
      title: "At-least-once duplicate surface",
      summary: "Watch the gap between processed work and committed offsets; duplicates are possible before commit.",
      metrics: [
        { label: "In-flight risk", value: String(lag), tone: lag > 0 ? "amber" : "emerald" },
        { label: "Duplicate-risk records", value: String(duplicateRisks), tone: duplicateRisks > 0 ? "amber" : "sky" },
        { label: "Committed", value: String(committed), tone: "emerald" }
      ],
      chips: ["idempotency key", "commit gap", "replay risk"]
    };
  }

  if (snapshot.scenarioId === "retry-dead-letter-queues") {
    return {
      title: "Retry and dead-letter routing",
      summary: "Every third simulated fulfillment request fails processing and is marked for retry/DLQ escalation.",
      metrics: [
        { label: "Failed", value: String(failed), tone: failed > 0 ? "rose" : "emerald" },
        { label: "Retry topic", value: latestPayloadString(latest, "retryTopic") ?? "orders.retry.30s", tone: "amber" },
        { label: "DLQ", value: latestPayloadString(latest, "deadLetterTopic") ?? "orders.dlq", tone: "rose" }
      ],
      chips: ["backoff", "terminal topic", "handler failure"]
    };
  }

  if (snapshot.scenarioId === "schema-evolution-karapace") {
    const incompatible = countPayload(messages, "compatible", false);
    return {
      title: "Schema compatibility",
      summary: "Compatible profile updates pass through; every fourth schema version simulates an incompatible contract.",
      metrics: [
        { label: "Schema version", value: latestPayloadString(latest, "schemaVersion") ?? "2", tone: "violet" },
        { label: "Rejected", value: String(incompatible), tone: incompatible > 0 ? "rose" : "emerald" },
        { label: "Subject", value: latestPayloadString(latest, "schemaSubject") ?? "profile-value", tone: "sky" }
      ],
      chips: ["Karapace", "compatibility", "consumer contract"]
    };
  }

  if (snapshot.scenarioId === "transactional-producers") {
    return {
      title: "Transactional producer boundary",
      summary: "Records carry transaction IDs, producer sequence numbers, and open/commit boundary hints.",
      metrics: [
        { label: "Transaction", value: latestPayloadString(latest, "transactionId") ?? "-", tone: "sky" },
        { label: "Boundary", value: latestPayloadString(latest, "commitBoundary") ?? "open", tone: latestPayloadString(latest, "commitBoundary") === "commit" ? "emerald" : "amber" },
        { label: "Committed offsets", value: String(committed), tone: "emerald" }
      ],
      chips: ["idempotent send", "epoch", "read committed"]
    };
  }

  if (snapshot.scenarioId === "event-replay-sourcing") {
    return {
      title: "Replay cursor",
      summary: "Domain events carry aggregate IDs and replay cursors so derived state can be rebuilt from the log.",
      metrics: [
        { label: "Aggregate", value: latestPayloadString(latest, "aggregateId") ?? "-", tone: "sky" },
        { label: "Event", value: latestPayloadString(latest, "eventName") ?? "-", tone: "violet" },
        { label: "Cursor", value: latestPayloadString(latest, "replayCursor") ?? "0", tone: "emerald" }
      ],
      chips: ["immutable log", "projection", "offset reset"]
    };
  }

  if (snapshot.scenarioId === "consumer-lag-backpressure") {
    return {
      title: "Lag and backpressure",
      summary: "Lag estimates grow when produced records outpace commits; add consumers or lower rate to recover.",
      metrics: [
        { label: "Estimated lag", value: String(lag), tone: lag > 2 ? "rose" : lag > 0 ? "amber" : "emerald" },
        { label: "Latency", value: `${snapshot.processingLatencyMs} ms`, tone: snapshot.processingLatencyMs > 1000 ? "amber" : "sky" },
        { label: "Rate", value: `${snapshot.productionRate}/s`, tone: "sky" }
      ],
      chips: ["throughput", "processing time", "capacity"]
    };
  }

  if (snapshot.scenarioId === "hot-partitions-key-skew") {
    const busiest = busiestPartition(snapshot);
    return {
      title: "Hot partition detector",
      summary: "The default hot key intentionally concentrates traffic so skew is visible in partition counts.",
      metrics: [
        { label: "Hot key", value: snapshot.keyStrategy.type === "fixed" ? snapshot.keyStrategy.value : "mixed", tone: "amber" },
        { label: "Busiest partition", value: busiest.partition, tone: "rose" },
        { label: "Records there", value: String(busiest.count), tone: busiest.count > 0 ? "rose" : "sky" }
      ],
      chips: ["key skew", "hash routing", "capacity hotspot"]
    };
  }

  if (snapshot.scenarioId === "log-compaction-tombstones") {
    const tombstones = countPayload(messages, "tombstone", true);
    return {
      title: "Compaction state",
      summary: "Repeated keys represent compacted updates; tombstones mark keys for eventual deletion.",
      metrics: [
        { label: "Tombstones", value: String(tombstones), tone: tombstones > 0 ? "rose" : "sky" },
        { label: "Latest op", value: latestPayloadString(latest, "operation") ?? "-", tone: latestPayloadString(latest, "operation") === "delete" ? "rose" : "emerald" },
        { label: "Compacted key", value: latestPayloadString(latest, "compactedKey") ?? "-", tone: "sky" }
      ],
      chips: ["upsert", "delete marker", "latest value"]
    };
  }

  if (snapshot.scenarioId === "retention-data-loss") {
    const expiring = countPayload(messages, "retentionBucket", "expired-soon");
    return {
      title: "Retention window",
      summary: "Records outside the active window represent data that consumers may no longer be able to replay.",
      metrics: [
        { label: "Expiring records", value: String(expiring), tone: expiring > 0 ? "amber" : "emerald" },
        { label: "Replayable from", value: latestPayloadString(latest, "replayableUntilOffset") ?? "0", tone: "sky" },
        { label: "Committed", value: String(committed), tone: "emerald" }
      ],
      chips: ["finite replay", "offset gap", "recovery window"]
    };
  }

  if (snapshot.scenarioId === "cooperative-rebalancing") {
    return {
      title: "Cooperative rebalance",
      summary: "Add and stop members to watch incremental ownership movement under a cooperative-sticky model.",
      metrics: [
        { label: "Members", value: String(snapshot.consumers.length), tone: "sky" },
        { label: "Revocations", value: String(snapshot.recentEvents.filter((event) => event.type === "consumer.partitions_revoked").length), tone: "amber" },
        { label: "Assignments", value: String(snapshot.consumers.reduce((sum, consumer) => sum + consumer.assignments.length, 0)), tone: "emerald" }
      ],
      chips: ["sticky", "incremental revoke", "group join"]
    };
  }

  if (snapshot.scenarioId === "streams-joins-windows") {
    return {
      title: "Windowed join",
      summary: "Events carry stream names, join keys, and window boundaries to model stateful stream joins.",
      metrics: [
        { label: "Stream", value: latestPayloadString(latest, "streamName") ?? "-", tone: "violet" },
        { label: "Join key", value: latestPayloadString(latest, "joinKey") ?? "-", tone: "sky" },
        { label: "Late arrivals", value: String(countPayload(messages, "lateArrival", true)), tone: countPayload(messages, "lateArrival", true) > 0 ? "amber" : "emerald" }
      ],
      chips: ["event time", "grace", "state store"]
    };
  }

  if (snapshot.scenarioId === "outbox-cdc") {
    return {
      title: "Outbox CDC",
      summary: "Records carry table operations, outbox IDs, and log sequence numbers for CDC publication.",
      metrics: [
        { label: "Table", value: latestPayloadString(latest, "table") ?? "orders", tone: "sky" },
        { label: "Operation", value: latestPayloadString(latest, "operation") ?? "-", tone: "violet" },
        { label: "LSN", value: latestPayloadString(latest, "lsn") ?? "-", tone: "emerald" }
      ],
      chips: ["transaction log", "outbox row", "connector retry"]
    };
  }

  if (snapshot.scenarioId === "acl-least-privilege") {
    const denied = countPayload(messages, "authorized", false);
    return {
      title: "Least-privilege ACL",
      summary: "Denied operations simulate Kafka authorization failures for principals with insufficient permissions.",
      metrics: [
        { label: "Denied", value: String(denied), tone: denied > 0 ? "rose" : "emerald" },
        { label: "Principal", value: latestPayloadString(latest, "principal") ?? "-", tone: "sky" },
        { label: "Operation", value: latestPayloadString(latest, "operation") ?? "-", tone: "amber" }
      ],
      chips: ["principal", "operation", "authorization"]
    };
  }

  return {
    title: "Partitioning run",
    summary: "Messages, partitions, consumer assignments, and commits show the core Kafka lifecycle.",
    metrics: [
      { label: "Produced", value: String(produced), tone: "sky" },
      { label: "Committed", value: String(committed), tone: "emerald" },
      { label: "Partitions", value: String(snapshot.partitionCount), tone: "violet" }
    ],
    chips: ["key routing", "partition order", "manual commit"]
  };
}

function countPayload(messages: PlaygroundMessage[], key: string, expected: unknown) {
  return messages.filter((message) => payloadValue(message, key) === expected).length;
}

function latestPayloadString(message: PlaygroundMessage | undefined, key: string) {
  const value = message ? payloadValue(message, key) : null;
  return value === null || value === undefined ? null : String(value);
}

function payloadValue(message: PlaygroundMessage, key: string) {
  const payload = message.value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return (payload as Record<string, unknown>)[key];
}

function busiestPartition(snapshot: RunSnapshot) {
  const entries = Object.entries(snapshot.messageCounts)
    .filter(([partition]) => /^\d+$/.test(partition))
    .map(([partition, count]) => ({ partition: `P${partition}`, count }));
  return entries.sort((a, b) => b.count - a.count)[0] ?? { partition: "P-", count: 0 };
}
