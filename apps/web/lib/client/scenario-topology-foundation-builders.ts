import {
  busiestPartition,
  countPayload,
  latestPayloadString,
} from "./scenario-metrics";
import { keyStrategyLabel } from "./key-strategy-label";
import {
  edge,
  model,
  node,
  type ScenarioTopologyContext,
  type ScenarioTopologyModel,
} from "./scenario-topology-model";

export function buildFanOutLoadBalancingTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, activeMembers, idleMembers } = context;
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
        position: { x: 1304, y: 404 },
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
      edge("balancer-to-group", "group-balancer", "consumerGroup", "emerald", {
        sourceHandle: "right-out",
        targetHandle: "empty-in",
      }),
      edge("balancer-to-idle", "group-balancer", "idle-members", "amber", {
        sourceHandle: "bottom-out",
        targetHandle: "top-in",
        dashed: true,
        active: idleMembers > 0,
      }),
    ],
  );
}

export function buildAtLeastOnceDuplicatesTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, produced, committed, lag, latestMessage } = context;
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
      edge("handler-to-commit", "idempotent-handler", "commit-gate", "amber", {
        sourceHandle: "bottom-out",
        targetHandle: "top-in",
      }),
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

export function buildRetryDeadLetterQueuesTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { failed, latestMessage } = context;
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

export function buildConsumerLagBackpressureTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, produced, committed, lag } = context;
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
      edge("backlog-to-pressure", "backlog-buffer", "pressure-meter", "amber", {
        sourceHandle: "right-out",
        targetHandle: "left-in",
        dashed: true,
        active: lag > 2,
      }),
    ],
  );
}

export function buildHotPartitionsKeySkewTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, produced } = context;
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

export function buildDefaultTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, produced, committed, lag, latestMessage } = context;
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
        position: { x: 92, y: 32 },
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
        position: { x: 1304, y: 372 },
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
