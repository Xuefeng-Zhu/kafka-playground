import { describe, expect, it, vi } from "vitest";
import "./playground-runtime-test-setup";

describe("PlaygroundRuntime message lifecycle", () => {
  it("emits scenario-specific processing failures", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("retry-dead-letter-queues");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 0,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    await runtime.produceOne(snapshot.runId);
    await runtime.produceOne(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);

    await expect
      .poll(() => runtime.snapshot(snapshot.runId).messageCounts.failed)
      .toBeGreaterThanOrEqual(1);
    snapshot = runtime.snapshot(snapshot.runId);
    expect(
      snapshot.recentMessages.some((message) => message.state === "failed"),
    ).toBe(true);
    expect(
      snapshot.recentEvents.some(
        (event) => event.type === "message.processing_failed",
      ),
    ).toBe(true);

    await runtime.reset(snapshot.runId);
  });

  it("marks failed produce attempts and leaves an inspectable failed message", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { DemoKafkaRuntimeAdapter } = await import("@kplay/kafka-runtime");
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning");
    vi.spyOn(DemoKafkaRuntimeAdapter.prototype, "produce").mockRejectedValue(
      new Error("producer unavailable"),
    );

    await expect(runtime.produceOne(snapshot.runId)).rejects.toThrow(
      "producer unavailable",
    );
    const failedSnapshot = runtime.snapshot(snapshot.runId);

    expect(failedSnapshot.messageCounts.failed).toBe(1);
    expect(failedSnapshot.recentMessages.at(-1)).toMatchObject({
      state: "failed",
      partition: null,
      offset: null,
    });
    expect(
      failedSnapshot.recentEvents.some(
        (event) => event.type === "run.error" && event.messageId,
      ),
    ).toBe(true);

    await runtime.reset(snapshot.runId);
  });

  it("requeues demo messages assigned to a stopped consumer before processing completes", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const message = snapshot.recentMessages.at(-1);
    expect(message?.state).toBe("received");
    expect(message?.assignedConsumerId).toBe("consumer-1");

    snapshot = await runtime.stopConsumer(snapshot.runId, "consumer-1");
    const requeued = snapshot.recentMessages.find(
      (item) => item.messageId === message?.messageId,
    );
    expect(requeued).toMatchObject({
      state: "produced",
      assignedConsumerId: null,
    });

    await runtime.reset(snapshot.runId);
  });

  it("keeps crashed demo consumers visible and replays uncommitted messages to replacements", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("at-least-once-duplicates");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const message = snapshot.recentMessages.at(-1);
    expect(message?.state).toBe("received");
    expect(message?.assignedConsumerId).toBe("consumer-1");

    snapshot = await runtime.crashConsumer(snapshot.runId, "consumer-1");
    const crashed = snapshot.consumers.find(
      (consumer) => consumer.consumerId === "consumer-1",
    );
    expect(crashed).toMatchObject({
      status: "crashed",
      assignments: [],
    });
    const requeued = snapshot.recentMessages.find(
      (item) => item.messageId === message?.messageId,
    );
    expect(requeued).toMatchObject({
      state: "produced",
      assignedConsumerId: null,
    });
    expect(
      snapshot.recentEvents.some((event) => event.type === "consumer.crashed"),
    ).toBe(true);

    snapshot = await runtime.addConsumer(snapshot.runId);
    expect(snapshot.consumers.map((consumer) => consumer.consumerId)).toContain(
      "consumer-2",
    );
    const replacement = snapshot.consumers.find(
      (consumer) => consumer.consumerId === "consumer-2",
    );
    expect(replacement?.assignments.length).toBeGreaterThan(0);
    const replayed = snapshot.recentMessages.find(
      (item) => item.messageId === message?.messageId,
    );
    expect(replayed).toMatchObject({
      state: "received",
      assignedConsumerId: "consumer-2",
    });

    await runtime.reset(snapshot.runId);
  });

  it("does not process a redelivered message twice after a crash", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 25,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const messageId = snapshot.recentMessages.at(-1)?.messageId;

    snapshot = await runtime.crashConsumer(snapshot.runId, "consumer-1");
    snapshot = await runtime.addConsumer(snapshot.runId);
    expect(
      snapshot.recentMessages.find(
        (message) => message.messageId === messageId,
      ),
    ).toMatchObject({
      state: "received",
      assignedConsumerId: "consumer-2",
    });

    await vi.advanceTimersByTimeAsync(80);
    snapshot = runtime.snapshot(snapshot.runId);
    expect(snapshot.messageCounts.processed).toBe(1);
    expect(snapshot.messageCounts.committed).toBe(1);
    expect(
      snapshot.recentEvents.filter(
        (event) => event.type === "offset.committed",
      ),
    ).toHaveLength(1);

    await runtime.reset(snapshot.runId);
  });

  it("does not requeue committed messages when a consumer crashes", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 0,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const messageId = snapshot.recentMessages.at(-1)?.messageId;

    await expect
      .poll(() => runtime.snapshot(snapshot.runId).messageCounts.committed)
      .toBeGreaterThanOrEqual(1);
    snapshot = await runtime.crashConsumer(snapshot.runId, "consumer-1");
    const committed = snapshot.recentMessages.find(
      (item) => item.messageId === messageId,
    );
    expect(committed).toMatchObject({
      state: "committed",
      assignedConsumerId: "consumer-1",
    });

    await runtime.reset(snapshot.runId);
  });
});
