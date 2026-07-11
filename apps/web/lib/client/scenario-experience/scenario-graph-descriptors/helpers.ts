import type { ScenarioTopologyIcon } from "../../scenario-topology-model";
import type {
  Provenance,
  ScenarioExperienceId,
  ScenarioExploreTopologyEdgeKind,
} from "../model";
import type {
  ScenarioGraphCoreNodeDescriptor,
  ScenarioGraphDescriptor,
  ScenarioGraphEdgeDescriptor,
  ScenarioGraphLayout,
  ScenarioGraphScenarioNodeDescriptor,
} from "./model";

const coreNodeCopy = {
  producer: {
    title: "Producer boundary",
    description: "The application operation before a Kafka write.",
    visualKind: "producer",
  },
  topic: {
    title: "Kafka topic",
    description: "The durable Kafka log and its partitions.",
    visualKind: "topic",
  },
  consumerGroup: {
    title: "Consumer group",
    description: "The group that owns partitions and commits progress.",
    visualKind: "consumer-group",
  },
} as const;

type CoreNodeId = keyof typeof coreNodeCopy;

type CoreNodeLayouts = {
  [Id in CoreNodeId]: ScenarioGraphLayout;
};

export function descriptor<Id extends ScenarioExperienceId>(
  value: ScenarioGraphDescriptor<Id>,
): ScenarioGraphDescriptor<Id> {
  return value;
}

export function layout(rank: number, lane = 0): ScenarioGraphLayout {
  return { rank, lane };
}

export function coreNode(
  id: CoreNodeId,
  nodeLayout: ScenarioGraphLayout,
): ScenarioGraphCoreNodeDescriptor {
  return {
    id,
    nodeKind: "core",
    provenance: "observed",
    layout: nodeLayout,
    ...coreNodeCopy[id],
  };
}

export function coreNodes(
  layouts: CoreNodeLayouts,
): readonly ScenarioGraphCoreNodeDescriptor[] {
  return [
    coreNode("producer", layouts.producer),
    coreNode("topic", layouts.topic),
    coreNode("consumerGroup", layouts.consumerGroup),
  ];
}

export function scenarioNode(
  id: string,
  title: string,
  description: string,
  provenance: Provenance,
  visualKind: ScenarioTopologyIcon,
  nodeLayout: ScenarioGraphLayout,
): ScenarioGraphScenarioNodeDescriptor {
  return {
    id,
    nodeKind: "scenario",
    title,
    description,
    provenance,
    visualKind,
    layout: nodeLayout,
  };
}

export function scenarioEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  provenance: Provenance,
  kind: ScenarioExploreTopologyEdgeKind,
): ScenarioGraphEdgeDescriptor {
  return { id, source, target, label, provenance, kind };
}
