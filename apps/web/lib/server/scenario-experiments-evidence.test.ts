import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@kplay/scenario-engine";
import {
  createInitialScenarioState,
  scenarioExperimentPrerequisite,
} from "./scenario-experiments";
import { rerun, run } from "./scenario-experiments-test-helpers";

describe("scenario experiment evidence", () => {
  it("separates primary evidence from contrast and recovery evidence", () => {
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
});

describe("scenario experiment contrasts", () => {
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
});
