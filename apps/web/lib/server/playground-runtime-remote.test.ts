import { describe, expect, it, vi } from "vitest";
import "./playground-runtime-test-setup";
import {
  createPlaygroundRuntimeTestHarness,
  remoteKafkaConfig,
} from "./playground-runtime-test-helpers";

describe("PlaygroundRuntime remote integration", () => {
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
});

describe("PlaygroundRuntime remote consumer recovery", () => {
  it("tracks a consumer handle when startup rollback fails and retries it during cleanup", async () => {
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
    const { getInternalRun, runtime } =
      await createPlaygroundRuntimeTestHarness();
    const snapshot = await runtime.createRun("partitioning", {
      mode: "remote",
      remoteKafkaConfig: remoteKafkaConfig(),
    });
    const internalRun = getInternalRun();
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
