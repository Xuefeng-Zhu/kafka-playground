import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ConnectionStatus,
  RunSnapshot,
  RuntimeEvent,
  ScenarioDefinition,
} from "@kplay/contracts";
import { EducationPanel } from "@/components/education/education-panel";
import { ScenarioSidebar } from "@/components/scenario/scenario-sidebar";
import { InspectorDrawer } from "./inspector-drawer";
import { StartRunPanel } from "./start-run-panel";
import { WorkspaceHeader } from "./workspace-header";

describe("playground shell components", () => {
  it("disables reset when no run is active and shows connection state", () => {
    const onReset = vi.fn();
    render(
      <WorkspaceHeader
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
    const onTestRemoteConnection = vi.fn();
    render(
      <StartRunPanel
        connection={connectionStatus({
          status: "configuration_missing",
          mode: "aiven",
          missingVariables: ["AIVEN_KAFKA_BROKERS"],
        })}
        disabled={false}
        onStartRun={onStartRun}
        onTestRemoteConnection={onTestRemoteConnection}
        scenario={scenarioFixture}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Remote Kafka/ }));
    expect(screen.queryByText("Remote configuration required")).not.toBeNull();
    expect(screen.queryByText(/brokers, username, password/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start scenario run" }));
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(onStartRun).not.toHaveBeenCalled();
    expect(onTestRemoteConnection).not.toHaveBeenCalled();
  });

  it("blocks remote starts when the broker list has no usable entries", () => {
    const onStartRun = vi.fn();
    const onTestRemoteConnection = vi.fn();
    render(
      <StartRunPanel
        connection={connectionStatus()}
        disabled={false}
        onStartRun={onStartRun}
        onTestRemoteConnection={onTestRemoteConnection}
        scenario={scenarioFixture}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Remote Kafka/ }));
    fireEvent.change(screen.getByLabelText("Brokers"), {
      target: { value: " , " },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "service-user" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "service-password" },
    });

    expect(screen.queryByText(/Add brokers before starting/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start scenario run" }));
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(onStartRun).not.toHaveBeenCalled();
    expect(onTestRemoteConnection).not.toHaveBeenCalled();
  });

  it("shows selected scenario details before starting a run", () => {
    render(
      <StartRunPanel
        connection={connectionStatus()}
        disabled={false}
        onStartRun={vi.fn()}
        onTestRemoteConnection={vi.fn()}
        scenario={scenarioFixture}
      />,
    );

    expect(screen.queryByText("Partitioning scenario")).not.toBeNull();
    expect(screen.queryByText("2 partitions")).not.toBeNull();
    expect(screen.queryByText("Understand partition ownership")).not.toBeNull();
  });

  it("saves remote connection config and starts a remote run", () => {
    window.localStorage.clear();
    const onStartRun = vi.fn();
    render(
      <StartRunPanel
        connection={connectionStatus()}
        disabled={false}
        onStartRun={onStartRun}
        onTestRemoteConnection={vi.fn()}
        scenario={scenarioFixture}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Remote Kafka/ }));
    fireEvent.change(screen.getByLabelText("Brokers"), {
      target: { value: "broker.example.com:9092" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "service-user" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "service-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start scenario run" }));

    expect(onStartRun).toHaveBeenCalledWith({
      mode: "remote",
      remoteKafkaConfig: expect.objectContaining({
        brokers: "broker.example.com:9092",
        username: "service-user",
        password: "service-password",
      }),
    });
    expect(window.localStorage.getItem("kplay.remoteKafka.config")).toContain(
      "service-password",
    );
  });

  it("tests and clears remote connection config", async () => {
    window.localStorage.clear();
    const onTestRemoteConnection = vi.fn().mockResolvedValue(
      connectionStatus({
        status: "connected",
        mode: "remote",
        maskedBrokerHost: "br***.example.com",
        brokerCount: 1,
      }),
    );
    render(
      <StartRunPanel
        connection={connectionStatus()}
        disabled={false}
        onStartRun={vi.fn()}
        onTestRemoteConnection={onTestRemoteConnection}
        scenario={scenarioFixture}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Remote Kafka/ }));
    fireEvent.change(screen.getByLabelText("Brokers"), {
      target: { value: "broker.example.com:9092" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "service-user" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "service-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText(/br\*\*\*\.example\.com/)).not.toBeNull();
    expect(screen.queryByText("service-password")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear saved config" }));

    expect(window.localStorage.getItem("kplay.remoteKafka.config")).toBeNull();
  });

  it("clears invalid saved remote connection config", async () => {
    window.localStorage.setItem(
      "kplay.remoteKafka.config",
      JSON.stringify({ brokers: 42 }),
    );
    render(
      <StartRunPanel
        connection={connectionStatus()}
        disabled={false}
        onStartRun={vi.fn()}
        onTestRemoteConnection={vi.fn()}
        scenario={scenarioFixture}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByRole("tab", { name: /Remote Kafka/ }));

    expect(window.localStorage.getItem("kplay.remoteKafka.config")).toBeNull();
    expect((screen.getByLabelText("Brokers") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("ignores stale remote connection test results after config changes", async () => {
    window.localStorage.clear();
    const pendingConnection = deferred<ConnectionStatus>();
    const onTestRemoteConnection = vi
      .fn()
      .mockReturnValue(pendingConnection.promise);
    render(
      <StartRunPanel
        connection={connectionStatus()}
        disabled={false}
        onStartRun={vi.fn()}
        onTestRemoteConnection={onTestRemoteConnection}
        scenario={scenarioFixture}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Remote Kafka/ }));
    fireEvent.change(screen.getByLabelText("Brokers"), {
      target: { value: "old-broker.example.com:9092" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "service-user" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "service-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    fireEvent.change(screen.getByLabelText("Brokers"), {
      target: { value: "new-broker.example.com:9092" },
    });
    await act(async () => {
      pendingConnection.resolve(
        connectionStatus({
          status: "connected",
          mode: "remote",
          maskedBrokerHost: "ol***.example.com",
          brokerCount: 1,
        }),
      );
      await pendingConnection.promise;
    });

    expect(onTestRemoteConnection).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/ol\*\*\*\.example\.com/)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Test connection",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("shows Aiven configuration state before a run exists", () => {
    render(
      <WorkspaceHeader
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

    expect(screen.queryByText("Aiven")).toBeNull();
    expect(screen.queryByText("Configuration missing")).not.toBeNull();
    expect(screen.queryByText("No broker configured")).not.toBeNull();
    expect(screen.queryByText("demo.aivencloud.com:9092")).toBeNull();
  });

  it("renders the inspector as a named dialog and closes from expected paths", () => {
    const onClose = vi.fn();
    render(
      <InspectorDrawer
        message={messageFixture}
        event={null}
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

  it("uses event inspector labels when a timeline event is selected", () => {
    render(
      <InspectorDrawer
        message={null}
        event={eventFixture}
        snapshot={snapshotFixture}
        selectedNode={null}
        onPreviousMessage={vi.fn()}
        onNextMessage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("dialog", { name: "Event inspector" }),
    );
    expect(screen.queryByText("Event Inspector")).not.toBeNull();
    expect(screen.queryByText("Selected event")).not.toBeNull();
    expect(
      screen.queryByText("message.processing_completed / #1"),
    ).not.toBeNull();
    expect(screen.queryByLabelText("Previous message")).toBeNull();
  });

  it("returns focus to the opener when the inspector closes", () => {
    const opener = document.createElement("button");
    opener.textContent = "Open inspector";
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(
      <InspectorDrawer
        message={messageFixture}
        event={null}
        snapshot={snapshotFixture}
        selectedNode={null}
        onPreviousMessage={vi.fn()}
        onNextMessage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("renders authoritative entity evidence in the unified inspector", () => {
    render(
      <InspectorDrawer
        entityDetail={{
          entityId: "commit-gate",
          title: "Commit boundary",
          summary: "The offset is still behind the processed record.",
          provenance: "observed",
          focus: { kind: "entity", id: "commit-gate" },
          facts: [
            {
              id: "commit-offset",
              label: "Committed offset",
              value: {
                value: "1",
                provenance: "observed",
                scope: "current",
              },
            },
          ],
        }}
        message={null}
        event={null}
        snapshot={snapshotFixture}
        selectedNode={null}
        onPreviousMessage={vi.fn()}
        onNextMessage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Evidence inspector" }),
    ).not.toBeNull();
    expect(screen.queryByText("Commit boundary")).not.toBeNull();
    expect(screen.queryByText("Committed offset")).not.toBeNull();
    expect(screen.queryAllByText("Observed").length).toBeGreaterThan(0);
  });

  it("does not activate topology and evidence detail models together", () => {
    render(
      <InspectorDrawer
        entityDetail={{
          entityId: "key-router",
          title: "Key router",
          summary: "Chooses one partition for an equal key.",
          provenance: "derived",
          focus: { kind: "entity", id: "key-router" },
          facts: [],
        }}
        message={null}
        event={null}
        snapshot={snapshotFixture}
        selectedNode={{ type: "topic" }}
        onPreviousMessage={vi.fn()}
        onNextMessage={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Evidence inspector" }),
    ).not.toBeNull();
    expect(screen.queryByText("Key router")).not.toBeNull();
    expect(screen.queryByText("Topic Metrics")).toBeNull();
  });

  it("exposes the How it works anchor target", () => {
    render(
      <EducationPanel
        scenarioId="partitioning"
        snapshot={snapshotFixture}
        selectedMessage={null}
      />,
    );

    expect(document.querySelector("#how-it-works")).not.toBeNull();
  });

  it("intercepts normal scenario links for active-run navigation", () => {
    const onNavigateScenario = vi.fn();
    render(
      <ScenarioSidebar
        scenarios={[scenarioFixture, loadBalancingScenarioFixture]}
        scenarioId="partitioning"
        onNavigateScenario={onNavigateScenario}
      />,
    );

    fireEvent.click(
      screen.getByRole("link", { name: /Consumer-group load balancing/ }),
    );

    expect(onNavigateScenario).toHaveBeenCalledWith("fan-out-load-balancing");
  });

  it("preserves native behavior for modified scenario link clicks", () => {
    const onNavigateScenario = vi.fn();
    render(
      <ScenarioSidebar
        scenarios={[scenarioFixture, loadBalancingScenarioFixture]}
        scenarioId="partitioning"
        onNavigateScenario={onNavigateScenario}
      />,
    );

    const link = screen.getByRole("link", {
      name: /Consumer-group load balancing/,
    });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, { metaKey: true });

    expect(onNavigateScenario).not.toHaveBeenCalled();
  });

  it("disables intercepted scenario navigation while actions are pending", () => {
    const onNavigateScenario = vi.fn();
    render(
      <ScenarioSidebar
        disabled
        scenarios={[scenarioFixture, loadBalancingScenarioFixture]}
        scenarioId="partitioning"
        onNavigateScenario={onNavigateScenario}
      />,
    );

    const link = screen.getByRole("link", {
      name: /Consumer-group load balancing/,
    });
    expect(link.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(link);

    expect(onNavigateScenario).not.toHaveBeenCalled();
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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

const scenarioFixture: ScenarioDefinition = {
  id: "partitioning",
  title: "Partitioning scenario",
  description: "Watch records move through a partitioned topic.",
  disabled: false,
  learningObjectives: [
    "Understand partition ownership",
    "Connect offsets to committed processing",
  ],
  topic: { partitions: 2 },
  limits: {
    maxConsumers: 3,
    maxProduceRate: 10,
    minProcessingLatencyMs: 0,
    maxProcessingLatencyMs: 5000,
  },
};

const loadBalancingScenarioFixture: ScenarioDefinition = {
  ...scenarioFixture,
  id: "fan-out-load-balancing",
  title: "Consumer-group load balancing",
  description: "Produce unkeyed messages and divide ownership.",
  topic: { partitions: 3 },
};

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
