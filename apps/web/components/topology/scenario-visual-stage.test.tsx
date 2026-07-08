import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  playgroundMessage,
  runSnapshot,
} from "@/lib/client/run-snapshot-test-fixtures";
import { deriveScenarioVisualization } from "@/lib/client/scenario-visualization";
import { ScenarioVisualStage } from "./scenario-visual-stage";

describe("ScenarioVisualStage", () => {
  it("renders all row cells from scenario-specific tables", () => {
    const visualization = deriveScenarioVisualization(
      runSnapshot({
        scenarioId: "outbox-cdc",
        recentMessages: [
          playgroundMessage({
            messageId: "cdc-1",
            value: {
              payload: {
                table: "orders",
                operation: "update",
                outboxId: "outbox-1",
                lsn: "0/3EA",
              },
            },
            state: "committed",
          }),
        ],
      }),
    );

    render(
      <ScenarioVisualStage
        visualization={visualization}
        selectedNode={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByTitle("orders")).toBeTruthy();
    expect(screen.getByTitle("update")).toBeTruthy();
    expect(screen.getByTitle("outbox-1")).toBeTruthy();
    expect(screen.getByTitle("0/3EA")).toBeTruthy();
    expect(
      screen.getByTestId("topology-scenario-node-cdc-connector"),
    ).toBeTruthy();
  });
});
