import { afterEach, describe, expect, it, vi } from "vitest";
import { getInternalRun } from "./playground-runtime-test-helpers";

vi.mock("./env", () => ({
  getServerEnv: () => ({
    KAFKA_MODE: "demo",
    AIVEN_KAFKA_BROKERS: "",
    AIVEN_KAFKA_USERNAME: "",
    AIVEN_KAFKA_PASSWORD: "",
    AIVEN_KAFKA_SASL_MECHANISM: "SCRAM-SHA-256",
    AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
    KAFKA_TOPIC_PREFIX: "kplay",
    MAX_CONSUMERS_PER_RUN: 10,
    MAX_PRODUCE_RATE: 10,
    EVENT_HISTORY_LIMIT: 2000,
    TIMELINE_DISPLAY_LIMIT: 1000,
    LOG_MESSAGE_PAYLOADS: false,
  }),
}));

describe("PlaygroundRuntime demo integration", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it("starts remote runs with a user-configured adapter", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    const createRun = vi
      .spyOn(UserConfiguredKafkaRuntimeAdapter.prototype, "createRun")
      .mockResolvedValue(undefined);
    const produce = vi
      .spyOn(UserConfiguredKafkaRuntimeAdapter.prototype, "produce")
      .mockResolvedValue({
        topic: "topic",
        partition: 0,
        offset: "1",
        timestamp: new Date(0).toISOString(),
      });
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "deleteRunResources",
    ).mockResolvedValue({
      status: "requested",
      steps: [],
    });
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: {
        brokers: "broker.example.com:9092",
        username: "service-user",
        password: "service-password",
        saslMechanism: "SCRAM-SHA-256",
        useTls: true,
        caCertificate: "",
      },
    });

    expect(snapshot.mode).toBe("remote");
    expect(snapshot.scenarioState).toBeNull();
    expect(createRun).toHaveBeenCalledTimes(1);

    snapshot = await runtime.produceOne(snapshot.runId);

    expect(produce).toHaveBeenCalledTimes(1);
    expect(snapshot.recentMessages.at(-1)).toMatchObject({
      partition: 0,
      offset: "1",
    });

    await runtime.reset(snapshot.runId);
  });

  it("reports missing user-configured remote fields as sanitized status", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();

    await expect(
      runtime.testConnection({
        mode: "remote",
        remoteKafkaConfig: {
          brokers: "",
          username: "",
          password: "",
          saslMechanism: "SCRAM-SHA-256",
          useTls: true,
          caCertificate: "secret certificate",
        },
      }),
    ).resolves.toMatchObject({
      status: "configuration_missing",
      mode: "remote",
      missingVariables: ["brokers", "username", "password"],
      error: null,
    });
  });

  it("rolls back remote consumers when consumer startup fails", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createConsumer",
    ).mockRejectedValue(new Error("consumer unavailable"));
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "deleteRunResources",
    ).mockResolvedValue({
      status: "requested",
      steps: [],
    });
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: {
        brokers: "broker.example.com:9092",
        username: "service-user",
        password: "service-password",
        saslMechanism: "SCRAM-SHA-256",
        useTls: true,
        caCertificate: "",
      },
    });

    await expect(runtime.addConsumer(snapshot.runId)).rejects.toThrow(
      "consumer unavailable",
    );
    const failedSnapshot = runtime.snapshot(snapshot.runId);

    expect(failedSnapshot.consumers).toHaveLength(0);
    expect(
      failedSnapshot.recentEvents.some(
        (event) =>
          event.type === "run.error" &&
          event.actor === "consumer-1" &&
          event.message === "Consumer failed to start.",
      ),
    ).toBe(true);

    await runtime.reset(snapshot.runId);
  });

  it("tracks a consumer handle when startup rollback fails and retries it during cleanup", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const {
      KafkaConsumerStartupRollbackError,
      UserConfiguredKafkaRuntimeAdapter,
    } = await import("@kplay/kafka-runtime");
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const consumerHandle = {
      consumerId: "consumer-1",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect,
    };
    const startupRollbackError = new KafkaConsumerStartupRollbackError(
      new Error("consumer unavailable"),
      new Error("startup rollback disconnect unavailable"),
      consumerHandle,
    );
    const createConsumer = vi
      .spyOn(UserConfiguredKafkaRuntimeAdapter.prototype, "createConsumer")
      .mockRejectedValue(startupRollbackError);
    const deleteRunResources = vi
      .spyOn(UserConfiguredKafkaRuntimeAdapter.prototype, "deleteRunResources")
      .mockResolvedValue({ status: "completed", steps: [] });
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: remoteKafkaConfig(),
    });
    const internalRun = getInternalRun(runtime);
    if (!internalRun) throw new Error("Missing internal run");

    await expect(runtime.addConsumer(snapshot.runId)).rejects.toBe(
      startupRollbackError,
    );

    const recoverySnapshot = runtime.snapshot(snapshot.runId);
    expect(recoverySnapshot).toMatchObject({
      consumers: [],
      cleanupStatus: "failed",
    });
    expect(
      recoverySnapshot.recentEvents.some(
        (event) =>
          event.type === "run.error" &&
          event.message ===
            "Consumer startup cleanup failed. Reset the run to retry cleanup.",
      ),
    ).toBe(true);
    expect(internalRun.consumerHandles.get("consumer-1")).toBe(consumerHandle);
    await expect(runtime.addConsumer(snapshot.runId)).rejects.toMatchObject({
      code: "RUN_NOT_ACTIVE",
      status: 409,
    });
    expect(createConsumer).toHaveBeenCalledTimes(1);

    await expect(runtime.reset(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "completed",
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(deleteRunResources).toHaveBeenCalledTimes(1);
    expect(internalRun.consumerHandles.size).toBe(0);
  });

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
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning");
    (
      runtime as unknown as {
        adapter: {
          produce: () => Promise<never>;
        };
      }
    ).adapter.produce = async () => {
      throw new Error("producer unavailable");
    };

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

  it("serializes automatic producer ticks so async sends do not overlap", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      productionRate: 10,
    });
    let inFlight = 0;
    let maxInFlight = 0;
    (
      runtime as unknown as {
        adapter: {
          produce: () => Promise<{
            topic: string;
            partition: number;
            offset: string;
            timestamp: string;
          }>;
        };
      }
    ).adapter.produce = async () => {
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
    };

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
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      productionRate: 10,
    });
    let resolveProduce: (() => void) | null = null;
    (
      runtime as unknown as {
        adapter: {
          produce: () => Promise<{
            topic: string;
            partition: number;
            offset: string;
            timestamp: string;
          }>;
        };
      }
    ).adapter.produce = () =>
      new Promise((resolve) => {
        resolveProduce = () =>
          resolve({
            topic: snapshot.topicName,
            partition: 0,
            offset: "0",
            timestamp: new Date(0).toISOString(),
          });
      });

    await runtime.startProducer(snapshot.runId);
    await vi.advanceTimersByTimeAsync(100);
    const internalRun = getInternalRun(runtime);
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
    const { logger } = await import("./logger");
    const runtime = new PlaygroundRuntime();
    const error = new Error("scheduled failure");
    const logError = vi
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    const internal = runtime as unknown as {
      processMessage: () => Promise<void>;
    };
    internal.processMessage = vi.fn().mockRejectedValue(error);
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

  it("disconnects the consumer handle during crash cleanup", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "deleteRunResources",
    ).mockResolvedValue({
      status: "requested",
      steps: [],
    });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createConsumer",
    ).mockResolvedValue({
      consumerId: "consumer-1",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect,
    });
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: {
        brokers: "broker.example.com:9092",
        username: "service-user",
        password: "service-password",
        saslMechanism: "SCRAM-SHA-256",
        useTls: true,
        caCertificate: "",
      },
    });
    snapshot = await runtime.addConsumer(snapshot.runId);

    snapshot = await runtime.crashConsumer(snapshot.runId, "consumer-1");

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(
      snapshot.consumers.find(
        (consumer) => consumer.consumerId === "consumer-1",
      )?.status,
    ).toBe("crashed");

    await runtime.reset(snapshot.runId);
  });
});

async function actResolvedProduce(resolveProduce: (() => void) | null) {
  expect(resolveProduce).not.toBeNull();
  resolveProduce?.();
  await Promise.resolve();
}

function remoteKafkaConfig() {
  return {
    brokers: "broker.example.com:9092",
    username: "service-user",
    password: "service-password",
    saslMechanism: "SCRAM-SHA-256" as const,
    useTls: true,
    caCertificate: "",
  };
}
