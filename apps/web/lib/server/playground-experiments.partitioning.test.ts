import { compareKafkaOffsets } from "@kplay/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaygroundRuntimeTestHarness } from "./playground-runtime-test-helpers";

const mockedServerEnv = vi.hoisted(() => ({ maxConsumersPerRun: 3 }));

vi.mock("./env", async () => {
  const { createTestServerEnv } = await import("./playground-runtime-test-env");
  return {
    getServerEnv: () =>
      createTestServerEnv({
        MAX_CONSUMERS_PER_RUN: mockedServerEnv.maxConsumersPerRun,
      }),
  };
});

afterEach(() => {
  mockedServerEnv.maxConsumersPerRun = 3;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PlaygroundRuntime partitioning experiment evidence", () => {
  it("uses demo adapter routing and assignments for the partitioning experiments", async () => {
    const { runtime } = await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("partitioning");

    const routed = await runtime.runExperiment(
      started.runId,
      "produce-keyed-record",
    );
    if (routed.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }
    const [firstA, , secondA] = routed.scenarioState.routingTraces;
    if (!firstA || !secondA) throw new Error("Missing keyed routing traces");
    expect(firstA.key).toBe("A");
    expect(secondA.key).toBe("A");
    expect(secondA.partition).toBe(firstA.partition);
    expect(compareKafkaOffsets(secondA.offset, firstA.offset)).toBeGreaterThan(
      0,
    );
    expect(routed.scenarioState.consumers).toHaveLength(1);
    const lastA = routed.recentMessages.find(
      (message) => message.messageId === secondA.messageId,
    );
    expect(lastA).toMatchObject({
      state: "processed",
      committedOffset: null,
    });
    const lastAPosition = routed.scenarioState.partitionPositions.find(
      (position) => position.partition === secondA.partition,
    );
    expect(lastAPosition).toMatchObject({
      processedOffset: secondA.offset,
      // Kafka stores the next offset to resume. Because the final A was
      // processed but not committed, the group resumes at that A's offset.
      committedOffset: secondA.offset,
    });
    expect(routed.latestCommittedOffsets[String(secondA.partition)]).toBe(
      secondA.offset,
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
    const { runtime } = await createPlaygroundRuntimeTestHarness();
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
      const { runtime } = await createPlaygroundRuntimeTestHarness();
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

  it.each([1, 2])(
    "preserves crash watermarks in guided evidence under a consumer cap of %i",
    async (consumerLimit) => {
      mockedServerEnv.maxConsumersPerRun = consumerLimit;
      const { runtime } = await createPlaygroundRuntimeTestHarness();
      const started = await runtime.createRun("partitioning");

      const routed = await runtime.runExperiment(
        started.runId,
        "produce-keyed-record",
      );
      if (routed.scenarioState?.scenarioId !== "partitioning") {
        throw new Error("Missing partitioning state");
      }
      const partitionPositions = structuredClone(
        routed.scenarioState.partitionPositions,
      );
      const gapPosition = partitionPositions.find(
        (position) =>
          position.processedOffset !== null &&
          position.committedOffset !== null &&
          BigInt(position.committedOffset) !==
            BigInt(position.processedOffset) + 1n,
      );
      const committedOffsets = structuredClone(routed.latestCommittedOffsets);
      const uncommittedMessageId =
        routed.scenarioState.routingTraces.at(-1)?.messageId;
      expect(gapPosition).toBeDefined();
      expect(uncommittedMessageId).toBeDefined();

      await runtime.crashConsumer(started.runId, "consumer-1");
      const grown = await runtime.runExperiment(
        started.runId,
        "grow-consumer-group",
      );
      if (grown.scenarioState?.scenarioId !== "partitioning") {
        throw new Error("Missing partitioning state");
      }

      expect(grown.consumerLimit).toBe(consumerLimit);
      expect(grown.consumers).toEqual([
        expect.objectContaining({
          consumerId: "consumer-1",
          status: "crashed",
        }),
      ]);
      expect(
        grown.scenarioState.consumers.map((consumer) => consumer.consumerId),
      ).toEqual([
        "guided-consumer-1",
        "guided-consumer-2",
        "guided-consumer-3",
      ]);
      expect(grown.scenarioState.partitionPositions).toEqual(
        partitionPositions,
      );
      expect(grown.latestCommittedOffsets).toEqual(committedOffsets);
      expect(
        grown.recentMessages.find(
          (message) => message.messageId === uncommittedMessageId,
        ),
      ).toMatchObject({ state: "produced", assignedConsumerId: null });

      await runtime.reset(started.runId);
    },
  );
});

describe("PlaygroundRuntime load-balancing experiment evidence", () => {
  it("simulates every load-balancing epoch without consuming raw-control capacity", async () => {
    const { runtime } = await createPlaygroundRuntimeTestHarness();
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
});
