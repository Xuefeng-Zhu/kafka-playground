import { scenarioStateSchema } from "@kplay/contracts";
import { SCENARIO_IDS } from "@kplay/scenario-engine";
import { describe, expect, it } from "vitest";
import { runSnapshot } from "../run-snapshot-test-fixtures";
import type {
  EvidenceFact,
  EvidenceTableModel,
  ScenarioExperienceFrame,
  ScenarioExperienceSnapshot,
  ScenarioLensModel,
  ScenarioStateFor,
} from "./model";
import {
  isScenarioExperienceSupported,
  projectScenarioExperience,
  resolveScenarioExperience,
  scenarioExperienceRegistry,
} from "./registry";
import { teachingScenarioTestManifest } from "./scenario-experience.test-manifest";

describe("scenario experience registry", () => {
  it("is compile-time and runtime complete for the independent 15-scenario manifest", () => {
    const expected = [...SCENARIO_IDS].sort();
    expect(
      teachingScenarioTestManifest.map((entry) => entry.scenarioId).sort(),
    ).toEqual(expected);
    expect(Object.keys(scenarioExperienceRegistry).sort()).toEqual(expected);
    expect(isScenarioExperienceSupported("partitioning")).toBe(true);
    expect(isScenarioExperienceSupported("not-a-scenario")).toBe(false);
  });

  it("falls back without authoritative state or when state and route disagree", () => {
    expect(
      resolveScenarioExperience(snapshotFor("partitioning", null)),
    ).toEqual({
      kind: "unavailable",
      reason: "missing-state",
    });
    expect(
      resolveScenarioExperience(
        snapshotFor("partitioning", teachingScenarioTestManifest[1].initial),
      ),
    ).toEqual({ kind: "unavailable", reason: "mismatched-state" });
  });

  it("projects from the narrow scenario experience snapshot contract", () => {
    const scenarioState = teachingScenarioTestManifest[0].initial;
    const snapshot = {
      scenarioId: "partitioning",
      scenarioState,
      mode: "demo",
      partitionCount: 2,
      topicName: "kplay.test",
      recentMessages: [],
    } satisfies ScenarioExperienceSnapshot;

    expect(projectScenarioExperience(snapshot, scenarioState).scenarioId).toBe(
      "partitioning",
    );
  });

  it("preserves the established scenario hotspot entity IDs", () => {
    const expectedHotspots = {
      partitioning: ["key-router", "commit-progress"],
      "fan-out-load-balancing": ["group-balancer", "idle-members"],
      "at-least-once-duplicates": [
        "idempotent-handler",
        "commit-gate",
        "replay-loop",
      ],
      "retry-dead-letter-queues": ["retry-topic", "dead-letter-topic"],
      "schema-evolution-karapace": ["schema-registry", "compatibility-gate"],
      "transactional-producers": ["transaction-coordinator", "commit-boundary"],
      "event-replay-sourcing": ["projection-store", "replay-cursor"],
      "consumer-lag-backpressure": ["backlog-buffer", "pressure-meter"],
      "hot-partitions-key-skew": ["hot-key-router", "hottest-partition"],
      "log-compaction-tombstones": [
        "compacted-state-store",
        "tombstone-marker",
      ],
      "retention-data-loss": ["retention-window", "expired-boundary"],
      "cooperative-rebalancing": [
        "rebalance-coordinator",
        "incremental-movement",
      ],
      "streams-joins-windows": [
        "orders-stream",
        "payments-stream",
        "window-state-store",
      ],
      "outbox-cdc": ["database-outbox", "cdc-connector", "transaction-log"],
      "acl-least-privilege": ["principal-identity", "authorization-gate"],
    } as const;

    for (const entry of teachingScenarioTestManifest) {
      const nodeIds = new Set(
        project(
          entry.scenarioId,
          entry.initial,
          partitionCount(entry.scenarioId),
        ).causalGraph.nodes.map((node) => node.id),
      );
      for (const hotspotId of expectedHotspots[entry.scenarioId]) {
        expect(nodeIds.has(hotspotId), `${entry.scenarioId}:${hotspotId}`).toBe(
          true,
        );
      }
    }
  });

  it("projects the authoritative experiment failure used after reload", () => {
    const entry = teachingScenarioTestManifest[0];
    const failedState = {
      ...entry.initial,
      experiment: {
        status: "failed" as const,
        experimentId: "produce-keyed-record",
        stepIndex: 1,
        totalSteps: 3,
        startedAtVirtualMs: 0,
        completedAtVirtualMs: 100,
        error: {
          code: "EXPERIMENT_STEP_FAILED",
          message: "The deterministic step could not complete.",
        },
      },
    };

    const frame = project(
      entry.scenarioId,
      failedState,
      partitionCount(entry.scenarioId),
    );

    expect(frame.experiment.status).toBe("failed");
    expect(frame.experiment.error).toEqual({
      code: "EXPERIMENT_STEP_FAILED",
      message: "The deterministic step could not complete.",
    });
  });

  it("preserves primary completion when a contrast experiment fails", () => {
    const entry = teachingScenarioTestManifest[0];
    if (entry.pivotal.scenarioId !== "partitioning") {
      throw new Error("Unexpected fixture scenario");
    }
    const failedContrast = {
      ...entry.pivotal,
      experiment: {
        status: "failed" as const,
        experimentId: "grow-consumer-group",
        stepIndex: 0,
        totalSteps: 1,
        startedAtVirtualMs: entry.pivotal.virtualTimeMs,
        completedAtVirtualMs: entry.pivotal.virtualTimeMs,
        error: {
          code: "CONSUMER_LIMIT_REACHED",
          message: "The contrast could not complete.",
        },
      },
    };

    const frame = project("partitioning", failedContrast, 2);

    expect(frame.experiment.status).toBe("failed");
    expect(frame.experiment.completedExperimentIds).toEqual([
      frame.experiments.primary.id,
    ]);
  });

  for (const entry of teachingScenarioTestManifest) {
    describe(entry.scenarioId, () => {
      const phases = [
        ["initial", entry.initial, entry.expectation.initialFact],
        ["pivotal", entry.pivotal, entry.expectation.pivotalFact],
        ["contrast", entry.contrast, entry.expectation.contrastFact],
      ] as const;

      for (const [phase, scenarioState, expectedFact] of phases) {
        it(`projects exact ${phase} evidence`, () => {
          expect(() => scenarioStateSchema.parse(scenarioState)).not.toThrow();
          expect(scenarioState.scenarioId).toBe(entry.scenarioId);
          const frame = project(
            entry.scenarioId,
            scenarioState,
            partitionCount(entry.scenarioId),
          );

          expect(frame.scenarioId).toBe(entry.scenarioId);
          expect(frame.lens.kind).toBe(entry.expectation.lensKind);
          expect(frame.lesson.objective).not.toHaveLength(0);
          expect(frame.lesson.misconception).not.toHaveLength(0);
          expect(frame.narrative.whatChanged.text).not.toHaveLength(0);
          expect(frame.narrative.why.text).not.toHaveLength(0);
          expect(frame.narrative.next.text).not.toHaveLength(0);
          expect(findFact(frame.lens.facts, expectedFact[0])?.value.value).toBe(
            expectedFact[1],
          );
          expect(frame.experiment.hypothesis).not.toHaveLength(0);
          expect(frame.experiment.status).toBe(
            phase === "initial" ? "idle" : "completed",
          );
          expect(frame.experiment.completedExperimentIds).toEqual(
            phase === "initial"
              ? []
              : phase === "pivotal"
                ? [frame.experiments.primary.id]
                : [frame.experiments.primary.id, frame.experiments.contrast.id],
          );
          expect(frame.checkpoint.options.length).toBeGreaterThanOrEqual(2);
          assertGraph(frame);
          assertEvidence(frame);
        });
      }

      it("keeps causal graph IDs stable across experiment phases", () => {
        const initial = project(
          entry.scenarioId,
          entry.initial,
          partitionCount(entry.scenarioId),
        );
        const pivotal = project(
          entry.scenarioId,
          entry.pivotal,
          partitionCount(entry.scenarioId),
        );
        const contrast = project(
          entry.scenarioId,
          entry.contrast,
          partitionCount(entry.scenarioId),
        );
        const initialIds = initial.causalGraph.nodes.map((node) => node.id);
        expect(pivotal.causalGraph.nodes.map((node) => node.id)).toEqual(
          initialIds,
        );
        expect(contrast.causalGraph.nodes.map((node) => node.id)).toEqual(
          initialIds,
        );
      });
    });
  }

  it("labels a bounded recent window and retains the run-total aggregate", () => {
    const manifest = teachingScenarioTestManifest[0];
    if (manifest.pivotal.scenarioId !== "partitioning") {
      throw new Error("Unexpected fixture scenario");
    }
    const state: ScenarioStateFor<"partitioning"> = {
      ...manifest.pivotal,
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
    const entry = teachingScenarioTestManifest[6];
    const longId = "projection-cart-with-a-very-long-aggregate-identifier";
    if (entry.pivotal.scenarioId !== "event-replay-sourcing") {
      throw new Error("Unexpected fixture scenario");
    }
    const frame = project(
      entry.scenarioId,
      {
        ...entry.pivotal,
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
    const fixture = teachingScenarioTestManifest[12].pivotal;
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

  it("keeps retry records on one current route", () => {
    const entry = teachingScenarioTestManifest[3];
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
      teachingScenarioTestManifest[4].contrast,
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
      teachingScenarioTestManifest[14].pivotal,
      2,
    );
    expect(findFact(acl.lens.facts, "acl-allowed")?.value.value).toBe(0);
    expect(
      acl.causalGraph.edges.find((edge) => edge.id === "gate-producer")?.active,
    ).toBe(false);
  });

  it("keeps replay produced totals fixed through rebuild and cursors ordered", () => {
    const entry = teachingScenarioTestManifest[6];
    if (
      entry.pivotal.scenarioId !== "event-replay-sourcing" ||
      entry.contrast.scenarioId !== "event-replay-sourcing"
    ) {
      throw new Error("Unexpected fixture scenario");
    }
    expect(entry.contrast.producedCount).toBe(entry.pivotal.producedCount);
    const offsets = entry.contrast.log.map((record) => Number(record.offset));
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
    expect(Number(entry.contrast.cursor)).toBeGreaterThanOrEqual(
      offsets.at(-1) ?? 0,
    );
  });

  it("compares hot phases with independent equal-size totals", () => {
    const entry = teachingScenarioTestManifest[8];
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
      teachingScenarioTestManifest[0].contrast,
      2,
    );
    expect(
      findFact(partition.experiment.before, "before-routes")?.value.value,
    ).toBe(3);

    const duplicatePivotal = project(
      "at-least-once-duplicates",
      teachingScenarioTestManifest[2].pivotal,
      2,
    );
    expect(
      findFact(duplicatePivotal.experiment.before, "before-naive")?.value.value,
    ).toBe(0);
    const duplicateContrast = project(
      "at-least-once-duplicates",
      teachingScenarioTestManifest[2].contrast,
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
      teachingScenarioTestManifest[10].contrast,
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
      teachingScenarioTestManifest[11].contrast,
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

  it("treats committed offsets as the next resume position", () => {
    const frame = project(
      "partitioning",
      teachingScenarioTestManifest[0].pivotal,
      2,
    );
    expect(findFact(frame.lens.facts, "commit-gaps")?.value.value).toBe(0);
  });

  it("shows the unkeyed burst without inventing an ownership rebalance", () => {
    const frame = project(
      "fan-out-load-balancing",
      teachingScenarioTestManifest[1].contrast,
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

  it("projects percentages, a missing ACL cell, and a deduped unacknowledged retry", () => {
    const hot = project(
      "hot-partitions-key-skew",
      teachingScenarioTestManifest[8].contrast,
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
      teachingScenarioTestManifest[14].pivotal,
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

    const cdcFixture = teachingScenarioTestManifest[13].contrast;
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
    const replay = teachingScenarioTestManifest[6];
    if (replay.contrast.scenarioId !== "event-replay-sourcing") {
      throw new Error("Unexpected replay fixture");
    }
    expect(replay.contrast.cursor).toBe("3");
    expect(replay.contrast.log).toHaveLength(3);

    const schema = teachingScenarioTestManifest[4];
    if (
      schema.pivotal.scenarioId !== "schema-evolution-karapace" ||
      schema.contrast.scenarioId !== "schema-evolution-karapace"
    ) {
      throw new Error("Unexpected schema fixture");
    }
    expect(schema.pivotal.activeVersion).toBe(1);
    expect(schema.contrast.topicRecordCount).toBe(1);

    const streams = teachingScenarioTestManifest[12];
    if (
      streams.pivotal.scenarioId !== "streams-joins-windows" ||
      streams.contrast.scenarioId !== "streams-joins-windows"
    ) {
      throw new Error("Unexpected streams fixture");
    }
    expect(streams.pivotal.inputs).toHaveLength(3);
    expect(streams.pivotal.inputs.at(-1)).toMatchObject({
      recordId: "order-99",
      status: "unmatched",
    });
    expect(streams.contrast.inputs).toHaveLength(4);
    expect(streams.contrast.lateRecords).toEqual(["payment-99"]);
  });
});

function project(
  scenarioId: (typeof SCENARIO_IDS)[number],
  scenarioState: (typeof teachingScenarioTestManifest)[number]["initial"],
  partitions: number,
) {
  return projectScenarioExperience(
    snapshotFor(scenarioId, scenarioState, partitions),
    scenarioState,
  );
}

function snapshotFor(
  scenarioId: string,
  scenarioState:
    | (typeof teachingScenarioTestManifest)[number]["initial"]
    | null,
  partitionCount = 2,
) {
  return runSnapshot({
    scenarioId,
    partitionCount,
    scenarioState,
    recentMessages: [],
  });
}

function partitionCount(scenarioId: (typeof SCENARIO_IDS)[number]) {
  if (scenarioId === "hot-partitions-key-skew") return 4;
  if (
    scenarioId === "fan-out-load-balancing" ||
    scenarioId === "consumer-lag-backpressure" ||
    scenarioId === "cooperative-rebalancing" ||
    scenarioId === "streams-joins-windows"
  ) {
    return 3;
  }
  return 2;
}

function findFact(facts: readonly EvidenceFact[], id: string) {
  return facts.find((candidate) => candidate.id === id);
}

function assertGraph(frame: ScenarioExperienceFrame) {
  const nodeIds = new Set(frame.causalGraph.nodes.map((node) => node.id));
  expect(nodeIds.size).toBe(frame.causalGraph.nodes.length);
  expect(frame.causalGraph.edges.length).toBeGreaterThan(0);
  for (const node of frame.causalGraph.nodes) {
    expect(node.provenance).toMatch(/^(observed|derived|simulated)$/);
    expect(node.focus).toEqual({ kind: "entity", id: node.id });
    if (node.metric) assertValue(node.metric);
  }
  for (const edge of frame.causalGraph.edges) {
    expect(nodeIds.has(edge.source), edge.id).toBe(true);
    expect(nodeIds.has(edge.target), edge.id).toBe(true);
    expect(edge.label, edge.id).not.toHaveLength(0);
    expect(edge.provenance).toMatch(/^(observed|derived|simulated)$/);
    expect(edge.scope).toMatch(/^(current|run-total|recent-window)$/);
  }
  // Demo facts must never masquerade as broker observations.
  expect(
    frame.causalGraph.nodes.some((node) => node.provenance === "observed"),
  ).toBe(false);
  expect(
    frame.causalGraph.edges.some((edge) => edge.provenance === "observed"),
  ).toBe(false);
}

function assertEvidence(frame: ScenarioExperienceFrame) {
  for (const evidenceFact of [
    ...frame.lens.facts,
    ...(frame.lens.sections?.flatMap((section) => section.facts) ?? []),
    ...frame.experiment.before,
    ...frame.experiment.current,
    ...frame.experiment.after,
  ]) {
    assertValue(evidenceFact.value);
  }
  const graphIds = new Set(frame.causalGraph.nodes.map((node) => node.id));
  for (const evidenceTable of collectTables(frame.lens)) {
    const columnKeys = evidenceTable.columns.map((column) => column.key);
    expect(new Set(columnKeys).size, evidenceTable.id).toBe(columnKeys.length);
    expect(
      evidenceTable.columns.every((column) => column.label.length > 0),
    ).toBe(true);
    for (const evidenceRow of evidenceTable.rows) {
      expect(
        evidenceRow.focus,
        `${evidenceTable.id}:${evidenceRow.id}`,
      ).toBeDefined();
      expect(Object.keys(evidenceRow.cells).sort()).toEqual(
        [...columnKeys].sort(),
      );
      for (const value of Object.values(evidenceRow.cells)) assertValue(value);
      if (evidenceRow.focus?.kind === "entity") {
        const details = frame.entityDetails[evidenceRow.focus.id];
        expect(details, evidenceRow.focus.id).toBeDefined();
        expect(details?.focus.id).toBe(evidenceRow.focus.id);
        if (evidenceRow.focus.graphEntityId) {
          expect(details?.graphEntityId).toBe(evidenceRow.focus.graphEntityId);
          expect(graphIds.has(evidenceRow.focus.graphEntityId)).toBe(true);
        }
      }
    }
  }
}

function assertValue(value: EvidenceFact["value"]) {
  expect(value.provenance).toMatch(/^(observed|derived|simulated)$/);
  expect(value.scope).toMatch(/^(current|run-total|recent-window)$/);
  if (value.scope === "recent-window") {
    expect(value.scopeLabel).toMatch(/^Latest \d+ of \d+ records$/);
  }
}

function collectTables(lens: ScenarioLensModel): EvidenceTableModel[] {
  return [
    lens.table,
    ...(lens.sections?.map((section) => section.table) ?? []),
    ...(lens.kind === "projection" ? [lens.source, lens.projection] : []),
    ...(lens.kind === "capacity" ? [lens.partitions] : []),
    ...(lens.kind === "window-join" ? [lens.outputs] : []),
  ].filter((candidate): candidate is EvidenceTableModel => candidate != null);
}
