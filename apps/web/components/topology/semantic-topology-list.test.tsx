import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { runSnapshot } from "@/lib/client/run-snapshot-test-fixtures";
import {
  projectScenarioExploreTopology,
  type ScenarioExploreTopologyProjection,
} from "@/lib/client/scenario-experience/explore-topology";
import { projectScenarioExperience } from "@/lib/client/scenario-experience/registry";
import { teachingScenarioTestManifest } from "@/lib/client/scenario-experience/scenario-experience.test-manifest";
import { SemanticTopologyList } from "./semantic-topology-list";

describe("SemanticTopologyList", () => {
  it("renders the shared core once with the scenario extension and causal route", () => {
    const onSelectNode = vi.fn();
    const { snapshot, topology } = partitioningTopology();

    render(
      <SemanticTopologyList
        snapshot={snapshot}
        scenarioTopology={topology}
        selectedMessageId={null}
        selectedNode={null}
        selectedScenarioNodeId={null}
        onSelectMessage={vi.fn()}
        onSelectNode={onSelectNode}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "Inspect producer" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Inspect topic" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Inspect consumer group" }),
    ).toHaveLength(1);
    expect(
      screen.getByTestId("semantic-scenario-node-key-router"),
    ).not.toBeNull();
    expect(
      screen.getByTestId("semantic-scenario-edge-producer-router"),
    ).not.toBeNull();
    expect(
      screen.queryByTestId("semantic-core-edge-producer-topic"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Inspect Key router" }));
    expect(onSelectNode).toHaveBeenLastCalledWith({
      type: "scenarioNode",
      nodeId: "key-router",
    });
  });

  it("keeps scenario selection separate from the selected core node", () => {
    const { snapshot, topology } = partitioningTopology();

    render(
      <SemanticTopologyList
        snapshot={snapshot}
        scenarioTopology={topology}
        selectedMessageId={null}
        selectedNode={{ type: "topic" }}
        selectedScenarioNodeId="key-router"
        onSelectMessage={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Inspect Key router" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Inspect topic" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("falls back to the core-only semantic route without scenario state", () => {
    render(
      <SemanticTopologyList
        snapshot={runSnapshot({ mode: "remote" })}
        scenarioTopology={null}
        selectedMessageId={null}
        selectedNode={null}
        selectedScenarioNodeId={null}
        onSelectMessage={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.queryByTestId(/^semantic-scenario-node-/)).toBeNull();
    expect(screen.getByText("Routes records to the topic")).not.toBeNull();
    expect(
      within(screen.getByTestId("semantic-core-edge-producer-topic")).getByText(
        "Observed",
      ),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Inspect producer" }).className,
    ).toContain("w-full");
  });

  it("renders the runtime core route when the scenario graph does not replace it", () => {
    const { snapshot, topology } = scenarioTopology("cooperative-rebalancing");

    renderTopology(snapshot, topology);

    const route = screen.getByTestId("semantic-core-edge-producer-topic");
    expect(route.getAttribute("data-provenance")).toBe("simulated");
    expect(route.getAttribute("aria-label")).toContain("simulated");
    expect(within(route).getByText("Simulated")).not.toBeNull();
    expect(
      screen.queryByTestId("semantic-scenario-edge-producer-topic"),
    ).toBeNull();
  });

  it("points feedback connectors upward and back to an earlier-ranked target", () => {
    const { snapshot, topology } = scenarioTopology("at-least-once-duplicates");

    renderTopology(snapshot, topology);

    const feedback = screen.getByTestId("semantic-scenario-edge-replay-group");
    const direction = screen.getByTestId(
      "semantic-edge-direction-replay-group",
    );
    expect(feedback.getAttribute("data-direction")).toBe("backward");
    expect(feedback.getAttribute("aria-label")).toContain(
      "Redelivery loop back to Consumer group",
    );
    expect(direction.getAttribute("class")).toContain("lucide-arrow-up");
  });

  it("announces scenario provenance once and keeps metric markup valid", () => {
    const { snapshot, topology } = partitioningTopology();
    const topologyWithMetric: ScenarioExploreTopologyProjection = {
      ...topology,
      nodes: topology.nodes.map((node) =>
        node.id === "key-router"
          ? {
              ...node,
              metric: {
                value: 3,
                provenance: "derived",
                scope: "current",
              },
            }
          : node,
      ),
    };

    renderTopology(snapshot, topologyWithMetric);

    const button = screen.getByRole("button", { name: "Inspect Key router" });
    const step = button.closest("li");
    expect(step).not.toBeNull();
    expect(within(button).queryByText("Derived")).toBeNull();
    expect(within(step!).getAllByText("Derived")).toHaveLength(1);
    expect(button.querySelector("span div")).toBeNull();
    expect(within(button).getByText("3")).not.toBeNull();
  });
});

function partitioningTopology(): {
  snapshot: ReturnType<typeof runSnapshot>;
  topology: ScenarioExploreTopologyProjection;
} {
  const entry = teachingScenarioTestManifest.find(
    (candidate) => candidate.scenarioId === "partitioning",
  );
  if (!entry) throw new Error("Missing partitioning teaching fixture");
  const snapshot = runSnapshot({
    scenarioId: "partitioning",
    scenarioState: entry.initial,
  });
  const frame = projectScenarioExperience(snapshot, entry.initial);
  const topology = projectScenarioExploreTopology(frame);
  if (!topology) throw new Error("Missing partitioning topology projection");
  return { snapshot, topology };
}

function scenarioTopology(
  scenarioId: "cooperative-rebalancing" | "at-least-once-duplicates",
) {
  const entry = teachingScenarioTestManifest.find(
    (candidate) => candidate.scenarioId === scenarioId,
  );
  if (!entry) throw new Error(`Missing ${scenarioId} teaching fixture`);
  const snapshot = runSnapshot({
    scenarioId,
    scenarioState: entry.initial,
  });
  const frame = projectScenarioExperience(snapshot, entry.initial);
  const topology = projectScenarioExploreTopology(frame);
  if (!topology) throw new Error(`Missing ${scenarioId} topology projection`);
  return { snapshot, topology };
}

function renderTopology(
  snapshot: ReturnType<typeof runSnapshot>,
  topology: ScenarioExploreTopologyProjection,
) {
  render(
    <SemanticTopologyList
      snapshot={snapshot}
      scenarioTopology={topology}
      selectedMessageId={null}
      selectedNode={null}
      selectedScenarioNodeId={null}
      onSelectMessage={vi.fn()}
      onSelectNode={vi.fn()}
    />,
  );
}
