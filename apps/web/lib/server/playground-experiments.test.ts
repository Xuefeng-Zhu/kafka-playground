import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeEventSchema } from "@kplay/contracts";

vi.mock("./env", () => ({
  getServerEnv: () => ({
    KAFKA_MODE: "demo",
    AIVEN_KAFKA_BROKERS: "",
    AIVEN_KAFKA_USERNAME: "",
    AIVEN_KAFKA_PASSWORD: "",
    AIVEN_KAFKA_SASL_MECHANISM: "SCRAM-SHA-256",
    AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
    KAFKA_TOPIC_PREFIX: "kplay",
    MAX_CONSUMERS_PER_RUN: 3,
    MAX_PRODUCE_RATE: 10,
    EVENT_HISTORY_LIMIT: 2000,
    TIMELINE_DISPLAY_LIMIT: 1000,
    LOG_MESSAGE_PAYLOADS: false,
  }),
}));

describe("PlaygroundRuntime teaching experiments", () => {
  afterEach(() => {
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
        } | null;
      };
    }
  ).runs;
  return registry.getSessionRun("default");
}
