import type { RunSnapshot } from "@kplay/contracts";
import type {
  CausalGraphModel,
  EvidenceValue,
  Provenance,
  ScenarioExperienceId,
} from "./model";
import { causalGraph, evidence, type GraphNodeSpec } from "./helpers";

type NodeSeed = {
  id: string;
  title: string;
  description: string;
  provenance: Provenance;
};

type EdgeSeed = {
  id: string;
  source: string;
  target: string;
  label: string;
  provenance: Provenance;
};

type GraphSeed = {
  nodes: readonly NodeSeed[];
  edges: readonly EdgeSeed[];
  partitions?: boolean;
};

type GraphOptions = {
  active?: boolean;
  inactiveEdgeIds?: ReadonlySet<string>;
  metrics?: Readonly<Record<string, EvidenceValue>>;
  states?: Readonly<Record<string, GraphNodeSpec["state"]>>;
};

const observedCoreNodes: readonly NodeSeed[] = [
  {
    id: "producer",
    title: "Producer boundary",
    description: "The application operation before a Kafka write.",
    provenance: "observed",
  },
  {
    id: "topic",
    title: "Kafka topic",
    description: "The durable Kafka log and its partitions.",
    provenance: "observed",
  },
  {
    id: "consumerGroup",
    title: "Consumer group",
    description: "The group that owns partitions and commits progress.",
    provenance: "observed",
  },
];

const graphSeeds: Record<ScenarioExperienceId, GraphSeed> = {
  partitioning: {
    partitions: true,
    nodes: [
      ...observedCoreNodes,
      node(
        "key-router",
        "Key router",
        "Maps a key to one partition.",
        "derived",
      ),
      node(
        "commit-progress",
        "Commit watermark",
        "Separates processed positions from committed group progress.",
        "observed",
      ),
    ],
    edges: [
      edge(
        "producer-router",
        "producer",
        "key-router",
        "record and key",
        "observed",
      ),
      edge(
        "router-topic",
        "key-router",
        "topic",
        "chosen partition",
        "derived",
      ),
      edge(
        "group-commit",
        "consumerGroup",
        "commit-progress",
        "processed then committed",
        "observed",
      ),
    ],
  },
  "fan-out-load-balancing": {
    partitions: true,
    nodes: [
      ...observedCoreNodes,
      node(
        "group-balancer",
        "Group coordinator",
        "Assigns every partition to at most one member in the group.",
        "observed",
      ),
      node(
        "idle-members",
        "Idle members",
        "Members wait when the group has more members than partitions.",
        "derived",
      ),
    ],
    edges: [
      edge("producer-topic", "producer", "topic", "append", "observed"),
      edge(
        "topic-balancer",
        "topic",
        "group-balancer",
        "partition set",
        "observed",
      ),
      edge(
        "balancer-group",
        "group-balancer",
        "consumerGroup",
        "ownership epoch",
        "observed",
      ),
      edge(
        "balancer-idle",
        "group-balancer",
        "idle-members",
        "unassigned members",
        "derived",
      ),
    ],
  },
  "at-least-once-duplicates": {
    nodes: [
      ...observedCoreNodes,
      node(
        "idempotent-handler",
        "Side-effect handler",
        "Applies work once per idempotency key.",
        "simulated",
      ),
      node(
        "commit-gate",
        "Commit boundary",
        "Records consumer progress only after processing.",
        "observed",
      ),
      node(
        "replay-loop",
        "Redelivery loop",
        "Returns an uncommitted partition and offset to a consumer.",
        "observed",
      ),
    ],
    edges: [
      edge("producer-topic", "producer", "topic", "append once", "observed"),
      edge("topic-group", "topic", "consumerGroup", "deliver", "observed"),
      edge(
        "group-handler",
        "consumerGroup",
        "idempotent-handler",
        "apply side effect",
        "simulated",
      ),
      edge(
        "handler-commit",
        "idempotent-handler",
        "commit-gate",
        "request commit",
        "observed",
      ),
      edge(
        "commit-replay",
        "commit-gate",
        "replay-loop",
        "crash before commit",
        "simulated",
      ),
      edge(
        "replay-group",
        "replay-loop",
        "consumerGroup",
        "same offset",
        "observed",
      ),
    ],
  },
  "retry-dead-letter-queues": {
    nodes: [
      ...observedCoreNodes,
      node(
        "retry-topic",
        "Retry topic",
        "Holds a record until its next attempt.",
        "simulated",
      ),
      node(
        "dead-letter-topic",
        "Dead-letter topic",
        "Stores a terminal poison record after retry exhaustion.",
        "simulated",
      ),
    ],
    edges: [
      edge("producer-topic", "producer", "topic", "append", "observed"),
      edge("topic-group", "topic", "consumerGroup", "attempt", "observed"),
      edge(
        "group-retry",
        "consumerGroup",
        "retry-topic",
        "retry only",
        "simulated",
      ),
      edge(
        "retry-group",
        "retry-topic",
        "consumerGroup",
        "after backoff",
        "simulated",
      ),
      edge(
        "retry-dlq",
        "retry-topic",
        "dead-letter-topic",
        "terminal only",
        "simulated",
      ),
    ],
  },
  "schema-evolution-karapace": {
    nodes: [
      ...observedCoreNodes,
      node(
        "schema-registry",
        "Schema registry",
        "Stores demo schema versions.",
        "simulated",
      ),
      node(
        "compatibility-gate",
        "Compatibility gate",
        "Stops incompatible payloads before Kafka.",
        "simulated",
      ),
    ],
    edges: [
      edge(
        "producer-registry",
        "producer",
        "schema-registry",
        "candidate schema",
        "simulated",
      ),
      edge(
        "registry-gate",
        "schema-registry",
        "compatibility-gate",
        "field-level check",
        "simulated",
      ),
      edge(
        "gate-topic",
        "compatibility-gate",
        "topic",
        "accepted only",
        "simulated",
      ),
      edge("topic-group", "topic", "consumerGroup", "safe payload", "observed"),
    ],
  },
  "transactional-producers": {
    nodes: [
      ...observedCoreNodes,
      node(
        "transaction-coordinator",
        "Transaction coordinator",
        "Stages deterministic demo transactions.",
        "simulated",
      ),
      node(
        "commit-boundary",
        "Read-committed boundary",
        "Reveals only committed transactional records.",
        "simulated",
      ),
    ],
    edges: [
      edge(
        "producer-coordinator",
        "producer",
        "transaction-coordinator",
        "stage records",
        "simulated",
      ),
      edge(
        "coordinator-boundary",
        "transaction-coordinator",
        "commit-boundary",
        "commit or abort",
        "simulated",
      ),
      edge(
        "boundary-topic",
        "commit-boundary",
        "topic",
        "committed only",
        "simulated",
      ),
      edge(
        "topic-group",
        "topic",
        "consumerGroup",
        "read committed",
        "observed",
      ),
    ],
  },
  "event-replay-sourcing": {
    nodes: [
      ...observedCoreNodes,
      node(
        "projection-store",
        "Projection store",
        "Derived state rebuilt from the immutable log.",
        "simulated",
      ),
      node(
        "replay-cursor",
        "Replay cursor",
        "Moves through existing offsets without producing new records.",
        "simulated",
      ),
    ],
    edges: [
      edge("producer-topic", "producer", "topic", "original facts", "observed"),
      edge(
        "topic-cursor",
        "topic",
        "replay-cursor",
        "reset and read",
        "simulated",
      ),
      edge(
        "cursor-projection",
        "replay-cursor",
        "projection-store",
        "apply historical event",
        "simulated",
      ),
      edge(
        "projection-group",
        "projection-store",
        "consumerGroup",
        "rebuilt view",
        "derived",
      ),
    ],
  },
  "consumer-lag-backpressure": {
    partitions: true,
    nodes: [
      ...observedCoreNodes,
      node(
        "backlog-buffer",
        "Partition backlog",
        "Uncommitted distance per partition.",
        "derived",
      ),
      node(
        "pressure-meter",
        "Capacity meter",
        "Compares production and processing rates.",
        "derived",
      ),
    ],
    edges: [
      edge(
        "producer-topic",
        "producer",
        "topic",
        "production rate",
        "observed",
      ),
      edge(
        "topic-backlog",
        "topic",
        "backlog-buffer",
        "end offsets",
        "observed",
      ),
      edge(
        "backlog-group",
        "backlog-buffer",
        "consumerGroup",
        "work to drain",
        "derived",
      ),
      edge(
        "group-pressure",
        "consumerGroup",
        "pressure-meter",
        "processing capacity",
        "derived",
      ),
    ],
  },
  "hot-partitions-key-skew": {
    partitions: true,
    nodes: [
      ...observedCoreNodes,
      node(
        "hot-key-router",
        "Key router",
        "Routes equal keys to the same partition.",
        "derived",
      ),
      node(
        "hottest-partition",
        "Skew comparison",
        "Compares independent equal-size phases.",
        "derived",
      ),
    ],
    edges: [
      edge(
        "producer-router",
        "producer",
        "hot-key-router",
        "phase input",
        "observed",
      ),
      edge(
        "router-topic",
        "hot-key-router",
        "topic",
        "partition route",
        "derived",
      ),
      edge(
        "topic-hotspot",
        "topic",
        "hottest-partition",
        "phase totals",
        "derived",
      ),
      edge(
        "hotspot-group",
        "hottest-partition",
        "consumerGroup",
        "capacity impact",
        "derived",
      ),
    ],
  },
  "log-compaction-tombstones": {
    nodes: [
      ...observedCoreNodes,
      node(
        "compacted-state-store",
        "Materialized key state",
        "Latest surviving value for each key.",
        "simulated",
      ),
      node(
        "tombstone-marker",
        "Tombstone lifecycle",
        "Marks deletion before later cleanup.",
        "simulated",
      ),
    ],
    edges: [
      edge("producer-topic", "producer", "topic", "append history", "observed"),
      edge(
        "topic-state",
        "topic",
        "compacted-state-store",
        "cleaner pass",
        "simulated",
      ),
      edge(
        "topic-tombstone",
        "topic",
        "tombstone-marker",
        "null value",
        "simulated",
      ),
      edge(
        "tombstone-state",
        "tombstone-marker",
        "compacted-state-store",
        "delete key",
        "simulated",
      ),
      edge(
        "state-group",
        "compacted-state-store",
        "consumerGroup",
        "latest state",
        "derived",
      ),
    ],
  },
  "retention-data-loss": {
    nodes: [
      ...observedCoreNodes,
      node(
        "retention-window",
        "Retention window",
        "Advances with deterministic virtual time.",
        "simulated",
      ),
      node(
        "expired-boundary",
        "Log-start boundary",
        "Old offsets become unavailable for replay.",
        "simulated",
      ),
    ],
    edges: [
      edge("producer-topic", "producer", "topic", "append", "observed"),
      edge(
        "topic-window",
        "topic",
        "retention-window",
        "age records",
        "simulated",
      ),
      edge(
        "window-boundary",
        "retention-window",
        "expired-boundary",
        "expire old records",
        "simulated",
      ),
      edge(
        "boundary-group",
        "expired-boundary",
        "consumerGroup",
        "resume or recover",
        "simulated",
      ),
    ],
  },
  "cooperative-rebalancing": {
    partitions: true,
    nodes: [
      ...observedCoreNodes,
      node(
        "rebalance-coordinator",
        "Rebalance coordinator",
        "Compares eager and cooperative-sticky ownership changes.",
        "simulated",
      ),
      node(
        "incremental-movement",
        "Ownership delta",
        "Separates kept, moved, revoked, and paused partitions.",
        "derived",
      ),
    ],
    edges: [
      edge(
        "topic-coordinator",
        "topic",
        "rebalance-coordinator",
        "partition set",
        "observed",
      ),
      edge(
        "coordinator-delta",
        "rebalance-coordinator",
        "incremental-movement",
        "strategy result",
        "simulated",
      ),
      edge(
        "delta-group",
        "incremental-movement",
        "consumerGroup",
        "new ownership",
        "simulated",
      ),
    ],
  },
  "streams-joins-windows": {
    nodes: [
      ...observedCoreNodes,
      node(
        "orders-stream",
        "Orders stream",
        "Left-side keyed records.",
        "simulated",
      ),
      node(
        "payments-stream",
        "Payments stream",
        "Right-side keyed records.",
        "simulated",
      ),
      node(
        "window-state-store",
        "Window state store",
        "Joins only equal keys inside the window and grace period.",
        "simulated",
      ),
    ],
    edges: [
      edge(
        "producer-orders",
        "producer",
        "orders-stream",
        "order",
        "simulated",
      ),
      edge(
        "producer-payments",
        "producer",
        "payments-stream",
        "payment",
        "simulated",
      ),
      edge(
        "orders-window",
        "orders-stream",
        "window-state-store",
        "same key candidate",
        "simulated",
      ),
      edge(
        "payments-window",
        "payments-stream",
        "window-state-store",
        "same key candidate",
        "simulated",
      ),
      edge(
        "window-topic",
        "window-state-store",
        "topic",
        "joined output only",
        "simulated",
      ),
      edge(
        "topic-group",
        "topic",
        "consumerGroup",
        "consume join result",
        "observed",
      ),
    ],
  },
  "outbox-cdc": {
    nodes: [
      node(
        "database-outbox",
        "Atomic database transaction",
        "Commits a business row and outbox row together.",
        "simulated",
      ),
      node(
        "transaction-log",
        "Database WAL",
        "Orders committed outbox changes by LSN.",
        "simulated",
      ),
      node(
        "cdc-connector",
        "CDC connector",
        "Publishes WAL changes and retries safely.",
        "simulated",
      ),
      observedCoreNodes[1],
      observedCoreNodes[2],
    ],
    edges: [
      edge(
        "outbox-wal",
        "database-outbox",
        "transaction-log",
        "atomic commit",
        "simulated",
      ),
      edge(
        "wal-cdc",
        "transaction-log",
        "cdc-connector",
        "ordered LSN",
        "simulated",
      ),
      edge(
        "cdc-topic",
        "cdc-connector",
        "topic",
        "publish and acknowledge",
        "simulated",
      ),
      edge(
        "topic-group",
        "topic",
        "consumerGroup",
        "idempotent consume",
        "observed",
      ),
    ],
  },
  "acl-least-privilege": {
    nodes: [
      ...observedCoreNodes,
      node(
        "principal-identity",
        "Kafka principal",
        "Identity requesting one operation.",
        "simulated",
      ),
      node(
        "authorization-gate",
        "Authorization gate",
        "Evaluates principal, operation, and resource before Kafka.",
        "simulated",
      ),
    ],
    edges: [
      edge(
        "principal-gate",
        "principal-identity",
        "authorization-gate",
        "permission request",
        "simulated",
      ),
      edge(
        "gate-producer",
        "authorization-gate",
        "producer",
        "allowed only",
        "simulated",
      ),
      edge(
        "producer-topic",
        "producer",
        "topic",
        "authorized operation",
        "observed",
      ),
      edge(
        "topic-group",
        "topic",
        "consumerGroup",
        "authorized read",
        "observed",
      ),
    ],
  },
};

export function buildScenarioGraph(
  scenarioId: ScenarioExperienceId,
  snapshot: RunSnapshot,
  options: GraphOptions = {},
): CausalGraphModel {
  const seed = graphSeeds[scenarioId];
  const partitionNodes: NodeSeed[] = seed.partitions
    ? Array.from({ length: snapshot.partitionCount }, (_, partition) =>
        node(
          `partition-${partition}`,
          `Partition ${partition}`,
          `Kafka partition ${partition} in ${snapshot.topicName}.`,
          "observed",
        ),
      )
    : [];
  const partitionEdges: EdgeSeed[] = seed.partitions
    ? Array.from({ length: snapshot.partitionCount }, (_, partition) =>
        edge(
          `topic-partition-${partition}`,
          "topic",
          `partition-${partition}`,
          `P${partition} log`,
          "observed",
        ),
      )
    : [];

  return causalGraph(
    [...seed.nodes, ...partitionNodes].map((item) => ({
      ...item,
      provenance: modeAwareProvenance(snapshot, item.provenance),
      state: options.states?.[item.id] ?? (options.active ? "active" : "idle"),
      ...(options.metrics?.[item.id]
        ? { metric: options.metrics[item.id] }
        : {}),
    })),
    [...seed.edges, ...partitionEdges].map((item) => ({
      ...item,
      provenance: modeAwareProvenance(snapshot, item.provenance),
      scope: "current",
      active: Boolean(options.active) && !options.inactiveEdgeIds?.has(item.id),
    })),
  );
}

function modeAwareProvenance(
  snapshot: RunSnapshot,
  provenance: Provenance,
): Provenance {
  if (snapshot.mode === "demo" && provenance === "observed") {
    return "simulated";
  }
  return provenance;
}

export function getScenarioGraphEntityIds(
  scenarioId: ScenarioExperienceId,
): readonly string[] {
  return graphSeeds[scenarioId].nodes.map((item) => item.id);
}

function node(
  id: string,
  title: string,
  description: string,
  provenance: Provenance,
): NodeSeed {
  return { id, title, description, provenance };
}

function edge(
  id: string,
  source: string,
  target: string,
  label: string,
  provenance: Provenance,
): EdgeSeed {
  return { id, source, target, label, provenance };
}

export function graphCountMetric(
  value: number,
  provenance: Provenance,
  scope: "current" | "run-total" | "recent-window" = "current",
) {
  return evidence(value, provenance, scope);
}
