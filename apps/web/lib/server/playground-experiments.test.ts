import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeEventSchema } from "@kplay/contracts";

const mockedServerEnv = vi.hoisted(() => ({ maxConsumersPerRun: 3 }));

vi.mock("./env", () => ({
  getServerEnv: () => ({
    KAFKA_MODE: "demo",
    AIVEN_KAFKA_BROKERS: "",
    AIVEN_KAFKA_USERNAME: "",
    AIVEN_KAFKA_PASSWORD: "",
    AIVEN_KAFKA_SASL_MECHANISM: "SCRAM-SHA-256",
    AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
    KAFKA_TOPIC_PREFIX: "kplay",
    MAX_CONSUMERS_PER_RUN: mockedServerEnv.maxConsumersPerRun,
    MAX_PRODUCE_RATE: 10,
    EVENT_HISTORY_LIMIT: 2000,
    TIMELINE_DISPLAY_LIMIT: 1000,
    LOG_MESSAGE_PAYLOADS: false,
  }),
}));

describe("PlaygroundRuntime teaching experiments", () => {
  afterEach(() => {
    mockedServerEnv.maxConsumersPerRun = 3;
    vi.restoreAllMocks();
  });

  it("uses demo adapter routing and assignments for the partitioning experiments", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("partitioning");

    const routed = await runtime.runExperiment(
      started.runId,
      "produce-keyed-record",
    );
    if (routed.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }
    const [firstA, , secondA] = routed.scenarioState.routingTraces;
    expect(firstA?.key).toBe("A");
    expect(secondA?.key).toBe("A");
    expect(secondA?.partition).toBe(firstA?.partition);
    expect(Number(secondA?.offset)).toBeGreaterThan(Number(firstA?.offset));
    expect(routed.scenarioState.consumers).toHaveLength(1);
    const lastA = routed.recentMessages.find(
      (message) => message.messageId === secondA?.messageId,
    );
    expect(lastA).toMatchObject({
      state: "processed",
      committedOffset: null,
    });
    const lastAPosition = routed.scenarioState.partitionPositions.find(
      (position) => position.partition === secondA?.partition,
    );
    expect(lastAPosition).toMatchObject({
      processedOffset: secondA?.offset,
      // Kafka stores the next offset to resume. Because the final A was
      // processed but not committed, the group resumes at that A's offset.
      committedOffset: secondA?.offset,
    });
    expect(routed.latestCommittedOffsets[String(secondA?.partition)]).toBe(
      secondA?.offset,
    );

    const grown = await runtime.runExperiment(
      started.runId,
      "grow-consumer-group",
    );
    if (grown.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }
    expect(grown.scenarioState.routingTraces).toEqual(
      routed.scenarioState.routingTraces,
    );
    expect(grown.scenarioState.consumers).toHaveLength(3);
    expect(
      grown.scenarioState.consumers.filter(
        (consumer) => consumer.status === "idle",
      ),
    ).toHaveLength(1);

    await runtime.reset(started.runId);
  });

  it("excludes crashed consumers from partitioning assignment evidence", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("partitioning");

    await runtime.runExperiment(started.runId, "produce-keyed-record");
    await runtime.crashConsumer(started.runId, "consumer-1");
    const grown = await runtime.runExperiment(
      started.runId,
      "grow-consumer-group",
    );
    if (grown.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }

    expect(grown.consumers).toContainEqual(
      expect.objectContaining({ consumerId: "consumer-1", status: "crashed" }),
    );
    expect(
      grown.scenarioState.consumers.map((consumer) => consumer.consumerId),
    ).toEqual(["consumer-2", "consumer-3", "consumer-4"]);
    expect(
      grown.scenarioState.consumers.filter(
        (consumer) => consumer.status === "idle",
      ),
    ).toHaveLength(1);

    await runtime.reset(started.runId);
  });

  it.each([1, 2])(
    "keeps three-member partitioning evidence simulated under a consumer cap of %i",
    async (consumerLimit) => {
      mockedServerEnv.maxConsumersPerRun = consumerLimit;
      const { PlaygroundRuntime } = await import("./playground-runtime");
      const runtime = new PlaygroundRuntime();
      const started = await runtime.createRun("partitioning");

      await runtime.runExperiment(started.runId, "produce-keyed-record");
      const grown = await runtime.runExperiment(
        started.runId,
        "grow-consumer-group",
      );
      if (grown.scenarioState?.scenarioId !== "partitioning") {
        throw new Error("Missing partitioning state");
      }

      expect(grown.consumerLimit).toBe(consumerLimit);
      expect(grown.consumers).toHaveLength(1);
      expect(grown.scenarioState.consumers).toHaveLength(3);
      expect(
        grown.scenarioState.consumers.every((consumer) =>
          consumer.consumerId.startsWith("guided-consumer-"),
        ),
      ).toBe(true);
      expect(
        grown.scenarioState.consumers.filter(
          (consumer) => consumer.status === "idle",
        ),
      ).toHaveLength(1);
      expect(
        grown.recentEvents.some(
          (event) => event.type === "scenario.experiment.failed",
        ),
      ).toBe(false);

      await runtime.reset(started.runId);
    },
  );

  it("does not reuse crashed runtime IDs in low-cap guided evidence", async () => {
    mockedServerEnv.maxConsumersPerRun = 2;
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("partitioning");

    await runtime.runExperiment(started.runId, "produce-keyed-record");
    await runtime.crashConsumer(started.runId, "consumer-1");
    const grown = await runtime.runExperiment(
      started.runId,
      "grow-consumer-group",
    );
    if (grown.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }

    expect(grown.consumers).toEqual([
      expect.objectContaining({ consumerId: "consumer-1", status: "crashed" }),
    ]);
    expect(
      grown.scenarioState.consumers.map((consumer) => consumer.consumerId),
    ).toEqual(["guided-consumer-1", "guided-consumer-2", "guided-consumer-3"]);

    await runtime.reset(started.runId);
  });

  it("simulates every load-balancing epoch without consuming raw-control capacity", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("fan-out-load-balancing");

    await runtime.addConsumer(started.runId);
    const beforeExperiment = await runtime.addConsumer(started.runId);
    expect(beforeExperiment).toMatchObject({
      consumerLimit: 3,
      consumers: [{ consumerId: "consumer-1" }, { consumerId: "consumer-2" }],
    });

    const completed = await runtime.runExperiment(
      started.runId,
      "grow-consumer-group",
    );
    if (completed.scenarioState?.scenarioId !== "fan-out-load-balancing") {
      throw new Error("Missing load-balancing state");
    }

    expect(completed.consumers.map((consumer) => consumer.consumerId)).toEqual([
      "consumer-1",
      "consumer-2",
    ]);
    expect(completed.scenarioState.epochs.map((epoch) => epoch.epoch)).toEqual([
      1, 2, 3, 4,
    ]);
    completed.scenarioState.epochs.forEach((epoch) => {
      expect(epoch.provenance).toBe("simulated");
      expect(epoch.memberIds).toHaveLength(epoch.epoch);
      expect(
        epoch.assignments.map((assignment) => assignment.consumerId),
      ).toEqual(epoch.memberIds);
      const ownedPartitions = epoch.assignments.flatMap(
        (assignment) => assignment.partitions,
      );
      expect([...ownedPartitions].sort((left, right) => left - right)).toEqual([
        0, 1, 2,
      ]);
      expect(new Set(ownedPartitions).size).toBe(3);
    });
    expect(completed.scenarioState.epochs.at(-1)?.idleConsumerIds).toEqual([
      "consumer-4",
    ]);
    expect(
      completed.recentEvents.flatMap((event) =>
        event.type === "scenario.experiment.transition" &&
        "experimentId" in event &&
        event.experimentId === "grow-consumer-group" &&
        "step" in event
          ? [event.step.id]
          : [],
      ),
    ).toEqual(["members-1", "members-2", "members-3", "members-4"]);

    const atCapacity = await runtime.addConsumer(started.runId);
    expect(atCapacity.consumers).toHaveLength(3);
    await expect(runtime.addConsumer(started.runId)).rejects.toMatchObject({
      code: "CONSUMER_LIMIT_REACHED",
      status: 409,
    });

    await runtime.reset(started.runId);
  });

  it("serializes experiments per run and persists the authoritative state", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("at-least-once-duplicates");

    const first = runtime.runExperiment(started.runId, "crash-and-redeliver");
    await expect(
      runtime.runExperiment(started.runId, "crash-and-redeliver"),
    ).rejects.toMatchObject({
      code: "SCENARIO_EXPERIMENT_UNAVAILABLE",
      status: 409,
    });

    const completed = await first;
    expect(completed.scenarioState).toMatchObject({
      scenarioId: "at-least-once-duplicates",
      experiment: {
        status: "completed",
        experimentId: "crash-and-redeliver",
      },
    });
    expect(runtime.snapshot(started.runId).scenarioState).toEqual(
      completed.scenarioState,
    );

    await runtime.reset(started.runId);
  });

  it("lets an in-flight experiment finish before resetting the run", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("partitioning");
    const observationStarted = createDeferred();
    const releaseObservation = createDeferred();
    const produceOne = runtime.produceOne.bind(runtime);
    vi.spyOn(runtime, "produceOne").mockImplementationOnce(async (...args) => {
      observationStarted.resolve();
      await releaseObservation.promise;
      return produceOne(...args);
    });

    const experiment = runtime.runExperiment(
      started.runId,
      "produce-keyed-record",
    );
    await observationStarted.promise;

    let resetSettled = false;
    const reset = runtime.reset(started.runId);
    void reset.then(
      () => {
        resetSettled = true;
      },
      () => {
        resetSettled = true;
      },
    );
    await Promise.resolve();

    expect(resetSettled).toBe(false);
    expect(getInternalRun(runtime)).toMatchObject({
      inFlightExperimentId: "produce-keyed-record",
      scenarioState: expect.objectContaining({ scenarioId: "partitioning" }),
    });

    releaseObservation.resolve();
    const [completed, cleanup] = await Promise.all([experiment, reset]);

    expect(completed.scenarioState).toMatchObject({
      scenarioId: "partitioning",
      experiment: {
        status: "completed",
        experimentId: "produce-keyed-record",
      },
    });
    expect(cleanup).toEqual({ cleanupStatus: "completed" });
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("rejects an experiment once reset cleanup has started", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("acl-least-privilege");
    const disconnectStarted = createDeferred();
    const releaseDisconnect = createDeferred();
    const internalRun = getInternalRun(runtime);
    if (!internalRun) throw new Error("Missing internal run");
    internalRun.consumerHandles.set("test-consumer", {
      disconnect: async () => {
        disconnectStarted.resolve();
        await releaseDisconnect.promise;
      },
    });

    const reset = runtime.reset(started.runId);
    await disconnectStarted.promise;

    await expect(
      runtime.runExperiment(started.runId, "trigger-acl-denial"),
    ).rejects.toMatchObject({
      code: "SCENARIO_EXPERIMENT_UNAVAILABLE",
      status: 409,
    });
    expect(getInternalRun(runtime)).toMatchObject({
      inFlightExperimentId: null,
      scenarioState: expect.objectContaining({
        scenarioId: "acl-least-privilege",
      }),
    });

    releaseDisconnect.resolve();
    await expect(reset).resolves.toEqual({ cleanupStatus: "completed" });
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("clears the in-flight guard when the experiment start event throws", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("acl-least-privilege");
    const emit = vi.spyOn(
      runtime as unknown as { emit: (...args: unknown[]) => void },
      "emit",
    );
    emit.mockImplementationOnce(() => {
      throw new Error("experiment start emission failed");
    });

    await expect(
      runtime.runExperiment(started.runId, "trigger-acl-denial"),
    ).rejects.toThrow("experiment start emission failed");
    expect(getInternalRun(runtime)).toMatchObject({
      inFlightExperimentId: null,
      scenarioState: expect.objectContaining({
        experiment: expect.objectContaining({ status: "failed" }),
      }),
    });

    emit.mockRestore();
    await expect(
      runtime.runExperiment(started.runId, "trigger-acl-denial"),
    ).resolves.toMatchObject({
      scenarioState: expect.objectContaining({
        experiment: expect.objectContaining({ status: "completed" }),
      }),
    });

    await runtime.reset(started.runId);
  });

  it("rejects every contrast until its primary experiment completes", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("schema-evolution-karapace");

    await expect(
      runtime.runExperiment(started.runId, "trigger-schema-rejection"),
    ).rejects.toMatchObject({
      code: "SCENARIO_EXPERIMENT_UNAVAILABLE",
      status: 409,
      message: expect.stringContaining("compatible-schema"),
    });
    expect(runtime.snapshot(started.runId).scenarioState).toMatchObject({
      activeVersion: 1,
      topicRecordCount: 0,
      attempts: [],
    });

    const primary = await runtime.runExperiment(
      started.runId,
      "compatible-schema",
    );
    expect(primary.scenarioState).toMatchObject({ activeVersion: 2 });
    const contrast = await runtime.runExperiment(
      started.runId,
      "trigger-schema-rejection",
    );
    expect(contrast.scenarioState).toMatchObject({
      activeVersion: 2,
      topicRecordCount: 1,
    });

    await runtime.reset(started.runId);
  });

  it("emits schema-valid transitions with stable entities, provenance, and coordinates", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("at-least-once-duplicates");
    const completed = await runtime.runExperiment(
      started.runId,
      "crash-and-redeliver",
    );
    const experimentEvents = completed.recentEvents.filter((event) =>
      event.type.startsWith("scenario.experiment."),
    );

    expect(experimentEvents.map((event) => event.type)).toEqual([
      "scenario.experiment.started",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.completed",
    ]);
    expect(experimentEvents.every((event) => "provenance" in event)).toBe(true);
    expect(
      experimentEvents.every(
        (event) =>
          "entityIds" in event &&
          event.entityIds.length > 0 &&
          event.provenance === "simulated",
      ),
    ).toBe(true);
    expect(experimentEvents).toContainEqual(
      expect.objectContaining({
        type: "scenario.experiment.transition",
        messageId: "duplicate-message-42",
        partition: 0,
        offset: "7",
      }),
    );
    experimentEvents.forEach((event) =>
      expect(() => runtimeEventSchema.parse(event)).not.toThrow(),
    );

    await runtime.reset(started.runId);
  });

  it("clears scenario state and the in-flight guard when a run is reset", async () => {
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("acl-least-privilege");
    await runtime.runExperiment(started.runId, "trigger-acl-denial");
    const internalRun = getInternalRun(runtime);
    expect(internalRun?.scenarioState).not.toBeNull();

    await runtime.reset(started.runId);

    expect(internalRun).toMatchObject({
      scenarioState: null,
      virtualTimeMs: 0,
      inFlightExperimentId: null,
    });
    expect(internalRun?.completedExperimentIds.size).toBe(0);
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("rejects demo-only experiments for remote runs", async () => {
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "deleteRunResources",
    ).mockResolvedValue({ status: "completed", steps: [] });
    const { PlaygroundRuntime } = await import("./playground-runtime");
    const runtime = new PlaygroundRuntime();
    const started = await runtime.createRun("schema-evolution-karapace", {
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

    expect(started.scenarioState).toBeNull();

    await expect(
      runtime.runExperiment(started.runId, "compatible-schema"),
    ).rejects.toMatchObject({
      code: "SCENARIO_EXPERIMENT_UNAVAILABLE",
      status: 409,
    });
    expect(runtime.snapshot(started.runId).scenarioState).toBeNull();

    await runtime.reset(started.runId);
  });
});

function getInternalRun(runtime: object) {
  const registry = (
    runtime as {
      runs: {
        getSessionRun(sessionId: string): {
          scenarioState: unknown;
          virtualTimeMs: number;
          inFlightExperimentId: string | null;
          completedExperimentIds: Set<string>;
          consumerHandles: Map<string, { disconnect: () => Promise<void> }>;
        } | null;
      };
    }
  ).runs;
  return registry.getSessionRun("default");
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
