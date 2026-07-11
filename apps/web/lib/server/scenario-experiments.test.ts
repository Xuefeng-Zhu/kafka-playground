import { describe, expect, expectTypeOf, it } from "vitest";
import {
  scenarioStateSchema,
  type ScenarioExperimentIdFor,
} from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import {
  buildScenarioExperimentResult,
  createInitialScenarioState,
  SCENARIO_EXPERIMENT_IDS,
  scenarioExperimentPrerequisite,
} from "./scenario-experiments";
import { complete, step } from "./scenario-experiments/shared";

const pivotalExperiments = {
  partitioning: "produce-keyed-record",
  "fan-out-load-balancing": "grow-consumer-group",
  "at-least-once-duplicates": "crash-and-redeliver",
  "retry-dead-letter-queues": "transient-recovery",
  "schema-evolution-karapace": "compatible-schema",
  "transactional-producers": "transaction-pair",
  "event-replay-sourcing": "aggregate-events",
  "consumer-lag-backpressure": "build-lag",
  "hot-partitions-key-skew": "hot-key-burst",
  "log-compaction-tombstones": "run-compaction",
  "retention-data-loss": "advance-retention",
  "cooperative-rebalancing": "compare-rebalance",
  "streams-joins-windows": "window-pair",
  "outbox-cdc": "cdc-batch",
  "acl-least-privilege": "trigger-acl-denial",
} as const;

describe("scenario experiment models", () => {
  it("keeps scenario state and experiment IDs correlated through completion and dispatch", () => {
    const initial = createInitialScenarioState("partitioning", 2);
    const transitions = [
      step("route", "Route a record", "key.hashed", ["key-router"], 100),
    ];

    const completed = complete(initial, "produce-keyed-record", 0, transitions);
    expectTypeOf(completed).toEqualTypeOf(initial);
    expect(completed.experiment.experimentId).toBe("produce-keyed-record");

    const dispatched = buildScenarioExperimentResult({
      state: initial,
      experimentId: "produce-keyed-record",
      startedAtVirtualMs: 0,
    });
    expectTypeOf(dispatched.state).toEqualTypeOf(initial);

    expectTypeOf<
      Extract<"cdc-batch", ScenarioExperimentIdFor<"partitioning">>
    >().toEqualTypeOf<never>();
    expect(() =>
      buildScenarioExperimentResult({
        state: initial,
        // @ts-expect-error Cross-scenario dispatch is rejected at compile time.
        experimentId: "cdc-batch",
        startedAtVirtualMs: 0,
      }),
    ).toThrow("Experiment cdc-batch does not belong to partitioning.");
  });

  it("creates a schema-valid authoritative initial state for all 15 scenarios", () => {
    expect(SCENARIOS).toHaveLength(15);
    for (const scenario of SCENARIOS) {
      const scenarioId = scenario.id as keyof typeof SCENARIO_EXPERIMENT_IDS;
      const state = createInitialScenarioState(
        scenario.id,
        scenario.topic.partitions,
      );
      expect(state).toMatchObject({
        scenarioId: scenario.id,
        version: 1,
        virtualTimeMs: 0,
        revision: 0,
        experiment: {
          status: "idle",
          experimentId: null,
          stepIndex: 0,
        },
      });
      expect(() => scenarioStateSchema.parse(state)).not.toThrow();
      expect(SCENARIO_EXPERIMENT_IDS[scenarioId].length).toBeGreaterThan(0);
    }
  });

  it("moves every scenario to a schema-valid pivotal state with monotonic cursors", () => {
    for (const scenario of SCENARIOS) {
      const scenarioId = scenario.id as keyof typeof pivotalExperiments;
      const initial = createInitialScenarioState(
        scenario.id,
        scenario.topic.partitions,
      );
      const result = buildScenarioExperimentResult({
        state: initial,
        experimentId: pivotalExperiments[scenarioId],
        startedAtVirtualMs: initial.virtualTimeMs,
      });

      expect(result.state.experiment.status, scenario.id).toBe("completed");
      expect(result.state.revision, scenario.id).toBeGreaterThan(
        initial.revision,
      );
      expect(result.state.virtualTimeMs, scenario.id).toBeGreaterThan(
        initial.virtualTimeMs,
      );
      expect(result.transitions, scenario.id).not.toHaveLength(0);
      expect(
        result.transitions.every(
          (transition) =>
            transition.provenance === "simulated" &&
            transition.entityIds.length > 0,
        ),
        scenario.id,
      ).toBe(true);
      const initialIds = collectRowIds(initial);
      const transitionEntityIds = new Set(
        result.transitions.flatMap((transition) => transition.entityIds),
      );
      const unlinkedRows = collectRowIds(result.state).filter(
        (id) => !initialIds.includes(id) && !transitionEntityIds.has(id),
      );
      expect(unlinkedRows, scenario.id).toEqual([]);
      expect(() => scenarioStateSchema.parse(result.state)).not.toThrow();
    }
  });

  it("preserves custom partition rows through pivotal and contrast experiments", () => {
    const expectedPartitions = [0, 1, 2, 3];
    const partitioningInitial = createInitialScenarioState("partitioning", 4);
    const partitioningPivotal = buildScenarioExperimentResult({
      state: partitioningInitial,
      experimentId: "produce-keyed-record",
      startedAtVirtualMs: 0,
    }).state;
    const partitioningContrast = buildScenarioExperimentResult({
      state: partitioningPivotal,
      experimentId: "grow-consumer-group",
      startedAtVirtualMs: partitioningPivotal.virtualTimeMs,
    }).state;

    for (const state of [partitioningPivotal, partitioningContrast]) {
      expect(
        state.partitionPositions.map(({ partition }) => partition),
      ).toEqual(expectedPartitions);
      expect(() => scenarioStateSchema.parse(state)).not.toThrow();
    }
    expect(partitioningPivotal.partitionPositions.slice(2)).toEqual(
      partitioningInitial.partitionPositions.slice(2),
    );
    expect(
      partitioningContrast.consumers
        .flatMap(({ partitions }) => partitions)
        .sort((left, right) => left - right),
    ).toEqual(expectedPartitions);

    const lagInitialState = createInitialScenarioState(
      "consumer-lag-backpressure",
      4,
    );
    const lagInitial = {
      ...lagInitialState,
      partitions: lagInitialState.partitions.map((partition) =>
        partition.partition === 3
          ? {
              ...partition,
              endOffset: "5",
              committedOffset: "1",
              lag: 4,
            }
          : partition,
      ),
    };
    const lagPivotalResult = buildScenarioExperimentResult({
      state: lagInitial,
      experimentId: "build-lag",
      startedAtVirtualMs: 0,
    });
    const lagPivotal = lagPivotalResult.state;
    const lagContrastResult = buildScenarioExperimentResult({
      state: lagPivotalResult.state,
      experimentId: "recover-lag",
      startedAtVirtualMs: lagPivotalResult.state.virtualTimeMs,
    });
    const lagContrast = lagContrastResult.state;

    for (const state of [lagPivotal, lagContrast]) {
      expect(state.partitions.map(({ partition }) => partition)).toEqual(
        expectedPartitions,
      );
      expect(() => scenarioStateSchema.parse(state)).not.toThrow();
    }
    expect(lagPivotal.partitions[3]).toEqual(lagInitial.partitions[3]);
    expect(lagContrast.partitions[3]).toMatchObject({
      partition: 3,
      endOffset: "5",
      committedOffset: "5",
      lag: 0,
    });
    expect(lagContrastResult.transitions.at(-1)?.entityIds).toContain(
      "lag-partition-3",
    );
  });

  it("separates pivotal evidence from contrast and recovery evidence", () => {
    const group = run("fan-out-load-balancing", "grow-consumer-group");
    const epochSnapshot = structuredClone(group.epochs);
    const burst = rerun(group, "produce-unkeyed-burst");
    expect(burst.epochs).toEqual(epochSnapshot);
    expect(
      run("fan-out-load-balancing", "produce-unkeyed-burst").epochs,
    ).toEqual([]);

    const duplicateHold = run(
      "at-least-once-duplicates",
      "duplicate-risk-records",
    );
    expect(duplicateHold.deliveries).toHaveLength(1);
    expect(duplicateHold.deliveries[0]).toMatchObject({ committed: false });
    const duplicateReplay = rerun(duplicateHold, "crash-and-redeliver");
    expect(duplicateReplay.deliveries.map((item) => item.offset)).toEqual([
      "7",
      "7",
    ]);
    expect(duplicateReplay.sideEffects[0]).toMatchObject({
      naiveCount: 2,
      idempotentCount: 1,
    });
    const primaryReplay = run(
      "at-least-once-duplicates",
      "crash-and-redeliver",
    );
    const comparedReplay = rerun(primaryReplay, "duplicate-risk-records");
    expect(comparedReplay.deliveries).toHaveLength(2);
    expect(comparedReplay.sideEffects[0]).toMatchObject({
      naiveCount: 2,
      idempotentCount: 1,
    });

    const compatible = run("schema-evolution-karapace", "compatible-schema");
    expect(compatible).toMatchObject({ activeVersion: 2, topicRecordCount: 1 });
    const rejected = rerun(compatible, "trigger-schema-rejection");
    expect(rejected).toMatchObject({ topicRecordCount: 1 });
    expect(rejected.attempts.at(-1)).toMatchObject({
      version: 3,
      gate: "rejected",
      reachedTopic: false,
    });

    const committed = run("transactional-producers", "transaction-pair");
    expect(committed.transactions).toHaveLength(1);
    expect(committed.transactions[0]?.visibleRecordIds).toHaveLength(2);
    const aborted = rerun(committed, "abort-and-dedupe");
    expect(
      aborted.transactions.find((item) => item.status === "aborted"),
    ).toMatchObject({ visibleRecordIds: [], offsetsCommitted: false });
    expect(aborted.transactions.at(-1)?.dedupe).toContainEqual({
      producerSequence: 3,
      accepted: false,
    });

    const produced = run("event-replay-sourcing", "aggregate-events");
    expect(produced.cursor).toBe("2");
    const rebuilt = rerun(produced, "rebuild-projection");
    expect(rebuilt.cursor).toBe("2");
    expect(rebuilt.producedCount).toBe(produced.producedCount);
    expect(rebuilt.projection).toEqual(produced.projection);

    const lagged = run("consumer-lag-backpressure", "build-lag");
    expect(lagged.samples.at(-1)?.trend).toBe("rising");
    const recovered = rerun(lagged, "recover-lag");
    expect(recovered.samples.at(-2)?.trend).toBe("falling");
    expect(recovered.partitions.every((partition) => partition.lag === 0)).toBe(
      true,
    );

    const hot = run("hot-partitions-key-skew", "hot-key-burst");
    expect(hot.phases).toHaveLength(1);
    const balanced = rerun(hot, "balanced-comparison");
    expect(balanced.phases).toHaveLength(2);
    expect(balanced.phases[0]?.total).toBe(balanced.phases[1]?.total);

    const appended = run("log-compaction-tombstones", "compacted-key-series");
    expect(appended.cleanerPasses).toHaveLength(0);
    const compacted = rerun(appended, "run-compaction");
    expect(compacted.cleanerPasses[0]?.removedOffsets).toEqual(["0", "1"]);
    const tombstoneExpired = rerun(compacted, "expire-tombstone");
    expect(tombstoneExpired.materialized.map((item) => item.key)).toEqual([
      "A",
    ]);

    const retained = run("retention-data-loss", "retention-window");
    expect(retained.error).toBeNull();
    const expired = rerun(retained, "advance-retention");
    expect(expired.error?.code).toBe("offset_out_of_range");
    const retentionRecovered = rerun(expired, "recover-retention");
    expect(retentionRecovered.error).toBeNull();
    expect(retentionRecovered.committedOffset).toBe(
      retentionRecovered.logStartOffset,
    );
    expect(retentionRecovered.lastOffsetOutOfRange).toEqual({
      code: "offset_out_of_range",
      requestedOffset: expired.error?.requestedOffset,
      recoveryOptions: ["earliest", "latest", "restore"],
      provenance: "simulated",
    });
    const retentionRecoveredAgain = rerun(
      retentionRecovered,
      "recover-retention",
    );
    expect(retentionRecoveredAgain.error).toBeNull();
    expect(retentionRecoveredAgain.lastOffsetOutOfRange).toEqual(
      retentionRecovered.lastOffsetOutOfRange,
    );

    const joined = run("streams-joins-windows", "window-pair");
    expect(joined.joins).toHaveLength(1);
    expect(joined.lateRecords).toHaveLength(0);
    expect(joined.windows[0]?.closed).toBe(false);
    const late = rerun(joined, "late-arrival");
    expect(late.lateRecords).toEqual(["payment-99"]);
    expect(late.windows[0]?.closed).toBe(true);

    const published = run("outbox-cdc", "cdc-batch");
    expect(published.publishes).toHaveLength(1);
    const deduped = rerun(published, "retry-cdc");
    expect(deduped.publishes).toEqual(published.publishes);
    expect(deduped.connectorAttempts.at(-1)).toMatchObject({
      attempt: 2,
      status: "retried",
    });
    expect(deduped.dedupeLedger[0]).toMatchObject({
      acceptedMessageId: "cdc-message-1",
      suppressedAttempts: 1,
    });

    const denied = run("acl-least-privilege", "trigger-acl-denial");
    expect(denied.attempts[0]).toMatchObject({
      decision: "denied",
      terminatedBeforeKafka: true,
    });
    const allowed = rerun(denied, "grant-required-permission");
    expect(allowed.attempts.at(-1)).toMatchObject({
      decision: "allowed",
      matchedPolicyId: "policy-orders-write",
    });
  });

  it("produces distinct cooperative ownership-pressure evidence", () => {
    const compared = run("cooperative-rebalancing", "compare-rebalance");
    const baselineComparisons = structuredClone(compared.comparisons);

    const pressured = rerun(compared, "cooperative-pressure");
    expect(pressured.comparisons).toHaveLength(2);
    expect(pressured.comparisons).not.toEqual(baselineComparisons);
    expect(
      pressured.comparisons.find(
        (comparison) => comparison.strategy === "eager",
      ),
    ).toMatchObject({
      keptPartitions: [],
      movedPartitions: [{ partition: 1 }, { partition: 2 }],
      revokedPartitions: [0, 1, 2],
      pausedPartitions: [0, 1, 2],
    });
    expect(
      pressured.comparisons.find(
        (comparison) => comparison.strategy === "cooperative_sticky",
      ),
    ).toMatchObject({
      keptPartitions: [0],
      movedPartitions: [{ partition: 1 }, { partition: 2 }],
      revokedPartitions: [1, 2],
      pausedPartitions: [1, 2],
      after: [
        { consumerId: "consumer-1", partitions: [0] },
        { consumerId: "consumer-2", partitions: [1] },
        { consumerId: "consumer-3", partitions: [2] },
      ],
    });

    const pressuredAgain = rerun(pressured, "cooperative-pressure");
    expect(pressuredAgain.comparisons).toEqual(pressured.comparisons);
  });

  it("declares every teaching contrast prerequisite explicitly", () => {
    const expected = {
      partitioning: ["grow-consumer-group", "produce-keyed-record"],
      "fan-out-load-balancing": [
        "produce-unkeyed-burst",
        "grow-consumer-group",
      ],
      "at-least-once-duplicates": [
        "duplicate-risk-records",
        "crash-and-redeliver",
      ],
      "retry-dead-letter-queues": ["poison-to-dlq", "transient-recovery"],
      "schema-evolution-karapace": [
        "trigger-schema-rejection",
        "compatible-schema",
      ],
      "transactional-producers": ["abort-and-dedupe", "transaction-pair"],
      "event-replay-sourcing": ["rebuild-projection", "aggregate-events"],
      "consumer-lag-backpressure": ["recover-lag", "build-lag"],
      "hot-partitions-key-skew": ["balanced-comparison", "hot-key-burst"],
      "log-compaction-tombstones": ["expire-tombstone", "run-compaction"],
      "retention-data-loss": ["recover-retention", "advance-retention"],
      "cooperative-rebalancing": ["cooperative-pressure", "compare-rebalance"],
      "streams-joins-windows": ["late-arrival", "window-pair"],
      "outbox-cdc": ["retry-cdc", "cdc-batch"],
      "acl-least-privilege": [
        "grant-required-permission",
        "trigger-acl-denial",
      ],
    } as const;

    for (const scenario of SCENARIOS) {
      const [contrast, primary] = expected[scenario.id];
      const state = createInitialScenarioState(
        scenario.id,
        scenario.topic.partitions,
      );
      expect(scenarioExperimentPrerequisite(state, contrast), scenario.id).toBe(
        primary,
      );
      expect(scenarioExperimentPrerequisite(state, primary), scenario.id).toBe(
        null,
      );
    }
  });

  it("models virtual time, retry attempts, and prerequisite steps exactly", () => {
    const transientInitial = createInitialScenarioState(
      "retry-dead-letter-queues",
      2,
    );
    const transient = buildScenarioExperimentResult({
      state: transientInitial,
      experimentId: "transient-recovery",
      startedAtVirtualMs: 2_000,
    });
    expect(transient.transitions.map((transition) => transition.id)).toEqual([
      "transient-attempt-1",
      "transient-fail",
      "backoff",
      "transient-attempt-2",
      "transient-success",
    ]);
    expect(transient.state.records[0]).toMatchObject({
      attempt: 2,
      status: "succeeded",
      route: [
        { stage: "main", atVirtualMs: 2_100 },
        { stage: "retry", atVirtualMs: 2_200 },
        { stage: "backoff", atVirtualMs: 2_200 },
        { stage: "retry", atVirtualMs: 3_300 },
        { stage: "succeeded", atVirtualMs: 3_400 },
      ],
    });

    const poisonInitial = createInitialScenarioState(
      "retry-dead-letter-queues",
      2,
    );
    const poison = buildScenarioExperimentResult({
      state: poisonInitial,
      experimentId: "poison-to-dlq",
      startedAtVirtualMs: 0,
    });
    expect(poison.transitions.map((transition) => transition.id)).toEqual([
      "poison-attempt-1",
      "poison-retry-1",
      "poison-backoff-1",
      "poison-attempt-2",
      "poison-retry-2",
      "poison-backoff-2",
      "poison-attempt-3",
      "poison-dlq",
    ]);
    expect(poison.state.records[0]).toMatchObject({
      attempt: 3,
      status: "dlq",
      route: [
        { stage: "main", atVirtualMs: 100 },
        { stage: "retry", atVirtualMs: 200 },
        { stage: "backoff", atVirtualMs: 200 },
        { stage: "retry", atVirtualMs: 1_300 },
        { stage: "backoff", atVirtualMs: 1_400 },
        { stage: "retry", atVirtualMs: 3_500 },
        { stage: "dlq", atVirtualMs: 3_600 },
      ],
    });

    const duplicate = run("at-least-once-duplicates", "crash-and-redeliver");
    expect(duplicate.deliveries).toHaveLength(2);
    const duplicateResult = buildScenarioExperimentResult({
      state: createInitialScenarioState("at-least-once-duplicates", 2),
      experimentId: "crash-and-redeliver",
      startedAtVirtualMs: 0,
    });
    expect(duplicateResult.transitions.map((item) => item.id)).toEqual([
      "deliver-first-attempt",
      "side-effect",
      "hold",
      "crash",
      "redeliver",
      "dedupe",
    ]);

    const compactionInitial = createInitialScenarioState(
      "log-compaction-tombstones",
      2,
    );
    const compacted = buildScenarioExperimentResult({
      state: compactionInitial,
      experimentId: "run-compaction",
      startedAtVirtualMs: 0,
    });
    expect(compacted.transitions.map((item) => item.id)).toEqual([
      "materialize-log-history",
      "compact",
    ]);
  });

  it("derives retention expiry from completed virtual time", () => {
    const initial = createInitialScenarioState("retention-data-loss", 2);
    const result = buildScenarioExperimentResult({
      state: initial,
      experimentId: "advance-retention",
      startedAtVirtualMs: 0,
    });
    expect(result.state.virtualTimeMs).toBe(60_250);
    expect(result.state.cutoffVirtualMs).toBe(
      result.state.virtualTimeMs - result.state.retentionMs,
    );
    expect(
      result.state.records.map((record) => [record.offset, record.expired]),
    ).toEqual([
      ["0", true],
      ["1", true],
      ["2", true],
      ["3", false],
      ["4", false],
    ]);
    expect(result.state).toMatchObject({
      logStartOffset: "3",
      committedOffset: "1",
      error: { requestedOffset: "1" },
    });
  });

  it("bases lag samples on the current virtual clock across reruns", () => {
    const initial = createInitialScenarioState("consumer-lag-backpressure", 3);
    const lagged = buildScenarioExperimentResult({
      state: initial,
      experimentId: "build-lag",
      startedAtVirtualMs: initial.virtualTimeMs,
    });
    const recovered = buildScenarioExperimentResult({
      state: lagged.state,
      experimentId: "recover-lag",
      startedAtVirtualMs: lagged.state.virtualTimeMs,
    });
    const recoveredAgain = buildScenarioExperimentResult({
      state: recovered.state,
      experimentId: "recover-lag",
      startedAtVirtualMs: recovered.state.virtualTimeMs,
    });
    const laggedAgain = buildScenarioExperimentResult({
      state: recoveredAgain.state,
      experimentId: "build-lag",
      startedAtVirtualMs: recoveredAgain.state.virtualTimeMs,
    });

    expect(
      recoveredAgain.state.samples.map((sample) => sample.atVirtualMs),
    ).toEqual([5_000, 10_200, 15_200]);
    expect(recoveredAgain.state.samples.at(-1)?.atVirtualMs).toBe(
      recoveredAgain.state.virtualTimeMs,
    );
    expect(
      recoveredAgain.state.samples.every(
        (sample, index, samples) =>
          index === 0 || sample.atVirtualMs > samples[index - 1]!.atVirtualMs,
      ),
    ).toBe(true);
    expect(
      laggedAgain.state.samples.map((sample) => sample.atVirtualMs),
    ).toEqual([10_200, 15_200, 20_200]);
    expect(laggedAgain.state.samples.at(-1)?.atVirtualMs).toBe(
      laggedAgain.state.virtualTimeMs,
    );
  });

  it("suppresses a repeated CDC delivery without acknowledging a new message", () => {
    const initial = createInitialScenarioState("outbox-cdc", 2);
    const published = buildScenarioExperimentResult({
      state: initial,
      experimentId: "cdc-batch",
      startedAtVirtualMs: 0,
    });
    const retried = buildScenarioExperimentResult({
      state: published.state,
      experimentId: "retry-cdc",
      startedAtVirtualMs: published.state.virtualTimeMs,
    });
    expect(retried.state.publishes).toEqual(
      published.state.scenarioId === "outbox-cdc"
        ? published.state.publishes
        : [],
    );
    expect(retried.state.publishes).toHaveLength(1);
    expect(retried.transitions[0]).toMatchObject({
      transition: "cdc.retry_deduplicated",
    });
    expect(retried.transitions[0]?.messageId).toBeUndefined();
    expect(retried.transitions[0]?.entityIds).not.toContain("publish-row-2");
    expect(retried.state.dedupeLedger).toEqual([
      expect.objectContaining({
        acceptedMessageId: "cdc-message-1",
        suppressedAttempts: 1,
      }),
    ]);
  });
});

function run<Id extends keyof typeof pivotalExperiments>(
  scenarioId: Id,
  experimentId: ScenarioExperimentIdFor<NoInfer<Id>>,
) {
  const state = createInitialScenarioState(
    scenarioId,
    partitionCountForScenario(scenarioId),
  );
  return buildScenarioExperimentResult({
    state,
    experimentId,
    startedAtVirtualMs: 0,
  }).state as Extract<typeof state, { scenarioId: Id }>;
}

function partitionCountForScenario(
  scenarioId: keyof typeof pivotalExperiments,
) {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`Missing ${scenarioId}`);
  return scenario.topic.partitions;
}

function rerun<State extends ReturnType<typeof run>>(
  state: State,
  experimentId: ScenarioExperimentIdFor<NoInfer<State["scenarioId"]>>,
) {
  return buildScenarioExperimentResult({
    state,
    experimentId,
    startedAtVirtualMs: state.virtualTimeMs,
  }).state as State;
}

function collectRowIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectRowIds);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.id === "string" ? [record.id] : []),
    ...Object.values(record).flatMap(collectRowIds),
  ];
}
