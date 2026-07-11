import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaygroundConsumerCallbacks } from "@kplay/kafka-runtime";
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

describe("PlaygroundRuntime cleanup lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the real cleanup status when deleting an active run", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning");
    (
      runtime as unknown as {
        adapter: {
          deleteRunResources: () => Promise<{
            cleanupStatus?: string;
            status: "requested";
            steps: [];
          }>;
        };
      }
    ).adapter.deleteRunResources = async () => ({
      status: "requested",
      steps: [],
    });

    await expect(runtime.deleteRun(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "requested",
    });
  });

  it("clears incomplete runs when startup is blocked by configuration", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { logger } = await import("./logger");
    const runtime = new PlaygroundRuntime();
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const createRun = vi.fn(async () => {
      const error = new Error(
        "Aiven Kafka configuration is missing: AIVEN_KAFKA_BROKERS",
      ) as Error & { code: string; status: number };
      error.code = "AIVEN_CONFIGURATION_MISSING";
      error.status = 503;
      throw error;
    });
    const deleteRunResources = vi.fn();
    (
      runtime as unknown as {
        adapter: {
          createRun: typeof createRun;
          deleteRunResources: typeof deleteRunResources;
        };
      }
    ).adapter.createRun = createRun;
    (
      runtime as unknown as {
        adapter: {
          createRun: typeof createRun;
          deleteRunResources: typeof deleteRunResources;
        };
      }
    ).adapter.deleteRunResources = deleteRunResources;

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
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { logger } = await import("./logger");
    const runtime = new PlaygroundRuntime();
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    let failedRunId = "";
    const createRun = vi.fn(async (run: { runId: string }) => {
      failedRunId = run.runId;
      throw new Error("topic creation failed");
    });
    const deleteRunResources = vi.fn().mockResolvedValue({
      status: "completed" as const,
      steps: [],
    });
    (
      runtime as unknown as {
        adapter: {
          createRun: typeof createRun;
          deleteRunResources: typeof deleteRunResources;
        };
      }
    ).adapter.createRun = createRun;
    (
      runtime as unknown as {
        adapter: {
          createRun: typeof createRun;
          deleteRunResources: typeof deleteRunResources;
        };
      }
    ).adapter.deleteRunResources = deleteRunResources;

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
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { logger } = await import("./logger");
    const runtime = new PlaygroundRuntime();
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    let failedRunId = "";
    const createRun = vi.fn(async (run: { runId: string }) => {
      failedRunId = run.runId;
      throw new Error("topic creation failed");
    });
    let cleanupAttempts = 0;
    const deleteRunResources = vi.fn(async () => {
      cleanupAttempts += 1;
      if (cleanupAttempts === 1) throw new Error("cleanup unavailable");
      return { status: "completed" as const, steps: [] };
    });
    (
      runtime as unknown as {
        adapter: {
          createRun: typeof createRun;
          deleteRunResources: typeof deleteRunResources;
        };
      }
    ).adapter.createRun = createRun;
    (
      runtime as unknown as {
        adapter: {
          createRun: typeof createRun;
          deleteRunResources: typeof deleteRunResources;
        };
      }
    ).adapter.deleteRunResources = deleteRunResources;

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
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning");
    let cleanupAttempts = 0;
    const deleteRunResources = vi.fn(async () => {
      cleanupAttempts += 1;
      if (cleanupAttempts === 1) throw new Error("cleanup unavailable");
      return { status: "completed" as const, steps: [] };
    });
    (
      runtime as unknown as {
        adapter: {
          deleteRunResources: typeof deleteRunResources;
        };
      }
    ).adapter.deleteRunResources = deleteRunResources;

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

  it("waits for consumer creation and disconnects its handle before reset completes", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    const deleteRunResources = vi
      .spyOn(UserConfiguredKafkaRuntimeAdapter.prototype, "deleteRunResources")
      .mockResolvedValue({ status: "completed", steps: [] });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    let resolveCreateConsumer:
      | ((handle: {
          consumerId: string;
          commit: () => Promise<void>;
          disconnect: () => Promise<void>;
        }) => void)
      | undefined;
    const createConsumer = vi
      .spyOn(UserConfiguredKafkaRuntimeAdapter.prototype, "createConsumer")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreateConsumer = resolve;
          }),
      );
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
    const internalRun = getInternalRun(runtime);
    if (!internalRun) throw new Error("Missing internal run");

    const addConsumer = runtime.addConsumer(snapshot.runId);
    await vi.waitFor(() => expect(createConsumer).toHaveBeenCalledTimes(1));
    let resetSettled = false;
    const reset = runtime.reset(snapshot.runId).finally(() => {
      resetSettled = true;
    });
    await Promise.resolve();

    expect(resetSettled).toBe(false);
    expect(deleteRunResources).not.toHaveBeenCalled();
    await expect(runtime.addConsumer(snapshot.runId)).rejects.toMatchObject({
      code: "RUN_CLEANUP_IN_PROGRESS",
      status: 409,
    });

    resolveCreateConsumer?.({
      consumerId: "consumer-1",
      commit: vi.fn().mockResolvedValue(undefined),
      disconnect,
    });
    await expect(addConsumer).resolves.toMatchObject({
      consumers: [expect.objectContaining({ consumerId: "consumer-1" })],
    });
    await expect(reset).resolves.toEqual({ cleanupStatus: "completed" });

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(deleteRunResources).toHaveBeenCalledTimes(1);
    expect(internalRun.consumerHandles.size).toBe(0);
    expect(internalRun.consumers).toHaveLength(0);
    expect(internalRun).toMatchObject({
      status: "stopped",
      producerStatus: "stopped",
    });
    const eventCountAfterReset = internalRun.events.length;
    await Promise.resolve();
    expect(internalRun.events).toHaveLength(eventCountAfterReset);
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("cancels and awaits delayed remote message work before reset completes", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    const deleteRunResources = vi
      .spyOn(UserConfiguredKafkaRuntimeAdapter.prototype, "deleteRunResources")
      .mockResolvedValue({ status: "completed", steps: [] });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    let consumerCallbacks: PlaygroundConsumerCallbacks | undefined;
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createConsumer",
    ).mockImplementation(async (_run, _consumerId, callbacks) => {
      consumerCallbacks = callbacks;
      return {
        consumerId: "consumer-1",
        commit: vi.fn().mockResolvedValue(undefined),
        disconnect,
      };
    });
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: remoteKafkaConfig(),
    });
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    if (!consumerCallbacks) throw new Error("Missing consumer callbacks");
    const internalRun = getInternalRun(runtime);
    if (!internalRun) throw new Error("Missing internal run");

    const consumed = consumerCallbacks.onMessage({
      topic: snapshot.topicName,
      partition: 0,
      offset: "0",
      key: "customer-1",
      value: { eventId: "remote-event-1" },
      headers: { "x-playground-event-id": "remote-event-1" },
      timestamp: new Date(0).toISOString(),
    });
    expect(
      internalRun.messages.find(
        (message) => message.messageId === "remote-event-1",
      ),
    ).toMatchObject({ state: "received", assignedConsumerId: "consumer-1" });

    const reset = runtime.reset(snapshot.runId);
    await expect(consumed).resolves.toBeUndefined();
    await expect(reset).resolves.toEqual({ cleanupStatus: "completed" });

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(deleteRunResources).toHaveBeenCalledTimes(1);
    expect(internalRun.messageCounts).toMatchObject({
      received: 1,
      processed: 0,
      committed: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains failed consumer handles and retries cleanup", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { logger } = await import("./logger");
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    const deleteRunResources = vi
      .spyOn(UserConfiguredKafkaRuntimeAdapter.prototype, "deleteRunResources")
      .mockResolvedValue({ status: "completed", steps: [] });
    const disconnect = vi
      .fn()
      .mockRejectedValueOnce(new Error("consumer disconnect unavailable"))
      .mockResolvedValueOnce(undefined);
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
      remoteKafkaConfig: remoteKafkaConfig(),
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    const internalRun = getInternalRun(runtime);
    if (!internalRun) throw new Error("Missing internal run");

    await expect(runtime.reset(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "failed",
    });

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(deleteRunResources).not.toHaveBeenCalled();
    expect(internalRun.consumerHandles.has("consumer-1")).toBe(true);
    expect(internalRun.cleanupStatus).toBe("failed");
    await expect(runtime.createRun("partitioning")).rejects.toMatchObject({
      code: "RUN_ALREADY_ACTIVE",
      status: 409,
      message: "The previous run still has resources that require cleanup.",
    });

    await expect(runtime.reset(snapshot.runId)).resolves.toEqual({
      cleanupStatus: "completed",
    });

    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(deleteRunResources).toHaveBeenCalledTimes(1);
    expect(internalRun.consumerHandles.size).toBe(0);
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("retains a consumer handle when an explicit stop cannot disconnect it", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { logger } = await import("./logger");
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "deleteRunResources",
    ).mockResolvedValue({ status: "completed", steps: [] });
    const disconnect = vi
      .fn()
      .mockRejectedValueOnce(new Error("consumer disconnect unavailable"))
      .mockResolvedValueOnce(undefined);
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
      remoteKafkaConfig: remoteKafkaConfig(),
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    const internalRun = getInternalRun(runtime);
    if (!internalRun) throw new Error("Missing internal run");

    await expect(
      runtime.stopConsumer(snapshot.runId, "consumer-1"),
    ).rejects.toThrow("consumer disconnect unavailable");

    expect(internalRun.consumerHandles.has("consumer-1")).toBe(true);
    expect(internalRun.consumers).toContainEqual(
      expect.objectContaining({
        consumerId: "consumer-1",
        status: "stopping",
      }),
    );

    await expect(
      runtime.stopConsumer(snapshot.runId, "consumer-1"),
    ).resolves.toMatchObject({ consumers: [] });
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(internalRun.consumerHandles.size).toBe(0);

    await runtime.reset(snapshot.runId);
  });

  it("skips message processing immediately after cleanup starts", async () => {
    vi.useFakeTimers();
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const internalRun = getInternalRun(runtime);
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
      invokeProcessMessage(runtime, snapshot.runId, messageId, "consumer-1"),
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
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    let snapshot = await runtime.createRun("partitioning");
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    snapshot = await runtime.produceOne(snapshot.runId);
    const internalRun = getInternalRun(runtime);
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
    const queuedProcessing = invokeProcessMessage(
      runtime,
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
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const { logger } = await import("./logger");
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const runtime = new PlaygroundRuntime();
    const snapshot = await runtime.createRun("partitioning");
    const internalRun = getInternalRun(runtime);
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

function invokeProcessMessage(
  runtime: object,
  runId: string,
  messageId: string,
  consumerId: string,
) {
  return (
    runtime as {
      processMessage(
        targetRunId: string,
        targetMessageId: string,
        expectedConsumerId: string,
      ): Promise<void>;
    }
  ).processMessage(runId, messageId, consumerId);
}

function createDeferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return {
    promise,
    resolve: () => resolve?.(),
  };
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
