import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoKafkaRuntimeAdapter } from "@kplay/kafka-runtime";
import { findScenario } from "@kplay/scenario-engine";
import { logger } from "./logger";
import { cleanupPlaygroundRun } from "./playground-cleanup";
import { createInternalRun } from "./playground-runtime-state";
import { createDeferred } from "./playground-runtime-test-helpers";

describe("cleanupPlaygroundRun deadlines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("attempts every consumer and does not overlap a timed-out disconnect retry", async () => {
    const { run, deleteRunResources } = createRun();
    const releaseDisconnect = createDeferred();
    const stuckDisconnect = vi.fn(() => releaseDisconnect.promise);
    const completedDisconnect = vi.fn().mockResolvedValue(undefined);
    run.consumerHandles.set("consumer-stuck", {
      consumerId: "consumer-stuck",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect: stuckDisconnect,
    });
    run.consumerHandles.set("consumer-completed", {
      consumerId: "consumer-completed",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect: completedDisconnect,
    });

    const firstCleanup = cleanup(run);
    await vi.advanceTimersByTimeAsync(25);
    await expect(firstCleanup).resolves.toMatchObject({
      status: "partially_completed",
      steps: expect.arrayContaining([
        expect.objectContaining({
          name: "consumer.disconnect",
          status: "failed",
          resourceName: "consumer-stuck",
          message: expect.stringContaining("timed out"),
        }),
        expect.objectContaining({
          name: "consumer.disconnect",
          status: "completed",
          resourceName: "consumer-completed",
        }),
      ]),
    });
    expect(stuckDisconnect).toHaveBeenCalledTimes(1);
    expect(completedDisconnect).toHaveBeenCalledTimes(1);
    expect([...run.consumerHandles.keys()]).toEqual(["consumer-stuck"]);
    expect(deleteRunResources).not.toHaveBeenCalled();

    const retryWhilePending = cleanup(run);
    await vi.advanceTimersByTimeAsync(25);
    await expect(retryWhilePending).resolves.toMatchObject({
      status: "failed",
    });
    expect(stuckDisconnect).toHaveBeenCalledTimes(1);

    releaseDisconnect.resolve();
    await vi.waitFor(() => expect(run.consumerHandles.size).toBe(0));
    await expect(cleanup(run)).resolves.toMatchObject({ status: "completed" });
    expect(deleteRunResources).toHaveBeenCalledTimes(1);
  });

  it("returns a retryable failure when pending mutation work misses its deadline", async () => {
    const { run, deleteRunResources } = createRun();
    const pendingMutation = createDeferred();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    run.consumerHandles.set("consumer-1", {
      consumerId: "consumer-1",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect,
    });

    const firstCleanup = cleanup(run, pendingMutation.promise);
    await vi.advanceTimersByTimeAsync(25);
    await expect(firstCleanup).resolves.toMatchObject({
      status: "partially_completed",
      steps: expect.arrayContaining([
        expect.objectContaining({
          name: "mutations.settle",
          status: "failed",
          message: expect.stringContaining("timed out"),
        }),
      ]),
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(deleteRunResources).not.toHaveBeenCalled();

    pendingMutation.resolve();
    await expect(cleanup(run, pendingMutation.promise)).resolves.toMatchObject({
      status: "completed",
    });
    expect(deleteRunResources).toHaveBeenCalledTimes(1);
  });

  it("bounds the overall cleanup and reuses an adapter cleanup still in flight", async () => {
    const { run, deleteRunResources } = createRun();
    const adapterResult = createDeferred<{
      status: "completed";
      steps: [];
    }>();
    deleteRunResources.mockImplementation(() => adapterResult.promise);

    const firstCleanup = cleanupPlaygroundRun({
      run,
      inFlightExperiment: undefined,
      pendingMutations: undefined,
      pendingRunScopedWork: Promise.resolve(),
      emit: vi.fn(),
      timeouts: { stepTimeoutMs: 100, overallTimeoutMs: 25 },
    });
    await vi.advanceTimersByTimeAsync(25);
    await expect(firstCleanup).resolves.toMatchObject({
      status: "failed",
      steps: [
        expect.objectContaining({
          name: "adapter.cleanup",
          status: "failed",
          message: expect.stringContaining("timed out after 25 ms"),
        }),
      ],
    });

    const retryWhilePending = cleanupPlaygroundRun({
      run,
      inFlightExperiment: undefined,
      pendingMutations: undefined,
      pendingRunScopedWork: Promise.resolve(),
      emit: vi.fn(),
      timeouts: { stepTimeoutMs: 100, overallTimeoutMs: 25 },
    });
    await vi.advanceTimersByTimeAsync(25);
    await expect(retryWhilePending).resolves.toMatchObject({
      status: "failed",
    });
    expect(deleteRunResources).toHaveBeenCalledTimes(1);

    adapterResult.resolve({ status: "completed", steps: [] });
    await Promise.resolve();
  });
});

function cleanup(
  run: ReturnType<typeof createInternalRun>,
  pendingMutations?: Promise<void>,
) {
  return cleanupPlaygroundRun({
    run,
    inFlightExperiment: undefined,
    pendingMutations,
    pendingRunScopedWork: Promise.resolve(),
    emit: vi.fn(),
    timeouts: { stepTimeoutMs: 25, overallTimeoutMs: 50 },
  });
}

function createRun() {
  const scenario = findScenario("partitioning");
  if (!scenario) throw new Error("Missing partitioning scenario");
  const adapter = new DemoKafkaRuntimeAdapter();
  const deleteRunResources = vi
    .spyOn(adapter, "deleteRunResources")
    .mockResolvedValue({ status: "completed", steps: [] });
  const run = createInternalRun({
    runId: "cleanup-deadline-run",
    adapter,
    mode: "demo",
    scenario,
    names: {
      topicName: "cleanup-deadline-topic",
      consumerGroupId: "cleanup-deadline-group",
    },
  });
  run.status = "running";
  return { run, deleteRunResources };
}
