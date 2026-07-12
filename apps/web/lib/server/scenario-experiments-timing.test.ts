import { describe, expect, it } from "vitest";
import {
  buildScenarioExperimentResult,
  createInitialScenarioState,
} from "./scenario-experiments";
import { run } from "./scenario-experiments-test-helpers";

describe("scenario experiment virtual time", () => {
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
});

describe("scenario experiment retention", () => {
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

  it("advances a fully expired retention log without losing offset precision", () => {
    const initial = createInitialScenarioState("retention-data-loss", 2);
    const filled = buildScenarioExperimentResult({
      state: initial,
      experimentId: "retention-window",
      startedAtVirtualMs: 0,
    });
    const lastRecord = filled.state.records.at(-1);
    if (!lastRecord)
      throw new Error("Retention fixture did not create records");
    const largeOffset = "18446744073709551616000000000000000000";
    const result = buildScenarioExperimentResult({
      state: {
        ...filled.state,
        retentionMs: 0,
        records: [{ ...lastRecord, offset: largeOffset }],
      },
      experimentId: "advance-retention",
      startedAtVirtualMs: filled.state.virtualTimeMs,
    });

    expect(result.state.logStartOffset).toBe(
      "18446744073709551616000000000000000001",
    );
  });
});

describe("scenario experiment repeated runs", () => {
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
