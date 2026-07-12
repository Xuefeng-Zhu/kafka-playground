import { describe, expect, it, vi } from "vitest";
import "./playground-runtime-test-setup";
import { createPlaygroundRuntimeTestHarness } from "./playground-runtime-test-helpers";

describe("PlaygroundRuntime scheduling", () => {
  it("serializes automatic producer ticks so async sends do not overlap", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { DemoKafkaRuntimeAdapter } = await import("@kplay/kafka-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      productionRate: 10,
    });
    let inFlight = 0;
    let maxInFlight = 0;
    vi.spyOn(DemoKafkaRuntimeAdapter.prototype, "produce").mockImplementation(
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 250));
        inFlight -= 1;
        return {
          topic: snapshot.topicName,
          partition: 0,
          offset: String(maxInFlight),
          timestamp: new Date(0).toISOString(),
        };
      },
    );

    await runtime.startProducer(snapshot.runId);
    await vi.advanceTimersByTimeAsync(300);

    expect(maxInFlight).toBe(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(runtime.snapshot(snapshot.runId).messageCounts.produced).toBe(1);

    const reset = runtime.reset(snapshot.runId);
    await vi.advanceTimersByTimeAsync(250);
    await reset;
  });

  it("does not reschedule automatic producer ticks after reset during an in-flight send", async () => {
    vi.useFakeTimers();
    const { DemoKafkaRuntimeAdapter } = await import("@kplay/kafka-runtime");
    const { getInternalRun, runtime } =
      await createPlaygroundRuntimeTestHarness();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      productionRate: 10,
    });
    let resolveProduce: (() => void) | null = null;
    vi.spyOn(DemoKafkaRuntimeAdapter.prototype, "produce").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProduce = () =>
            resolve({
              topic: snapshot.topicName,
              partition: 0,
              offset: "0",
              timestamp: new Date(0).toISOString(),
            });
        }),
    );

    await runtime.startProducer(snapshot.runId);
    await vi.advanceTimersByTimeAsync(100);
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const queuedSettings = runtime.updateSettings(snapshot.runId, {
      productionRate: 5,
    });
    const queuedSettingsRejected = expect(queuedSettings).rejects.toMatchObject(
      {
        code: "RUN_CLEANUP_IN_PROGRESS",
        status: 409,
      },
    );
    let resetSettled = false;
    const reset = runtime.reset(snapshot.runId).finally(() => {
      resetSettled = true;
    });
    await Promise.resolve();

    expect(resetSettled).toBe(false);

    await actResolvedProduce(resolveProduce);
    await queuedSettingsRejected;
    await expect(reset).resolves.toEqual({ cleanupStatus: "completed" });
    expect(internalRun).toMatchObject({
      status: "stopped",
      producerStatus: "stopped",
      producerTimer: null,
      messageCounts: expect.objectContaining({ produced: 1 }),
    });
    expect(internalRun.processingTimers.size).toBe(0);
    expect(internalRun.consumerHandles.size).toBe(0);
    const eventCountAfterReset = internalRun.events.length;

    await vi.advanceTimersByTimeAsync(1000);

    expect(vi.getTimerCount()).toBe(0);
    expect(internalRun.events).toHaveLength(eventCountAfterReset);
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("logs scheduled demo processing failures instead of leaving unhandled rejections", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { PlaygroundRuntimeMessages } =
      await import("./playground-runtime-messages");
    const { logger } = await import("./logger");
    const runtime = new PlaygroundRuntime();
    const error = new Error("scheduled failure");
    const logError = vi
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(PlaygroundRuntimeMessages.prototype, "process").mockRejectedValue(
      error,
    );
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 25,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const messageId = snapshot.recentMessages.at(-1)?.messageId;

    await vi.advanceTimersByTimeAsync(25);

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        runId: snapshot.runId,
        messageId,
        consumerId: "consumer-1",
      }),
      "Scheduled message processing failed",
    );

    await runtime.reset(snapshot.runId);
  });

  it("clears pending processing timers when old messages are pruned", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);

    for (let index = 0; index < 501; index += 1) {
      snapshot = await runtime.produceOne(snapshot.runId);
    }

    expect(runtime.snapshot(snapshot.runId).messageCounts.produced).toBe(501);
    expect(vi.getTimerCount()).toBe(500);

    await runtime.reset(snapshot.runId);
    expect(vi.getTimerCount()).toBe(0);
  });
});

async function actResolvedProduce(resolveProduce: (() => void) | null) {
  expect(resolveProduce).not.toBeNull();
  resolveProduce?.();
  await Promise.resolve();
}
