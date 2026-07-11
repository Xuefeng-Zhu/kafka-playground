import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoKafkaRuntimeAdapter } from "@kplay/kafka-runtime";
import { findScenario } from "@kplay/scenario-engine";
import {
  createInternalRun,
  createRunSnapshot,
} from "./playground-runtime-state";
import { executeScenarioExperiment } from "./scenario-experiment-execution";
import {
  captureScenarioExperimentCheckpoint,
  restoreScenarioExperimentCheckpoint,
  restoreScenarioExperimentProducerStatus,
  suspendScenarioExperimentTimers,
} from "./scenario-experiment-transaction";

describe("scenario experiment setup", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the in-flight guard when checkpoint capture fails", async () => {
    const harness = await createHarness();
    const originalTimer = harness.run.producerTimer;
    harness.captureCheckpoint.mockImplementationOnce(() => {
      throw new Error("checkpoint capture failed");
    });

    await expect(executeScenarioExperiment(harness.input)).rejects.toThrow(
      "checkpoint capture failed",
    );

    expect(harness.run.inFlightExperimentId).toBeNull();
    expect(harness.suspendTimers).not.toHaveBeenCalled();
    expect(harness.beginEventBuffer).not.toHaveBeenCalled();
    expect(harness.discardEventBuffer).not.toHaveBeenCalled();
    expect(harness.resumeTimers).not.toHaveBeenCalled();
    expect(harness.run.producerTimer).toBe(originalTimer);
    expect(harness.isEventBufferActive()).toBe(false);
    expect(harness.run.scenarioState?.experiment).toMatchObject({
      status: "failed",
      experimentId: "trigger-acl-denial",
    });
  });

  it("restores the checkpoint and timers when suspension fails", async () => {
    const harness = await createHarness();
    harness.suspendTimers.mockImplementationOnce(() => {
      suspendScenarioExperimentTimers(harness.run);
      harness.run.messageCounts.produced = 99;
      throw new Error("timer suspension failed");
    });

    await expect(executeScenarioExperiment(harness.input)).rejects.toThrow(
      "timer suspension failed",
    );

    expect(harness.run.inFlightExperimentId).toBeNull();
    expect(harness.run.messageCounts.produced).toBe(0);
    expect(harness.run.producerStatus).toBe("running");
    expect(harness.run.producerTimer).not.toBeNull();
    expect(harness.beginEventBuffer).not.toHaveBeenCalled();
    expect(harness.restoreCheckpoint).toHaveBeenCalledTimes(1);
    expect(harness.resumeTimers).toHaveBeenCalledTimes(1);
    expect(harness.isEventBufferActive()).toBe(false);
    expect(harness.run.scenarioState?.experiment.status).toBe("failed");
  });

  it("discards a partially initialized buffer and restores timers", async () => {
    const harness = await createHarness();
    harness.beginEventBuffer.mockImplementationOnce(() => {
      harness.setEventBufferActive(true);
      throw new Error("event buffer initialization failed");
    });

    await expect(executeScenarioExperiment(harness.input)).rejects.toThrow(
      "event buffer initialization failed",
    );

    expect(harness.run.inFlightExperimentId).toBeNull();
    expect(harness.discardEventBuffer).toHaveBeenCalledTimes(1);
    expect(harness.restoreCheckpoint).toHaveBeenCalledTimes(1);
    expect(harness.resumeTimers).toHaveBeenCalledTimes(1);
    expect(harness.run.producerStatus).toBe("running");
    expect(harness.run.producerTimer).not.toBeNull();
    expect(harness.isEventBufferActive()).toBe(false);
    expect(harness.run.scenarioState?.experiment.status).toBe("failed");
  });
});

async function createHarness() {
  const scenario = findScenario("acl-least-privilege");
  if (!scenario) throw new Error("Missing ACL scenario");
  const adapter = new DemoKafkaRuntimeAdapter();
  const run = createInternalRun({
    runId: "setup-failure-run",
    adapter,
    mode: "demo",
    scenario,
    names: {
      topicName: "setup-failure-topic",
      consumerGroupId: "setup-failure-group",
    },
  });
  await adapter.createRun(run);
  run.status = "running";
  run.producerStatus = "running";
  run.producerTimer = setTimeout(() => undefined, 1_000);

  let eventBufferActive = false;
  const captureCheckpoint = vi.fn(() =>
    captureScenarioExperimentCheckpoint(run),
  );
  const suspendTimers = vi.fn(() => suspendScenarioExperimentTimers(run));
  const beginEventBuffer = vi.fn(() => {
    eventBufferActive = true;
  });
  const discardEventBuffer = vi.fn(() => {
    eventBufferActive = false;
  });
  const flushEventBuffer = vi.fn(() => {
    eventBufferActive = false;
  });
  const restoreCheckpoint = vi.fn((checkpoint) =>
    restoreScenarioExperimentCheckpoint(run, checkpoint),
  );
  const restoreProducerStatus = vi.fn((checkpoint) =>
    restoreScenarioExperimentProducerStatus(run, checkpoint.producerStatus),
  );
  const resumeTimers = vi.fn((checkpoint) => {
    restoreScenarioExperimentProducerStatus(run, checkpoint.producerStatus);
    if (run.producerStatus === "running") {
      run.producerTimer = setTimeout(() => undefined, 1_000);
    }
  });
  const emit = vi.fn();

  const input: Parameters<typeof executeScenarioExperiment>[0] = {
    run,
    experimentId: "trigger-acl-denial",
    prepareObservations: async () => undefined,
    emit,
    beginEventBuffer,
    discardEventBuffer,
    flushEventBuffer,
    captureCheckpoint,
    restoreCheckpoint,
    suspendTimers,
    restoreProducerStatus,
    resumeTimers,
    snapshot: () => createRunSnapshot(run, 3, 100),
  };

  return {
    run,
    input,
    captureCheckpoint,
    suspendTimers,
    beginEventBuffer,
    discardEventBuffer,
    restoreCheckpoint,
    resumeTimers,
    isEventBufferActive: () => eventBufferActive,
    setEventBufferActive: (active: boolean) => {
      eventBufferActive = active;
    },
  };
}
