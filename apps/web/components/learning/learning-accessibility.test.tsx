import { fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type {
  CausalGraphModel,
  EvidenceTableModel,
  EvidenceValue,
  ScenarioExperienceFrame,
} from "@/lib/client/scenario-experience/model";
import { CausalGraphList, CausalGraphRail } from "./causal-graph";
import { EvidenceTable } from "./evidence-table";
import { ExpandableIdentifier } from "./evidence-value";
import { ProvenanceLegend } from "./provenance";
import { ScenarioCheckpoint } from "./scenario-checkpoint";
import { ScenarioLearningSurface } from "./scenario-learning-surface";

const veryLongId =
  "message-01JZ4P7Q9V4F3A6N8M2R5T0X1C-partition-0000000000000000000000000007";

const observed = (value: string | number): EvidenceValue => ({
  value,
  provenance: "observed",
  scope: "current",
});

const evidenceTable: EvidenceTableModel = {
  id: "routing-records",
  caption: "Latest routing records",
  columns: [
    { key: "key", label: "Message key" },
    { key: "id", label: "Message ID" },
  ],
  rows: [
    {
      id: "message-row",
      focus: { kind: "message", id: veryLongId, partition: 0, offset: "2" },
      cells: {
        key: observed("A"),
        id: observed(veryLongId),
      },
    },
  ],
  emptyCopy: "No routing records yet.",
  bounded: { shown: 1, total: 12, label: "Latest 1 of 12 records" },
};

const causalGraph: CausalGraphModel = {
  nodes: [
    {
      id: "producer",
      title: "Producer",
      description: "Creates a keyed record.",
      provenance: "observed",
      focus: { kind: "entity", id: "producer" },
      state: "complete",
    },
    {
      id: "partition-0",
      title: "Partition 0",
      description: "Stores both A records in offset order.",
      provenance: "derived",
      focus: { kind: "entity", id: "partition-0" },
      state: "active",
    },
  ],
  edges: [
    {
      id: "producer-partition",
      source: "producer",
      target: "partition-0",
      label: "hash(A) routes here",
      provenance: "simulated",
      scope: "current",
      active: true,
    },
  ],
};

const frame: ScenarioExperienceFrame = {
  scenarioId: "partitioning",
  title: "Partitioning and ordering",
  lesson: {
    objective: "Explain why equal keys stay ordered in one partition.",
    misconception: "Consumers choose the destination partition.",
    emptyCopy: "Run the routing experiment.",
  },
  causalGraph,
  lens: {
    kind: "routing",
    title: "Why key A stays ordered",
    summary: "The key hash selects a partition before consumption.",
    emptyCopy: "Produce A, B, A to reveal the route.",
    facts: [
      {
        id: "partition-count",
        label: "Partition count",
        value: observed(2),
      },
    ],
    table: evidenceTable,
    traces: [
      {
        id: "trace-a",
        key: "A",
        partition: 0,
        offset: "2",
        reason: "Equal hashes choose equal partitions.",
        provenance: "observed",
        focus: { kind: "message", id: veryLongId, partition: 0, offset: "2" },
      },
    ],
  },
  narrative: {
    whatChanged: {
      label: "What changed",
      text: "Three records were produced with keys A, B, A.",
      provenance: "observed",
      scope: "current",
    },
    why: {
      label: "Why",
      text: "Kafka hashes each key before appending.",
      provenance: "derived",
      scope: "run-total",
    },
    next: {
      label: "What happens next",
      text: "More A records continue at the next partition offset.",
      provenance: "derived",
      scope: "current",
    },
  },
  experiments: {
    primary: {
      id: "route-a-b-a",
      role: "primary",
      label: "Route keys A, B, A",
      hypothesis: "Equal keys choose one partition.",
      description: "Produce three keyed records and add three consumers.",
      remoteSupport: "demo-only",
    },
    contrast: {
      id: "route-more-keys",
      role: "contrast",
      label: "Route more keys",
      hypothesis: "Other keys can choose another partition.",
      description: "Produce A and B again.",
      remoteSupport: "demo-only",
    },
  },
  experiment: {
    experimentId: "route-a-b-a",
    status: "completed",
    error: null,
    completedExperimentIds: ["route-a-b-a"],
    hypothesis: "Equal keys choose one partition.",
    before: [
      {
        id: "before-records",
        label: "Records",
        value: observed(0),
      },
    ],
    current: [
      {
        id: "current-records",
        label: "Records",
        value: observed(3),
      },
    ],
    after: [
      {
        id: "after-a-route",
        label: "A partition",
        value: {
          value: 0,
          provenance: "derived",
          scope: "run-total",
        },
      },
    ],
  },
  checkpoint: {
    id: "partition-check",
    prompt: "Why do both A records stay ordered?",
    options: [
      { id: "hash", label: "Their key hashes route both to one partition." },
      { id: "consumer", label: "One consumer rearranges them." },
    ],
    correctOptionId: "hash",
    explanation: "Ordering is guaranteed within a partition.",
  },
  entityDetails: {},
};

describe("learning component accessibility", () => {
  it("renders named table headers and keyboard-selectable evidence rows", () => {
    const onFocus = vi.fn();
    render(
      <EvidenceTable table={evidenceTable} focus={null} onFocus={onFocus} />,
    );

    const table = screen.getByRole("table", { name: "Latest routing records" });
    expect(
      within(table).getByRole("columnheader", { name: "Message key" }),
    ).toBeTruthy();
    expect(
      within(table).getByRole("columnheader", { name: "Message ID" }),
    ).toBeTruthy();
    expect(screen.getByTestId("evidence-row-message-row")).toBeTruthy();
    expect(screen.getByText("Latest 1 of 12 records")).toBeTruthy();

    const focusButton = screen.getByRole("button", {
      name: "Focus row message-row",
    });
    focusButton.focus();
    expect(document.activeElement).toBe(focusButton);
    fireEvent.click(focusButton, { detail: 0 });
    expect(onFocus).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "message", id: veryLongId }),
    );
    expect(screen.getByText(veryLongId).getAttribute("title")).toBeNull();
  });

  it("keeps secondary identifiers available through an expandable control", () => {
    render(<ExpandableIdentifier value={veryLongId} />);

    const disclosure = screen.getByText("Show ID").closest("summary");
    expect(disclosure).toBeTruthy();
    fireEvent.click(disclosure!);
    expect(screen.getByText(veryLongId)).toBeTruthy();
  });

  it("uses a semantic mobile causal list with selectable nodes and edge provenance", () => {
    const onFocus = vi.fn();
    render(
      <CausalGraphList graph={causalGraph} focus={null} onFocus={onFocus} />,
    );

    const list = screen.getByTestId("causal-graph-list");
    expect(list.tagName).toBe("OL");
    expect(list.children).toHaveLength(2);
    expect(screen.getByText("hash(A) routes here")).toBeTruthy();
    expect(screen.getAllByText("Simulated").length).toBeGreaterThan(0);

    const node = screen.getByTestId("causal-node-producer");
    node.focus();
    expect(document.activeElement).toBe(node);
    fireEvent.click(node, { detail: 0 });
    expect(onFocus).toHaveBeenCalledWith({ kind: "entity", id: "producer" });
  });

  it("renders the compact desktop causal rail as normal DOM", () => {
    render(
      <CausalGraphRail graph={causalGraph} focus={null} onFocus={vi.fn()} />,
    );

    const rail = screen.getByTestId("causal-graph-rail");
    expect(
      within(rail).getByRole("list", { name: "Causal steps" }),
    ).toBeTruthy();
    expect(within(rail).getByText("hash(A) routes here")).toBeTruthy();
    expect(within(rail).getByText("Simulated")).toBeTruthy();
  });

  it("explains every provenance label with a keyboard-accessible tooltip", () => {
    render(<ProvenanceLegend />);

    const observedLabel = screen.getByText("Observed");
    const observedTrigger = observedLabel.parentElement;
    const observedTooltip = screen.getByText(
      "Reported directly by the Kafka broker or runtime.",
    );

    expect(observedTrigger?.tabIndex).toBe(0);
    expect(observedTrigger?.getAttribute("aria-describedby")).toBe(
      observedTooltip.id,
    );
    observedTrigger?.focus();
    expect(document.activeElement).toBe(observedTrigger);
    expect(observedTooltip.getAttribute("role")).toBe("tooltip");

    expect(screen.getByText("Derived")).toBeTruthy();
    expect(screen.getByText("Simulated")).toBeTruthy();
    expect(screen.getAllByRole("tooltip")).toHaveLength(3);
    expect(
      screen.getByText(
        "Calculated from observed or authoritative scenario state.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Created by a deterministic teaching experiment, not observed broker behavior.",
      ),
    ).toBeTruthy();
  });

  it("answers the checkpoint through accessible native buttons", () => {
    const onAnswer = vi.fn();
    render(
      <ScenarioCheckpoint checkpoint={frame.checkpoint} onAnswer={onAnswer} />,
    );

    const answer = screen.getByRole("button", {
      name: "Their key hashes route both to one partition.",
    });
    answer.focus();
    fireEvent.click(answer, { detail: 0 });

    expect(onAnswer).toHaveBeenCalledWith("hash");
    expect(screen.getByText("Correct.")).toBeTruthy();
    expect(answer.getAttribute("aria-pressed")).toBe("true");
  });

  it("composes one polite live region and explicitly disables demo-only remote experiments", () => {
    const { container } = render(
      <ScenarioLearningSurface
        frame={frame}
        focus={null}
        onFocus={vi.fn()}
        onRunExperiment={vi.fn()}
        onAnswerCheckpoint={vi.fn()}
        runtimeMode="remote"
        announcement="Routing evidence updated."
      />,
    );

    const surface = screen.getByTestId("scenario-learning-surface");
    expect(surface.dataset.scenarioId).toBe("partitioning");
    expect(surface.dataset.experimentId).toBe("route-a-b-a");
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(screen.getByText("Routing evidence updated.")).toBeTruthy();
    expect(screen.getByTestId("scenario-evidence-lens")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Before" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Current" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "After" })).toBeTruthy();

    const primary = screen.getByTestId("experiment-route-a-b-a");
    expect((primary as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/Demo mode only/).length).toBe(2);
  });

  it("shows Run for idle experiments and explains the contrast prerequisite", () => {
    const idleFrame: ScenarioExperienceFrame = {
      ...frame,
      experiment: {
        ...frame.experiment,
        status: "idle",
        completedExperimentIds: [],
      },
    };
    render(
      <ScenarioLearningSurface
        frame={idleFrame}
        focus={null}
        onFocus={vi.fn()}
        onRunExperiment={vi.fn()}
        onAnswerCheckpoint={vi.fn()}
      />,
    );

    const primary = screen.getByTestId("experiment-route-a-b-a");
    const contrast = screen.getByTestId("experiment-route-more-keys");
    expect(primary.textContent).toContain("Run");
    expect(primary.textContent).not.toContain("Rerun");
    expect((contrast as HTMLButtonElement).disabled).toBe(true);
    const prerequisite = screen.getByText(
      /Run Route keys A, B, A first\. This contrast builds on/,
    );
    expect(contrast.getAttribute("aria-describedby")).toContain(
      prerequisite.id,
    );
  });

  it("keeps the contrast enabled after reloading its completed state", () => {
    const contrastFrame: ScenarioExperienceFrame = {
      ...frame,
      experiment: {
        ...frame.experiment,
        experimentId: "route-more-keys",
        completedExperimentIds: ["route-a-b-a", "route-more-keys"],
      },
    };
    render(
      <ScenarioLearningSurface
        frame={contrastFrame}
        focus={null}
        onFocus={vi.fn()}
        onRunExperiment={vi.fn()}
        onAnswerCheckpoint={vi.fn()}
      />,
    );

    const contrast = screen.getByTestId("experiment-route-more-keys");
    expect((contrast as HTMLButtonElement).disabled).toBe(false);
    expect(contrast.textContent).toContain("Rerun");
    expect(screen.queryByText(/This contrast builds on/)).toBeNull();
  });

  it("keeps a failed contrast enabled for retry after its primary completed", () => {
    const failedContrastFrame: ScenarioExperienceFrame = {
      ...frame,
      experiment: {
        ...frame.experiment,
        experimentId: "route-more-keys",
        status: "failed",
        error: {
          code: "EXPERIMENT_STEP_FAILED",
          message: "The contrast could not complete.",
        },
        completedExperimentIds: ["route-a-b-a"],
      },
    };
    render(
      <ScenarioLearningSurface
        frame={failedContrastFrame}
        focus={null}
        onFocus={vi.fn()}
        onRunExperiment={vi.fn()}
        onAnswerCheckpoint={vi.fn()}
      />,
    );

    const contrast = screen.getByTestId("experiment-route-more-keys");
    expect((contrast as HTMLButtonElement).disabled).toBe(false);
    expect(contrast.textContent).toContain("Run");
    expect(contrast.textContent).not.toContain("Rerun");
    expect(screen.queryByText(/This contrast builds on/)).toBeNull();
  });

  it("renders selectable server transitions with virtual time and provenance", () => {
    const onFocus = vi.fn();
    render(
      <ScenarioLearningSurface
        frame={frame}
        focus={{ kind: "event", id: "transition-2" }}
        onFocus={onFocus}
        onRunExperiment={vi.fn()}
        onAnswerCheckpoint={vi.fn()}
        experimentTransitions={[
          {
            id: "transition-1",
            experimentId: "route-a-b-a",
            stepLabel: "Route key A",
            stepIndex: 1,
            totalSteps: 2,
            virtualTimeMs: 100,
            provenance: "simulated",
            transition: "key.hashed",
            focus: { kind: "event", id: "transition-1" },
          },
          {
            id: "transition-2",
            experimentId: "route-a-b-a",
            stepLabel: "Extend partition order",
            stepIndex: 2,
            totalSteps: 2,
            virtualTimeMs: 200,
            provenance: "observed",
            transition: "partition.order.extended",
            focus: { kind: "event", id: "transition-2" },
          },
        ]}
      />,
    );

    expect(screen.getByText("Step 1/2")).toBeTruthy();
    expect(screen.getByText("Virtual time 100 ms")).toBeTruthy();
    expect(
      within(
        screen.getByTestId("experiment-transition-transition-2"),
      ).getByText("Observed"),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("experiment-transition-transition-2")
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("experiment-transition-transition-1"));
    expect(onFocus).toHaveBeenCalledWith({
      kind: "event",
      id: "transition-1",
    });
  });

  it("uses mapped graph and evidence focus without creating a second selection", () => {
    render(
      <ScenarioLearningSurface
        frame={frame}
        focus={{ kind: "event", id: "event-12" }}
        graphFocus={{ kind: "entity", id: "partition-0" }}
        evidenceFocus={{
          kind: "message",
          id: veryLongId,
          partition: 0,
          offset: "2",
        }}
        onFocus={vi.fn()}
        onRunExperiment={vi.fn()}
        onAnswerCheckpoint={vi.fn()}
      />,
    );

    expect(
      screen
        .getByTestId("causal-node-partition-0")
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(screen.getByTestId("evidence-row-message-row"))
        .getByRole("button")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("exposes pending and error states without another live region", () => {
    const onRunExperiment = vi.fn();
    const { container } = render(
      <ScenarioLearningSurface
        frame={frame}
        focus={null}
        onFocus={vi.fn()}
        onRunExperiment={onRunExperiment}
        onAnswerCheckpoint={vi.fn()}
        pendingExperimentId="route-more-keys"
        experimentError="The simulator rejected the transition."
      />,
    );

    expect(
      screen.getByTestId("scenario-learning-surface").dataset.pending,
    ).toBe("true");
    expect(
      screen.getByTestId("experiment-route-more-keys").textContent,
    ).toContain("Running");
    expect(screen.getByTestId("experiment-error").textContent).toContain(
      "The simulator rejected the transition.",
    );
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    fireEvent.click(screen.getByTestId("experiment-route-more-keys"));
    expect(onRunExperiment).not.toHaveBeenCalled();
  });

  it("restores an authoritative experiment failure from the projected frame", () => {
    const failedFrame: ScenarioExperienceFrame = {
      ...frame,
      experiment: {
        ...frame.experiment,
        status: "failed",
        error: {
          code: "CONSUMER_LIMIT_REACHED",
          message: "The run cannot add another consumer.",
        },
      },
    };

    render(
      <ScenarioLearningSurface
        frame={failedFrame}
        focus={null}
        onFocus={vi.fn()}
        onRunExperiment={vi.fn()}
        onAnswerCheckpoint={vi.fn()}
      />,
    );

    expect(screen.getByTestId("experiment-error").textContent).toContain(
      "The run cannot add another consumer.",
    );
    expect(
      screen.getByText(/Route keys A, B, A failed:/).textContent,
    ).toContain("The run cannot add another consumer.");
  });

  it("dispatches the selected guided experiment in demo mode", () => {
    const onRunExperiment = vi.fn();
    render(
      <ScenarioLearningSurface
        frame={frame}
        focus={null}
        onFocus={vi.fn()}
        onRunExperiment={onRunExperiment}
        onAnswerCheckpoint={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("experiment-route-more-keys"));
    expect(onRunExperiment).toHaveBeenCalledWith("route-more-keys");
  });

  it("has no serious or critical structural accessibility violations", async () => {
    const { container } = render(
      <ScenarioLearningSurface
        frame={frame}
        focus={null}
        onFocus={vi.fn()}
        onRunExperiment={vi.fn()}
        onAnswerCheckpoint={vi.fn()}
      />,
    );

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
  });
});
