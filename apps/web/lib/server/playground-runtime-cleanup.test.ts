import { describe, expect, it, vi } from "vitest";
import { createPlaygroundRuntimeTestHarness } from "./playground-runtime-test-helpers";
import "./playground-runtime-test-setup";

describe("PlaygroundRuntime cleanup status", () => {
  it("returns the real cleanup status when deleting an active run", async () => {
    const { adapter, runtime } = await createPlaygroundRuntimeTestHarness();
    const snapshot = await runtime.createRun("partitioning");
    vi.spyOn(adapter, "deleteRunResources").mockResolvedValue({
      status: "requested",
      steps: [],
    });

    await expect(runtime.deleteRun(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "requested",
    });
  });

  it("clears incomplete runs when startup is blocked by configuration", async () => {
    const { logger } = await import("./logger");
    const { adapter, runtime } = await createPlaygroundRuntimeTestHarness();
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const createRun = vi.fn(async () => {
      const error = new Error(
        "Aiven Kafka configuration is missing: AIVEN_KAFKA_BROKERS",
      ) as Error & { code: string; status: number };
      error.code = "AIVEN_CONFIGURATION_MISSING";
      error.status = 503;
      throw error;
    });
    vi.spyOn(adapter, "createRun").mockImplementation(createRun);
    const deleteRunResources = vi.spyOn(adapter, "deleteRunResources");

    await expect(runtime.createRun("partitioning")).rejects.toMatchObject({
      code: "AIVEN_CONFIGURATION_MISSING",
      status: 503,
    });
    expect(runtime.activeSnapshot()).toBeNull();
    expect(deleteRunResources).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ runId: expect.any(String) }),
      "Scenario run blocked by incomplete Kafka configuration",
    );
  });

  it("removes failed startup runs from the registry after cleanup", async () => {
    const { logger } = await import("./logger");
    const { adapter, runtime } = await createPlaygroundRuntimeTestHarness();
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    let failedRunId = "";
    const createRun = vi.fn(async (run: { runId: string }) => {
      failedRunId = run.runId;
      throw new Error("topic creation failed");
    });
    vi.spyOn(adapter, "createRun").mockImplementation(createRun);
    const deleteRunResources = vi
      .spyOn(adapter, "deleteRunResources")
      .mockResolvedValue({
        status: "completed" as const,
        steps: [],
      });

    await expect(runtime.createRun("partitioning")).rejects.toThrow(
      "topic creation failed",
    );

    expect(runtime.activeSnapshot()).toBeNull();
    expect(deleteRunResources).toHaveBeenCalledTimes(1);
    expect(failedRunId).toBeTruthy();
    expect(() => runtime.snapshot(failedRunId)).toThrow(
      "The scenario run does not exist.",
    );
  });

  it("retains failed startup runs when cleanup is incomplete", async () => {
    const { logger } = await import("./logger");
    const { adapter, runtime } = await createPlaygroundRuntimeTestHarness();
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    let failedRunId = "";
    const createRun = vi.fn(async (run: { runId: string }) => {
      failedRunId = run.runId;
      throw new Error("topic creation failed");
    });
    let cleanupAttempts = 0;
    vi.spyOn(adapter, "createRun").mockImplementation(createRun);
    const deleteRunResources = vi
      .spyOn(adapter, "deleteRunResources")
      .mockImplementation(async () => {
        cleanupAttempts += 1;
        if (cleanupAttempts === 1) throw new Error("cleanup unavailable");
        return { status: "completed" as const, steps: [] };
      });

    await expect(runtime.createRun("partitioning")).rejects.toThrow(
      "topic creation failed",
    );

    expect(failedRunId).toBeTruthy();
    expect(runtime.activeSnapshot()).toMatchObject({
      runId: failedRunId,
      status: "stopped",
      cleanupStatus: "failed",
    });
    expect(runtime.snapshot(failedRunId)).toMatchObject({
      runId: failedRunId,
      cleanupStatus: "failed",
    });
    await expect(runtime.createRun("partitioning")).rejects.toMatchObject({
      code: "RUN_ALREADY_ACTIVE",
      status: 409,
    });

    await expect(runtime.reset(failedRunId)).resolves.toEqual({
      cleanupStatus: "completed",
    });
    expect(deleteRunResources).toHaveBeenCalledTimes(2);
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("exposes failed cleanup for recovery, rejects mutations, and allows retry", async () => {
    const { adapter, runtime } = await createPlaygroundRuntimeTestHarness();
    const snapshot = await runtime.createRun("partitioning");
    let cleanupAttempts = 0;
    const deleteRunResources = vi
      .spyOn(adapter, "deleteRunResources")
      .mockImplementation(async () => {
        cleanupAttempts += 1;
        if (cleanupAttempts === 1) throw new Error("cleanup unavailable");
        return { status: "completed" as const, steps: [] };
      });

    await expect(runtime.reset(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "failed",
    });
    expect(runtime.activeSnapshot()).toMatchObject({
      runId: snapshot.runId,
      status: "stopped",
      cleanupStatus: "failed",
    });
    await expect(
      runtime.updateSettings(snapshot.runId, { processingLatencyMs: 25 }),
    ).rejects.toMatchObject({
      code: "RUN_NOT_ACTIVE",
      status: 409,
    });
    for (const mutation of [
      () => runtime.produceOne(snapshot.runId),
      () => runtime.startProducer(snapshot.runId),
      () => runtime.addConsumer(snapshot.runId),
    ]) {
      await expect(mutation()).rejects.toMatchObject({
        code: "RUN_NOT_ACTIVE",
        status: 409,
      });
    }
    expect(deleteRunResources).toHaveBeenCalledTimes(1);

    await expect(runtime.reset(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "completed",
    });
    expect(deleteRunResources).toHaveBeenCalledTimes(2);
    expect(runtime.activeSnapshot()).toBeNull();
  });
});
