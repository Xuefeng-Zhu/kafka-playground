import { scenarioStateIds } from "@kplay/contracts";
import { describe, expect, it } from "vitest";
import { getScenarioExploreTopologyDefinition } from "./explore-topology";
import { buildScenarioGraph } from "./graphs";
import type { ScenarioExperienceSnapshot } from "./model";
import { SCENARIO_GRAPH_DESCRIPTORS } from "./scenario-graph-descriptors";

describe("scenario graph descriptor catalog", () => {
  it("is complete and keeps graph and topology IDs consistent", () => {
    expect(Object.keys(SCENARIO_GRAPH_DESCRIPTORS)).toEqual(scenarioStateIds);

    for (const scenarioId of scenarioStateIds) {
      const descriptor = SCENARIO_GRAPH_DESCRIPTORS[scenarioId];
      const definition = getScenarioExploreTopologyDefinition(scenarioId);
      const nodeIds = descriptor.nodes.map((node) => node.id);
      const edgeIds = descriptor.edges.map((edge) => edge.id);
      const nodeIdSet = new Set(nodeIds);

      expect(descriptor.scenarioId).toBe(scenarioId);
      expect(nodeIdSet.size, `${scenarioId}: duplicate node ID`).toBe(
        nodeIds.length,
      );
      expect(new Set(edgeIds).size, `${scenarioId}: duplicate edge ID`).toBe(
        edgeIds.length,
      );
      for (const edge of descriptor.edges) {
        expect(
          nodeIdSet.has(edge.source),
          `${scenarioId}:${edge.id}:source`,
        ).toBe(true);
        expect(
          nodeIdSet.has(edge.target),
          `${scenarioId}:${edge.id}:target`,
        ).toBe(true);
      }

      expect(definition.scenarioId).toBe(scenarioId);
      expect(definition.nodes.map((node) => node.id).sort()).toEqual(
        descriptor.nodes
          .filter((node) => node.nodeKind === "scenario")
          .map((node) => node.id)
          .sort(),
      );
      expect(definition.edges.map((edge) => edge.id)).toEqual(edgeIds);
      expect(Object.keys(definition.layout ?? {}).sort()).toEqual(
        [...nodeIds].sort(),
      );
      for (const node of descriptor.nodes) {
        expect(definition.layout?.[node.id]).toEqual(node.layout);
        if (node.nodeKind === "scenario") {
          expect(
            definition.nodes.find((candidate) => candidate.id === node.id),
          ).toMatchObject({ visualKind: node.visualKind });
        }
      }
      for (const edge of descriptor.edges) {
        expect(
          definition.edges.find((candidate) => candidate.id === edge.id),
        ).toEqual({ id: edge.id, kind: edge.kind });
      }
      expect(definition.replacesCoreProducerTopicEdge).toBe(
        Boolean(descriptor.replacesCoreProducerTopicEdge),
      );

      const graph = buildScenarioGraph(scenarioId, snapshotFor(scenarioId));
      expect(
        graph.nodes
          .filter((node) => !node.id.startsWith("partition-"))
          .map((node) => node.id),
      ).toEqual(nodeIds);
      expect(
        graph.edges
          .filter((edge) => !edge.id.startsWith("topic-partition-"))
          .map((edge) => edge.id),
      ).toEqual(edgeIds);
      expect(
        graph.nodes.filter((node) => node.id.startsWith("partition-")),
      ).toHaveLength(descriptor.partitions ? 3 : 0);
    }
  });
});

function snapshotFor(
  scenarioId: (typeof scenarioStateIds)[number],
): ScenarioExperienceSnapshot {
  return {
    scenarioId,
    scenarioState: null,
    mode: "demo",
    partitionCount: 3,
    topicName: "descriptor-test-topic",
    recentMessages: [],
    completedExperimentIds: [],
  };
}
