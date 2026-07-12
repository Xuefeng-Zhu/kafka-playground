import { describe, expect, it } from "vitest";
import {
  addToKafkaOffset,
  compareKafkaOffsets,
  connectionTestRequestSchema,
  consumerSnapshotSchema,
  createRunRequestSchema,
  getMissingRemoteKafkaConfigFields,
  isIncompleteCleanupStatus,
  kafkaOffsetSchema,
  kafkaOffsetWindow,
  parseRemoteKafkaBrokerList,
  remoteKafkaConfigSchema,
  runSnapshotSchema,
  runtimeEventTypes,
  runtimeEventSchema,
  scenarioExperimentCatalog,
  scenarioExperimentIds,
  scenarioExperimentIdSchema,
  scenarioExperimentStatusSchema,
  scenarioStateSchema,
  scenarioExperimentTransitionSchema,
  settingsRequestSchema,
} from "./index";

describe("contracts", () => {
  it("classifies only retryable cleanup failures as incomplete", () => {
    expect(isIncompleteCleanupStatus("failed")).toBe(true);
    expect(isIncompleteCleanupStatus("partially_completed")).toBe(true);
    expect(isIncompleteCleanupStatus("not_requested")).toBe(false);
    expect(isIncompleteCleanupStatus("requested")).toBe(false);
    expect(isIncompleteCleanupStatus("completed")).toBe(false);
  });

  it("validates committed offset events", () => {
    expect(() =>
      runtimeEventSchema.parse({
        eventId: "evt",
        runId: "run",
        sequence: 1,
        occurredAt: new Date().toISOString(),
        type: "offset.committed",
        consumerId: "consumer-1",
        groupId: "group",
        topic: "topic",
        partition: 0,
        committedOffset: "2",
        messageId: "message",
      }),
    ).not.toThrow();
  });

  it("accepts arbitrarily large nonnegative decimal Kafka offsets", () => {
    expect(
      kafkaOffsetSchema.parse("18446744073709551616000000000000000000"),
    ).toBe("18446744073709551616000000000000000000");
  });

  it("compares and advances arbitrarily large Kafka offsets exactly", () => {
    const lower = "18446744073709551616000000000000000000";
    const higher = "18446744073709551616000000000000000001";

    expect(compareKafkaOffsets(lower, higher)).toBe(-1);
    expect(compareKafkaOffsets(higher, lower)).toBe(1);
    expect(compareKafkaOffsets(lower, lower)).toBe(0);
    expect(addToKafkaOffset(lower, 1n)).toBe(higher);
    expect(() => addToKafkaOffset("0", -1n)).toThrow(RangeError);
    expect(() => compareKafkaOffsets("-1", "0")).toThrow();
  });

  it("builds bounded Kafka offset windows without Number coercion", () => {
    expect(kafkaOffsetWindow("9007199254740993", 3)).toEqual([
      "9007199254740991",
      "9007199254740992",
      "9007199254740993",
    ]);
    expect(kafkaOffsetWindow("2", 7)).toEqual(["0", "1", "2"]);
  });

  it.each(["", "-1", "+1", "1.5", "1e3", " 1", "1 ", "NaN"])(
    "rejects malformed Kafka offset %j at the contract boundary",
    (offset) => {
      expect(kafkaOffsetSchema.safeParse(offset).success).toBe(false);
      expect(
        scenarioStateSchema.safeParse({
          ...partitioningScenarioStateFixture(null),
          routingTraces: [
            {
              id: "route-1",
              provenance: "simulated",
              messageId: "message-1",
              key: "key-1",
              partition: 0,
              offset,
              sequence: 1,
            },
          ],
        }).success,
      ).toBe(false);
    },
  );

  it("validates crashed consumers and crash events", () => {
    expect(() =>
      consumerSnapshotSchema.parse({
        consumerId: "consumer-1",
        status: "crashed",
        assignments: [],
        processedCount: 0,
        committedCount: 0,
      }),
    ).not.toThrow();

    expect(() =>
      runtimeEventSchema.parse({
        eventId: "evt",
        runId: "run",
        sequence: 1,
        occurredAt: new Date().toISOString(),
        type: "consumer.crashed",
        consumerId: "consumer-1",
        actor: "consumer-1",
        message: "consumer-1 crashed before a graceful shutdown.",
      }),
    ).not.toThrow();
  });

  it("rejects excessive producer rates", () => {
    expect(() => settingsRequestSchema.parse({ productionRate: 11 })).toThrow();
  });

  it("defaults retention recovery history for legacy version-1 state", () => {
    expect(
      scenarioStateSchema.parse({
        version: 1,
        scenarioId: "retention-data-loss",
        virtualTimeMs: 0,
        revision: 0,
        experiment: {
          status: "idle",
          experimentId: null,
          stepIndex: 0,
          totalSteps: 0,
          startedAtVirtualMs: null,
          completedAtVirtualMs: null,
          error: null,
        },
        records: [],
        retentionMs: 60_000,
        cutoffVirtualMs: 0,
        logStartOffset: "0",
        committedOffset: "0",
        error: null,
      }),
    ).toMatchObject({
      scenarioId: "retention-data-loss",
      lastOffsetOutOfRange: null,
    });
  });

  it("defaults run creation to demo mode", () => {
    expect(
      createRunRequestSchema.parse({ scenarioId: "partitioning" }),
    ).toEqual({
      scenarioId: "partitioning",
      mode: "demo",
    });
  });

  it("validates remote Kafka run requests", () => {
    const remoteKafkaConfig = remoteKafkaConfigSchema.parse({
      brokers: "broker.example.com:9092",
      username: "service-user",
      password: "service-password",
      saslMechanism: "SCRAM-SHA-512",
      useTls: false,
    });

    expect(
      createRunRequestSchema.parse({
        scenarioId: "partitioning",
        mode: "remote",
        remoteKafkaConfig,
      }),
    ).toEqual({
      scenarioId: "partitioning",
      mode: "remote",
      remoteKafkaConfig,
    });
    expect(() =>
      createRunRequestSchema.parse({
        scenarioId: "partitioning",
        mode: "remote",
      }),
    ).toThrow();
    expect(() => createRunRequestSchema.parse({ mode: "aiven" })).toThrow();
  });

  it("validates remote Kafka connection test requests", () => {
    expect(
      connectionTestRequestSchema.parse({
        mode: "remote",
        remoteKafkaConfig: {
          brokers: "broker.example.com:9092",
          username: "service-user",
          password: "service-password",
        },
      }),
    ).toMatchObject({
      mode: "remote",
      remoteKafkaConfig: {
        saslMechanism: "SCRAM-SHA-256",
        useTls: true,
      },
    });
  });

  it("shares remote Kafka missing-field detection across clients and runtime", () => {
    expect(parseRemoteKafkaBrokerList(" one:9092, , two:9092 ")).toEqual([
      "one:9092",
      "two:9092",
    ]);
    expect(
      getMissingRemoteKafkaConfigFields(
        remoteKafkaConfigSchema.parse({
          brokers: " , ",
          username: "service-user",
          password: "service-password",
        }),
      ),
    ).toEqual(["brokers"]);
  });

  it("exports every runtime event type for client listeners", () => {
    expect(runtimeEventTypes).toEqual(
      expect.arrayContaining([
        "message.produced",
        "consumer.crashed",
        "offset.committed",
        "resource.cleanup_failed",
        "scenario.experiment.transition",
      ]),
    );
    expect(new Set(runtimeEventTypes).size).toBe(runtimeEventTypes.length);
  });

  it("validates scenario experiment events with stable evidence references", () => {
    expect(() =>
      runtimeEventSchema.parse({
        eventId: "experiment-event-1",
        runId: "run-1",
        sequence: 1,
        occurredAt: "2026-07-09T00:00:00.000Z",
        type: "scenario.experiment.transition",
        scenarioId: "partitioning",
        experimentId: "produce-keyed-record",
        entityIds: ["routing-message-1", "partition-0"],
        provenance: "simulated",
        virtualTimeMs: 100,
        messageId: "message-1",
        partition: 0,
        offset: "7",
        transition: "key.hashed",
        step: {
          id: "route-key-a",
          index: 1,
          total: 4,
          label: "Route key A",
        },
      }),
    ).not.toThrow();
  });

  it("rejects unknown or inconsistently named experiment transitions", () => {
    expect(
      scenarioExperimentTransitionSchema.safeParse("group.assignment_changed")
        .success,
    ).toBe(true);
    expect(
      scenarioExperimentTransitionSchema.safeParse("group.assignment.changed")
        .success,
    ).toBe(false);
    expect(
      scenarioExperimentTransitionSchema.safeParse("group.assignmentChanged")
        .success,
    ).toBe(false);
  });

  it("shares one typed experiment descriptor catalog across client and server code", () => {
    expect(scenarioExperimentCatalog.partitioning).toEqual([
      {
        id: "produce-keyed-record",
        role: "primary",
        prerequisite: null,
      },
      {
        id: "grow-consumer-group",
        role: "contrast",
        prerequisite: "produce-keyed-record",
      },
    ]);
    expect(scenarioExperimentIds.partitioning).toEqual([
      "produce-keyed-record",
      "grow-consumer-group",
    ]);
    expect(
      scenarioExperimentIdSchema.safeParse("produce-keyed-record").success,
    ).toBe(true);
    expect(
      scenarioExperimentIdSchema.safeParse("produce_keyed_record").success,
    ).toBe(false);

    for (const descriptors of Object.values(scenarioExperimentCatalog)) {
      const ids = descriptors.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(descriptors.filter(({ role }) => role === "primary")).toHaveLength(
        1,
      );
      expect(
        descriptors.filter(({ role }) => role === "contrast"),
      ).toHaveLength(1);
      for (const descriptor of descriptors) {
        if (descriptor.prerequisite !== null) {
          expect(ids).toContain(descriptor.prerequisite);
        }
      }
    }
  });

  it("rejects arbitrary experiment IDs in state and runtime event fields", () => {
    expect(
      scenarioExperimentStatusSchema.safeParse({
        status: "completed",
        experimentId: "not-a-real-experiment",
        stepIndex: 1,
        totalSteps: 1,
        startedAtVirtualMs: 0,
        completedAtVirtualMs: 1,
        error: null,
      }).success,
    ).toBe(false);

    expect(
      runtimeEventSchema.safeParse(
        experimentStartedEventFixture("not-a-real-experiment"),
      ).success,
    ).toBe(false);
  });

  it("rejects cross-scenario experiment IDs in state and runtime events", () => {
    const state = scenarioStateSchema.safeParse(
      partitioningScenarioStateFixture("cdc-batch"),
    );
    expect(state.success).toBe(false);
    if (!state.success) {
      expect(state.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["experiment", "experimentId"],
            message: "cdc-batch does not belong to partitioning.",
          }),
        ]),
      );
    }

    const event = runtimeEventSchema.safeParse(
      experimentStartedEventFixture("cdc-batch"),
    );
    expect(event.success).toBe(false);
    if (!event.success) {
      expect(event.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["experimentId"],
            message: "cdc-batch does not belong to partitioning.",
          }),
        ]),
      );
    }
  });

  it("rejects completed experiment IDs from another snapshot scenario", () => {
    expect(
      runSnapshotSchema.safeParse(
        runSnapshotFixture(["produce-keyed-record", "grow-consumer-group"]),
      ).success,
    ).toBe(true);

    const result = runSnapshotSchema.safeParse(
      runSnapshotFixture(["cdc-batch"]),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["completedExperimentIds", 0],
          message: "cdc-batch does not belong to partitioning.",
        }),
      ]),
    );
  });

  it("requires prerequisite-closed completion history in insertion order", () => {
    const missingPrerequisite = runSnapshotSchema.safeParse(
      runSnapshotFixture(["grow-consumer-group"]),
    );
    expect(missingPrerequisite.success).toBe(false);
    if (!missingPrerequisite.success) {
      expect(missingPrerequisite.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["completedExperimentIds", 0],
            message:
              "grow-consumer-group requires earlier completion of produce-keyed-record.",
          }),
        ]),
      );
    }

    const reversed = runSnapshotSchema.safeParse(
      runSnapshotFixture(["grow-consumer-group", "produce-keyed-record"]),
    );
    expect(reversed.success).toBe(false);

    expect(
      runSnapshotSchema.safeParse(
        runSnapshotFixture(["produce-keyed-record", "grow-consumer-group"]),
      ).success,
    ).toBe(true);
  });

  it("keeps completed scenario state coherent with completion history", () => {
    const completedState = partitioningScenarioStateFixture(
      "grow-consumer-group",
    );
    const missingActive = runSnapshotSchema.safeParse(
      runSnapshotFixture(["produce-keyed-record"], {
        scenarioState: completedState,
      }),
    );
    expect(missingActive.success).toBe(false);
    if (!missingActive.success) {
      expect(missingActive.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["completedExperimentIds"],
            message:
              "grow-consumer-group is completed in scenario state but missing from completion history.",
          }),
        ]),
      );
    }

    expect(
      runSnapshotSchema.safeParse(
        runSnapshotFixture(["produce-keyed-record", "grow-consumer-group"], {
          scenarioState: completedState,
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects duplicate completion history and mismatched scenario state", () => {
    const duplicate = runSnapshotSchema.safeParse(
      runSnapshotFixture(["produce-keyed-record", "produce-keyed-record"]),
    );
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["completedExperimentIds", 1] }),
        ]),
      );
    }

    const mismatch = runSnapshotSchema.safeParse(
      runSnapshotFixture([], {
        scenarioId: "fan-out-load-balancing",
        scenarioState: partitioningScenarioStateFixture(null),
      }),
    );
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["scenarioState", "scenarioId"] }),
        ]),
      );
    }
  });
});

function runSnapshotFixture(
  completedExperimentIds: string[],
  overrides: Record<string, unknown> = {},
) {
  return {
    runId: "run-1",
    scenarioId: "partitioning",
    mode: "demo",
    status: "running",
    topicName: "kplay.test",
    partitionCount: 2,
    consumerLimit: 3,
    consumerGroupId: "kplay.test.workers",
    producerStatus: "stopped",
    productionRate: 1,
    keyStrategy: { type: "round_robin_users" },
    processingLatencyMs: 500,
    consumers: [],
    latestPartitionOffsets: {},
    latestCommittedOffsets: {},
    messageCounts: {},
    recentMessages: [],
    recentEvents: [],
    cleanupStatus: "not_requested",
    sequence: 0,
    completedExperimentIds,
    ...overrides,
  };
}

function partitioningScenarioStateFixture(experimentId: string | null) {
  return {
    version: 1,
    scenarioId: "partitioning",
    virtualTimeMs: 0,
    revision: experimentId === null ? 0 : 1,
    experiment: {
      status: experimentId === null ? "idle" : "completed",
      experimentId,
      stepIndex: experimentId === null ? 0 : 1,
      totalSteps: experimentId === null ? 0 : 1,
      startedAtVirtualMs: experimentId === null ? null : 0,
      completedAtVirtualMs: experimentId === null ? null : 1,
      error: null,
    },
    routingTraces: [],
    partitionPositions: [],
    consumers: [],
    assignmentEpoch: 0,
  };
}

function experimentStartedEventFixture(experimentId: string) {
  return {
    eventId: "experiment-event",
    runId: "run-1",
    sequence: 1,
    occurredAt: "2026-07-09T00:00:00.000Z",
    type: "scenario.experiment.started",
    scenarioId: "partitioning",
    experimentId,
    entityIds: ["scenario-partitioning"],
    provenance: "simulated",
    virtualTimeMs: 0,
    step: {
      id: "experiment-started",
      index: 0,
      total: 1,
      label: "Experiment started",
    },
  };
}
