import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumerSnapshot,
  playgroundMessage,
  runSnapshot,
} from "@/lib/client/run-snapshot-test-fixtures";
import { projectScenarioExperience } from "@/lib/client/scenario-experience/registry";
import { teachingScenarioTestManifest } from "@/lib/client/scenario-experience/scenario-experience.test-manifest";

const { desktopTopologyProps } = vi.hoisted(() => ({
  desktopTopologyProps: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockDesktopTopology(props: Record<string, unknown>) {
      desktopTopologyProps(props);
      return <div data-testid="topology-flow">Interactive topology</div>;
    },
}));

import { ExploreTopology } from "./explore-topology";

describe("ExploreTopology", () => {
  beforeEach(() => {
    desktopTopologyProps.mockClear();
  });

  it("renders semantic, selectable topology without mounting React Flow below 768px", async () => {
    installMatchMedia(true);
    const onFocus = vi.fn();
    const snapshot = runSnapshot({
      consumers: [consumerSnapshot()],
      messageCounts: { 0: 1, 1: 0 },
      recentMessages: [
        playgroundMessage({ messageId: "message-42", partition: 0 }),
      ],
    });

    render(
      <ExploreTopology
        snapshot={snapshot}
        focus={{ kind: "message", id: "message-42" }}
        selectedEvent={null}
        onFocus={onFocus}
      />,
    );

    expect(await screen.findByTestId("semantic-topology-list")).not.toBeNull();
    expect(screen.queryByTestId("topology-flow")).toBeNull();
    const topologyRegion = screen.getByRole("region", {
      name: "Simulated runtime topology",
    });
    expect(topologyRegion.getAttribute("data-provenance")).toBe("simulated");
    expect(
      screen.getByText(
        "Free Explore actions update this deterministic demo run. Guided evidence changes only when you run a guided experiment.",
      ).className,
    ).toContain("sr-only");
    expect(screen.getAllByText("Simulated").length).toBeGreaterThan(0);
    expect(
      screen
        .getByTestId("partition-message-message-42")
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Inspect partition 0" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(
      screen.getByRole("button", { name: "Inspect consumer group" }),
    );
    expect(onFocus).toHaveBeenLastCalledWith({
      kind: "entity",
      id: "consumerGroup",
    });
    expect(desktopTopologyProps).not.toHaveBeenCalled();
  });

  it("lazily renders the core-only React Flow topology at desktop widths", async () => {
    installMatchMedia(false);
    const snapshot = runSnapshot({ mode: "remote" });

    render(
      <ExploreTopology
        snapshot={snapshot}
        focus={{ kind: "entity", id: "topic" }}
        selectedEvent={null}
        onFocus={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("topology-flow")).not.toBeNull();
    expect(screen.queryByTestId("semantic-topology-list")).toBeNull();
    expect(
      screen
        .getByRole("region", { name: "Observed broker topology" })
        .getAttribute("data-provenance"),
    ).toBe("observed");
    expect(desktopTopologyProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot,
        showScenarioVisual: false,
        selectedMessageId: null,
        selectedNode: { type: "topic" },
      }),
    );
  });

  it("keeps the old scenario overlay available only when legacy fallback opts in", async () => {
    installMatchMedia(false);

    render(
      <ExploreTopology
        snapshot={runSnapshot()}
        focus={{ kind: "entity", id: "legacy-hotspot" }}
        selectedEvent={null}
        showLegacyScenarioVisual
        onFocus={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("topology-flow")).not.toBeNull();
    expect(desktopTopologyProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showScenarioVisual: true,
        selectedNode: { type: "scenarioNode", nodeId: "legacy-hotspot" },
      }),
    );
  });

  it("projects a converted scenario graph and highlights its evidence entity", async () => {
    installMatchMedia(false);
    const entry = teachingScenarioTestManifest.find(
      (candidate) => candidate.scenarioId === "partitioning",
    );
    if (!entry) throw new Error("Missing partitioning teaching fixture");
    const snapshot = runSnapshot({
      scenarioId: "partitioning",
      scenarioState: entry.initial,
    });
    const scenarioFrame = projectScenarioExperience(snapshot, entry.initial);

    render(
      <ExploreTopology
        snapshot={snapshot}
        scenarioFrame={scenarioFrame}
        entityDetails={scenarioFrame.entityDetails}
        focus={{ kind: "entity", id: "key-router" }}
        selectedEvent={null}
        onFocus={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("topology-flow")).not.toBeNull();
    expect(desktopTopologyProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showScenarioVisual: false,
        selectedNode: { type: "scenarioNode", nodeId: "key-router" },
        scenarioTopology: expect.objectContaining({
          scenarioId: "partitioning",
        }),
      }),
    );
  });
});

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
