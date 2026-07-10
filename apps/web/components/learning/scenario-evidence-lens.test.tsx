import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  EvidenceTableModel,
  EvidenceValue,
  FocusRef,
  ScenarioLensModel,
} from "@/lib/client/scenario-experience/model";
import { ScenarioEvidenceLens } from "./scenario-evidence-lens";

const observed = (value: string | number): EvidenceValue => ({
  value,
  provenance: "observed",
  scope: "current",
});

const entity = (id: string): FocusRef => ({ kind: "entity", id });

const emptyTable = (id: string, caption: string): EvidenceTableModel => ({
  id,
  caption,
  columns: [{ key: "value", label: "Value" }],
  rows: [],
  emptyCopy: "No rows yet.",
});

const common = {
  title: "Teaching evidence",
  summary: "Read the causal change from left to right.",
  emptyCopy: "Run the experiment to collect evidence.",
  facts: [],
} as const;

const lensCases: readonly {
  lens: ScenarioLensModel;
  expected: string;
}[] = [
  {
    lens: {
      ...common,
      kind: "routing",
      traces: [
        {
          id: "trace-a",
          key: "account-a",
          partition: 0,
          offset: "2",
          reason: "The same hash routes the key consistently.",
          provenance: "observed",
          focus: entity("partition-0"),
        },
      ],
    },
    expected: "Partition 0 · offset 2",
  },
  {
    lens: {
      ...common,
      kind: "assignment",
      beforeLabel: "One member",
      afterLabel: "Four members",
      deltas: [
        {
          id: "delta-0",
          partition: 0,
          beforeOwner: "consumer-a",
          afterOwner: "consumer-b",
          status: "moved",
          provenance: "derived",
          focus: entity("partition-0"),
        },
      ],
    },
    expected: "Four members",
  },
  {
    lens: {
      ...common,
      kind: "lifecycle",
      records: [
        {
          id: "attempt-2",
          recordId: "message-1",
          stage: "Retry topic",
          attempt: 2,
          outcome: "retrying",
          backoffMs: 500,
          provenance: "simulated",
          focus: entity("message-1"),
        },
      ],
    },
    expected: "Retry topic · attempt 2",
  },
  {
    lens: {
      ...common,
      kind: "pipeline",
      stages: [
        {
          id: "outbox",
          title: "Read outbox",
          status: "active",
          provenance: "simulated",
          focus: { kind: "entity", id: "outbox" },
        },
      ],
    },
    expected: "Read outbox",
  },
  {
    lens: {
      ...common,
      kind: "gate",
      evaluations: [
        {
          id: "gate-1",
          subject: "orders-writer",
          resource: "orders",
          operation: "WRITE",
          outcome: "denied",
          reason: "Denied by rule",
          provenance: "simulated",
          focus: entity("acl-orders-write"),
        },
      ],
    },
    expected: "Denied by rule",
  },
  {
    lens: {
      ...common,
      kind: "transaction",
      boundaries: [
        {
          id: "tx-1",
          status: "committed",
          recordIds: ["record-a", "record-b"],
          visibleRecordIds: ["record-a", "record-b"],
          provenance: "simulated",
          focus: { kind: "entity", id: "tx-1" },
        },
      ],
    },
    expected: "Visible to consumers",
  },
  {
    lens: {
      ...common,
      kind: "projection",
      source: emptyTable("source", "Immutable log"),
      projection: emptyTable("projection", "Projection state"),
      cursor: observed("offset 8"),
    },
    expected: "Projection cursor",
  },
  {
    lens: {
      ...common,
      kind: "capacity",
      trend: "rising",
      partitions: emptyTable("partitions", "Per-partition lag"),
      drainEstimate: {
        value: "42 seconds",
        provenance: "derived",
        scope: "current",
      },
    },
    expected: "Lag rising",
  },
  {
    lens: {
      ...common,
      kind: "heatmap",
      phases: [
        {
          id: "fixed",
          label: "Fixed key",
          sampleSize: 10,
          partitionCounts: { "0": 10, "1": 0 },
          partitionPercentages: { "0": 100, "1": 0 },
          skewRatio: 10,
          provenance: "observed",
          scope: "run-total",
        },
      ],
    },
    expected: "Fixed key",
  },
  {
    lens: {
      ...common,
      kind: "window-join",
      records: [
        {
          id: "left-1",
          key: "order-1",
          side: "left",
          eventTimeMs: 100,
          windowId: "window-0",
          outcome: "waiting",
          provenance: "simulated",
          focus: entity("left-1"),
        },
      ],
      outputs: emptyTable("outputs", "Joined output"),
    },
    expected: "Left stream",
  },
];

describe("ScenarioEvidenceLens", () => {
  it.each(lensCases)("renders the $lens.kind lens", ({ lens, expected }) => {
    render(<ScenarioEvidenceLens lens={lens} focus={null} onFocus={vi.fn()} />);

    expect(screen.getByTestId("scenario-evidence-lens").dataset.lensKind).toBe(
      lens.kind,
    );
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("renders heatmap counts, percentages, and skew together", () => {
    const lens: ScenarioLensModel = {
      ...common,
      kind: "heatmap",
      phases: [
        {
          id: "hot",
          label: "Fixed hot key",
          sampleSize: 8,
          partitionCounts: { "0": 0, "1": 8 },
          partitionPercentages: { "0": 0, "1": 100 },
          skewRatio: 8,
          provenance: "simulated",
          scope: "run-total",
        },
      ],
    };

    render(<ScenarioEvidenceLens lens={lens} focus={null} onFocus={vi.fn()} />);

    expect(screen.getByText(/skew ratio 8/i)).toBeTruthy();
    expect(screen.getByText("100.0% of phase")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
  });

  it("renders and highlights a denied ACL cell without an allow policy", () => {
    const lens: ScenarioLensModel = {
      ...common,
      kind: "gate",
      evaluations: [],
      matrixCells: [
        {
          id: "acl-denied",
          principal: "orders-service",
          operation: "write",
          resource: "orders",
          effect: "missing",
          highlighted: true,
          provenance: "simulated",
          focus: entity("acl-denied"),
        },
      ],
    };

    render(<ScenarioEvidenceLens lens={lens} focus={null} onFocus={vi.fn()} />);

    const missing = screen.getByText("No matching allow");
    expect(missing).toBeTruthy();
    expect(screen.getByText("Highlighted request cell")).toBeTruthy();
    expect(missing.closest("li")?.dataset.highlighted).toBe("true");
  });
});
