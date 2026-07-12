import { describe, expect, it, vi } from "vitest";
import {
  createDeferred,
  createPlaygroundRuntimeTestHarness,
} from "./playground-runtime-test-helpers";
import "./playground-runtime-test-setup";

describe("PlaygroundRuntime message cleanup", () => {
  it("skips message processing immediately after cleanup starts", async () => {
    vi.useFakeTimers();
    const { getInternalRun, messages, runtime } =
      await createPlaygroundRuntimeTestHarness();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const messageId = snapshot.recentMessages.at(-1)?.messageId;
    if (!messageId) throw new Error("Missing pending message");
    const disconnectStarted = createDeferred();
    const releaseDisconnect = createDeferred();
    internalRun.consumerHandles.set("cleanup-blocker", {
      consumerId: "cleanup-blocker",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect: async () => {
        disconnectStarted.resolve();
        await releaseDisconnect.promise;
      },
    });

    const reset = runtime.reset(snapshot.runId);
    await disconnectStarted.promise;
    await expect(
      messages.process(snapshot.runId, messageId, "consumer-1"),
    ).resolves.toBeUndefined();

    expect(
      internalRun.messages.find((message) => message.messageId === messageId),
    ).toMatchObject({ state: "received", assignedConsumerId: "consumer-1" });
    expect(internalRun.messageCounts.processed).toBe(0);

    releaseDisconnect.resolve();
    await expect(reset).resolves.toEqual({ cleanupStatus: "completed" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("skips queued message processing when cleanup starts first", async () => {
    vi.useFakeTimers();
    const { getInternalRun, messages, runtime } =
      await createPlaygroundRuntimeTestHarness();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const messageId = snapshot.recentMessages.at(-1)?.messageId;
    if (!messageId) throw new Error("Missing pending message");
    const processingTimer = internalRun.processingTimers.get(messageId);
    if (processingTimer) clearTimeout(processingTimer);
    internalRun.processingTimers.delete(messageId);
    const produceStarted = createDeferred();
    const releaseProduce = createDeferred();
    const originalProduce = internalRun.adapter.produce.bind(
      internalRun.adapter,
    );
    vi.spyOn(internalRun.adapter, "produce").mockImplementationOnce(
      async (input) => {
        produceStarted.resolve();
        await releaseProduce.promise;
        return originalProduce(input);
      },
    );

    const blockingProduce = runtime.produceOne(snapshot.runId);
    await produceStarted.promise;
    const queuedProcessing = messages.process(
      snapshot.runId,
      messageId,
      "consumer-1",
    );
    const reset = runtime.reset(snapshot.runId);

    releaseProduce.resolve();
    await blockingProduce;
    await expect(queuedProcessing).resolves.toBeUndefined();
    await expect(reset).resolves.toEqual({ cleanupStatus: "completed" });

    expect(
      internalRun.messages.find((message) => message.messageId === messageId),
    ).toMatchObject({ state: "received", assignedConsumerId: "consumer-1" });
    expect(internalRun.messageCounts.processed).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains only failed handles after partial cleanup and completes on retry", async () => {
    const { logger } = await import("./logger");
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { getInternalRun, runtime } =
      await createPlaygroundRuntimeTestHarness();
    const snapshot = await runtime.createRun("partitioning");
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const disconnected = vi.fn().mockResolvedValue(undefined);
    const retryDisconnect = vi
      .fn()
      .mockRejectedValueOnce(new Error("disconnect unavailable"))
      .mockResolvedValueOnce(undefined);
    internalRun.consumerHandles.set("consumer-1", {
      consumerId: "consumer-1",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect: disconnected,
    });
    internalRun.consumerHandles.set("consumer-2", {
      consumerId: "consumer-2",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect: retryDisconnect,
    });

    await expect(runtime.reset(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "partially_completed",
    });
    expect(runtime.activeSnapshot()).toMatchObject({
      runId: snapshot.runId,
      cleanupStatus: "partially_completed",
      status: "stopped",
    });
    expect([...internalRun.consumerHandles.keys()]).toEqual(["consumer-2"]);
    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(retryDisconnect).toHaveBeenCalledTimes(1);
    await expect(runtime.produceOne(snapshot.runId)).rejects.toMatchObject({
      code: "RUN_NOT_ACTIVE",
      status: 409,
    });

    await expect(runtime.reset(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "completed",
    });
    expect(retryDisconnect).toHaveBeenCalledTimes(2);
    expect(runtime.activeSnapshot()).toBeNull();
  });
});
