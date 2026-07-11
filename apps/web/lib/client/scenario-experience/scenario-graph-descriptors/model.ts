import type { ScenarioTopologyIcon } from "../../scenario-topology-model";
import type {
  Provenance,
  ScenarioExperienceId,
  ScenarioExploreTopologyDefinition,
  ScenarioExploreTopologyEdgeKind,
  ScenarioExploreTopologyVisualKind,
} from "../model";

export type ScenarioGraphLayout = {
  rank: number;
  lane: number;
};

type ScenarioGraphNodeDescriptorBase = {
  id: string;
  title: string;
  description: string;
  provenance: Provenance;
  layout: ScenarioGraphLayout;
};

export type ScenarioGraphCoreNodeDescriptor =
  ScenarioGraphNodeDescriptorBase & {
    nodeKind: "core";
    visualKind: Extract<
      ScenarioExploreTopologyVisualKind,
      "producer" | "topic" | "consumer-group"
    >;
  };

export type ScenarioGraphScenarioNodeDescriptor =
  ScenarioGraphNodeDescriptorBase & {
    nodeKind: "scenario";
    visualKind: ScenarioTopologyIcon;
  };

export type ScenarioGraphNodeDescriptor =
  | ScenarioGraphCoreNodeDescriptor
  | ScenarioGraphScenarioNodeDescriptor;

export type ScenarioGraphEdgeDescriptor = {
  id: string;
  source: string;
  target: string;
  label: string;
  provenance: Provenance;
  kind: ScenarioExploreTopologyEdgeKind;
};

export type ScenarioGraphDescriptor<
  Id extends ScenarioExperienceId = ScenarioExperienceId,
> = {
  scenarioId: Id;
  nodes: readonly ScenarioGraphNodeDescriptor[];
  edges: readonly ScenarioGraphEdgeDescriptor[];
  partitions?: boolean;
  replacesCoreProducerTopicEdge?: boolean;
};

export type ScenarioGraphDescriptorCatalog = {
  [Id in ScenarioExperienceId]: ScenarioGraphDescriptor<Id>;
};

export type ScenarioGraphDescriptorCatalogSubset<
  Id extends ScenarioExperienceId,
> = {
  [Key in Id]: ScenarioGraphDescriptor<Key>;
};

export type ScenarioExploreTopologyDefinitionCatalog = {
  [Id in ScenarioExperienceId]: ScenarioExploreTopologyDefinition<Id>;
};
