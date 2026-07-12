import { compareKafkaOffsets } from "@kplay/contracts";
import { describe, expect, it } from "vitest";
import type { ScenarioStateFor } from "./model";
import {
  collectTables,
  findFact,
  project,
} from "./scenario-experience.test-support";
import { teachingScenarioTestCase } from "./scenario-experience.test-manifest";

describe("scenario experience evidence projections", () => {
  it("labels a bounded recent window and retains the run-total aggregate", () => {
    const manifest = teachingScenarioTestCase("partitioning");
    if (manifest.primary.scenarioId !== "partitioning") {
      throw new Error("Unexpected fixture scenario");
    }
    const state: ScenarioStateFor<"partitioning"> = {
      ...manifest.primary,
      scenarioId: "partitioning",
      routingTraces: Array.from({ length: 12 }, (_, index) => ({
        id: `long-route-${index}`,
        provenance: "simulated" as const,
        messageId: `message-${index}`,
        key: `key-${index % 2}`,
        partition: index % 2,
        offset: String(index),
        sequence: index + 1,
      })),
    };
    const frame = project("partitioning", state, 2);
    const evidenceTable = collectTables(frame.lens).find(
      (candidate) => candidate.id === "partition-routing-evidence",
    );
    expect(evidenceTable?.bounded).toEqual({
      shown: 8,
      total: 12,
      label: "Latest 8 of 12 records",
    });
    expect(
      findFact(frame.lens.facts, "routing-trace-count")?.value,
    ).toMatchObject({
      value: 12,
      scope: "run-total",
    });
    for (const evidenceRow of evidenceTable?.rows ?? []) {
      for (const value of Object.values(evidenceRow.cells)) {
        expect(value).toMatchObject({
          scope: "recent-window",
          scopeLabel: "Latest 8 of 12 records",
        });
      }
    }
  });

  it("preserves long entity IDs and creates inspector details for synthetic rows", () => {
    const entry = teachingScenarioTestCase("event-replay-sourcing");
    const longId = "projection-cart-with-a-very-long-aggregate-identifier";
    if (entry.primary.scenarioId !== "event-replay-sourcing") {
      throw new Error("Unexpected fixture scenario");
    }
    const frame = project(
      entry.scenarioId,
      {
        ...entry.primary,
        projection: { "cart-with-a-very-long-aggregate-identifier": 1 },
      },
      2,
    );
    expect(
      collectTables(frame.lens)
        .flatMap((evidenceTable) => evidenceTable.rows)
        .find((evidenceRow) => evidenceRow.id === longId),
    ).toMatchObject({
      id: longId,
      focus: { kind: "entity", id: "cart-projection" },
    });
    expect(frame.entityDetails["cart-projection"]).toMatchObject({
      entityId: "cart-projection",
      graphEntityId: "projection-store",
    });
  });

  it("never emits a join for mismatched keys even if malformed state claims one", () => {
    const fixture = teachingScenarioTestCase("streams-joins-windows").primary;
    if (fixture.scenarioId !== "streams-joins-windows") {
      throw new Error("Unexpected fixture scenario");
    }
    const state: ScenarioStateFor<"streams-joins-windows"> = {
      ...fixture,
      inputs: fixture.inputs.map((record) =>
        record.stream === "payments" ? { ...record, key: "other-key" } : record,
      ),
    };
    const frame = project("streams-joins-windows", state, 3);
    expect(frame.lens.kind).toBe("window-join");
    if (frame.lens.kind !== "window-join") return;
    expect(frame.lens.outputs.rows).toHaveLength(0);
    expect(findFact(frame.lens.facts, "streams-valid-joins")?.value.value).toBe(
      0,
    );
  });
});

describe("scenario experience routing and offset semantics", () => {
  it("compares Kafka offsets without numeric precision loss", () => {
    const manifest = teachingScenarioTestCase("partitioning");
    const processedOffset = 18446744073709551616000000000000000000n;
    const state: ScenarioStateFor<"partitioning"> = {
      ...manifest.initial,
      partitionPositions: [
        {
          id: "position-0",
          provenance: "simulated",
          partition: 0,
          processedOffset: String(processedOffset),
          committedOffset: String(processedOffset + 1n),
        },
        {
          id: "position-1",
          provenance: "simulated",
          partition: 1,
          processedOffset: String(processedOffset),
          committedOffset: String(processedOffset + 2n),
        },
      ],
    };

    const frame = project("partitioning", state, 2);

    expect(findFact(frame.lens.facts, "commit-gaps")?.value.value).toBe(1);
  });

  it("keeps retry records on one current route", () => {
    const entry = teachingScenarioTestCase("retry-dead-letter-queues");
    const frame = project(entry.scenarioId, entry.contrast, 2);
    expect(frame.lens.kind).toBe("lifecycle");
    if (frame.lens.kind !== "lifecycle") return;
    expect(
      new Set(frame.lens.records.map((record) => record.recordId)).size,
    ).toBe(frame.lens.records.length);
    const activeRetryEdges = frame.causalGraph.edges.filter(
      (edge) =>
        edge.active &&
        ["group-retry", "retry-group", "retry-dlq"].includes(edge.id),
    );
    expect(activeRetryEdges.map((edge) => edge.id)).toEqual(["retry-dlq"]);
  });

  it("does not route rejected schema or ACL attempts into Kafka", () => {
    const schema = project(
      "schema-evolution-karapace",
      teachingScenarioTestCase("schema-evolution-karapace").contrast,
      2,
    );
    expect(
      findFact(schema.lens.facts, "schema-topic-records")?.value.value,
    ).toBe(1);
    expect(
      schema.causalGraph.edges.find((edge) => edge.id === "gate-topic")?.active,
    ).toBe(false);

    const acl = project(
      "acl-least-privilege",
      teachingScenarioTestCase("acl-least-privilege").primary,
      2,
    );
    expect(findFact(acl.lens.facts, "acl-allowed")?.value.value).toBe(0);
    expect(
      acl.causalGraph.edges.find((edge) => edge.id === "gate-producer")?.active,
    ).toBe(false);
  });

  it("keeps replay produced totals fixed through rebuild and cursors ordered", () => {
    const entry = teachingScenarioTestCase("event-replay-sourcing");
    if (
      entry.primary.scenarioId !== "event-replay-sourcing" ||
      entry.contrast.scenarioId !== "event-replay-sourcing"
    ) {
      throw new Error("Unexpected fixture scenario");
    }
    expect(entry.contrast.producedCount).toBe(entry.primary.producedCount);
    const offsets = entry.contrast.log.map((record) => record.offset);
    const cursor = entry.contrast.cursor;
    if (cursor === null) throw new Error("Expected completed replay cursor");
    expect(offsets).toEqual([...offsets].sort(compareKafkaOffsets));
    expect(
      compareKafkaOffsets(cursor, offsets.at(-1) ?? cursor),
    ).toBeGreaterThanOrEqual(0);
  });

  it("counts replayed offsets above Number.MAX_SAFE_INTEGER exactly", () => {
    const entry = teachingScenarioTestCase("event-replay-sourcing");
    const source = entry.primary.log[0];
    if (!source) throw new Error("Expected replay source fixture");
    const state: ScenarioStateFor<"event-replay-sourcing"> = {
      ...entry.primary,
      cursor: "9007199254740992",
      log: [
        { ...source, id: "large-offset-1", offset: "9007199254740992" },
        { ...source, id: "large-offset-2", offset: "9007199254740993" },
      ],
    };

    const frame = project("event-replay-sourcing", state, 2);

    expect(
      findFact(frame.lens.facts, "replay-applied-count")?.value.value,
    ).toBe(1);
  });

  it("treats committed offsets as the next resume position", () => {
    const frame = project(
      "partitioning",
      teachingScenarioTestCase("partitioning").primary,
      2,
    );
    expect(findFact(frame.lens.facts, "commit-gaps")?.value.value).toBe(0);
  });

  it("shows the unkeyed burst without inventing an ownership rebalance", () => {
    const frame = project(
      "fan-out-load-balancing",
      teachingScenarioTestCase("fan-out-load-balancing").contrast,
      3,
    );
    expect(frame.lens.kind).toBe("assignment");
    if (frame.lens.kind !== "assignment") return;
    expect(frame.lens.deltas.every((delta) => delta.status === "kept")).toBe(
      true,
    );
    expect(
      findFact(frame.lens.facts, "assignment-ownership-changed")?.value.value,
    ).toBe("No");
    expect(
      findFact(frame.lens.facts, "assignment-unkeyed-routes")?.value.value,
    ).toBe(3);
    expect(frame.narrative.whatChanged.text).toContain(
      "assignment stayed at epoch 4",
    );
  });
});

describe("scenario experience comparison and fixture fidelity", () => {
  it("compares hot phases with independent equal-size totals", () => {
    const entry = teachingScenarioTestCase("hot-partitions-key-skew");
    if (entry.contrast.scenarioId !== "hot-partitions-key-skew") {
      throw new Error("Unexpected fixture scenario");
    }
    expect(entry.contrast.phases).toHaveLength(2);
    expect(entry.contrast.phases[0].total).toBe(entry.contrast.phases[1].total);
    expect(entry.contrast.phases[0].partitionCounts).not.toEqual(
      entry.contrast.phases[1].partitionCounts,
    );
  });

  it("derives authoritative before facts for non-mutating contrasts and recovery", () => {
    const partition = project(
      "partitioning",
      teachingScenarioTestCase("partitioning").contrast,
      2,
    );
    expect(
      findFact(partition.experiment.before, "before-routes")?.value.value,
    ).toBe(3);

    const duplicatePrimary = project(
      "at-least-once-duplicates",
      teachingScenarioTestCase("at-least-once-duplicates").primary,
      2,
    );
    expect(
      findFact(duplicatePrimary.experiment.before, "before-naive")?.value.value,
    ).toBe(0);
    const duplicateContrast = project(
      "at-least-once-duplicates",
      teachingScenarioTestCase("at-least-once-duplicates").contrast,
      2,
    );
    expect(
      findFact(duplicateContrast.experiment.before, "before-naive")?.value
        .value,
    ).toBe(2);
    expect(
      findFact(duplicateContrast.experiment.before, "before-idempotent")?.value
        .value,
    ).toBe(1);

    const retention = project(
      "retention-data-loss",
      teachingScenarioTestCase("retention-data-loss").contrast,
      2,
    );
    expect(
      findFact(retention.experiment.before, "retention-before-start")?.value
        .value,
    ).toBe("3");
    expect(
      findFact(retention.experiment.before, "retention-before-committed")?.value
        .value,
    ).toBe("0");
    expect(
      findFact(retention.experiment.before, "retention-before-error")?.value
        .value,
    ).toBe("offset_out_of_range");
    expect(
      findFact(retention.experiment.after, "retention-committed")?.value.value,
    ).toBe("3");
    expect(
      findFact(retention.experiment.after, "retention-error")?.value.value,
    ).toBe("Available");
    expect(
      collectTables(retention.lens)
        .find((table) => table.id === "retention-recovery-options")
        ?.rows.map((row) => row.cells.choice?.value),
    ).toEqual(["earliest", "latest", "restore"]);

    const cooperative = project(
      "cooperative-rebalancing",
      teachingScenarioTestCase("cooperative-rebalancing").contrast,
      3,
    );
    expect(cooperative.lens.kind).toBe("assignment");
    if (cooperative.lens.kind !== "assignment") return;
    expect(
      cooperative.lens.deltas.map((delta) => [
        delta.partition,
        delta.status,
        delta.afterOwner,
      ]),
    ).toEqual([
      [0, "kept", "consumer-1"],
      [1, "moved", "consumer-2"],
      [2, "moved", "consumer-3"],
    ]);
  });

  it("projects percentages, a missing ACL cell, and a deduped unacknowledged retry", () => {
    const hot = project(
      "hot-partitions-key-skew",
      teachingScenarioTestCase("hot-partitions-key-skew").contrast,
      4,
    );
    expect(hot.lens.kind).toBe("heatmap");
    if (hot.lens.kind === "heatmap") {
      expect(hot.lens.phases[0]?.partitionPercentages).toEqual({
        "0": 0,
        "1": 100,
        "2": 0,
        "3": 0,
      });
      expect(hot.lens.phases[0]?.skewRatio).toBe(8);
    }

    const acl = project(
      "acl-least-privilege",
      teachingScenarioTestCase("acl-least-privilege").primary,
      2,
    );
    expect(acl.lens.kind).toBe("gate");
    if (acl.lens.kind === "gate") {
      expect(acl.lens.matrixCells).toContainEqual(
        expect.objectContaining({
          principal: "orders-service",
          operation: "write",
          resource: "orders",
          effect: "missing",
          highlighted: true,
        }),
      );
    }

    const cdcFixture = teachingScenarioTestCase("outbox-cdc").contrast;
    if (cdcFixture.scenarioId !== "outbox-cdc") {
      throw new Error("Unexpected fixture scenario");
    }
    expect(cdcFixture.publishes.at(-1)).toMatchObject({
      deduplicated: true,
      acknowledged: false,
    });
    const cdc = project("outbox-cdc", cdcFixture, 2);
    expect(
      findFact(cdc.lens.facts, "outbox-latest-acknowledgement")?.value.value,
    ).toBe("Not emitted");
    expect(cdc.narrative.next.text).toContain(
      "No second Kafka acknowledgement was emitted",
    );
  });

  it("keeps corrected replay, schema, and stream fixtures server-shaped", () => {
    const replay = teachingScenarioTestCase("event-replay-sourcing");
    if (replay.contrast.scenarioId !== "event-replay-sourcing") {
      throw new Error("Unexpected replay fixture");
    }
    expect(replay.contrast.cursor).toBe("3");
    expect(replay.contrast.log).toHaveLength(3);

    const schema = teachingScenarioTestCase("schema-evolution-karapace");
    if (
      schema.primary.scenarioId !== "schema-evolution-karapace" ||
      schema.contrast.scenarioId !== "schema-evolution-karapace"
    ) {
      throw new Error("Unexpected schema fixture");
    }
    expect(schema.primary.activeVersion).toBe(1);
    expect(schema.contrast.topicRecordCount).toBe(1);

    const streams = teachingScenarioTestCase("streams-joins-windows");
    if (
      streams.primary.scenarioId !== "streams-joins-windows" ||
      streams.contrast.scenarioId !== "streams-joins-windows"
    ) {
      throw new Error("Unexpected streams fixture");
    }
    expect(streams.primary.inputs).toHaveLength(3);
    expect(streams.primary.inputs.at(-1)).toMatchObject({
      recordId: "order-99",
      status: "unmatched",
    });
    expect(streams.contrast.inputs).toHaveLength(4);
    expect(streams.contrast.lateRecords).toEqual(["payment-99"]);
  });
});
