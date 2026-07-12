import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CLEANUP_STEP_TIMEOUT_MS } from "./playground-cleanup-deadlines";
import {
  createDeferred,
  createPlaygroundRuntimeTestHarness,
} from "./playground-runtime-test-helpers";
import "./playground-runtime-test-setup";

describe("PlaygroundRuntime timed-out experiment cleanup", () => {
  it("keeps cleanup authoritative when a deferred experiment settles late", async () => {
    vi.useFakeTimers();
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    let started = await runtime.createRun("partitioning");
    started = await runtime.updateSettings(started.runId, {
      productionRate: 10,
    });
    await runtime.startProducer(started.runId);
    const run = getInternalRun();
    if (!run) throw new Error("Missing internal run");

    const observationStarted = createDeferred();
    const releaseObservation = createDeferred();
    const produce = run.adapter.produce.bind(run.adapter);
    vi.spyOn(run.adapter, "produce").mockImplementationOnce(async (input) => {
      observationStarted.resolve();
      await releaseObservation.promise;
      return produce(input);
    });

    const experiment = runtime.runExperiment(
      started.runId,
      "produce-keyed-record",
    );
    const experimentRejected = expect(experiment).rejects.toMatchObject({
      code: "RUN_CLEANUP_IN_PROGRESS",
    });
    await observationStarted.promise;

    const deliveredTypes: string[] = [];
    runtime.subscribe(started.runId, null, {
      id: "cleanup-observer",
      enqueue: (event) => deliveredTypes.push(event.type),
    });

    const reset = runtime.reset(started.runId);
    await vi.advanceTimersByTimeAsync(DEFAULT_CLEANUP_STEP_TIMEOUT_MS);
    await expect(reset).resolves.toEqual({ cleanupStatus: "failed" });

    const cleanupEventTypes = [
      "resource.cleanup_started",
      "resource.cleanup_failed",
      "run.stopped",
    ];
    expect(deliveredTypes.slice(-3)).toEqual(cleanupEventTypes);
    expect(run.events.slice(-3).map((event) => event.type)).toEqual(
      cleanupEventTypes,
    );
    await expect(runtime.produceOne(started.runId)).rejects.toMatchObject({
      code: "RUN_CLEANUP_IN_PROGRESS",
    });

    releaseObservation.resolve();
    await experimentRejected;

    expect(run).toMatchObject({
      status: "stopped",
      producerStatus: "stopped",
      cleanupStatus: "failed",
      scenarioState: null,
      inFlightExperimentId: null,
      consumers: [],
    });
    expect(run.processingTimers.size).toBe(0);
    expect(run.producerTimer).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(run.events.slice(-3).map((event) => event.type)).toEqual(
      cleanupEventTypes,
    );
    await expect(runtime.produceOne(started.runId)).rejects.toMatchObject({
      code: "RUN_NOT_ACTIVE",
    });

    await expect(runtime.reset(started.runId)).resolves.toEqual({
      cleanupStatus: "completed",
    });
    expect(runtime.activeSnapshot()).toBeNull();
  });
});
