import { describe, expect, it, vi } from "vitest";
import "./playground-runtime-test-setup";
import {
  createDeferred,
  createPlaygroundRuntimeTestHarness,
} from "./playground-runtime-test-helpers";

describe("PlaygroundRuntime experiment coordination", () => {
  it("serializes experiments per run and persists the authoritative state", async () => {
    const { runtime } = await createPlaygroundRuntimeTestHarness();
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

  it("queues ordinary production until guided observations are complete", async () => {
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("partitioning");
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const observationStarted = createDeferred();
    const releaseObservation = createDeferred();
    const produce = internalRun.adapter.produce.bind(internalRun.adapter);
    let adapterCalls = 0;
    vi.spyOn(internalRun.adapter, "produce").mockImplementation(
      async (input) => {
        adapterCalls += 1;
        if (adapterCalls === 1) {
          observationStarted.resolve();
          await releaseObservation.promise;
        }
        return produce(input);
      },
    );

    const experiment = runtime.runExperiment(
      started.runId,
      "produce-keyed-record",
    );
    await observationStarted.promise;

    let ordinaryProduceSettled = false;
    const ordinaryProduce = runtime
      .produceOne(started.runId, { type: "fixed", value: "ordinary" })
      .finally(() => {
        ordinaryProduceSettled = true;
      });
    await Promise.resolve();

    expect(adapterCalls).toBe(1);
    expect(ordinaryProduceSettled).toBe(false);

    releaseObservation.resolve();
    const completed = await experiment;
    await ordinaryProduce;

    if (completed.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }
    expect(
      completed.scenarioState.routingTraces.map((trace) => trace.key),
    ).toEqual(["A", "B", "A"]);
    expect(adapterCalls).toBe(4);
    expect(
      runtime
        .snapshot(started.runId)
        .recentMessages.map((message) => message.key),
    ).toEqual(["A", "B", "A", "ordinary"]);

    await runtime.reset(started.runId);
  });

  it("resumes automatic production in the run's owning session", async () => {
    vi.useFakeTimers();
    const { runtime } = await createPlaygroundRuntimeTestHarness();
    const sessionId = "experiment-owner";
    const started = await runtime.createRun(
      "acl-least-privilege",
      {},
      sessionId,
    );
    await runtime.updateSettings(
      started.runId,
      { productionRate: 10 },
      sessionId,
    );
    await runtime.startProducer(started.runId, sessionId);

    const completed = await runtime.runExperiment(
      started.runId,
      "trigger-acl-denial",
      sessionId,
    );
    expect(completed.producerStatus).toBe("running");

    await vi.advanceTimersByTimeAsync(100);

    expect(
      runtime.snapshot(started.runId, sessionId).messageCounts.produced,
    ).toBe(1);
    expect(runtime.activeSnapshot()).toBeNull();

    await runtime.reset(started.runId, sessionId);
  });
});

describe("PlaygroundRuntime experiment cleanup coordination", () => {
  it("lets an in-flight experiment finish before resetting the run", async () => {
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("partitioning");
    const observationStarted = createDeferred();
    const releaseObservation = createDeferred();
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const produce = internalRun.adapter.produce.bind(internalRun.adapter);
    vi.spyOn(internalRun.adapter, "produce").mockImplementationOnce(
      async (input) => {
        observationStarted.resolve();
        await releaseObservation.promise;
        return produce(input);
      },
    );

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
    expect(getInternalRun()).toMatchObject({
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

  it("waits for a reserved experiment before cleaning up its run", async () => {
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("partitioning");
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const ordinaryProduceStarted = createDeferred();
    const releaseOrdinaryProduce = createDeferred();
    const produce = internalRun.adapter.produce.bind(internalRun.adapter);
    vi.spyOn(internalRun.adapter, "produce").mockImplementationOnce(
      async (input) => {
        ordinaryProduceStarted.resolve();
        await releaseOrdinaryProduce.promise;
        return produce(input);
      },
    );

    const ordinaryProduce = runtime.produceOne(started.runId);
    await ordinaryProduceStarted.promise;
    const experiment = runtime.runExperiment(
      started.runId,
      "produce-keyed-record",
    );
    const experimentRejected = expect(experiment).rejects.toMatchObject({
      code: "SCENARIO_EXPERIMENT_UNAVAILABLE",
      status: 409,
    });
    let resetSettled = false;
    const reset = runtime.reset(started.runId).finally(() => {
      resetSettled = true;
    });
    await Promise.resolve();

    expect(resetSettled).toBe(false);

    releaseOrdinaryProduce.resolve();
    await ordinaryProduce;
    await experimentRejected;
    await expect(reset).resolves.toEqual({ cleanupStatus: "completed" });
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("rejects an experiment once reset cleanup has started", async () => {
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("acl-least-privilege");
    const disconnectStarted = createDeferred();
    const releaseDisconnect = createDeferred();
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    internalRun.consumerHandles.set("test-consumer", {
      consumerId: "test-consumer",
      commit: vi.fn().mockResolvedValue(undefined),
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
    expect(getInternalRun()).toMatchObject({
      inFlightExperimentId: null,
      scenarioState: expect.objectContaining({
        scenarioId: "acl-least-privilege",
      }),
    });

    releaseDisconnect.resolve();
    await expect(reset).resolves.toEqual({ cleanupStatus: "completed" });
    expect(runtime.activeSnapshot()).toBeNull();
  });
});

describe("PlaygroundRuntime experiment event and timer recovery", () => {
  it("clears the in-flight guard when the experiment start event throws", async () => {
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("acl-least-privilege");
    const runtimeEventHub = await import("./runtime-event-hub");
    const emit = vi.spyOn(runtimeEventHub, "emitRuntimeEvent");
    emit.mockImplementationOnce(() => {
      throw new Error("experiment start emission failed");
    });

    await expect(
      runtime.runExperiment(started.runId, "trigger-acl-denial"),
    ).rejects.toThrow("experiment start emission failed");
    expect(getInternalRun()).toMatchObject({
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

  it("resumes a pending processing timer exactly once after a successful experiment", async () => {
    vi.useFakeTimers();
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    let started = await runtime.createRun("partitioning");
    started = await runtime.updateSettings(started.runId, {
      processingLatencyMs: 1000,
    });
    started = await runtime.addConsumer(started.runId);
    const pending = await runtime.produceOne(started.runId);
    const pendingMessageId = pending.recentMessages.at(-1)?.messageId;
    if (!pendingMessageId) throw new Error("Missing pending message");
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    expect(internalRun.processingTimers.has(pendingMessageId)).toBe(true);

    await runtime.runExperiment(started.runId, "produce-keyed-record");

    expect(internalRun.processingTimers.has(pendingMessageId)).toBe(true);
    expect(
      runtime
        .snapshot(started.runId)
        .recentEvents.filter(
          (event) =>
            event.type === "message.processing_completed" &&
            event.messageId === pendingMessageId,
        ),
    ).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);
    let completedEvents = runtime
      .snapshot(started.runId)
      .recentEvents.filter(
        (event) =>
          event.type === "message.processing_completed" &&
          event.messageId === pendingMessageId,
      );
    expect(completedEvents).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2000);
    completedEvents = runtime
      .snapshot(started.runId)
      .recentEvents.filter(
        (event) =>
          event.type === "message.processing_completed" &&
          event.messageId === pendingMessageId,
      );
    expect(completedEvents).toHaveLength(1);

    await runtime.reset(started.runId);
  });

  it("restores a pending processing timer exactly once after experiment rollback", async () => {
    vi.useFakeTimers();
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    let started = await runtime.createRun("partitioning");
    started = await runtime.updateSettings(started.runId, {
      processingLatencyMs: 1000,
    });
    started = await runtime.addConsumer(started.runId);
    const pending = await runtime.produceOne(started.runId);
    const pendingMessageId = pending.recentMessages.at(-1)?.messageId;
    if (!pendingMessageId) throw new Error("Missing pending message");
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const produce = internalRun.adapter.produce.bind(internalRun.adapter);
    let guidedProduceCalls = 0;
    const produceSpy = vi
      .spyOn(internalRun.adapter, "produce")
      .mockImplementation(async (input) => {
        guidedProduceCalls += 1;
        if (guidedProduceCalls === 2) {
          throw new Error("guided observation failed");
        }
        return produce(input);
      });

    await expect(
      runtime.runExperiment(started.runId, "produce-keyed-record"),
    ).rejects.toThrow("guided observation failed");

    expect(internalRun.processingTimers.has(pendingMessageId)).toBe(true);
    expect(
      runtime
        .snapshot(started.runId)
        .recentEvents.filter(
          (event) =>
            event.type === "message.processing_completed" &&
            event.messageId === pendingMessageId,
        ),
    ).toHaveLength(0);
    produceSpy.mockRestore();

    await vi.advanceTimersByTimeAsync(1000);
    let completedEvents = runtime
      .snapshot(started.runId)
      .recentEvents.filter(
        (event) =>
          event.type === "message.processing_completed" &&
          event.messageId === pendingMessageId,
      );
    expect(completedEvents).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2000);
    completedEvents = runtime
      .snapshot(started.runId)
      .recentEvents.filter(
        (event) =>
          event.type === "message.processing_completed" &&
          event.messageId === pendingMessageId,
      );
    expect(completedEvents).toHaveLength(1);

    await runtime.reset(started.runId);
  });
});

describe("PlaygroundRuntime experiment transaction recovery", () => {
  it("rolls back a second-step observation failure and retries cleanly", async () => {
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("partitioning");
    const internalRun = getInternalRun();
    if (!internalRun) throw new Error("Missing internal run");
    const before = structuredClone(runtime.snapshot(started.runId));
    const produce = internalRun.adapter.produce.bind(internalRun.adapter);
    let adapterCalls = 0;
    const produceSpy = vi
      .spyOn(internalRun.adapter, "produce")
      .mockImplementation(async (input) => {
        adapterCalls += 1;
        if (adapterCalls === 2) {
          throw new Error("second guided produce failed");
        }
        return produce(input);
      });

    await expect(
      runtime.runExperiment(started.runId, "produce-keyed-record"),
    ).rejects.toThrow("second guided produce failed");

    const failed = runtime.snapshot(started.runId);
    expect(failed.recentMessages).toEqual(before.recentMessages);
    expect(failed.consumers).toEqual(before.consumers);
    expect(failed.messageCounts).toEqual(before.messageCounts);
    expect(failed.latestPartitionOffsets).toEqual(
      before.latestPartitionOffsets,
    );
    expect(failed.latestCommittedOffsets).toEqual(
      before.latestCommittedOffsets,
    );
    expect(
      failed.recentEvents
        .slice(before.recentEvents.length)
        .map((event) => event.type),
    ).toEqual(["scenario.experiment.failed"]);
    expect(internalRun.processingTimers.size).toBe(0);

    produceSpy.mockRestore();
    const retried = await runtime.runExperiment(
      started.runId,
      "produce-keyed-record",
    );
    if (retried.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }
    expect(
      retried.scenarioState.routingTraces.map((trace) => trace.key),
    ).toEqual(["A", "B", "A"]);
    expect(retried.recentMessages).toHaveLength(3);
    expect(
      retried.recentMessages.map((message) => message.value.sequence),
    ).toEqual([1, 2, 3]);
    expect(
      new Set(
        retried.scenarioState.routingTraces.map((trace) => trace.messageId),
      ),
    ).toEqual(
      new Set(retried.recentMessages.map((message) => message.messageId)),
    );

    const cleanStarted = await runtime.createRun(
      "partitioning",
      {},
      "clean-reference",
    );
    const clean = await runtime.runExperiment(
      cleanStarted.runId,
      "produce-keyed-record",
      "clean-reference",
    );
    if (clean.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }
    const routeCoordinates = (snapshot: typeof clean) => {
      if (snapshot.scenarioState?.scenarioId !== "partitioning") return [];
      return snapshot.scenarioState.routingTraces.map((trace) => ({
        key: trace.key,
        partition: trace.partition,
        offset: trace.offset,
      }));
    };
    expect(routeCoordinates(retried)).toEqual(routeCoordinates(clean));

    await runtime.reset(started.runId);
    await runtime.reset(cleanStarted.runId, "clean-reference");
  });
});
