import { describe, expect, it, vi } from "vitest";
import type { PlaygroundConsumerCallbacks } from "@kplay/kafka-runtime";
import {
  createPlaygroundRuntimeTestHarness,
  remoteKafkaConfig,
} from "./playground-runtime-test-helpers";
import "./playground-runtime-test-setup";

describe("PlaygroundRuntime resource cleanup", () => {
  it("waits for consumer creation and disconnects its handle before reset completes", async () => {
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
    const { getInternalRun, runtime } =
      await createPlaygroundRuntimeTestHarness();
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
    const internalRun = getInternalRun();
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
    const { getInternalRun, runtime } =
      await createPlaygroundRuntimeTestHarness();
    let snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: remoteKafkaConfig(),
    });
    snapshot = await runtime.updateSettings(snapshot.runId, {
      processingLatencyMs: 3000,
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    if (!consumerCallbacks) throw new Error("Missing consumer callbacks");
    const internalRun = getInternalRun();
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
});

describe("PlaygroundRuntime consumer cleanup recovery", () => {
  it("retains failed consumer handles and retries cleanup", async () => {
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
    const { getInternalRun, runtime } =
      await createPlaygroundRuntimeTestHarness();
    let snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: remoteKafkaConfig(),
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    const internalRun = getInternalRun();
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
    const { getInternalRun, runtime } =
      await createPlaygroundRuntimeTestHarness();
    let snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: remoteKafkaConfig(),
    });
    snapshot = await runtime.addConsumer(snapshot.runId);
    const internalRun = getInternalRun();
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
});
