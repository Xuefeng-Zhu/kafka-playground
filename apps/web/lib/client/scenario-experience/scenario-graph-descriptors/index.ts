import { scenarioStateIds } from "@kplay/contracts";
import { deliveryScenarioGraphDescriptors } from "./delivery";
import { fundamentalScenarioGraphDescriptors } from "./fundamentals";
import { gateScenarioGraphDescriptors } from "./gates";
import { historyScenarioGraphDescriptors } from "./history";
import { pipelineScenarioGraphDescriptors } from "./pipelines";
import type {
  ScenarioGraphDescriptor,
  ScenarioGraphDescriptorCatalog,
  ScenarioGraphNodeDescriptor,
  ScenarioGraphScenarioNodeDescriptor,
  ScenarioExploreTopologyDefinitionCatalog,
} from "./model";
import type {
  ScenarioExperienceId,
  ScenarioExploreTopologyDefinition,
} from "../model";

const scenarioGraphDescriptorsById = {
  ...fundamentalScenarioGraphDescriptors,
  ...deliveryScenarioGraphDescriptors,
  ...gateScenarioGraphDescriptors,
  ...historyScenarioGraphDescriptors,
  ...pipelineScenarioGraphDescriptors,
} satisfies ScenarioGraphDescriptorCatalog;

export const SCENARIO_GRAPH_DESCRIPTORS = Object.fromEntries(
  scenarioStateIds.map((scenarioId) => [
    scenarioId,
    scenarioGraphDescriptorsById[scenarioId],
  ]),
) as ScenarioGraphDescriptorCatalog;

export function createScenarioExploreTopologyDefinitions(): ScenarioExploreTopologyDefinitionCatalog {
  const entries = Object.values(SCENARIO_GRAPH_DESCRIPTORS).map(
    (descriptor) => [
      descriptor.scenarioId,
      createScenarioExploreTopologyDefinition(descriptor),
    ],
  );

  // Object.fromEntries cannot retain the key/value generic correlation. The
  // catalog completeness check above makes this the single construction boundary.
  return Object.fromEntries(
    entries,
  ) as ScenarioExploreTopologyDefinitionCatalog;
}

function createScenarioExploreTopologyDefinition<
  Id extends ScenarioExperienceId,
>(
  descriptor: ScenarioGraphDescriptor<Id>,
): ScenarioExploreTopologyDefinition<Id> {
  const orderedNodes = [...descriptor.nodes].sort(compareLayout);
  return {
    scenarioId: descriptor.scenarioId,
    nodes: orderedNodes
      .filter(isScenarioNode)
      .map(({ id, visualKind, layout }) => ({
        id,
        visualKind,
        ...layout,
      })),
    edges: descriptor.edges.map(({ id, kind }) => ({ id, kind })),
    layout: Object.fromEntries(
      orderedNodes.map(({ id, layout }) => [id, layout]),
    ),
    replacesCoreProducerTopicEdge: Boolean(
      descriptor.replacesCoreProducerTopicEdge,
    ),
  };
}

function isScenarioNode(
  node: ScenarioGraphNodeDescriptor,
): node is ScenarioGraphScenarioNodeDescriptor {
  return node.nodeKind === "scenario";
}

function compareLayout(
  left: ScenarioGraphNodeDescriptor,
  right: ScenarioGraphNodeDescriptor,
) {
  return (
    left.layout.rank - right.layout.rank ||
    left.layout.lane - right.layout.lane ||
    left.id.localeCompare(right.id)
  );
}
