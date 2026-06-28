import { countPayload, latestPayloadString } from "./scenario-metrics";
import {
  edge,
  model,
  node,
  type ScenarioTopologyContext,
  type ScenarioTopologyModel,
} from "./scenario-topology-model";

export function buildSchemaEvolutionKarapaceTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, latestMessage } = context;
  const rejected = countPayload(snapshot.recentMessages, "compatible", false);
  return model(
    [
      node({
        id: "schema-registry",
        title: "Schema registry",
        eyebrow: "Karapace",
        description: "Subject versions define the consumer contract.",
        metricLabel: "Version",
        metricValue: latestPayloadString(latestMessage, "schemaVersion") ?? "2",
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

export function buildTransactionalProducersTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { committed, latestMessage } = context;
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
      edge("transaction-to-topic", "transaction-coordinator", "topic", "sky", {
        sourceHandle: "right-out",
        targetHandle: "topic-in",
      }),
      edge("topic-to-boundary", "topic", "commit-boundary", "amber", {
        sourceHandle: "topic-empty-out",
        targetHandle: "top-in",
      }),
    ],
  );
}

export function buildEventReplaySourcingTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { produced, committed, latestMessage } = context;
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
          ["Event", latestPayloadString(latestMessage, "eventName") ?? "none"],
          ["Cursor", latestPayloadString(latestMessage, "replayCursor") ?? "0"],
        ],
      }),
      node({
        id: "replay-cursor",
        title: "Replay cursor",
        eyebrow: "Offset reset",
        description: "Historical offsets drive rebuild progress.",
        metricLabel: "Cursor",
        metricValue: latestPayloadString(latestMessage, "replayCursor") ?? "0",
        tone: "violet",
        icon: "retry",
        position: { x: 222, y: 408 },
        compactIndex: 1,
        details: [
          ["Cursor", latestPayloadString(latestMessage, "replayCursor") ?? "0"],
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

export function buildLogCompactionTombstonesTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, produced, latestMessage } = context;
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

export function buildRetentionDataLossTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, produced, committed, latestMessage } = context;
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
            latestPayloadString(latestMessage, "replayableUntilOffset") ?? "0",
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
            latestPayloadString(latestMessage, "replayableUntilOffset") ?? "0",
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

export function buildOutboxCdcTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { produced, latestMessage } = context;
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
