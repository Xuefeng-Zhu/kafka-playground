import type {
  CausalGraphEdge,
  CausalGraphNode,
  EntityFocusRef,
  EvidenceScope,
  EvidenceValue,
  Provenance,
  ScenarioExperienceFrame,
  ScenarioExperienceId,
  ScenarioExploreTopologyDefinition,
  ScenarioExploreTopologyEdgeKind,
  ScenarioExploreTopologyVisualKind,
} from "./model";
import type { ScenarioTopologyIcon } from "../scenario-topology-model";

export const SCENARIO_EXPLORE_NODE_WIDTH = 280;
export const SCENARIO_EXPLORE_NODE_HEIGHT = 208;
export const SCENARIO_EXPLORE_COLUMN_GAP = 240;
export const SCENARIO_EXPLORE_ROW_GAP = 240;

const CORE_NODE_IDS = new Set(["producer", "topic", "consumerGroup"]);
const PARTITION_NODE_PATTERN = /^partition-\d+$/;

export type ScenarioExploreTopologyNode = {
  id: string;
  entityId: string;
  nodeKind: "core" | "scenario";
  visualKind: ScenarioExploreTopologyVisualKind;
  title: string;
  description: string;
  provenance: Provenance;
  state?: CausalGraphNode["state"];
  metric?: EvidenceValue;
  focus: EntityFocusRef;
  rank: number;
  lane: number;
  position: { x: number; y: number };
};

export type ScenarioExploreTopologyEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: ScenarioExploreTopologyEdgeKind;
  provenance: Provenance;
  scope: EvidenceScope;
  active: boolean;
};

/** A runtime topology relation, kept separate from scenario causal evidence. */
export type ScenarioExploreTopologyCoreRoute = {
  id: "core-producer-topic";
  source: "producer";
  target: "topic";
  label: string;
  kind: "data";
  provenance: Provenance;
  scope: "current";
  active: false;
};

export type ScenarioExploreTopologyProjection = {
  scenarioId: ScenarioExperienceId;
  definition: ScenarioExploreTopologyDefinition;
  nodes: readonly ScenarioExploreTopologyNode[];
  edges: readonly ScenarioExploreTopologyEdge[];
  scenarioNodeIds: ReadonlySet<string>;
  coreNodeIds: ReadonlySet<string>;
  replacesCoreProducerTopicEdge: boolean;
  coreProducerTopicRoute: ScenarioExploreTopologyCoreRoute | null;
};

export type ScenarioExploreTopologyProjectionOptions = {
  enabledScenarioIds?: ReadonlySet<ScenarioExperienceId>;
};

export type ScenarioExploreTopologyGraphIssue =
  | { kind: "duplicate-node-id"; id: string }
  | { kind: "duplicate-edge-id"; id: string }
  | { kind: "invalid-edge-endpoint"; id: string; endpoint: string }
  | { kind: "missing-node-definition"; id: string }
  | { kind: "missing-edge-definition"; id: string };

export const SCENARIO_EXPLORE_TOPOLOGY_DEFINITIONS = {
  partitioning: defineTopology(
    "partitioning",
    {
      "key-router": "route",
      "commit-progress": "commit",
    },
    {
      "producer-router": "data",
      "router-topic": "control",
      "group-commit": "control",
    },
    {
      producer: rank(0),
      "key-router": rank(1),
      topic: rank(2),
      consumerGroup: rank(3),
      "commit-progress": rank(4),
    },
    true,
  ),
  "fan-out-load-balancing": defineTopology(
    "fan-out-load-balancing",
    {
      "group-balancer": "balance",
      "idle-members": "balance",
    },
    {
      "producer-topic": "data",
      "topic-balancer": "control",
      "balancer-group": "ownership",
      "balancer-idle": "ownership",
    },
    {
      producer: rank(0),
      topic: rank(1),
      "group-balancer": rank(2),
      consumerGroup: rank(3, -1),
      "idle-members": rank(3, 1),
    },
  ),
  "at-least-once-duplicates": defineTopology(
    "at-least-once-duplicates",
    {
      "idempotent-handler": "handler",
      "commit-gate": "commit",
      "replay-loop": "retry",
    },
    {
      "producer-topic": "data",
      "topic-group": "data",
      "group-handler": "data",
      "handler-commit": "control",
      "commit-replay": "control",
      "replay-group": "feedback",
    },
    {
      producer: rank(0),
      topic: rank(1),
      consumerGroup: rank(2),
      "idempotent-handler": rank(3),
      "commit-gate": rank(4),
      "replay-loop": rank(5),
    },
  ),
  "retry-dead-letter-queues": defineTopology(
    "retry-dead-letter-queues",
    {
      "retry-topic": "retry",
      "dead-letter-topic": "dlq",
    },
    {
      "producer-topic": "data",
      "topic-group": "data",
      "group-retry": "control",
      "retry-group": "feedback",
      "retry-dlq": "data",
    },
    {
      producer: rank(0),
      topic: rank(1),
      consumerGroup: rank(2),
      "retry-topic": rank(3),
      "dead-letter-topic": rank(4),
    },
  ),
  "schema-evolution-karapace": defineTopology(
    "schema-evolution-karapace",
    {
      "schema-registry": "schema",
      "compatibility-gate": "schema",
    },
    {
      "producer-registry": "data",
      "registry-gate": "control",
      "gate-topic": "control",
      "topic-group": "data",
    },
    {
      producer: rank(0),
      "schema-registry": rank(1),
      "compatibility-gate": rank(2),
      topic: rank(3),
      consumerGroup: rank(4),
    },
    true,
  ),
  "transactional-producers": defineTopology(
    "transactional-producers",
    {
      "transaction-coordinator": "transaction",
      "commit-boundary": "commit",
    },
    {
      "producer-coordinator": "data",
      "coordinator-boundary": "control",
      "boundary-topic": "control",
      "topic-group": "data",
    },
    {
      producer: rank(0),
      "transaction-coordinator": rank(1),
      "commit-boundary": rank(2),
      topic: rank(3),
      consumerGroup: rank(4),
    },
    true,
  ),
  "event-replay-sourcing": defineTopology(
    "event-replay-sourcing",
    {
      "replay-cursor": "retry",
      "projection-store": "projection",
    },
    {
      "producer-topic": "data",
      "topic-cursor": "control",
      "cursor-projection": "data",
      "projection-group": "data",
    },
    {
      producer: rank(0),
      topic: rank(1),
      "replay-cursor": rank(2),
      "projection-store": rank(3),
      consumerGroup: rank(4),
    },
  ),
  "consumer-lag-backpressure": defineTopology(
    "consumer-lag-backpressure",
    {
      "backlog-buffer": "lag",
      "pressure-meter": "lag",
    },
    {
      "producer-topic": "data",
      "topic-backlog": "data",
      "backlog-group": "data",
      "group-pressure": "control",
    },
    {
      producer: rank(0),
      topic: rank(1),
      "backlog-buffer": rank(2),
      consumerGroup: rank(3),
      "pressure-meter": rank(4),
    },
  ),
  "hot-partitions-key-skew": defineTopology(
    "hot-partitions-key-skew",
    {
      "hot-key-router": "route",
      "hottest-partition": "hot",
    },
    {
      "producer-router": "data",
      "router-topic": "control",
      "topic-hotspot": "data",
      "hotspot-group": "control",
    },
    {
      producer: rank(0),
      "hot-key-router": rank(1),
      topic: rank(2),
      "hottest-partition": rank(3),
      consumerGroup: rank(4),
    },
    true,
  ),
  "log-compaction-tombstones": defineTopology(
    "log-compaction-tombstones",
    {
      "compacted-state-store": "compact",
      "tombstone-marker": "compact",
    },
    {
      "producer-topic": "data",
      "topic-state": "control",
      "topic-tombstone": "data",
      "tombstone-state": "control",
      "state-group": "data",
    },
    {
      producer: rank(0),
      topic: rank(1),
      "compacted-state-store": rank(2, -1),
      "tombstone-marker": rank(2, 1),
      consumerGroup: rank(3),
    },
  ),
  "retention-data-loss": defineTopology(
    "retention-data-loss",
    {
      "retention-window": "retention",
      "expired-boundary": "retention",
    },
    {
      "producer-topic": "data",
      "topic-window": "control",
      "window-boundary": "control",
      "boundary-group": "control",
    },
    {
      producer: rank(0),
      topic: rank(1),
      "retention-window": rank(2),
      "expired-boundary": rank(3),
      consumerGroup: rank(4),
    },
  ),
  "cooperative-rebalancing": defineTopology(
    "cooperative-rebalancing",
    {
      "rebalance-coordinator": "rebalance",
      "incremental-movement": "rebalance",
    },
    {
      "topic-coordinator": "control",
      "coordinator-delta": "ownership",
      "delta-group": "ownership",
    },
    {
      producer: rank(0, -1),
      topic: rank(1),
      "rebalance-coordinator": rank(2),
      "incremental-movement": rank(3),
      consumerGroup: rank(4),
    },
  ),
  "streams-joins-windows": defineTopology(
    "streams-joins-windows",
    {
      "orders-stream": "stream",
      "payments-stream": "stream",
      "window-state-store": "stream",
    },
    {
      "producer-orders": "data",
      "producer-payments": "data",
      "orders-window": "data",
      "payments-window": "data",
      "window-topic": "data",
      "topic-group": "data",
    },
    {
      producer: rank(0),
      "orders-stream": rank(1, -1),
      "payments-stream": rank(1, 1),
      "window-state-store": rank(2),
      topic: rank(3),
      consumerGroup: rank(4),
    },
    true,
  ),
  "outbox-cdc": defineTopology(
    "outbox-cdc",
    {
      "database-outbox": "database",
      "transaction-log": "database",
      "cdc-connector": "stream",
    },
    {
      "outbox-wal": "data",
      "wal-cdc": "data",
      "cdc-topic": "data",
      "topic-group": "data",
    },
    {
      "database-outbox": rank(0),
      "transaction-log": rank(1),
      "cdc-connector": rank(2),
      topic: rank(3),
      consumerGroup: rank(4),
    },
    true,
  ),
  "acl-least-privilege": defineTopology(
    "acl-least-privilege",
    {
      "principal-identity": "acl",
      "authorization-gate": "acl",
    },
    {
      "principal-gate": "control",
      "gate-producer": "control",
      "producer-topic": "data",
      "topic-group": "data",
    },
    {
      "principal-identity": rank(0),
      "authorization-gate": rank(1),
      producer: rank(2),
      topic: rank(3),
      consumerGroup: rank(4),
    },
  ),
} satisfies {
  [Id in ScenarioExperienceId]: ScenarioExploreTopologyDefinition<Id>;
};

export const SCENARIO_EXPLORE_TOPOLOGY_ALLOWLIST: ReadonlySet<ScenarioExperienceId> =
  new Set([
    "partitioning",
    "fan-out-load-balancing",
    "at-least-once-duplicates",
    "retry-dead-letter-queues",
    "schema-evolution-karapace",
    "transactional-producers",
    "event-replay-sourcing",
    "consumer-lag-backpressure",
    "hot-partitions-key-skew",
    "log-compaction-tombstones",
    "retention-data-loss",
    "cooperative-rebalancing",
    "streams-joins-windows",
    "outbox-cdc",
    "acl-least-privilege",
  ]);

export function isScenarioExploreTopologyEnabled(
  scenarioId: string,
  enabledScenarioIds: ReadonlySet<ScenarioExperienceId> = SCENARIO_EXPLORE_TOPOLOGY_ALLOWLIST,
): scenarioId is ScenarioExperienceId {
  return (
    scenarioId in SCENARIO_EXPLORE_TOPOLOGY_DEFINITIONS &&
    enabledScenarioIds.has(scenarioId as ScenarioExperienceId)
  );
}

export function getScenarioExploreTopologyDefinition<
  Id extends ScenarioExperienceId,
>(scenarioId: Id): ScenarioExploreTopologyDefinition<Id> {
  return SCENARIO_EXPLORE_TOPOLOGY_DEFINITIONS[
    scenarioId
  ] as ScenarioExploreTopologyDefinition<Id>;
}

export function projectScenarioExploreTopology(
  frame: ScenarioExperienceFrame | null | undefined,
  options: ScenarioExploreTopologyProjectionOptions = {},
): ScenarioExploreTopologyProjection | null {
  if (!frame) return null;
  const enabledScenarioIds =
    options.enabledScenarioIds ?? SCENARIO_EXPLORE_TOPOLOGY_ALLOWLIST;
  if (!isScenarioExploreTopologyEnabled(frame.scenarioId, enabledScenarioIds)) {
    return null;
  }

  const definition = getScenarioExploreTopologyDefinition(frame.scenarioId);
  const graphNodes = uniqueVisibleNodes(frame.causalGraph.nodes);
  const visibleNodeIds = new Set(graphNodes.map((node) => node.id));
  const graphEdges = uniqueValidEdges(
    frame.causalGraph.edges,
    visibleNodeIds,
  ).sort(compareEdges);
  const nodeDefinitions = new Map(
    definition.nodes.map((nodeDefinition) => [
      nodeDefinition.id,
      nodeDefinition,
    ]),
  );
  const edgeDefinitions = new Map(
    definition.edges.map((edgeDefinition) => [
      edgeDefinition.id,
      edgeDefinition,
    ]),
  );
  const ranks = calculateRanks(
    graphNodes,
    graphEdges,
    definition,
    edgeDefinitions,
  );
  const lanes = new Map(
    graphNodes.map((node) => [
      node.id,
      definition.layout?.[node.id]?.lane ??
        nodeDefinitions.get(node.id)?.lane ??
        0,
    ]),
  );
  const orderedNodes = [...graphNodes].sort((left, right) =>
    compareLayout(left.id, right.id, ranks, lanes),
  );
  const rankIndexes = indexesWithinRanks(orderedNodes, ranks);
  const nodes = orderedNodes.map((node) => {
    const nodeDefinition = nodeDefinitions.get(node.id);
    const nodeKind = CORE_NODE_IDS.has(node.id) ? "core" : "scenario";
    const rankValue = ranks.get(node.id) ?? 0;
    const lane = lanes.get(node.id) ?? 0;
    const index = rankIndexes.get(node.id) ?? 0;
    return {
      id: node.id,
      entityId: node.focus.id,
      nodeKind,
      visualKind: visualKindForNode(node.id, nodeDefinition?.visualKind),
      title: node.title,
      description: node.description,
      provenance: node.provenance,
      ...(node.state ? { state: node.state } : {}),
      ...(node.metric ? { metric: node.metric } : {}),
      focus: node.focus,
      rank: rankValue,
      lane,
      position: positionFor(rankValue, index),
    } satisfies ScenarioExploreTopologyNode;
  });
  const edges = graphEdges.map(
    (edge) =>
      ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        kind: edgeDefinitions.get(edge.id)?.kind ?? "data",
        provenance: edge.provenance,
        scope: edge.scope,
        active: Boolean(edge.active),
      }) satisfies ScenarioExploreTopologyEdge,
  );
  const scenarioNodeIds = new Set(
    nodes.filter((node) => node.nodeKind === "scenario").map((node) => node.id),
  );
  const coreNodeIds = new Set(
    nodes.filter((node) => node.nodeKind === "core").map((node) => node.id),
  );
  const coreProducerTopicRoute = deriveCoreProducerTopicRoute(
    nodes,
    edges,
    definition.replacesCoreProducerTopicEdge,
  );

  return {
    scenarioId: frame.scenarioId,
    definition,
    nodes,
    edges,
    scenarioNodeIds,
    coreNodeIds,
    replacesCoreProducerTopicEdge: definition.replacesCoreProducerTopicEdge,
    coreProducerTopicRoute,
  };
}

export function validateScenarioExploreTopologyGraph(
  frame: ScenarioExperienceFrame,
): readonly ScenarioExploreTopologyGraphIssue[] {
  const definition = getScenarioExploreTopologyDefinition(frame.scenarioId);
  const issues: ScenarioExploreTopologyGraphIssue[] = [];
  const nodeIds = new Set<string>();
  const visibleNodeIds = new Set<string>();
  for (const node of frame.causalGraph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ kind: "duplicate-node-id", id: node.id });
      continue;
    }
    nodeIds.add(node.id);
    if (!isPartitionNodeId(node.id)) visibleNodeIds.add(node.id);
  }
  const definedNodeIds = new Set(definition.nodes.map((node) => node.id));
  for (const nodeId of visibleNodeIds) {
    if (!CORE_NODE_IDS.has(nodeId) && !definedNodeIds.has(nodeId)) {
      issues.push({ kind: "missing-node-definition", id: nodeId });
    }
  }

  const edgeIds = new Set<string>();
  const definedEdgeIds = new Set(definition.edges.map((edge) => edge.id));
  for (const edge of frame.causalGraph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ kind: "duplicate-edge-id", id: edge.id });
      continue;
    }
    edgeIds.add(edge.id);
    if (isPartitionNodeId(edge.source) || isPartitionNodeId(edge.target)) {
      continue;
    }
    if (!visibleNodeIds.has(edge.source)) {
      issues.push({
        kind: "invalid-edge-endpoint",
        id: edge.id,
        endpoint: edge.source,
      });
    }
    if (!visibleNodeIds.has(edge.target)) {
      issues.push({
        kind: "invalid-edge-endpoint",
        id: edge.id,
        endpoint: edge.target,
      });
    }
    if (!definedEdgeIds.has(edge.id)) {
      issues.push({ kind: "missing-edge-definition", id: edge.id });
    }
  }
  return issues;
}

function defineTopology<Id extends ScenarioExperienceId>(
  scenarioId: Id,
  nodes: Readonly<Record<string, ScenarioTopologyIcon>>,
  edges: Readonly<Record<string, ScenarioExploreTopologyEdgeKind>>,
  layout: NonNullable<ScenarioExploreTopologyDefinition["layout"]>,
  replacesCoreProducerTopicEdge = false,
): ScenarioExploreTopologyDefinition<Id> {
  return {
    scenarioId,
    nodes: Object.entries(nodes).map(([id, visualKind]) => ({
      id,
      visualKind,
      ...layout[id],
    })),
    edges: Object.entries(edges).map(([id, kind]) => ({ id, kind })),
    layout,
    replacesCoreProducerTopicEdge,
  };
}

function rank(rankValue: number, lane = 0) {
  return { rank: rankValue, lane };
}

function uniqueVisibleNodes(
  graphNodes: readonly CausalGraphNode[],
): CausalGraphNode[] {
  const nodesById = new Map<string, CausalGraphNode>();
  for (const node of graphNodes) {
    if (!isPartitionNodeId(node.id) && !nodesById.has(node.id)) {
      nodesById.set(node.id, node);
    }
  }
  return [...nodesById.values()];
}

function uniqueValidEdges(
  graphEdges: readonly CausalGraphEdge[],
  visibleNodeIds: ReadonlySet<string>,
): CausalGraphEdge[] {
  const edgesById = new Map<string, CausalGraphEdge>();
  for (const edge of graphEdges) {
    if (!edgesById.has(edge.id)) edgesById.set(edge.id, edge);
  }
  return [...edgesById.values()].filter(
    (edge) =>
      !isPartitionNodeId(edge.source) &&
      !isPartitionNodeId(edge.target) &&
      visibleNodeIds.has(edge.source) &&
      visibleNodeIds.has(edge.target),
  );
}

function calculateRanks(
  nodes: readonly CausalGraphNode[],
  edges: readonly CausalGraphEdge[],
  definition: ScenarioExploreTopologyDefinition,
  edgeDefinitions: ReadonlyMap<
    string,
    { kind: ScenarioExploreTopologyEdgeKind }
  >,
): Map<string, number> {
  const explicitRanks = new Map<string, number>();
  for (const node of nodes) {
    const hintedRank = definition.layout?.[node.id]?.rank;
    if (hintedRank !== undefined) explicitRanks.set(node.id, hintedRank);
  }
  const ranks = new Map(
    nodes.map((node) => [node.id, explicitRanks.get(node.id) ?? 0]),
  );
  const indegrees = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, CausalGraphEdge[]>();
  for (const edge of edges) {
    if (edgeDefinitions.get(edge.id)?.kind === "feedback") continue;
    indegrees.set(edge.target, (indegrees.get(edge.target) ?? 0) + 1);
    const targetEdges = outgoing.get(edge.source) ?? [];
    targetEdges.push(edge);
    outgoing.set(edge.source, targetEdges);
  }
  for (const targetEdges of outgoing.values()) {
    targetEdges.sort((left, right) =>
      left.target === right.target
        ? left.id.localeCompare(right.id)
        : left.target.localeCompare(right.target),
    );
  }

  const queue = [...indegrees]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  while (queue.length > 0) {
    const source = queue.shift();
    if (source === undefined) break;
    for (const edge of outgoing.get(source) ?? []) {
      if (!explicitRanks.has(edge.target)) {
        ranks.set(
          edge.target,
          Math.max(ranks.get(edge.target) ?? 0, (ranks.get(source) ?? 0) + 1),
        );
      }
      const nextDegree = (indegrees.get(edge.target) ?? 1) - 1;
      indegrees.set(edge.target, nextDegree);
      if (nextDegree === 0) {
        insertSorted(queue, edge.target);
      }
    }
  }
  return ranks;
}

function indexesWithinRanks(
  orderedNodes: readonly CausalGraphNode[],
  ranks: ReadonlyMap<string, number>,
): Map<string, number> {
  const counts = new Map<number, number>();
  const indexes = new Map<string, number>();
  for (const node of orderedNodes) {
    const rankValue = ranks.get(node.id) ?? 0;
    const index = counts.get(rankValue) ?? 0;
    indexes.set(node.id, index);
    counts.set(rankValue, index + 1);
  }
  return indexes;
}

function compareLayout(
  leftId: string,
  rightId: string,
  ranks: ReadonlyMap<string, number>,
  lanes: ReadonlyMap<string, number>,
): number {
  return (
    (ranks.get(leftId) ?? 0) - (ranks.get(rightId) ?? 0) ||
    (lanes.get(leftId) ?? 0) - (lanes.get(rightId) ?? 0) ||
    leftId.localeCompare(rightId)
  );
}

function compareEdges(left: CausalGraphEdge, right: CausalGraphEdge) {
  return (
    left.source.localeCompare(right.source) ||
    left.target.localeCompare(right.target) ||
    left.id.localeCompare(right.id)
  );
}

function positionFor(rankValue: number, indexWithinRank: number) {
  return {
    x: rankValue * (SCENARIO_EXPLORE_NODE_WIDTH + SCENARIO_EXPLORE_COLUMN_GAP),
    y:
      indexWithinRank *
      (SCENARIO_EXPLORE_NODE_HEIGHT + SCENARIO_EXPLORE_ROW_GAP),
  };
}

function visualKindForNode(
  nodeId: string,
  scenarioVisualKind: ScenarioTopologyIcon | undefined,
): ScenarioExploreTopologyVisualKind {
  if (nodeId === "producer") return "producer";
  if (nodeId === "topic") return "topic";
  if (nodeId === "consumerGroup") return "consumer-group";
  return scenarioVisualKind ?? "stream";
}

function deriveCoreProducerTopicRoute(
  nodes: readonly ScenarioExploreTopologyNode[],
  edges: readonly ScenarioExploreTopologyEdge[],
  replacesCoreProducerTopicEdge: boolean,
): ScenarioExploreTopologyCoreRoute | null {
  if (
    replacesCoreProducerTopicEdge ||
    edges.some((edge) => edge.source === "producer" && edge.target === "topic")
  ) {
    return null;
  }
  const producer = nodes.find((node) => node.id === "producer");
  const topic = nodes.find((node) => node.id === "topic");
  if (!producer || !topic) return null;
  return {
    id: "core-producer-topic",
    source: "producer",
    target: "topic",
    label: "Routes records to the topic",
    kind: "data",
    provenance: topic.provenance,
    scope: "current",
    active: false,
  };
}

function isPartitionNodeId(id: string) {
  return PARTITION_NODE_PATTERN.test(id);
}

function insertSorted(values: string[], value: string) {
  const index = values.findIndex(
    (candidate) => candidate.localeCompare(value) > 0,
  );
  if (index === -1) values.push(value);
  else values.splice(index, 0, value);
}
