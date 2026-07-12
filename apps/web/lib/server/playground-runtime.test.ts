import { describe, expect, it, vi } from "vitest";
import "./playground-runtime-test-setup";

describe("PlaygroundRuntime demo integration", () => {
  it("starts a run, produces, assigns two consumers, marks a third idle, and resets idempotently", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 25,
    });
    expect(snapshot.partitionCount).toBe(2);
    expect(runtime.activeSnapshot()?.runId).toBe(snapshot.runId);

    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.addConsumer(snapshot.runId);
    expect(
      snapshot.consumers.filter((consumer) => consumer.assignments.length > 0),
    ).toHaveLength(2);
    expect(
      snapshot.consumers.some((consumer) => consumer.assignments.length === 0),
    ).toBe(true);

    snapshot = await runtime.produceOne(snapshot.runId);
    expect(snapshot.recentMessages.at(-1)?.partition).not.toBeNull();
    expect(snapshot.recentMessages.at(-1)?.offset).not.toBeNull();

    await vi.advanceTimersByTimeAsync(25);
    snapshot = runtime.snapshot(snapshot.runId);
    expect(snapshot.messageCounts.committed).toBeGreaterThanOrEqual(1);

    await runtime.reset(snapshot.runId);
    expect(runtime.activeSnapshot()).toBeNull();
    await expect(runtime.deleteRun(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "completed",
    });
  });

  it("commits the exact next offset above Number.MAX_SAFE_INTEGER", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { DemoKafkaRuntimeAdapter } = await import("@kplay/kafka-runtime");
    const consumedOffset = "9007199254740992";
    vi.spyOn(DemoKafkaRuntimeAdapter.prototype, "produce").mockResolvedValue({
      topic: "topic",
      partition: 0,
      offset: consumedOffset,
      timestamp: new Date(0).toISOString(),
    });
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 0,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const messageId = snapshot.recentMessages.at(-1)?.messageId;

    await expect
      .poll(
        () =>
          runtime
            .snapshot(snapshot.runId)
            .recentMessages.find((message) => message.messageId === messageId)
            ?.committedOffset,
      )
      .toBe("9007199254740993");

    expect(runtime.snapshot(snapshot.runId).latestCommittedOffsets["0"]).toBe(
      "9007199254740993",
    );
    await runtime.reset(snapshot.runId);
  });

  it("keeps active runs isolated by browser session", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();

    const sessionOneRun = await runtime.createRun(
      "partitioning",
      {},
      "session-one",
    );
    const sessionTwoRun = await runtime.createRun(
      "fan-out-load-balancing",
      {},
      "session-two",
    );

    expect(runtime.activeSnapshot("session-one")?.runId).toBe(
      sessionOneRun.runId,
    );
    expect(runtime.activeSnapshot("session-two")?.runId).toBe(
      sessionTwoRun.runId,
    );
    expect(runtime.activeSnapshot("session-one")?.scenarioId).toBe(
      "partitioning",
    );
    expect(runtime.activeSnapshot("session-two")?.scenarioId).toBe(
      "fan-out-load-balancing",
    );
    try {
      runtime.snapshot(sessionOneRun.runId, "session-two");
      throw new Error("Expected cross-session snapshot to fail.");
    } catch (error) {
      expect(error).toMatchObject({ code: "RUN_NOT_FOUND" });
    }

    await runtime.reset(sessionOneRun.runId, "session-one");
    expect(runtime.activeSnapshot("session-one")).toBeNull();
    expect(runtime.activeSnapshot("session-two")?.runId).toBe(
      sessionTwoRun.runId,
    );

    await runtime.reset(sessionTwoRun.runId, "session-two");
  });

  it("keeps automatic producer ticks scoped to the browser session", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning", {}, "session-one");
    snapshot = await runtime.updateSettings(
      snapshot.runId,
      {
        productionRate: 10,
      },
      "session-one",
    );

    await runtime.startProducer(snapshot.runId, "session-one");
    await vi.advanceTimersByTimeAsync(120);

    expect(
      runtime.snapshot(snapshot.runId, "session-one").messageCounts.produced,
    ).toBeGreaterThanOrEqual(1);

    await runtime.reset(snapshot.runId, "session-one");
  });

  it("replays missed SSE events from bounded history", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning");
    await runtime.produceOne(snapshot.runId);
    const replayed: unknown[] = [];
    const unsubscribe = runtime.subscribe(snapshot.runId, 1, {
      id: "test",
      enqueue: (event) => replayed.push(event),
    });
    unsubscribe();
    expect(replayed.length).toBeGreaterThan(1);
    await runtime.reset(snapshot.runId);
  });

  it("removes failed SSE subscribers without blocking healthy subscribers", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { logger } = await import("./logger");
    const runtime = new PlaygroundRuntime();
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const snapshot = await runtime.createRun("partitioning");
    const delivered: unknown[] = [];

    runtime.subscribe(snapshot.runId, null, {
      id: "broken",
      enqueue: (event) => {
        if ("snapshot" in event) return;
        throw new Error("client stream closed");
      },
    });
    const unsubscribe = runtime.subscribe(snapshot.runId, null, {
      id: "healthy",
      enqueue: (event) => delivered.push(event),
    });

    await runtime.produceOne(snapshot.runId);
    unsubscribe();

    expect(
      delivered.some(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "message.produced",
      ),
    ).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: snapshot.runId,
        subscriberId: "broken",
      }),
      "Removed failed runtime event subscriber",
    );

    await runtime.reset(snapshot.runId);
  });

  it("starts and resets every implemented scenario", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { SCENARIOS } = await import("@kplay/scenario-engine");
    const runtime = new PlaygroundRuntime();

    for (const scenario of SCENARIOS) {
      const snapshot = await runtime.createRun(scenario.id);
      expect(snapshot.scenarioId).toBe(scenario.id);
      expect(snapshot.partitionCount).toBe(scenario.topic.partitions);
      expect(snapshot.status).toBe("running");
      await runtime.reset(snapshot.runId);
    }
  });
});
