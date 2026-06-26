import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ConnectionStatus,
  RunSnapshot,
  RuntimeEvent,
} from "@kplay/contracts";
import { InspectorDrawer } from "./inspector-drawer";
import { StartRunPanel } from "./start-run-panel";
import { WorkspaceHeader } from "./workspace-header";

describe("playground shell components", () => {
  it("disables reset when no run is active and shows connection state", () => {
    const onReset = vi.fn();
    render(
      <WorkspaceHeader
        scenarioTitle="Partitioning"
        run={null}
        connection={connectionStatus({ status: "demo_mode" })}
        disabled={false}
        onReset={onReset}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Reset run" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getAllByText("Demo mode").length).toBeGreaterThan(0);
  });

  it("surfaces missing Aiven configuration and blocks starting a run", () => {
    const onStartRun = vi.fn();
    render(
      <StartRunPanel
        connection={connectionStatus({
          status: "configuration_missing",
          mode: "aiven",
          missingVariables: ["AIVEN_KAFKA_BROKERS"],
        })}
        disabled={false}
        onStartRun={onStartRun}
      />,
    );

    expect(screen.queryByText("Configuration missing")).not.toBeNull();
    expect(screen.queryByText(/AIVEN_KAFKA_BROKERS/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start scenario run" }));
    expect(onStartRun).not.toHaveBeenCalled();
  });

  it("labels Aiven mode before a run exists", () => {
    render(
      <WorkspaceHeader
        scenarioTitle="Partitioning"
        run={null}
        connection={connectionStatus({
          status: "configuration_missing",
          mode: "aiven",
          topicCount: null,
        })}
        disabled={false}
        onReset={vi.fn()}
      />,
    );

    expect(screen.queryByText("Aiven")).not.toBeNull();
    expect(screen.queryByText("No broker configured")).not.toBeNull();
    expect(screen.queryByText("demo.aivencloud.com:9092")).toBeNull();
  });

  it("renders the inspector as a named dialog and closes from expected paths", () => {
    const onClose = vi.fn();
    render(
      <InspectorDrawer
        message={messageFixture}
        event={eventFixture}
        snapshot={snapshotFixture}
        selectedNode={null}
        onPreviousMessage={vi.fn()}
        onNextMessage={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("dialog", { name: "Message inspector" }),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByLabelText("Close message inspector"));
    fireEvent.click(document.querySelector("[aria-hidden='true']") as Element);

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

function connectionStatus(
  override: Partial<ConnectionStatus> = {},
): ConnectionStatus {
  return {
    status: "demo_mode",
    mode: "demo",
    maskedBrokerHost: null,
    brokerCount: 0,
    topicCount: 0,
    missingVariables: [],
    error: null,
    checkedAt: "2026-06-26T00:00:00.000Z",
    ...override,
  };
}

const messageFixture = {
  messageId: "message-1",
  runId: "run-1",
  topic: "topic",
  partition: 0,
  offset: "1",
  key: "user-1",
  value: { action: "page_view" },
  headers: {},
  timestamp: "2026-06-26T00:00:00.000Z",
  state: "committed",
  assignedConsumerId: "consumer-1",
  committedOffset: "2",
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
} satisfies RunSnapshot["recentMessages"][number];

const eventFixture = {
  eventId: "event-1",
  runId: "run-1",
  sequence: 1,
  occurredAt: "2026-06-26T00:00:00.000Z",
  type: "message.processing_completed",
  messageId: "message-1",
} satisfies RuntimeEvent;

const snapshotFixture = {
  runId: "run-1",
  scenarioId: "partitioning",
  mode: "demo",
  status: "running",
  topicName: "topic",
  partitionCount: 2,
  consumerLimit: 3,
  consumerGroupId: "group",
  producerStatus: "stopped",
  productionRate: 1,
  keyStrategy: { type: "round_robin_users" },
  processingLatencyMs: 500,
  consumers: [],
  recentMessages: [messageFixture],
  recentEvents: [eventFixture],
  latestPartitionOffsets: {},
  latestCommittedOffsets: {},
  messageCounts: { produced: 1, received: 1, committed: 1 },
  cleanupStatus: "not_requested",
  sequence: 1,
} satisfies RunSnapshot;
