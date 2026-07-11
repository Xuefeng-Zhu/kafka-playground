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
import { createScenarioExploreTopologyDefinitions } from "./scenario-graph-descriptors";

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

export type ScenarioExploreTopologyGraphIssue =
  | { kind: "duplicate-node-id"; id: string }
  | { kind: "duplicate-edge-id"; id: string }
  | { kind: "invalid-edge-endpoint"; id: string; endpoint: string }
  | { kind: "missing-node-definition"; id: string }
  | { kind: "missing-edge-definition"; id: string };

export const SCENARIO_EXPLORE_TOPOLOGY_DEFINITIONS =
  createScenarioExploreTopologyDefinitions();

export function getScenarioExploreTopologyDefinition<
  Id extends ScenarioExperienceId,
>(scenarioId: Id): ScenarioExploreTopologyDefinition<Id> {
  return SCENARIO_EXPLORE_TOPOLOGY_DEFINITIONS[scenarioId];
}

export function projectScenarioExploreTopology(
  frame: ScenarioExperienceFrame | null | undefined,
): ScenarioExploreTopologyProjection | null {
  if (!frame) return null;

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
