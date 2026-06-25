import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  getServerEnv: () => ({
    KAFKA_MODE: "demo",
    AIVEN_KAFKA_BROKERS: "",
    AIVEN_KAFKA_USERNAME: "",
    AIVEN_KAFKA_PASSWORD: "",
    AIVEN_KAFKA_SASL_MECHANISM: "SCRAM-SHA-256",
    AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
    KAFKA_TOPIC_PREFIX: "kplay",
    MAX_ACTIVE_RUNS: 1,
    MAX_CONSUMERS_PER_RUN: 3,
    MAX_PRODUCE_RATE: 10,
    EVENT_HISTORY_LIMIT: 2000,
    TIMELINE_DISPLAY_LIMIT: 1000,
    LOG_MESSAGE_PAYLOADS: false
  })
}));

describe("PlaygroundRuntime demo integration", () => {
  it("starts a run, produces, assigns two consumers, marks a third idle, and resets idempotently", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    expect(snapshot.partitionCount).toBe(2);
    expect(runtime.activeSnapshot()?.runId).toBe(snapshot.runId);

    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.addConsumer(snapshot.runId);
    expect(snapshot.consumers.filter((consumer) => consumer.assignments.length > 0)).toHaveLength(2);
    expect(snapshot.consumers.some((consumer) => consumer.assignments.length === 0)).toBe(true);

    snapshot = await runtime.produceOne(snapshot.runId);
    expect(snapshot.recentMessages.at(-1)?.partition).not.toBeNull();
    expect(snapshot.recentMessages.at(-1)?.offset).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 550));
    snapshot = runtime.snapshot(snapshot.runId);
    expect(snapshot.messageCounts.committed).toBeGreaterThanOrEqual(1);

    await runtime.reset(snapshot.runId);
    expect(runtime.activeSnapshot()).toBeNull();
    await expect(runtime.deleteRun(snapshot.runId)).resolves.toEqual({ cleanupStatus: "completed" });
  });

  it("replays missed SSE events from bounded history", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning");
    await runtime.produceOne(snapshot.runId);
    const replayed: unknown[] = [];
    const unsubscribe = runtime.subscribe(snapshot.runId, 1, {
      id: "test",
      enqueue: (event) => replayed.push(event)
    });
    unsubscribe();
    expect(replayed.length).toBeGreaterThan(1);
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

  it("emits scenario-specific processing failures", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("retry-dead-letter-queues");
    snapshot = await runtime.updateSettings(snapshot.runId, { processingLatencyMs: 0 });
    snapshot = await runtime.addConsumer(snapshot.runId);
    await runtime.produceOne(snapshot.runId);
    await runtime.produceOne(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);

    await expect.poll(() => runtime.snapshot(snapshot.runId).messageCounts.failed).toBeGreaterThanOrEqual(1);
    snapshot = runtime.snapshot(snapshot.runId);
    expect(snapshot.recentMessages.some((message) => message.state === "failed")).toBe(true);
    expect(snapshot.recentEvents.some((event) => event.type === "message.processing_failed")).toBe(true);

    await runtime.reset(snapshot.runId);
  });

  it("returns the real cleanup status when deleting an active run", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning");
    (runtime as unknown as {
      adapter: { deleteRunResources: () => Promise<{ cleanupStatus?: string; status: "requested"; steps: [] }> };
    }).adapter.deleteRunResources = async () => ({ status: "requested", steps: [] });

    await expect(runtime.deleteRun(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "requested"
    });
  });

  it("requeues demo messages assigned to a stopped consumer before processing completes", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, { processingLatencyMs: 3000 });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const message = snapshot.recentMessages.at(-1);
    expect(message?.state).toBe("received");
    expect(message?.assignedConsumerId).toBe("consumer-1");

    snapshot = await runtime.stopConsumer(snapshot.runId, "consumer-1");
    const requeued = snapshot.recentMessages.find((item) => item.messageId === message?.messageId);
    expect(requeued).toMatchObject({
      state: "produced",
      assignedConsumerId: null
    });

    await runtime.reset(snapshot.runId);
  });
});
