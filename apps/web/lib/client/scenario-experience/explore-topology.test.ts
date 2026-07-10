import type { ScenarioState } from "@kplay/contracts";
import { describe, expect, it } from "vitest";
import { runSnapshot } from "../run-snapshot-test-fixtures";
import {
  getScenarioExploreTopologyDefinition,
  isScenarioExploreTopologyEnabled,
  projectScenarioExploreTopology,
  SCENARIO_EXPLORE_COLUMN_GAP,
  SCENARIO_EXPLORE_NODE_WIDTH,
  SCENARIO_EXPLORE_ROW_GAP,
  SCENARIO_EXPLORE_TOPOLOGY_ALLOWLIST,
  SCENARIO_EXPLORE_TOPOLOGY_DEFINITIONS,
  validateScenarioExploreTopologyGraph,
} from "./explore-topology";
import type { ScenarioExperienceFrame, ScenarioExperienceId } from "./model";
import { SCENARIO_EXPERIENCE_IDS } from "./model";
import {
  projectScenarioExperience,
  scenarioExperienceRegistry,
} from "./registry";
import { teachingScenarioTestManifest } from "./scenario-experience.test-manifest";

const distinctiveExtensions = {
  partitioning: ["key-router", "producer-router"],
  "fan-out-load-balancing": ["group-balancer", "balancer-group"],
  "at-least-once-duplicates": ["replay-loop", "replay-group"],
  "retry-dead-letter-queues": ["dead-letter-topic", "retry-dlq"],
  "schema-evolution-karapace": ["compatibility-gate", "gate-topic"],
  "transactional-producers": ["commit-boundary", "boundary-topic"],
  "event-replay-sourcing": ["replay-cursor", "topic-cursor"],
  "consumer-lag-backpressure": ["backlog-buffer", "topic-backlog"],
  "hot-partitions-key-skew": ["hottest-partition", "topic-hotspot"],
  "log-compaction-tombstones": ["tombstone-marker", "tombstone-state"],
  "retention-data-loss": ["expired-boundary", "boundary-group"],
  "cooperative-rebalancing": ["incremental-movement", "delta-group"],
  "streams-joins-windows": ["window-state-store", "window-topic"],
  "outbox-cdc": ["cdc-connector", "cdc-topic"],
  "acl-least-privilege": ["authorization-gate", "gate-producer"],
} as const satisfies Record<
  ScenarioExperienceId,
  readonly [nodeId: string, edgeId: string]
>;

describe("scenario Explore topology definitions", () => {
  it("covers and separately enables all 15 teaching scenarios", () => {
    const expected = [...SCENARIO_EXPERIENCE_IDS].sort();

    expect(Object.keys(SCENARIO_EXPLORE_TOPOLOGY_DEFINITIONS).sort()).toEqual(
      expected,
    );
    expect([...SCENARIO_EXPLORE_TOPOLOGY_ALLOWLIST].sort()).toEqual(expected);
    for (const scenarioId of SCENARIO_EXPERIENCE_IDS) {
      expect(isScenarioExploreTopologyEnabled(scenarioId)).toBe(true);
      expect(scenarioExperienceRegistry[scenarioId].exploreTopology).toBe(
        getScenarioExploreTopologyDefinition(scenarioId),
      );
    }
  });

  for (const entry of teachingScenarioTestManifest) {
    it(`${entry.scenarioId} projects a valid, stable extension and route`, () => {
      const frames = [entry.initial, entry.pivotal, entry.contrast].map(
        (state) => frameFor(entry.scenarioId, state),
      );
      const projections = frames.map((frame) => {
        expect(validateScenarioExploreTopologyGraph(frame)).toEqual([]);
        const projection = projectScenarioExploreTopology(frame);
        expect(projection).not.toBeNull();
        return projection!;
      });
      const [nodeId, edgeId] = distinctiveExtensions[entry.scenarioId];
      const first = projections[0];

      expect(first.scenarioNodeIds.has(nodeId)).toBe(true);
      expect(first.edges.some((edge) => edge.id === edgeId)).toBe(true);
      expect(first.nodes.some((node) => /^partition-\d+$/.test(node.id))).toBe(
        false,
      );
      expect(
        first.edges.some(
          (edge) =>
            /^partition-\d+$/.test(edge.source) ||
            /^partition-\d+$/.test(edge.target),
        ),
      ).toBe(false);
      expect(new Set(first.nodes.map((node) => node.id)).size).toBe(
        first.nodes.length,
      );
      expect(new Set(first.edges.map((edge) => edge.id)).size).toBe(
        first.edges.length,
      );
      for (const node of first.nodes) {
        expect(node.entityId).toBe(node.focus.id);
        expect(node.provenance).toMatch(/^(observed|derived|simulated)$/);
        expect(Number.isFinite(node.position.x)).toBe(true);
        expect(Number.isFinite(node.position.y)).toBe(true);
      }
      for (const edge of first.edges) {
        const source = first.nodes.find((node) => node.id === edge.source);
        const target = first.nodes.find((node) => node.id === edge.target);
        expect(source).toBeDefined();
        expect(target).toBeDefined();
        expect(edge.kind).toMatch(/^(data|control|ownership|feedback)$/);
        expect(edge.provenance).toMatch(/^(observed|derived|simulated)$/);
        if (edge.kind === "feedback") {
          expect(source!.rank).toBeGreaterThan(target!.rank);
        } else if (source!.rank === target!.rank) {
          expect(source!.lane).not.toBe(target!.lane);
        } else {
          expect(target!.rank).toBeGreaterThan(source!.rank);
        }
      }

      const stableLayout = first.nodes.map(stableNode);
      const stableEdges = first.edges.map(stableEdge);
      for (const projection of projections.slice(1)) {
        expect(projection.nodes.map(stableNode)).toEqual(stableLayout);
        expect(projection.edges.map(stableEdge)).toEqual(stableEdges);
      }
    });
  }
});

describe("scenario Explore topology projection", () => {
  it("ignores the declared redelivery and retry feedback edges for ranking", () => {
    const duplicates = projectionFor("at-least-once-duplicates");
    const retries = projectionFor("retry-dead-letter-queues");

    expect(
      duplicates.edges.find((edge) => edge.id === "replay-group")?.kind,
    ).toBe("feedback");
    expect(retries.edges.find((edge) => edge.id === "retry-group")?.kind).toBe(
      "feedback",
    );
    expect(rankOf(duplicates, "consumerGroup")).toBeLessThan(
      rankOf(duplicates, "replay-loop"),
    );
    expect(rankOf(retries, "consumerGroup")).toBeLessThan(
      rankOf(retries, "retry-topic"),
    );
  });

  it("keeps a provenance-labelled core route separate from scenario evidence", () => {
    const cooperative = projectionFor("cooperative-rebalancing");
    const retry = projectionFor("retry-dead-letter-queues");
    const partitioning = projectionFor("partitioning");

    expect(cooperative.coreProducerTopicRoute).toEqual({
      id: "core-producer-topic",
      source: "producer",
      target: "topic",
      label: "Routes records to the topic",
      kind: "data",
      provenance: "simulated",
      scope: "current",
      active: false,
    });
    expect(
      cooperative.edges.some(
        (edge) => edge.source === "producer" && edge.target === "topic",
      ),
    ).toBe(false);
    expect(retry.coreProducerTopicRoute).toBeNull();
    expect(partitioning.coreProducerTopicRoute).toBeNull();
  });

  it("orders same-rank branches by lane and then ID", () => {
    const streams = projectionFor("streams-joins-windows");
    const branchIds = streams.nodes
      .filter((node) => node.rank === 1)
      .map((node) => node.id);

    expect(branchIds).toEqual(["orders-stream", "payments-stream"]);
    expect(
      streams.nodes.find((node) => node.id === "orders-stream")?.lane,
    ).toBe(-1);
    expect(
      streams.nodes.find((node) => node.id === "payments-stream")?.lane,
    ).toBe(1);
  });

  it("reserves a full desktop label lane between adjacent ranks", () => {
    const partitioning = projectionFor("partitioning");
    const producer = partitioning.nodes.find((node) => node.id === "producer");
    const router = partitioning.nodes.find((node) => node.id === "key-router");

    expect(producer).toBeDefined();
    expect(router).toBeDefined();
    expect(router!.position.x - producer!.position.x).toBe(
      SCENARIO_EXPLORE_NODE_WIDTH + SCENARIO_EXPLORE_COLUMN_GAP,
    );
    expect(SCENARIO_EXPLORE_COLUMN_GAP).toBeGreaterThanOrEqual(240);
    expect(SCENARIO_EXPLORE_ROW_GAP).toBeGreaterThanOrEqual(80);
  });

  it("is deterministic when valid graph input order changes", () => {
    const frame = initialFrame("streams-joins-windows");
    const reversed: ScenarioExperienceFrame = {
      ...frame,
      causalGraph: {
        nodes: [...frame.causalGraph.nodes].reverse(),
        edges: [...frame.causalGraph.edges].reverse(),
      },
    };

    expect(projectScenarioExploreTopology(reversed)).toEqual(
      projectScenarioExploreTopology(frame),
    );
  });

  it("reports malformed graph records and projects a safe deduplicated graph", () => {
    const frame = initialFrame("partitioning");
    const firstNode = frame.causalGraph.nodes[0];
    const firstEdge = frame.causalGraph.edges[0];
    const malformed: ScenarioExperienceFrame = {
      ...frame,
      causalGraph: {
        nodes: [
          ...frame.causalGraph.nodes,
          { ...firstNode, title: "Duplicate must not win" },
          {
            id: "future-extension",
            title: "Future extension",
            description: "Unknown metadata remains safely projectable.",
            provenance: "simulated",
            focus: { kind: "entity", id: "future-extension" },
          },
        ],
        edges: [
          ...frame.causalGraph.edges,
          { ...firstEdge },
          {
            id: "invalid-endpoint",
            source: "future-extension",
            target: "missing-node",
            label: "invalid",
            provenance: "simulated",
            scope: "current",
          },
          {
            id: "future-route",
            source: "producer",
            target: "future-extension",
            label: "future route",
            provenance: "simulated",
            scope: "current",
          },
        ],
      },
    };

    expect(validateScenarioExploreTopologyGraph(malformed)).toEqual(
      expect.arrayContaining([
        { kind: "duplicate-node-id", id: firstNode.id },
        { kind: "duplicate-edge-id", id: firstEdge.id },
        { kind: "missing-node-definition", id: "future-extension" },
        {
          kind: "invalid-edge-endpoint",
          id: "invalid-endpoint",
          endpoint: "missing-node",
        },
        { kind: "missing-edge-definition", id: "future-route" },
      ]),
    );

    const projection = projectScenarioExploreTopology(malformed)!;
    expect(
      projection.nodes.filter((node) => node.id === firstNode.id),
    ).toHaveLength(1);
    expect(
      projection.edges.filter((edge) => edge.id === firstEdge.id),
    ).toHaveLength(1);
    expect(
      projection.edges.some((edge) => edge.id === "invalid-endpoint"),
    ).toBe(false);
    expect(
      projection.nodes.find((node) => node.id === "future-extension")
        ?.visualKind,
    ).toBe("stream");
  });

  it("returns no extension when state is missing or rollout is disabled", () => {
    const frame = initialFrame("partitioning");

    expect(projectScenarioExploreTopology(null)).toBeNull();
    expect(projectScenarioExploreTopology(undefined)).toBeNull();
    expect(
      projectScenarioExploreTopology(frame, {
        enabledScenarioIds: new Set(),
      }),
    ).toBeNull();
    expect(isScenarioExploreTopologyEnabled("not-a-scenario")).toBe(false);
  });
});

function initialFrame(scenarioId: ScenarioExperienceId) {
  const entry = teachingScenarioTestManifest.find(
    (candidate) => candidate.scenarioId === scenarioId,
  );
  if (!entry) throw new Error(`Missing test manifest entry for ${scenarioId}`);
  return frameFor(scenarioId, entry.initial);
}

function projectionFor(scenarioId: ScenarioExperienceId) {
  const projection = projectScenarioExploreTopology(initialFrame(scenarioId));
  if (!projection) throw new Error(`Missing projection for ${scenarioId}`);
  return projection;
}

function frameFor(scenarioId: ScenarioExperienceId, state: ScenarioState) {
  return projectScenarioExperience(
    runSnapshot({
      scenarioId,
      scenarioState: state,
      partitionCount: partitionCount(scenarioId),
      recentMessages: [],
    }),
    state,
  );
}

function partitionCount(scenarioId: ScenarioExperienceId) {
  return scenarioId === "hot-partitions-key-skew" ? 4 : 3;
}

function stableNode(node: {
  id: string;
  nodeKind: string;
  visualKind: string;
  rank: number;
  lane: number;
  position: { x: number; y: number };
}) {
  return {
    id: node.id,
    nodeKind: node.nodeKind,
    visualKind: node.visualKind,
    rank: node.rank,
    lane: node.lane,
    position: node.position,
  };
}

function stableEdge(edge: {
  id: string;
  source: string;
  target: string;
  kind: string;
}) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
  };
}

function rankOf(
  projection: NonNullable<ReturnType<typeof projectScenarioExploreTopology>>,
  nodeId: string,
) {
  const node = projection.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Missing projected node ${nodeId}`);
  return node.rank;
}
