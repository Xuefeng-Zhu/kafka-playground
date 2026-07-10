import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RunSnapshot } from "@kplay/contracts";
import { ControlsPanel } from "./controls-panel";

describe("ControlsPanel", () => {
  it("disables mutating controls while an action is pending", () => {
    renderControls({ disabled: true });

    expect(button("Start").disabled).toBe(true);
    expect(button("Pause").disabled).toBe(true);
    expect(button("Stop").disabled).toBe(true);
    expect(button("Produce one").disabled).toBe(true);
    expect(button("Consumer").disabled).toBe(true);
  });

  it("emits settings updates from always-visible controls", () => {
    const onUpdateSettings = vi.fn();
    renderControls({ onUpdateSettings });

    fireEvent.change(screen.getByLabelText("Messages per second"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Key strategy"), {
      target: { value: "no_key" },
    });
    fireEvent.change(screen.getByLabelText("Consumer processing latency"), {
      target: { value: "4500" },
    });

    expect(onUpdateSettings).toHaveBeenCalledWith({ productionRate: 7 });
    expect(onUpdateSettings).toHaveBeenCalledWith({
      keyStrategy: { type: "no_key" },
    });
    expect(onUpdateSettings).toHaveBeenCalledWith({
      processingLatencyMs: 4500,
    });
  });

  it("ignores blank, invalid, and out-of-range numeric edits", () => {
    const onUpdateSettings = vi.fn();
    renderControls({ onUpdateSettings });

    fireEvent.change(screen.getByLabelText("Messages per second"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Consumer processing latency"), {
      target: { value: "not-a-number" },
    });
    fireEvent.change(screen.getByLabelText("Messages per second"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Consumer processing latency"), {
      target: { value: "5001" },
    });

    expect(onUpdateSettings).not.toHaveBeenCalled();
  });

  it("wires per-consumer stop and crash actions", () => {
    const onStopConsumer = vi.fn();
    const onCrashConsumer = vi.fn();
    renderControls({ onStopConsumer, onCrashConsumer });

    const panel = screen.getByTestId("run-controls-panel");
    fireEvent.click(
      within(panel).getByRole("button", { name: "Stop consumer-1" }),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Crash consumer-1" }),
    );

    expect(onStopConsumer).toHaveBeenCalledWith("consumer-1");
    expect(onCrashConsumer).toHaveBeenCalledWith("consumer-1");
  });

  it("keeps Kafka group identifiers out of the controls surface", () => {
    renderControls();

    expect(screen.queryByText(/Group:/)).toBeNull();
    expect(screen.queryByText("group")).toBeNull();
  });

  it("reserves 44px mobile rows for settings inputs", () => {
    renderControls();

    const rateInput = screen.getByLabelText("Messages per second");
    const rateSlider = screen.getByLabelText("Produce rate slider");
    const latencyInput = screen.getByLabelText("Consumer processing latency");
    const latencySlider = screen.getByLabelText("Processing latency slider");
    const keyStrategy = screen.getByLabelText("Key strategy");
    const fixedKey = screen.getByLabelText("Fixed key");

    for (const input of [
      rateInput,
      rateSlider,
      latencyInput,
      latencySlider,
      keyStrategy,
      fixedKey,
    ]) {
      expect(input.className).toContain("h-11");
    }

    expect(rateInput.parentElement?.className).toContain(
      "grid-rows-[16px_44px_44px]",
    );
    expect(latencyInput.parentElement?.className).toContain(
      "grid-rows-[16px_44px_44px]",
    );
    expect(keyStrategy.parentElement?.className).toContain(
      "grid-rows-[16px_44px_minmax(44px,auto)]",
    );
  });
});

function renderControls({
  disabled = false,
  onUpdateSettings = vi.fn(),
  onStopConsumer = vi.fn(),
  onCrashConsumer = vi.fn(),
}: {
  disabled?: boolean;
  onUpdateSettings?: Parameters<typeof ControlsPanel>[0]["onUpdateSettings"];
  onStopConsumer?: Parameters<typeof ControlsPanel>[0]["onStopConsumer"];
  onCrashConsumer?: Parameters<typeof ControlsPanel>[0]["onCrashConsumer"];
} = {}) {
  return render(
    <ControlsPanel
      snapshot={snapshotFixture}
      disabled={disabled}
      onStartProducer={vi.fn()}
      onPauseProducer={vi.fn()}
      onStopProducer={vi.fn()}
      onProduceOne={vi.fn()}
      onAddConsumer={vi.fn()}
      onStopConsumer={onStopConsumer}
      onCrashConsumer={onCrashConsumer}
      onUpdateSettings={onUpdateSettings}
    />,
  );
}

const snapshotFixture = {
  runId: "run-1",
  scenarioId: "partitioning",
  mode: "demo",
  status: "running",
  topicName: "topic",
  partitionCount: 2,
  consumerLimit: 3,
  consumerGroupId: "group",
  producerStatus: "paused",
  productionRate: 1,
  keyStrategy: { type: "fixed", value: "user-1" },
  processingLatencyMs: 500,
  consumers: [
    {
      consumerId: "consumer-1",
      status: "running",
      assignments: [{ topic: "topic", partition: 0 }],
      processedCount: 1,
      committedCount: 1,
    },
  ],
  recentMessages: [],
  recentEvents: [],
  latestPartitionOffsets: {},
  latestCommittedOffsets: {},
  messageCounts: { produced: 0 },
  cleanupStatus: "not_requested",
  sequence: 0,
} satisfies RunSnapshot;

function button(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}
