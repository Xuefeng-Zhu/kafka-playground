import type { PlaygroundMessage, RunSnapshot } from "@kplay/contracts";
import {
  deriveScenarioTopology,
  type ScenarioTopologyNode,
} from "./scenario-topology";
import {
  busiestPartition,
  countPayload,
  latestPayloadString,
} from "./scenario-metrics";
import { keyStrategyLabel } from "./key-strategy-label";

export type ScenarioVisualizationKind =
  | "partitioning-routing"
  | "fanout-assignment"
  | "duplicate-commit-timeline"
  | "retry-dlq-conveyor"
  | "schema-compatibility-gate"
  | "transaction-envelope"
  | "event-replay-projection"
  | "lag-backpressure-meter"
  | "hot-partition-heatmap"
  | "compaction-state-table"
  | "retention-window-timeline"
  | "cooperative-rebalance-board"
  | "streams-window-join"
  | "outbox-cdc-pipeline"
  | "acl-permission-matrix";

export type ScenarioVisualizationHotspot = Pick<
  ScenarioTopologyNode,
  | "description"
  | "details"
  | "eyebrow"
  | "icon"
  | "id"
  | "metricLabel"
  | "metricValue"
  | "title"
  | "tone"
>;

export type VisualMessage = {
  id: string;
  label: string;
  key: string;
  partition: string;
  offset: string;
  state: PlaygroundMessage["state"];
};

export type ScenarioVisualization = {
  kind: ScenarioVisualizationKind;
  scenarioId: string;
  title: string;
  summary: string;
  hotspots: ScenarioVisualizationHotspot[];
  metrics: Array<{
    label: string;
    value: string;
    tone: ScenarioVisualizationHotspot["tone"];
  }>;
  lanes: Array<{
    id: string;
    label: string;
    tone: ScenarioVisualizationHotspot["tone"];
    value: string;
    note: string;
    messages: VisualMessage[];
  }>;
  rows: Array<{
    id: string;
    cells: string[];
    tone: ScenarioVisualizationHotspot["tone"];
    emphasis?: boolean;
  }>;
  steps: Array<{
    id: string;
    label: string;
    value: string;
    tone: ScenarioVisualizationHotspot["tone"];
    active?: boolean;
  }>;
};

export function deriveScenarioVisualization(
  snapshot: RunSnapshot,
): ScenarioVisualization {
  const context = visualizationContext(snapshot);
  const hotspots = deriveScenarioTopology(snapshot).nodes.map(toHotspot);

  if (snapshot.scenarioId === "fan-out-load-balancing") {
    return fanOutVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "at-least-once-duplicates") {
    return duplicateVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "retry-dead-letter-queues") {
    return retryVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "schema-evolution-karapace") {
    return schemaVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "transactional-producers") {
    return transactionVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "event-replay-sourcing") {
    return replayVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "consumer-lag-backpressure") {
    return lagVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "hot-partitions-key-skew") {
    return hotPartitionVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "log-compaction-tombstones") {
    return compactionVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "retention-data-loss") {
    return retentionVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "cooperative-rebalancing") {
    return cooperativeVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "streams-joins-windows") {
    return streamsVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "outbox-cdc") {
    return outboxVisualization(context, hotspots);
  }
  if (snapshot.scenarioId === "acl-least-privilege") {
    return aclVisualization(context, hotspots);
  }
  return partitioningVisualization(context, hotspots);
}

function partitioningVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { snapshot, messages, produced, committed, lag } = context;
  return {
    kind: "partitioning-routing",
    scenarioId: snapshot.scenarioId,
    title: "Key routing lanes",
    summary: "Keys choose partition lanes; commits mark group progress.",
    hotspots,
    metrics: [
      {
        label: "Strategy",
        value: keyStrategyLabel(snapshot.keyStrategy),
        tone: "sky",
      },
      {
        label: "Committed",
        value: `${committed}/${produced}`,
        tone: committed >= produced && produced > 0 ? "emerald" : "amber",
      },
      { label: "Lag", value: String(lag), tone: lag > 0 ? "amber" : "emerald" },
    ],
    lanes: partitionLanes(context),
    rows: messages.slice(-5).map((message) => ({
      id: message.messageId,
      cells: [
        visualMessageLabel(message),
        message.key ?? "no key",
        partitionLabel(message.partition),
        message.state,
      ],
      tone: message.state === "committed" ? "emerald" : "sky",
      emphasis: message.messageId === messages.at(-1)?.messageId,
    })),
    steps: [
      {
        id: "producer",
        label: "Producer",
        value: snapshot.producerStatus,
        tone: snapshot.producerStatus === "running" ? "emerald" : "amber",
        active: snapshot.producerStatus === "running",
      },
      {
        id: "router",
        label: "Router",
        value: keyStrategyLabel(snapshot.keyStrategy),
        tone: "sky",
        active: produced > 0,
      },
      {
        id: "commit",
        label: "Commit",
        value: `${committed} offsets`,
        tone: committed > 0 ? "emerald" : "amber",
        active: committed > 0,
      },
    ],
  };
}

function fanOutVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { snapshot, activeMembers, idleMembers } = context;
  const consumers = snapshot.consumers;
  return {
    kind: "fanout-assignment",
    scenarioId: snapshot.scenarioId,
    title: "Partition assignment board",
    summary: "One group divides partition ownership; extras wait idle.",
    hotspots,
    metrics: [
      {
        label: "Partitions",
        value: String(snapshot.partitionCount),
        tone: "sky",
      },
      { label: "Active", value: String(activeMembers), tone: "emerald" },
      {
        label: "Idle",
        value: String(idleMembers),
        tone: idleMembers > 0 ? "amber" : "sky",
      },
    ],
    lanes: consumers.map((consumer) => ({
      id: consumer.consumerId,
      label: shortConsumerId(consumer.consumerId),
      tone: consumer.assignments.length > 0 ? "emerald" : "amber",
      value: consumer.assignments.length
        ? consumer.assignments
            .map((assignment) => `P${assignment.partition}`)
            .join(", ")
        : "idle",
      note: consumer.status,
      messages: [],
    })),
    rows: Array.from({ length: snapshot.partitionCount }, (_, partition) => {
      const owner = snapshot.consumers.find((consumer) =>
        consumer.assignments.some(
          (assignment) => assignment.partition === partition,
        ),
      );
      return {
        id: `partition-${partition}`,
        cells: [
          `P${partition}`,
          owner ? shortConsumerId(owner.consumerId) : "unassigned",
          String(snapshot.messageCounts[String(partition)] ?? 0),
        ],
        tone: owner ? "emerald" : "amber",
        emphasis: !owner,
      };
    }),
    steps: [
      {
        id: "group",
        label: "Consumer group",
        value: `${snapshot.consumers.length} members`,
        tone: "sky",
        active: snapshot.consumers.length > 0,
      },
      {
        id: "assignment",
        label: "Assignment",
        value: `${activeMembers}/${snapshot.partitionCount}`,
        tone: "emerald",
        active: activeMembers > 0,
      },
      {
        id: "idle",
        label: "Idle seats",
        value: String(idleMembers),
        tone: idleMembers > 0 ? "amber" : "sky",
        active: idleMembers > 0,
      },
    ],
  };
}

function duplicateVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages, produced, committed, lag } = context;
  const duplicateRisks = countPayload(messages, "duplicateRisk", true);
  return {
    kind: "duplicate-commit-timeline",
    scenarioId: context.snapshot.scenarioId,
    title: "Processing before commit",
    summary: "Replay risk lives between handler success and offset commit.",
    hotspots,
    metrics: [
      { label: "Produced", value: String(produced), tone: "sky" },
      { label: "Committed", value: String(committed), tone: "emerald" },
      {
        label: "Risk gap",
        value: String(lag),
        tone: lag > 0 ? "amber" : "emerald",
      },
    ],
    lanes: [
      timelineLane(
        "processed",
        "Processed",
        messages.filter(
          (message) =>
            message.state === "processed" ||
            message.state === "commit_requested",
        ),
        "amber",
      ),
      timelineLane(
        "committed",
        "Committed",
        messages.filter((message) => message.state === "committed"),
        "emerald",
      ),
      timelineLane(
        "risk",
        "Duplicate risk",
        messages.filter(
          (message) => payloadValue(message, "duplicateRisk") === true,
        ),
        duplicateRisks > 0 ? "rose" : "sky",
      ),
    ],
    rows: messages.slice(-5).map((message) => ({
      id: message.messageId,
      cells: [
        latestPayloadString(message, "idempotencyKey") ??
          visualMessageLabel(message),
        message.state,
        payloadValue(message, "duplicateRisk") === true
          ? "replayable"
          : "normal",
      ],
      tone: payloadValue(message, "duplicateRisk") === true ? "amber" : "sky",
      emphasis: payloadValue(message, "duplicateRisk") === true,
    })),
    steps: [
      {
        id: "receive",
        label: "Receive",
        value: String(messages.length),
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "process",
        label: "Process",
        value: String(produced - lag),
        tone: "amber",
        active: produced > lag,
      },
      {
        id: "commit",
        label: "Commit",
        value: String(committed),
        tone: "emerald",
        active: committed > 0,
      },
    ],
  };
}

function retryVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages, failed } = context;
  const latest = messages.at(-1);
  return {
    kind: "retry-dlq-conveyor",
    scenarioId: context.snapshot.scenarioId,
    title: "Failure conveyor",
    summary:
      "Failed records leave the main path for retry and DLQ observation.",
    hotspots,
    metrics: [
      {
        label: "Failed",
        value: String(failed),
        tone: failed > 0 ? "rose" : "emerald",
      },
      {
        label: "Retry",
        value: latestPayloadString(latest, "retryTopic") ?? "orders.retry.30s",
        tone: "amber",
      },
      {
        label: "DLQ",
        value: latestPayloadString(latest, "deadLetterTopic") ?? "orders.dlq",
        tone: "rose",
      },
    ],
    lanes: [
      timelineLane(
        "main",
        "Main topic",
        messages.filter((message) => message.state !== "failed"),
        "sky",
      ),
      timelineLane(
        "retry",
        "Retry delay",
        messages.filter(
          (message) => payloadValue(message, "shouldFail") === true,
        ),
        failed > 0 ? "amber" : "sky",
      ),
      timelineLane(
        "dlq",
        "Dead letter",
        messages.filter((message) => message.state === "failed"),
        failed > 0 ? "rose" : "amber",
      ),
    ],
    rows: messages.slice(-5).map((message) => ({
      id: message.messageId,
      cells: [
        visualMessageLabel(message),
        `attempt ${latestPayloadString(message, "attempt") ?? "1"}`,
        payloadValue(message, "shouldFail") === true ? "retry + DLQ" : "main",
      ],
      tone: message.state === "failed" ? "rose" : "sky",
      emphasis: message.state === "failed",
    })),
    steps: [
      {
        id: "main",
        label: "Main",
        value: String(messages.length),
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "retry",
        label: "Retry",
        value: String(failed),
        tone: failed > 0 ? "amber" : "sky",
        active: failed > 0,
      },
      {
        id: "dlq",
        label: "DLQ",
        value: failed > 0 ? "active" : "ready",
        tone: failed > 0 ? "rose" : "amber",
        active: failed > 0,
      },
    ],
  };
}

function schemaVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages } = context;
  const latest = messages.at(-1);
  const rejected = countPayload(messages, "compatible", false);
  return {
    kind: "schema-compatibility-gate",
    scenarioId: context.snapshot.scenarioId,
    title: "Schema compatibility gate",
    summary: "Compatible shape changes pass; unsafe versions stop up front.",
    hotspots,
    metrics: [
      {
        label: "Version",
        value: latestPayloadString(latest, "schemaVersion") ?? "2",
        tone: "violet",
      },
      {
        label: "Rejected",
        value: String(rejected),
        tone: rejected > 0 ? "rose" : "emerald",
      },
      {
        label: "Subject",
        value: latestPayloadString(latest, "schemaSubject") ?? "profile-value",
        tone: "sky",
      },
    ],
    lanes: [
      timelineLane(
        "compatible",
        "Compatible",
        messages.filter(
          (message) => payloadValue(message, "compatible") !== false,
        ),
        "emerald",
      ),
      timelineLane(
        "rejected",
        "Rejected",
        messages.filter(
          (message) => payloadValue(message, "compatible") === false,
        ),
        rejected > 0 ? "rose" : "amber",
      ),
    ],
    rows: messages.slice(-5).map((message) => ({
      id: message.messageId,
      cells: [
        `v${latestPayloadString(message, "schemaVersion") ?? "?"}`,
        latestPayloadString(message, "fieldChange") ?? "ready",
        payloadValue(message, "compatible") === false ? "blocked" : "passed",
      ],
      tone: payloadValue(message, "compatible") === false ? "rose" : "emerald",
      emphasis: payloadValue(message, "compatible") === false,
    })),
    steps: [
      {
        id: "subject",
        label: "Subject",
        value: latestPayloadString(latest, "schemaSubject") ?? "profile-value",
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "version",
        label: "Version",
        value: latestPayloadString(latest, "schemaVersion") ?? "2",
        tone: "violet",
        active: messages.length > 0,
      },
      {
        id: "gate",
        label: "Gate",
        value: rejected > 0 ? "blocking" : "passing",
        tone: rejected > 0 ? "rose" : "emerald",
        active: messages.length > 0,
      },
    ],
  };
}

function transactionVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages, committed } = context;
  const latest = messages.at(-1);
  const transactionRows = Array.from(
    groupMessages(messages, "transactionId").entries(),
  ).slice(-5);
  return {
    kind: "transaction-envelope",
    scenarioId: context.snapshot.scenarioId,
    title: "Transaction envelope",
    summary: "Records become visible when the transaction boundary commits.",
    hotspots,
    metrics: [
      {
        label: "Transaction",
        value: latestPayloadString(latest, "transactionId") ?? "-",
        tone: "sky",
      },
      {
        label: "Boundary",
        value: latestPayloadString(latest, "commitBoundary") ?? "open",
        tone:
          latestPayloadString(latest, "commitBoundary") === "commit"
            ? "emerald"
            : "amber",
      },
      { label: "Committed", value: String(committed), tone: "emerald" },
    ],
    lanes: transactionRows.map(([transactionId, items]) => ({
      id: transactionId,
      label: transactionId,
      tone: items.some(
        (message) =>
          latestPayloadString(message, "commitBoundary") === "commit",
      )
        ? "emerald"
        : "amber",
      value: items.some(
        (message) =>
          latestPayloadString(message, "commitBoundary") === "commit",
      )
        ? "visible"
        : "open",
      note: `${items.length} records`,
      messages: items.map(toVisualMessage),
    })),
    rows: messages.slice(-5).map((message) => ({
      id: message.messageId,
      cells: [
        latestPayloadString(message, "transactionId") ?? "-",
        `epoch ${latestPayloadString(message, "producerEpoch") ?? "1"}`,
        `seq ${latestPayloadString(message, "sequenceNumber") ?? "0"}`,
        latestPayloadString(message, "commitBoundary") ?? "open",
      ],
      tone:
        latestPayloadString(message, "commitBoundary") === "commit"
          ? "emerald"
          : "amber",
      emphasis: message.messageId === latest?.messageId,
    })),
    steps: [
      {
        id: "epoch",
        label: "Epoch",
        value: latestPayloadString(latest, "producerEpoch") ?? "1",
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "sequence",
        label: "Sequence",
        value: latestPayloadString(latest, "sequenceNumber") ?? "0",
        tone: "violet",
        active: messages.length > 0,
      },
      {
        id: "visibility",
        label: "Visibility",
        value: latestPayloadString(latest, "commitBoundary") ?? "open",
        tone:
          latestPayloadString(latest, "commitBoundary") === "commit"
            ? "emerald"
            : "amber",
        active: messages.length > 0,
      },
    ],
  };
}

function replayVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages, committed } = context;
  const latest = messages.at(-1);
  const projections = latestByPayloadKey(messages, "aggregateId");
  return {
    kind: "event-replay-projection",
    scenarioId: context.snapshot.scenarioId,
    title: "Replay cursor and projection",
    summary: "The event log rebuilds derived state by aggregate.",
    hotspots,
    metrics: [
      {
        label: "Aggregate",
        value: latestPayloadString(latest, "aggregateId") ?? "-",
        tone: "sky",
      },
      {
        label: "Cursor",
        value: latestPayloadString(latest, "replayCursor") ?? "0",
        tone: "emerald",
      },
      { label: "Committed", value: String(committed), tone: "emerald" },
    ],
    lanes: [
      timelineLane("log", "Immutable log", messages, "violet"),
      timelineLane(
        "cursor",
        "Replay cursor",
        latest ? [latest] : [],
        "emerald",
      ),
    ],
    rows: Array.from(projections.entries()).map(([aggregate, message]) => ({
      id: aggregate,
      cells: [
        aggregate,
        latestPayloadString(message, "eventName") ?? "-",
        latestPayloadString(message, "replayCursor") ?? "0",
      ],
      tone: "emerald",
      emphasis: aggregate === latestPayloadString(latest, "aggregateId"),
    })),
    steps: [
      {
        id: "reset",
        label: "Offset reset",
        value: "ready",
        tone: "violet",
        active: messages.length > 0,
      },
      {
        id: "scan",
        label: "Scan log",
        value: `${messages.length} events`,
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "project",
        label: "Projection",
        value: `${projections.size} aggregates`,
        tone: "emerald",
        active: projections.size > 0,
      },
    ],
  };
}

function lagVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { snapshot, produced, committed, failed, lag } = context;
  return {
    kind: "lag-backpressure-meter",
    scenarioId: snapshot.scenarioId,
    title: "Lag pressure meter",
    summary: "Production fills the queue; commits drain it.",
    hotspots,
    metrics: [
      { label: "Produced", value: String(produced), tone: "sky" },
      { label: "Committed", value: String(committed), tone: "emerald" },
      {
        label: "Lag",
        value: String(lag),
        tone: lag > 2 ? "rose" : lag > 0 ? "amber" : "emerald",
      },
    ],
    lanes: [
      {
        id: "produced",
        label: "Produced",
        tone: "sky",
        value: String(produced),
        note: `${snapshot.productionRate}/s`,
        messages: context.messages.map(toVisualMessage),
      },
      {
        id: "committed",
        label: "Committed",
        tone: "emerald",
        value: String(committed),
        note: "drained",
        messages: context.messages
          .filter((message) => message.state === "committed")
          .map(toVisualMessage),
      },
      {
        id: "lag",
        label: "Backlog",
        tone: lag > 2 ? "rose" : lag > 0 ? "amber" : "emerald",
        value: String(lag),
        note: `${snapshot.processingLatencyMs} ms processing`,
        messages: context.messages
          .filter(
            (message) =>
              message.state !== "committed" && message.state !== "failed",
          )
          .map(toVisualMessage),
      },
    ],
    rows: [
      {
        id: "rate",
        cells: ["Production rate", `${snapshot.productionRate}/s`, "input"],
        tone: "sky",
      },
      {
        id: "latency",
        cells: [
          "Processing latency",
          `${snapshot.processingLatencyMs} ms`,
          "capacity",
        ],
        tone: snapshot.processingLatencyMs > 1000 ? "amber" : "emerald",
      },
      {
        id: "failed",
        cells: ["Failed", String(failed), "removed from lag"],
        tone: failed > 0 ? "rose" : "sky",
      },
    ],
    steps: [
      {
        id: "fill",
        label: "Fill",
        value: String(produced),
        tone: "sky",
        active: produced > 0,
      },
      {
        id: "drain",
        label: "Drain",
        value: String(committed),
        tone: "emerald",
        active: committed > 0,
      },
      {
        id: "pressure",
        label: "Pressure",
        value: lag > 0 ? "building" : "clear",
        tone: lag > 2 ? "rose" : lag > 0 ? "amber" : "emerald",
        active: lag > 0,
      },
    ],
  };
}

function hotPartitionVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { snapshot, produced } = context;
  const busiest = busiestPartition(snapshot);
  const maxCount = Math.max(
    1,
    ...Array.from(
      { length: snapshot.partitionCount },
      (_, partition) => snapshot.messageCounts[String(partition)] ?? 0,
    ),
  );
  return {
    kind: "hot-partition-heatmap",
    scenarioId: snapshot.scenarioId,
    title: "Partition heatmap",
    summary: "A dominant key lights up one lane.",
    hotspots,
    metrics: [
      {
        label: "Hot key",
        value:
          snapshot.keyStrategy.type === "fixed"
            ? snapshot.keyStrategy.value
            : "mixed",
        tone: "amber",
      },
      { label: "Busiest", value: busiest.partition, tone: "rose" },
      {
        label: "Records",
        value: String(busiest.count),
        tone: busiest.count > 0 ? "rose" : "sky",
      },
    ],
    lanes: Array.from({ length: snapshot.partitionCount }, (_, partition) => {
      const count = snapshot.messageCounts[String(partition)] ?? 0;
      return {
        id: `partition-${partition}`,
        label: `P${partition}`,
        tone:
          count === busiest.count && count > 0
            ? "rose"
            : count > 0
              ? "amber"
              : "sky",
        value: String(count),
        note: `${Math.round((count / maxCount) * 100)}% heat`,
        messages: context.messages
          .filter((message) => message.partition === partition)
          .map(toVisualMessage),
      };
    }),
    rows: context.messages.slice(-5).map((message) => ({
      id: message.messageId,
      cells: [
        message.key ?? "no key",
        partitionLabel(message.partition),
        latestPayloadString(message, "fanoutSize") ?? "-",
      ],
      tone: message.key === "celebrity-user" ? "rose" : "sky",
      emphasis:
        message.partition !== null &&
        `P${message.partition}` === busiest.partition,
    })),
    steps: [
      {
        id: "key",
        label: "Key",
        value: snapshot.keyStrategy.type,
        tone: "amber",
        active: produced > 0,
      },
      {
        id: "hash",
        label: "Hash",
        value: busiest.partition,
        tone: busiest.count > 0 ? "rose" : "sky",
        active: busiest.count > 0,
      },
      {
        id: "load",
        label: "Load",
        value: String(busiest.count),
        tone: busiest.count > 0 ? "rose" : "sky",
        active: busiest.count > 0,
      },
    ],
  };
}

function compactionVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages } = context;
  const tombstones = countPayload(messages, "tombstone", true);
  const compacted = latestByPayloadKey(messages, "compactedKey");
  return {
    kind: "compaction-state-table",
    scenarioId: context.snapshot.scenarioId,
    title: "Raw log to compacted state",
    summary: "Latest values survive; tombstones mark deletion.",
    hotspots,
    metrics: [
      { label: "Keys", value: String(compacted.size), tone: "sky" },
      {
        label: "Tombstones",
        value: String(tombstones),
        tone: tombstones > 0 ? "rose" : "sky",
      },
      {
        label: "Latest op",
        value: latestPayloadString(messages.at(-1), "operation") ?? "-",
        tone:
          latestPayloadString(messages.at(-1), "operation") === "delete"
            ? "rose"
            : "emerald",
      },
    ],
    lanes: [
      timelineLane("raw", "Raw log", messages, "sky"),
      timelineLane(
        "state",
        "Compacted state",
        Array.from(compacted.values()),
        "emerald",
      ),
    ],
    rows: Array.from(compacted.entries()).map(([key, message]) => ({
      id: key,
      cells: [
        key,
        latestPayloadString(message, "operation") ?? "-",
        latestPayloadString(message, "retainedValue") ?? "deleted",
      ],
      tone: payloadValue(message, "tombstone") === true ? "rose" : "emerald",
      emphasis: payloadValue(message, "tombstone") === true,
    })),
    steps: [
      {
        id: "append",
        label: "Append",
        value: String(messages.length),
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "collapse",
        label: "Collapse by key",
        value: String(compacted.size),
        tone: "emerald",
        active: compacted.size > 0,
      },
      {
        id: "delete",
        label: "Tombstone",
        value: String(tombstones),
        tone: tombstones > 0 ? "rose" : "amber",
        active: tombstones > 0,
      },
    ],
  };
}

function retentionVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages, committed } = context;
  const latest = messages.at(-1);
  const expiring = countPayload(messages, "retentionBucket", "expired-soon");
  const replayableFrom =
    latestPayloadString(latest, "replayableUntilOffset") ?? "0";
  return {
    kind: "retention-window-timeline",
    scenarioId: context.snapshot.scenarioId,
    title: "Replayable offset window",
    summary: "Records outside retention cannot be replayed.",
    hotspots,
    metrics: [
      {
        label: "Expiring",
        value: String(expiring),
        tone: expiring > 0 ? "amber" : "emerald",
      },
      { label: "Replayable from", value: replayableFrom, tone: "sky" },
      { label: "Committed", value: String(committed), tone: "emerald" },
    ],
    lanes: [
      timelineLane(
        "expired",
        "Expired soon",
        messages.filter(
          (message) =>
            payloadValue(message, "retentionBucket") === "expired-soon",
        ),
        expiring > 0 ? "amber" : "sky",
      ),
      timelineLane(
        "active",
        "Active window",
        messages.filter(
          (message) =>
            payloadValue(message, "retentionBucket") !== "expired-soon",
        ),
        "emerald",
      ),
    ],
    rows: messages.slice(-6).map((message) => ({
      id: message.messageId,
      cells: [
        message.offset ?? "-",
        latestPayloadString(message, "retentionBucket") ?? "active-window",
        latestPayloadString(message, "replayableUntilOffset") ?? "0",
      ],
      tone:
        payloadValue(message, "retentionBucket") === "expired-soon"
          ? "amber"
          : "emerald",
      emphasis: payloadValue(message, "retentionBucket") === "expired-soon",
    })),
    steps: [
      {
        id: "old",
        label: "Old offsets",
        value: String(expiring),
        tone: expiring > 0 ? "amber" : "sky",
        active: expiring > 0,
      },
      {
        id: "boundary",
        label: "Boundary",
        value: replayableFrom,
        tone: "rose",
        active: messages.length > 0,
      },
      {
        id: "window",
        label: "Active window",
        value: String(Math.max(0, messages.length - expiring)),
        tone: "emerald",
        active: messages.length > expiring,
      },
    ],
  };
}

function cooperativeVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { snapshot } = context;
  const revocations = snapshot.recentEvents.filter(
    (event) => event.type === "consumer.partitions_revoked",
  ).length;
  const assignments = snapshot.consumers.reduce(
    (sum, consumer) => sum + consumer.assignments.length,
    0,
  );
  return {
    kind: "cooperative-rebalance-board",
    scenarioId: snapshot.scenarioId,
    title: "Sticky assignment choreography",
    summary: "Cooperative rebalances move ownership incrementally.",
    hotspots,
    metrics: [
      {
        label: "Members",
        value: String(snapshot.consumers.length),
        tone: "sky",
      },
      { label: "Assignments", value: String(assignments), tone: "emerald" },
      {
        label: "Revokes",
        value: String(revocations),
        tone: revocations > 0 ? "amber" : "emerald",
      },
    ],
    lanes: snapshot.consumers.map((consumer) => ({
      id: consumer.consumerId,
      label: shortConsumerId(consumer.consumerId),
      tone:
        consumer.status === "crashed"
          ? "rose"
          : consumer.assignments.length > 0
            ? "emerald"
            : "amber",
      value: consumer.assignments.length
        ? consumer.assignments
            .map((assignment) => `P${assignment.partition}`)
            .join(", ")
        : "idle",
      note: consumer.status,
      messages: [],
    })),
    rows: snapshot.consumers.flatMap((consumer) =>
      consumer.assignments.map((assignment) => ({
        id: `${consumer.consumerId}-${assignment.partition}`,
        cells: [
          shortConsumerId(consumer.consumerId),
          `P${assignment.partition}`,
          "kept",
        ],
        tone: "emerald" as const,
      })),
    ),
    steps: [
      {
        id: "join",
        label: "Members",
        value: String(snapshot.consumers.length),
        tone: "sky",
        active: snapshot.consumers.length > 0,
      },
      {
        id: "revoke",
        label: "Revoke",
        value: String(revocations),
        tone: revocations > 0 ? "amber" : "emerald",
        active: revocations > 0,
      },
      {
        id: "assign",
        label: "Assign",
        value: String(assignments),
        tone: "emerald",
        active: assignments > 0,
      },
    ],
  };
}

function streamsVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages } = context;
  const late = countPayload(messages, "lateArrival", true);
  const latest = messages.at(-1);
  return {
    kind: "streams-window-join",
    scenarioId: context.snapshot.scenarioId,
    title: "Windowed stream join",
    summary: "Orders and payments meet while the event-time window is open.",
    hotspots,
    metrics: [
      {
        label: "Join key",
        value: latestPayloadString(latest, "joinKey") ?? "-",
        tone: "sky",
      },
      {
        label: "Window",
        value: `${latestPayloadString(latest, "windowStartSecond") ?? "0"}-${latestPayloadString(latest, "windowEndSecond") ?? "60"}`,
        tone: "violet",
      },
      {
        label: "Late",
        value: String(late),
        tone: late > 0 ? "amber" : "emerald",
      },
    ],
    lanes: [
      timelineLane(
        "orders",
        "Orders",
        messages.filter(
          (message) =>
            latestPayloadString(message, "streamName") !== "payments",
        ),
        "sky",
      ),
      timelineLane(
        "payments",
        "Payments",
        messages.filter(
          (message) =>
            latestPayloadString(message, "streamName") === "payments",
        ),
        "violet",
      ),
      timelineLane(
        "late",
        "Grace / late",
        messages.filter(
          (message) => payloadValue(message, "lateArrival") === true,
        ),
        late > 0 ? "amber" : "emerald",
      ),
    ],
    rows: messages.slice(-6).map((message) => ({
      id: message.messageId,
      cells: [
        latestPayloadString(message, "streamName") ?? "orders",
        latestPayloadString(message, "joinKey") ?? "-",
        `${latestPayloadString(message, "windowStartSecond") ?? "0"}-${latestPayloadString(message, "windowEndSecond") ?? "60"}`,
        payloadValue(message, "lateArrival") === true ? "late" : "on time",
      ],
      tone: payloadValue(message, "lateArrival") === true ? "amber" : "sky",
      emphasis: payloadValue(message, "lateArrival") === true,
    })),
    steps: [
      {
        id: "orders",
        label: "Orders",
        value: String(
          messages.filter(
            (message) =>
              latestPayloadString(message, "streamName") !== "payments",
          ).length,
        ),
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "payments",
        label: "Payments",
        value: String(
          messages.filter(
            (message) =>
              latestPayloadString(message, "streamName") === "payments",
          ).length,
        ),
        tone: "violet",
        active: messages.length > 0,
      },
      {
        id: "join",
        label: "Join state",
        value: latestPayloadString(latest, "joinKey") ?? "ready",
        tone: "emerald",
        active: messages.length > 1,
      },
    ],
  };
}

function outboxVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages, produced } = context;
  const latest = messages.at(-1);
  return {
    kind: "outbox-cdc-pipeline",
    scenarioId: context.snapshot.scenarioId,
    title: "Database commit to Kafka",
    summary:
      "Business rows and outbox rows commit together, then CDC follows LSN order.",
    hotspots,
    metrics: [
      {
        label: "Table",
        value: latestPayloadString(latest, "table") ?? "orders",
        tone: "sky",
      },
      {
        label: "LSN",
        value: latestPayloadString(latest, "lsn") ?? "-",
        tone: "emerald",
      },
      { label: "Published", value: String(produced), tone: "emerald" },
    ],
    lanes: [
      timelineLane("outbox", "Outbox table", messages, "sky"),
      timelineLane("wal", "WAL / LSN", messages, "violet"),
      timelineLane(
        "kafka",
        "Kafka topic",
        messages.filter((message) => message.partition !== null),
        "emerald",
      ),
    ],
    rows: messages.slice(-6).map((message) => ({
      id: message.messageId,
      cells: [
        latestPayloadString(message, "table") ?? "orders",
        latestPayloadString(message, "operation") ?? "-",
        shortId(latestPayloadString(message, "outboxId") ?? message.messageId),
        latestPayloadString(message, "lsn") ?? "-",
      ],
      tone: "emerald",
      emphasis: message.messageId === latest?.messageId,
    })),
    steps: [
      {
        id: "commit",
        label: "DB commit",
        value: latestPayloadString(latest, "operation") ?? "ready",
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "lsn",
        label: "LSN cursor",
        value: latestPayloadString(latest, "lsn") ?? "-",
        tone: "violet",
        active: messages.length > 0,
      },
      {
        id: "publish",
        label: "Publish",
        value: String(produced),
        tone: "emerald",
        active: produced > 0,
      },
    ],
  };
}

function aclVisualization(
  context: VisualizationContext,
  hotspots: ScenarioVisualizationHotspot[],
): ScenarioVisualization {
  const { messages } = context;
  const denied = countPayload(messages, "authorized", false);
  const latest = messages.at(-1);
  return {
    kind: "acl-permission-matrix",
    scenarioId: context.snapshot.scenarioId,
    title: "Principal permission matrix",
    summary: "Kafka checks principal, operation, and resource before access.",
    hotspots,
    metrics: [
      {
        label: "Denied",
        value: String(denied),
        tone: denied > 0 ? "rose" : "emerald",
      },
      {
        label: "Principal",
        value: latestPayloadString(latest, "principal") ?? "-",
        tone: "sky",
      },
      {
        label: "Operation",
        value: latestPayloadString(latest, "operation") ?? "-",
        tone: "amber",
      },
    ],
    lanes: [
      timelineLane(
        "allowed",
        "Allowed",
        messages.filter(
          (message) => payloadValue(message, "authorized") !== false,
        ),
        "emerald",
      ),
      timelineLane(
        "denied",
        "Denied",
        messages.filter(
          (message) => payloadValue(message, "authorized") === false,
        ),
        denied > 0 ? "rose" : "amber",
      ),
    ],
    rows: messages.slice(-6).map((message) => ({
      id: message.messageId,
      cells: [
        latestPayloadString(message, "principal") ?? "-",
        latestPayloadString(message, "operation") ?? "-",
        latestPayloadString(message, "resource") ?? "secured.orders",
        payloadValue(message, "authorized") === false ? "denied" : "allowed",
      ],
      tone: payloadValue(message, "authorized") === false ? "rose" : "emerald",
      emphasis: payloadValue(message, "authorized") === false,
    })),
    steps: [
      {
        id: "principal",
        label: "Principal",
        value: latestPayloadString(latest, "principal") ?? "ready",
        tone: "sky",
        active: messages.length > 0,
      },
      {
        id: "acl",
        label: "ACL gate",
        value: denied > 0 ? "deny" : "allow",
        tone: denied > 0 ? "rose" : "emerald",
        active: messages.length > 0,
      },
      {
        id: "resource",
        label: "Resource",
        value: latestPayloadString(latest, "resource") ?? "secured.orders",
        tone: "amber",
        active: messages.length > 0,
      },
    ],
  };
}

type VisualizationContext = {
  snapshot: RunSnapshot;
  messages: PlaygroundMessage[];
  produced: number;
  committed: number;
  failed: number;
  lag: number;
  activeMembers: number;
  idleMembers: number;
};

function visualizationContext(snapshot: RunSnapshot): VisualizationContext {
  const produced = snapshot.messageCounts.produced ?? 0;
  const committed = snapshot.messageCounts.committed ?? 0;
  const failed =
    snapshot.messageCounts.failed ??
    snapshot.recentMessages.filter((message) => message.state === "failed")
      .length;
  return {
    snapshot,
    messages: snapshot.recentMessages,
    produced,
    committed,
    failed,
    lag: Math.max(0, produced - committed - failed),
    activeMembers: snapshot.consumers.filter(
      (consumer) => consumer.assignments.length > 0,
    ).length,
    idleMembers: snapshot.consumers.filter(
      (consumer) => consumer.assignments.length === 0,
    ).length,
  };
}

function toHotspot(node: ScenarioTopologyNode): ScenarioVisualizationHotspot {
  return {
    description: node.description,
    details: node.details,
    eyebrow: node.eyebrow,
    icon: node.icon,
    id: node.id,
    metricLabel: node.metricLabel,
    metricValue: node.metricValue,
    title: node.title,
    tone: node.tone,
  };
}

function partitionLanes(context: VisualizationContext) {
  const { snapshot, messages } = context;
  return Array.from({ length: snapshot.partitionCount }, (_, partition) => ({
    id: `partition-${partition}`,
    label: `Partition ${partition}`,
    tone: partitionTone(partition),
    value: String(snapshot.messageCounts[String(partition)] ?? 0),
    note: `latest ${snapshot.latestPartitionOffsets[String(partition)] ?? "none"} / committed ${snapshot.latestCommittedOffsets[String(partition)] ?? "-"}`,
    messages: messages
      .filter((message) => message.partition === partition)
      .slice(-6)
      .map(toVisualMessage),
  }));
}

function timelineLane(
  id: string,
  label: string,
  messages: PlaygroundMessage[],
  tone: ScenarioVisualizationHotspot["tone"],
) {
  return {
    id,
    label,
    tone,
    value: String(messages.length),
    note: messages.at(-1)?.state ?? "ready",
    messages: messages.slice(-6).map(toVisualMessage),
  };
}

function toVisualMessage(message: PlaygroundMessage): VisualMessage {
  return {
    id: message.messageId,
    label: visualMessageLabel(message),
    key: message.key ?? "no key",
    partition: partitionLabel(message.partition),
    offset: message.offset ?? "-",
    state: message.state,
  };
}

function visualMessageLabel(message: PlaygroundMessage) {
  const sequence = message.value.sequence;
  if (typeof sequence === "number") return `m${sequence}`;
  return shortId(message.messageId);
}

function payloadValue(message: PlaygroundMessage | undefined, key: string) {
  const payload = message?.value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return (payload as Record<string, unknown>)[key] ?? null;
}

function partitionLabel(partition: number | null) {
  return typeof partition === "number" ? `P${partition}` : "pending";
}

function partitionTone(
  partition: number,
): ScenarioVisualizationHotspot["tone"] {
  return partition % 3 === 0
    ? "sky"
    : partition % 3 === 1
      ? "violet"
      : "emerald";
}

function groupMessages(messages: PlaygroundMessage[], key: string) {
  const grouped = new Map<string, PlaygroundMessage[]>();
  messages.forEach((message) => {
    const groupKey = latestPayloadString(message, key) ?? "ungrouped";
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), message]);
  });
  return grouped;
}

function latestByPayloadKey(messages: PlaygroundMessage[], key: string) {
  const latest = new Map<string, PlaygroundMessage>();
  messages.forEach((message) => {
    const mapKey = latestPayloadString(message, key);
    if (mapKey) latest.set(mapKey, message);
  });
  return latest;
}

function shortConsumerId(consumerId: string) {
  return consumerId.replace("consumer-", "C");
}

function shortId(value: string) {
  return value.length > 10
    ? `${value.slice(0, 4)}...${value.slice(-4)}`
    : value;
}
