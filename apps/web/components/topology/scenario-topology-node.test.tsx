import { fireEvent, render, screen } from "@testing-library/react";
import type { Node, NodeProps } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  Handle: ({ id, type }: { id: string; type: string }) => (
    <span data-testid={`handle-${id}`} data-handle-type={type} />
  ),
  Position: { Bottom: "bottom", Left: "left", Right: "right", Top: "top" },
}));

import {
  ScenarioTopologyFlowNode,
  type ScenarioExploreNodeData,
} from "./scenario-topology-node";

describe("ScenarioTopologyFlowNode", () => {
  it("shows state, metric, provenance, selection, and stable entity focus", () => {
    const onSelectNode = vi.fn();
    const data: ScenarioExploreNodeData = {
      description: "Maps a stable key to one partition.",
      entityId: "key-router",
      metric: {
        value: 3,
        display: "3 routes",
        provenance: "derived",
        scope: "current",
      },
      nodeId: "key-router",
      onSelectNode,
      provenance: "derived",
      selected: true,
      state: "warning",
      title: "Key router",
      visualKind: "route",
    };

    render(
      <ScenarioTopologyFlowNode
        {...({ data } as NodeProps<
          Node<ScenarioExploreNodeData, "scenarioExplore">
        >)}
      />,
    );

    const node = screen.getByRole("button", { name: "Inspect Key router" });
    expect(node.getAttribute("aria-pressed")).toBe("true");
    expect(node.getAttribute("data-testid")).toBe(
      "topology-node-scenario-key-router",
    );
    expect(node.getAttribute("data-provenance")).toBe("derived");
    expect(screen.getByText(/warning/i)).not.toBeNull();
    expect(screen.getByText("3 routes")).not.toBeNull();
    expect(screen.getByText("Derived")).not.toBeNull();
    expect(
      screen
        .getByTestId("handle-scenario-feedback-in")
        .getAttribute("data-handle-type"),
    ).toBe("target");

    fireEvent.click(node);
    expect(onSelectNode).toHaveBeenCalledWith({
      type: "scenarioNode",
      nodeId: "key-router",
    });
  });
});
