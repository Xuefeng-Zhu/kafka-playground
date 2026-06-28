import type { RunSnapshot } from "@kplay/contracts";
import {
  busiestPartition,
  countPayload,
  latestPayloadString,
} from "./scenario-metrics";
import { keyStrategyLabel } from "./key-strategy-label";

export type ScenarioTopologyTone =
  | "amber"
  | "emerald"
  | "rose"
  | "sky"
  | "teal"
  | "violet";

export type ScenarioTopologyIcon =
  | "acl"
  | "balance"
  | "commit"
  | "compact"
  | "database"
  | "dlq"
  | "handler"
  | "hot"
  | "lag"
  | "projection"
  | "rebalance"
  | "retention"
  | "retry"
  | "route"
  | "schema"
  | "stream"
  | "transaction";

export type ScenarioTopologyNode = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  metricLabel: string;
  metricValue: string;
  tone: ScenarioTopologyTone;
  icon: ScenarioTopologyIcon;
  position: { x: number; y: number };
  compactPosition: { x: number; y: number };
  details: Array<[string, string]>;
};

export type ScenarioTopologyEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  tone: ScenarioTopologyTone;
  active?: boolean;
  dashed?: boolean;
};

export type ScenarioTopologyModel = {
  nodes: ScenarioTopologyNode[];
  edges: ScenarioTopologyEdge[];
};

type ScenarioNodeInput = Omit<ScenarioTopologyNode, "compactPosition"> & {
  compactIndex: number;
};

const latest = (snapshot: RunSnapshot) => snapshot.recentMessages.at(-1);

export function deriveScenarioTopology(
  snapshot: RunSnapshot,
): ScenarioTopologyModel {
  const produced = snapshot.messageCounts.produced ?? 0;
  const committed = snapshot.messageCounts.committed ?? 0;
  const failed =
    snapshot.messageCounts.failed ??
    snapshot.recentMessages.filter((message) => message.state === "failed")
      .length;
  const lag = Math.max(0, produced - committed - failed);
  const latestMessage = latest(snapshot);
  const activeMembers = snapshot.consumers.filter(
    (consumer) => consumer.assignments.length > 0,
  ).length;
  const idleMembers = snapshot.consumers.filter(
    (consumer) => consumer.assignments.length === 0,
  ).length;

  if (snapshot.scenarioId === "fan-out-load-balancing") {
    return model(
      [
        node({
          id: "group-balancer",
          title: "Group balancer",
          eyebrow: "Load sharing",
          description: "One group divides partitions across active members.",
          metricLabel: "Active",
          metricValue: `${activeMembers}/${snapshot.partitionCount}`,
          tone: "emerald",
          icon: "balance",
          position: { x: 604, y: 32 },
          compactIndex: 0,
          details: [
            ["Partitions", String(snapshot.partitionCount)],
            ["Active members", String(activeMembers)],
            ["Idle members", String(idleMembers)],
          ],
        }),
        node({
          id: "idle-members",
          title: "Idle members",
          eyebrow: "Partition limit",
          description: "Extra members wait when partitions are exhausted.",
          metricLabel: "Idle",
          metricValue: String(idleMembers),
          tone: idleMembers > 0 ? "amber" : "sky",
          icon: "handler",
          position: { x: 930, y: 404 },
          compactIndex: 1,
          details: [
            ["Consumers", String(snapshot.consumers.length)],
            ["Idle members", String(idleMembers)],
            ["Group", snapshot.consumerGroupId],
          ],
        }),
      ],
      [
        edge("topic-to-balancer", "topic", "group-balancer", "emerald", {
          sourceHandle: "topic-empty-out",
          targetHandle: "left-in",
          active: activeMembers > 0,
        }),
        edge(
          "balancer-to-group",
          "group-balancer",
          "consumerGroup",
          "emerald",
          { sourceHandle: "right-out", targetHandle: "empty-in" },
        ),
        edge("balancer-to-idle", "group-balancer", "idle-members", "amber", {
          sourceHandle: "bottom-out",
          targetHandle: "top-in",
          dashed: true,
          active: idleMembers > 0,
        }),
      ],
    );
  }

  if (snapshot.scenarioId === "at-least-once-duplicates") {
    const duplicateRisks = countPayload(
      snapshot.recentMessages,
      "duplicateRisk",
      true,
    );
    return model(
      [
        node({
          id: "idempotent-handler",
          title: "Idempotent handler",
          eyebrow: "Processing",
          description: "Handler must tolerate replay before commit.",
          metricLabel: "Risk keys",
          metricValue: String(duplicateRisks),
          tone: duplicateRisks > 0 ? "amber" : "emerald",
          icon: "handler",
          position: { x: 592, y: 32 },
          compactIndex: 0,
          details: [
            ["Duplicate-risk records", String(duplicateRisks)],
            ["Latency", `${snapshot.processingLatencyMs} ms`],
            ["Latest state", latestMessage?.state ?? "ready"],
          ],
        }),
        node({
          id: "commit-gate",
          title: "Commit gate",
          eyebrow: "Offset boundary",
          description: "Work is only safe after offset commit.",
          metricLabel: "Gap",
          metricValue: String(lag),
          tone: lag > 0 ? "amber" : "emerald",
          icon: "commit",
          position: { x: 642, y: 408 },
          compactIndex: 1,
          details: [
            ["Produced", String(produced)],
            ["Committed", String(committed)],
            ["In-flight gap", String(lag)],
          ],
        }),
        node({
          id: "replay-loop",
          title: "Replay loop",
          eyebrow: "At-least-once",
          description: "Uncommitted work can be delivered again.",
          metricLabel: "Replayable",
          metricValue: lag > 0 ? "yes" : "none",
          tone: lag > 0 ? "rose" : "sky",
          icon: "retry",
          position: { x: 214, y: 408 },
          compactIndex: 2,
          details: [
            ["Replay risk", lag > 0 ? "Present" : "None observed"],
            ["Consumer count", String(snapshot.consumers.length)],
            ["Commit strategy", "manual"],
          ],
        }),
      ],
      [
        edge("topic-to-handler", "topic", "idempotent-handler", "amber", {
          sourceHandle: "topic-empty-out",
          targetHandle: "left-in",
          active: duplicateRisks > 0,
        }),
        edge(
          "handler-to-commit",
          "idempotent-handler",
          "commit-gate",
          "amber",
          {
            sourceHandle: "bottom-out",
            targetHandle: "top-in",
          },
        ),
        edge("commit-to-group", "commit-gate", "consumerGroup", "emerald", {
          sourceHandle: "right-out",
          targetHandle: "empty-in",
        }),
        edge("replay-loop", "commit-gate", "replay-loop", "rose", {
          sourceHandle: "left-out",
          targetHandle: "right-in",
          dashed: true,
          active: lag > 0,
        }),
      ],
    );
  }

  if (snapshot.scenarioId === "retry-dead-letter-queues") {
    return model(
      [
        node({
          id: "retry-topic",
          title: "Retry topic",
          eyebrow: "Backoff path",
          description: "Failed records pause outside the main flow.",
          metricLabel: "Failed",
          metricValue: String(failed),
          tone: failed > 0 ? "amber" : "sky",
          icon: "retry",
          position: { x: 600, y: 32 },
          compactIndex: 0,
          details: [
            [
              "Retry topic",
              latestPayloadString(latestMessage, "retryTopic") ??
                "orders.retry.30s",
            ],
            ["Failed records", String(failed)],
            ["Trigger cadence", "every third record"],
          ],
        }),
        node({
          id: "dead-letter-topic",
          title: "Dead-letter topic",
          eyebrow: "Terminal failure",
          description: "Poison records remain observable for operators.",
          metricLabel: "DLQ",
          metricValue: failed > 0 ? "active" : "ready",
          tone: failed > 0 ? "rose" : "amber",
          icon: "dlq",
          position: { x: 884, y: 404 },
          compactIndex: 1,
          details: [
            [
              "DLQ",
              latestPayloadString(latestMessage, "deadLetterTopic") ??
                "orders.dlq",
            ],
            ["Failed", String(failed)],
            ["Latest state", latestMessage?.state ?? "ready"],
          ],
        }),
      ],
      [
        edge("topic-to-retry", "topic", "retry-topic", "amber", {
          sourceHandle: "topic-empty-out",
          targetHandle: "left-in",
          active: failed > 0,
        }),
        edge("retry-to-dlq", "retry-topic", "dead-letter-topic", "rose", {
          sourceHandle: "right-out",
          targetHandle: "left-in",
          dashed: true,
          active: failed > 0,
        }),
      ],
    );
  }

  if (snapshot.scenarioId === "schema-evolution-karapace") {
    const rejected = countPayload(snapshot.recentMessages, "compatible", false);
    return model(
      [
        node({
          id: "schema-registry",
          title: "Schema registry",
          eyebrow: "Karapace",
          description: "Subject versions define the consumer contract.",
          metricLabel: "Version",
          metricValue:
            latestPayloadString(latestMessage, "schemaVersion") ?? "2",
          tone: "violet",
          icon: "schema",
          position: { x: 236, y: 32 },
          compactIndex: 0,
          details: [
            [
              "Subject",
              latestPayloadString(latestMessage, "schemaSubject") ??
                "profile-value",
            ],
            [
              "Version",
              latestPayloadString(latestMessage, "schemaVersion") ?? "2",
            ],
            [
              "Field change",
              latestPayloadString(latestMessage, "fieldChange") ?? "ready",
            ],
          ],
        }),
        node({
          id: "compatibility-gate",
          title: "Compatibility gate",
          eyebrow: "Pre-processing",
          description: "Unsafe payloads fail before consumers run.",
          metricLabel: "Rejected",
          metricValue: String(rejected),
          tone: rejected > 0 ? "rose" : "emerald",
          icon: "acl",
          position: { x: 604, y: 32 },
          compactIndex: 1,
          details: [
            ["Rejected", String(rejected)],
            ["Compatible", rejected > 0 ? "No" : "Yes"],
            ["Latest state", latestMessage?.state ?? "ready"],
          ],
        }),
      ],
      [
        edge("producer-to-registry", "producer", "schema-registry", "violet", {
          sourceHandle: "producer-out",
          targetHandle: "left-in",
        }),
        edge(
          "registry-to-gate",
          "schema-registry",
          "compatibility-gate",
          "violet",
          {
            sourceHandle: "right-out",
            targetHandle: "left-in",
          },
        ),
        edge(
          "gate-to-topic",
          "compatibility-gate",
          "topic",
          rejected > 0 ? "rose" : "emerald",
          {
            sourceHandle: "right-out",
            targetHandle: "topic-in",
            active: rejected > 0,
          },
        ),
      ],
    );
  }

  if (snapshot.scenarioId === "transactional-producers") {
    return model(
      [
        node({
          id: "transaction-coordinator",
          title: "Transaction coordinator",
          eyebrow: "Exactly once",
          description: "Producer epochs and sequence numbers guard writes.",
          metricLabel: "Txn",
          metricValue:
            latestPayloadString(latestMessage, "transactionId") ?? "ready",
          tone: "sky",
          icon: "transaction",
          position: { x: 236, y: 32 },
          compactIndex: 0,
          details: [
            [
              "Transaction",
              latestPayloadString(latestMessage, "transactionId") ?? "none",
            ],
            [
              "Producer epoch",
              latestPayloadString(latestMessage, "producerEpoch") ?? "1",
            ],
            [
              "Sequence",
              latestPayloadString(latestMessage, "sequenceNumber") ?? "0",
            ],
          ],
        }),
        node({
          id: "commit-boundary",
          title: "Commit boundary",
          eyebrow: "Visibility",
          description: "Consumers expose only committed transactional output.",
          metricLabel: "Boundary",
          metricValue:
            latestPayloadString(latestMessage, "commitBoundary") ?? "open",
          tone:
            latestPayloadString(latestMessage, "commitBoundary") === "commit"
              ? "emerald"
              : "amber",
          icon: "commit",
          position: { x: 642, y: 408 },
          compactIndex: 1,
          details: [
            [
              "Boundary",
              latestPayloadString(latestMessage, "commitBoundary") ?? "open",
            ],
            ["Committed offsets", String(committed)],
            ["Isolation", "read_committed"],
          ],
        }),
      ],
      [
        edge(
          "producer-to-transaction",
          "producer",
          "transaction-coordinator",
          "sky",
          {
            sourceHandle: "producer-out",
            targetHandle: "left-in",
          },
        ),
        edge(
          "transaction-to-topic",
          "transaction-coordinator",
          "topic",
          "sky",
          {
            sourceHandle: "right-out",
            targetHandle: "topic-in",
          },
        ),
        edge("topic-to-boundary", "topic", "commit-boundary", "amber", {
          sourceHandle: "topic-empty-out",
          targetHandle: "top-in",
        }),
      ],
    );
  }

  if (snapshot.scenarioId === "event-replay-sourcing") {
    return model(
      [
        node({
          id: "projection-store",
          title: "Projection store",
          eyebrow: "Derived state",
          description: "Replay rebuilds views from immutable events.",
          metricLabel: "Aggregate",
          metricValue:
            latestPayloadString(latestMessage, "aggregateId") ?? "ready",
          tone: "emerald",
          icon: "projection",
          position: { x: 880, y: 404 },
          compactIndex: 0,
          details: [
            [
              "Aggregate",
              latestPayloadString(latestMessage, "aggregateId") ?? "none",
            ],
            [
              "Event",
              latestPayloadString(latestMessage, "eventName") ?? "none",
            ],
            [
              "Cursor",
              latestPayloadString(latestMessage, "replayCursor") ?? "0",
            ],
          ],
        }),
        node({
          id: "replay-cursor",
          title: "Replay cursor",
          eyebrow: "Offset reset",
          description: "Historical offsets drive rebuild progress.",
          metricLabel: "Cursor",
          metricValue:
            latestPayloadString(latestMessage, "replayCursor") ?? "0",
          tone: "violet",
          icon: "retry",
          position: { x: 222, y: 408 },
          compactIndex: 1,
          details: [
            [
              "Cursor",
              latestPayloadString(latestMessage, "replayCursor") ?? "0",
            ],
            ["Produced", String(produced)],
            ["Committed", String(committed)],
          ],
        }),
      ],
      [
        edge("topic-to-projection", "topic", "projection-store", "emerald", {
          sourceHandle: "topic-empty-out",
          targetHandle: "left-in",
          active: produced > 0,
        }),
        edge("cursor-to-topic", "replay-cursor", "topic", "violet", {
          sourceHandle: "right-out",
          targetHandle: "topic-in",
          dashed: true,
        }),
      ],
    );
  }

  if (snapshot.scenarioId === "consumer-lag-backpressure") {
    return model(
      [
        node({
          id: "backlog-buffer",
          title: "Backlog buffer",
          eyebrow: "Produced minus committed",
          description: "Lag appears when work arrives faster than commits.",
          metricLabel: "Lag",
          metricValue: String(lag),
          tone: lag > 2 ? "rose" : lag > 0 ? "amber" : "emerald",
          icon: "lag",
          position: { x: 600, y: 32 },
          compactIndex: 0,
          details: [
            ["Produced", String(produced)],
            ["Committed", String(committed)],
            ["Estimated lag", String(lag)],
          ],
        }),
        node({
          id: "pressure-meter",
          title: "Pressure meter",
          eyebrow: "Capacity",
          description: "Rate and processing latency set recovery pressure.",
          metricLabel: "Latency",
          metricValue: `${snapshot.processingLatencyMs} ms`,
          tone: snapshot.processingLatencyMs > 1000 ? "amber" : "sky",
          icon: "lag",
          position: { x: 884, y: 404 },
          compactIndex: 1,
          details: [
            ["Rate", `${snapshot.productionRate}/s`],
            ["Latency", `${snapshot.processingLatencyMs} ms`],
            ["Consumers", String(snapshot.consumers.length)],
          ],
        }),
      ],
      [
        edge("topic-to-backlog", "topic", "backlog-buffer", "amber", {
          sourceHandle: "topic-empty-out",
          targetHandle: "left-in",
          active: lag > 0,
        }),
        edge(
          "backlog-to-pressure",
          "backlog-buffer",
          "pressure-meter",
          "amber",
          {
            sourceHandle: "right-out",
            targetHandle: "left-in",
            dashed: true,
            active: lag > 2,
          },
        ),
      ],
    );
  }

  if (snapshot.scenarioId === "hot-partitions-key-skew") {
    const busiest = busiestPartition(snapshot);
    return model(
      [
        node({
          id: "hot-key-router",
          title: "Hot-key router",
          eyebrow: "Hash routing",
          description: "A dominant key repeatedly lands on one partition.",
          metricLabel: "Key",
          metricValue:
            snapshot.keyStrategy.type === "fixed"
              ? snapshot.keyStrategy.value
              : "mixed",
          tone: "amber",
          icon: "hot",
          position: { x: 222, y: 32 },
          compactIndex: 0,
          details: [
            ["Key strategy", snapshot.keyStrategy.type],
            [
              "Hot key",
              snapshot.keyStrategy.type === "fixed"
                ? snapshot.keyStrategy.value
                : "mixed",
            ],
            ["Partitions", String(snapshot.partitionCount)],
          ],
        }),
        node({
          id: "hottest-partition",
          title: "Hottest partition",
          eyebrow: "Skew detector",
          description: "The busiest lane reveals uneven key distribution.",
          metricLabel: busiest.partition,
          metricValue: String(busiest.count),
          tone: busiest.count > 0 ? "rose" : "sky",
          icon: "hot",
          position: { x: 610, y: 408 },
          compactIndex: 1,
          details: [
            ["Busiest partition", busiest.partition],
            ["Records there", String(busiest.count)],
            ["Produced", String(produced)],
          ],
        }),
      ],
      [
        edge("producer-to-hot-key", "producer", "hot-key-router", "amber", {
          sourceHandle: "producer-out",
          targetHandle: "left-in",
          active: produced > 0,
        }),
        edge("hot-key-to-topic", "hot-key-router", "topic", "amber", {
          sourceHandle: "right-out",
          targetHandle: "topic-in",
          active: produced > 0,
        }),
        edge("topic-to-hot-partition", "topic", "hottest-partition", "rose", {
          sourceHandle: "topic-empty-out",
          targetHandle: "top-in",
          dashed: true,
          active: busiest.count > 0,
        }),
      ],
    );
  }

  if (snapshot.scenarioId === "log-compaction-tombstones") {
    const tombstones = countPayload(snapshot.recentMessages, "tombstone", true);
    return model(
      [
        node({
          id: "compacted-state-store",
          title: "Compacted state",
          eyebrow: "Latest value",
          description: "Compaction retains the newest value per key.",
          metricLabel: "Key",
          metricValue:
            latestPayloadString(latestMessage, "compactedKey") ?? "ready",
          tone: "emerald",
          icon: "compact",
          position: { x: 884, y: 404 },
          compactIndex: 0,
          details: [
            [
              "Compacted key",
              latestPayloadString(latestMessage, "compactedKey") ?? "none",
            ],
            [
              "Latest op",
              latestPayloadString(latestMessage, "operation") ?? "none",
            ],
            [
              "Retained value",
              latestPayloadString(latestMessage, "retainedValue") ?? "none",
            ],
          ],
        }),
        node({
          id: "tombstone-marker",
          title: "Tombstone marker",
          eyebrow: "Delete",
          description: "Null-value records mark keys for deletion.",
          metricLabel: "Tombstones",
          metricValue: String(tombstones),
          tone: tombstones > 0 ? "rose" : "amber",
          icon: "dlq",
          position: { x: 600, y: 32 },
          compactIndex: 1,
          details: [
            ["Tombstones", String(tombstones)],
            [
              "Latest op",
              latestPayloadString(latestMessage, "operation") ?? "none",
            ],
            ["Topic type", "compacted"],
          ],
        }),
      ],
      [
        edge(
          "topic-to-state-store",
          "topic",
          "compacted-state-store",
          "emerald",
          {
            sourceHandle: "topic-empty-out",
            targetHandle: "left-in",
            active: produced > 0,
          },
        ),
        edge("topic-to-tombstone", "topic", "tombstone-marker", "rose", {
          sourceHandle: "topic-empty-out",
          targetHandle: "left-in",
          dashed: true,
          active: tombstones > 0,
        }),
      ],
    );
  }

  if (snapshot.scenarioId === "retention-data-loss") {
    const expiring = countPayload(
      snapshot.recentMessages,
      "retentionBucket",
      "expired-soon",
    );
    return model(
      [
        node({
          id: "retention-window",
          title: "Retention window",
          eyebrow: "Replay limit",
          description: "Only records inside the window remain replayable.",
          metricLabel: "Expiring",
          metricValue: String(expiring),
          tone: expiring > 0 ? "amber" : "emerald",
          icon: "retention",
          position: { x: 600, y: 32 },
          compactIndex: 0,
          details: [
            ["Expiring records", String(expiring)],
            [
              "Replayable from",
              latestPayloadString(latestMessage, "replayableUntilOffset") ??
                "0",
            ],
            ["Committed", String(committed)],
          ],
        }),
        node({
          id: "expired-boundary",
          title: "Expired boundary",
          eyebrow: "Data loss risk",
          description: "Offsets can point behind retained data.",
          metricLabel: "From",
          metricValue:
            latestPayloadString(latestMessage, "replayableUntilOffset") ?? "0",
          tone: expiring > 0 ? "rose" : "sky",
          icon: "retention",
          position: { x: 222, y: 408 },
          compactIndex: 1,
          details: [
            [
              "Replayable from",
              latestPayloadString(latestMessage, "replayableUntilOffset") ??
                "0",
            ],
            [
              "Recovery note",
              latestPayloadString(latestMessage, "recoveryNote") ?? "ready",
            ],
            ["Produced", String(produced)],
          ],
        }),
      ],
      [
        edge("topic-to-retention", "topic", "retention-window", "amber", {
          sourceHandle: "topic-empty-out",
          targetHandle: "left-in",
          active: expiring > 0,
        }),
        edge(
          "retention-to-expired",
          "retention-window",
          "expired-boundary",
          "rose",
          {
            sourceHandle: "left-out",
            targetHandle: "right-in",
            dashed: true,
            active: expiring > 0,
          },
        ),
      ],
    );
  }

  if (snapshot.scenarioId === "cooperative-rebalancing") {
    const revocations = snapshot.recentEvents.filter(
      (event) => event.type === "consumer.partitions_revoked",
    ).length;
    const assignments = snapshot.consumers.reduce(
      (sum, consumer) => sum + consumer.assignments.length,
      0,
    );
    return model(
      [
        node({
          id: "rebalance-coordinator",
          title: "Rebalance coordinator",
          eyebrow: "Cooperative sticky",
          description: "Ownership moves incrementally as members change.",
          metricLabel: "Members",
          metricValue: String(snapshot.consumers.length),
          tone: "violet",
          icon: "rebalance",
          position: { x: 604, y: 32 },
          compactIndex: 0,
          details: [
            ["Members", String(snapshot.consumers.length)],
            ["Assignments", String(assignments)],
            ["Revocations", String(revocations)],
          ],
        }),
        node({
          id: "incremental-movement",
          title: "Incremental movement",
          eyebrow: "Reduced stop time",
          description: "Sticky assignment avoids full-group churn.",
          metricLabel: "Revokes",
          metricValue: String(revocations),
          tone: revocations > 0 ? "amber" : "emerald",
          icon: "balance",
          position: { x: 884, y: 404 },
          compactIndex: 1,
          details: [
            ["Revocations", String(revocations)],
            ["Assignments", String(assignments)],
            ["Strategy", "cooperative-sticky"],
          ],
        }),
      ],
      [
        edge("topic-to-rebalance", "topic", "rebalance-coordinator", "violet", {
          sourceHandle: "topic-empty-out",
          targetHandle: "left-in",
        }),
        edge(
          "rebalance-to-group",
          "rebalance-coordinator",
          "consumerGroup",
          "violet",
          {
            sourceHandle: "right-out",
            targetHandle: "empty-in",
            active: snapshot.consumers.length > 0,
          },
        ),
        edge(
          "rebalance-to-movement",
          "rebalance-coordinator",
          "incremental-movement",
          "amber",
          {
            sourceHandle: "bottom-out",
            targetHandle: "top-in",
            dashed: true,
            active: revocations > 0,
          },
        ),
      ],
    );
  }

  if (snapshot.scenarioId === "streams-joins-windows") {
    const late = countPayload(snapshot.recentMessages, "lateArrival", true);
    return model(
      [
        node({
          id: "orders-stream",
          title: "Orders stream",
          eyebrow: "Input A",
          description: "One side of the windowed join.",
          metricLabel: "Latest",
          metricValue:
            latestPayloadString(latestMessage, "streamName") ?? "orders",
          tone: "sky",
          icon: "stream",
          position: { x: 222, y: 32 },
          compactIndex: 0,
          details: [
            ["Stream", "orders"],
            [
              "Join key",
              latestPayloadString(latestMessage, "joinKey") ?? "none",
            ],
            [
              "Window start",
              latestPayloadString(latestMessage, "windowStartSecond") ?? "0",
            ],
          ],
        }),
        node({
          id: "payments-stream",
          title: "Payments stream",
          eyebrow: "Input B",
          description: "The matching side for the join key.",
          metricLabel: "Late",
          metricValue: String(late),
          tone: late > 0 ? "amber" : "violet",
          icon: "stream",
          position: { x: 222, y: 408 },
          compactIndex: 1,
          details: [
            ["Stream", "payments"],
            ["Late arrivals", String(late)],
            ["Grace", "open while on time"],
          ],
        }),
        node({
          id: "window-state-store",
          title: "Window state store",
          eyebrow: "Join memory",
          description: "State holds records until the window closes.",
          metricLabel: "Key",
          metricValue: latestPayloadString(latestMessage, "joinKey") ?? "ready",
          tone: "emerald",
          icon: "projection",
          position: { x: 884, y: 404 },
          compactIndex: 2,
          details: [
            [
              "Join key",
              latestPayloadString(latestMessage, "joinKey") ?? "none",
            ],
            [
              "Window end",
              latestPayloadString(latestMessage, "windowEndSecond") ?? "60",
            ],
            ["Late arrivals", String(late)],
          ],
        }),
      ],
      [
        edge("orders-to-state", "orders-stream", "window-state-store", "sky", {
          sourceHandle: "right-out",
          targetHandle: "left-in",
        }),
        edge(
          "payments-to-state",
          "payments-stream",
          "window-state-store",
          "violet",
          {
            sourceHandle: "right-out",
            targetHandle: "left-in",
          },
        ),
        edge(
          "state-to-group",
          "window-state-store",
          "consumerGroup",
          "emerald",
          {
            sourceHandle: "right-out",
            targetHandle: "empty-in",
          },
        ),
      ],
    );
  }

  if (snapshot.scenarioId === "outbox-cdc") {
    return model(
      [
        node({
          id: "database-outbox",
          title: "Database outbox",
          eyebrow: "Atomic write",
          description: "Business state and event row commit together.",
          metricLabel: "Table",
          metricValue: latestPayloadString(latestMessage, "table") ?? "orders",
          tone: "sky",
          icon: "database",
          position: { x: 214, y: 32 },
          compactIndex: 0,
          details: [
            ["Table", latestPayloadString(latestMessage, "table") ?? "orders"],
            [
              "Operation",
              latestPayloadString(latestMessage, "operation") ?? "none",
            ],
            [
              "Outbox id",
              latestPayloadString(latestMessage, "outboxId") ?? "none",
            ],
          ],
        }),
        node({
          id: "cdc-connector",
          title: "CDC connector",
          eyebrow: "Publish bridge",
          description: "Connector reads outbox rows into Kafka.",
          metricLabel: "LSN",
          metricValue: latestPayloadString(latestMessage, "lsn") ?? "ready",
          tone: "emerald",
          icon: "route",
          position: { x: 560, y: 32 },
          compactIndex: 1,
          details: [
            ["LSN", latestPayloadString(latestMessage, "lsn") ?? "none"],
            [
              "Outbox id",
              latestPayloadString(latestMessage, "outboxId") ?? "none",
            ],
            ["Produced", String(produced)],
          ],
        }),
        node({
          id: "transaction-log",
          title: "Transaction log",
          eyebrow: "Ordering source",
          description: "Log sequence numbers preserve change order.",
          metricLabel: "LSN",
          metricValue: latestPayloadString(latestMessage, "lsn") ?? "0/0",
          tone: "violet",
          icon: "transaction",
          position: { x: 884, y: 404 },
          compactIndex: 2,
          details: [
            ["LSN", latestPayloadString(latestMessage, "lsn") ?? "none"],
            [
              "Operation",
              latestPayloadString(latestMessage, "operation") ?? "none",
            ],
            ["Connector retries", "idempotent"],
          ],
        }),
      ],
      [
        edge("outbox-to-cdc", "database-outbox", "cdc-connector", "sky", {
          sourceHandle: "right-out",
          targetHandle: "left-in",
        }),
        edge("cdc-to-topic", "cdc-connector", "topic", "emerald", {
          sourceHandle: "right-out",
          targetHandle: "topic-in",
        }),
        edge("log-to-cdc", "transaction-log", "cdc-connector", "violet", {
          sourceHandle: "left-out",
          targetHandle: "bottom-in",
          dashed: true,
        }),
      ],
    );
  }

  if (snapshot.scenarioId === "acl-least-privilege") {
    const denied = countPayload(snapshot.recentMessages, "authorized", false);
    return model(
      [
        node({
          id: "principal-identity",
          title: "Principal identity",
          eyebrow: "Credential",
          description: "Kafka evaluates the authenticated principal.",
          metricLabel: "Principal",
          metricValue:
            latestPayloadString(latestMessage, "principal") ?? "ready",
          tone: "sky",
          icon: "acl",
          position: { x: 222, y: 32 },
          compactIndex: 0,
          details: [
            [
              "Principal",
              latestPayloadString(latestMessage, "principal") ?? "none",
            ],
            [
              "Operation",
              latestPayloadString(latestMessage, "operation") ?? "none",
            ],
            [
              "Resource",
              latestPayloadString(latestMessage, "resource") ??
                "secured.orders",
            ],
          ],
        }),
        node({
          id: "authorization-gate",
          title: "Authorization gate",
          eyebrow: "ACL check",
          description: "Least privilege blocks unsafe operations.",
          metricLabel: "Denied",
          metricValue: String(denied),
          tone: denied > 0 ? "rose" : "emerald",
          icon: "acl",
          position: { x: 604, y: 32 },
          compactIndex: 1,
          details: [
            ["Denied", String(denied)],
            [
              "Authorized",
              latestPayloadString(latestMessage, "authorized") ?? "ready",
            ],
            [
              "Resource",
              latestPayloadString(latestMessage, "resource") ??
                "secured.orders",
            ],
          ],
        }),
      ],
      [
        edge(
          "principal-to-gate",
          "principal-identity",
          "authorization-gate",
          "sky",
          {
            sourceHandle: "right-out",
            targetHandle: "left-in",
          },
        ),
        edge(
          "producer-to-auth",
          "producer",
          "authorization-gate",
          denied > 0 ? "rose" : "emerald",
          {
            sourceHandle: "producer-out",
            targetHandle: "left-in",
            active: denied > 0,
          },
        ),
        edge(
          "auth-to-topic",
          "authorization-gate",
          "topic",
          denied > 0 ? "rose" : "emerald",
          {
            sourceHandle: "right-out",
            targetHandle: "topic-in",
          },
        ),
      ],
    );
  }

  return model(
    [
      node({
        id: "key-router",
        title: "Key router",
        eyebrow: "Partition choice",
        description: "Message keys choose the partition lane.",
        metricLabel: "Strategy",
        metricValue: keyStrategyLabel(snapshot.keyStrategy),
        tone: "sky",
        icon: "route",
        position: { x: 222, y: 32 },
        compactIndex: 0,
        details: [
          ["Key strategy", keyStrategyLabel(snapshot.keyStrategy)],
          ["Latest key", latestMessage?.key ?? "none"],
          ["Partitions", String(snapshot.partitionCount)],
        ],
      }),
      node({
        id: "commit-progress",
        title: "Commit progress",
        eyebrow: "Consumer offset",
        description: "Committed offsets record group progress.",
        metricLabel: "Committed",
        metricValue: `${committed}/${produced}`,
        tone: committed >= produced && produced > 0 ? "emerald" : "amber",
        icon: "commit",
        position: { x: 642, y: 408 },
        compactIndex: 1,
        details: [
          ["Produced", String(produced)],
          ["Committed", String(committed)],
          ["Lag", String(lag)],
        ],
      }),
    ],
    [
      edge("producer-to-key-router", "producer", "key-router", "sky", {
        sourceHandle: "producer-out",
        targetHandle: "left-in",
      }),
      edge("key-router-to-topic", "key-router", "topic", "sky", {
        sourceHandle: "right-out",
        targetHandle: "topic-in",
        active: produced > 0,
      }),
      edge("topic-to-commit-progress", "topic", "commit-progress", "emerald", {
        sourceHandle: "topic-empty-out",
        targetHandle: "top-in",
        active: committed > 0,
      }),
    ],
  );
}

function model(
  nodes: ScenarioTopologyNode[],
  edges: ScenarioTopologyEdge[],
): ScenarioTopologyModel {
  return { nodes, edges };
}

function node(input: ScenarioNodeInput): ScenarioTopologyNode {
  const { compactIndex, ...rest } = input;
  return {
    ...rest,
    compactPosition: {
      x: 390,
      y: 112 + compactIndex * 132,
    },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  tone: ScenarioTopologyTone,
  options: Omit<ScenarioTopologyEdge, "id" | "source" | "target" | "tone"> = {},
): ScenarioTopologyEdge {
  return { id, source, target, tone, ...options };
}
