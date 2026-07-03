import type { RunSnapshot } from "@kplay/contracts";

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

export type ScenarioTopologyContext = {
  snapshot: RunSnapshot;
  produced: number;
  committed: number;
  failed: number;
  lag: number;
  latestMessage: RunSnapshot["recentMessages"][number] | undefined;
  activeMembers: number;
  idleMembers: number;
};

type ScenarioNodeInput = Omit<ScenarioTopologyNode, "compactPosition"> & {
  compactIndex: number;
};

const wideScenarioPositions = [
  { x: 92, y: 32 },
  { x: 1304, y: 372 },
  { x: 92, y: 460 },
] as const;

export function createScenarioTopologyContext(
  snapshot: RunSnapshot,
): ScenarioTopologyContext {
  const produced = snapshot.messageCounts.produced ?? 0;
  const committed = snapshot.messageCounts.committed ?? 0;
  const failed =
    snapshot.messageCounts.failed ??
    snapshot.recentMessages.filter((message) => message.state === "failed")
      .length;
  const lag = Math.max(0, produced - committed - failed);
  const activeMembers = snapshot.consumers.filter(
    (consumer) => consumer.assignments.length > 0,
  ).length;
  const idleMembers = snapshot.consumers.filter(
    (consumer) => consumer.assignments.length === 0,
  ).length;

  return {
    snapshot,
    produced,
    committed,
    failed,
    lag,
    latestMessage: snapshot.recentMessages.at(-1),
    activeMembers,
    idleMembers,
  };
}

export function model(
  nodes: ScenarioTopologyNode[],
  edges: ScenarioTopologyEdge[],
): ScenarioTopologyModel {
  return { nodes, edges };
}

export function node(input: ScenarioNodeInput): ScenarioTopologyNode {
  const { compactIndex, ...rest } = input;
  return {
    ...rest,
    position: wideScenarioPosition(compactIndex),
    compactPosition: {
      x: 390,
      y: 112 + compactIndex * 132,
    },
  };
}

function wideScenarioPosition(compactIndex: number) {
  return (
    wideScenarioPositions[compactIndex] ?? {
      x: 1304,
      y: 372 + (compactIndex - 1) * 176,
    }
  );
}

export function edge(
  id: string,
  source: string,
  target: string,
  tone: ScenarioTopologyTone,
  options: Omit<ScenarioTopologyEdge, "id" | "source" | "target" | "tone"> = {},
): ScenarioTopologyEdge {
  return { id, source, target, tone, ...options };
}
