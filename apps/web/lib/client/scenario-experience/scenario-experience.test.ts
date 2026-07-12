import { scenarioStateIds, scenarioStateSchema } from "@kplay/contracts";
import { SCENARIO_IDS } from "@kplay/scenario-engine";
import { describe, expect, expectTypeOf, it } from "vitest";
import { runSnapshot } from "../run-snapshot-test-fixtures";
import type {
  ScenarioExperienceDefinition,
  ScenarioExperienceSnapshot,
} from "./model";
import {
  createScenarioExperienceDefinitionRegistry,
  isScenarioExperienceSupported,
  projectScenarioExperience,
  resolveScenarioExperience,
  scenarioExperienceRegistry,
} from "./registry";
import {
  assertEvidence,
  assertGraph,
  findFact,
  partitionCount,
  project,
  snapshotFor,
} from "./scenario-experience.test-support";
import {
  teachingScenarioTestCase,
  teachingScenarioTestManifest,
} from "./scenario-experience.test-manifest";

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

  it("preserves definition correlation and ordered registry iteration", () => {
    expectTypeOf(scenarioExperienceRegistry.partitioning).toEqualTypeOf<
      ScenarioExperienceDefinition<"partitioning">
    >();
    expect(Object.keys(scenarioExperienceRegistry)).toEqual(scenarioStateIds);
  });

  it("rejects duplicate and missing definitions", () => {
    const definitions = Object.values(scenarioExperienceRegistry);

    expect(() =>
      createScenarioExperienceDefinitionRegistry([
        ...definitions,
        scenarioExperienceRegistry.partitioning,
      ]),
    ).toThrow("Duplicate scenario experience definition: partitioning.");
    expect(() =>
      createScenarioExperienceDefinitionRegistry(definitions.slice(1)),
    ).toThrow("Missing scenario experience definitions: partitioning.");
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
        snapshotFor(
          "partitioning",
          teachingScenarioTestCase("fan-out-load-balancing").initial,
        ),
      ),
    ).toEqual({ kind: "unavailable", reason: "mismatched-state" });
  });

  it("projects from the narrow scenario experience snapshot contract", () => {
    const scenarioState = teachingScenarioTestCase("partitioning").initial;
    const snapshot = {
      scenarioId: "partitioning",
      scenarioState,
      mode: "demo",
      partitionCount: 2,
      topicName: "kplay.test",
      recentMessages: [],
      completedExperimentIds: [],
    } satisfies ScenarioExperienceSnapshot;

    expect(projectScenarioExperience(snapshot, scenarioState).scenarioId).toBe(
      "partitioning",
    );
  });

  it("dispatches every authoritative scenario state through the registry", () => {
    for (const entry of teachingScenarioTestManifest) {
      const snapshot = snapshotFor(
        entry.scenarioId,
        entry.initial,
        partitionCount(entry.scenarioId),
      );
      const frame = projectScenarioExperience(snapshot, entry.initial);
      const resolution = resolveScenarioExperience(snapshot);

      expect(frame.scenarioId, entry.scenarioId).toBe(entry.scenarioId);
      expect(resolution.kind, entry.scenarioId).toBe("experience");
      if (resolution.kind !== "experience") {
        throw new Error(`Missing ${entry.scenarioId} experience`);
      }
      expect(resolution.definition, entry.scenarioId).toBe(
        scenarioExperienceRegistry[entry.scenarioId],
      );
      expect(resolution.frame, entry.scenarioId).toEqual(frame);
    }
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
});

describe("scenario experience experiment history", () => {
  it("projects the authoritative experiment failure used after reload", () => {
    const entry = teachingScenarioTestCase("partitioning");
    const failedState = {
      ...entry.initial,
      experiment: {
        status: "failed" as const,
        experimentId: "produce-keyed-record" as const,
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
    const entry = teachingScenarioTestCase("partitioning");
    if (entry.primary.scenarioId !== "partitioning") {
      throw new Error("Unexpected fixture scenario");
    }
    const failedContrast = {
      ...entry.primary,
      experiment: {
        status: "failed" as const,
        experimentId: "grow-consumer-group" as const,
        stepIndex: 0,
        totalSteps: 1,
        startedAtVirtualMs: entry.primary.virtualTimeMs,
        completedAtVirtualMs: entry.primary.virtualTimeMs,
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

  it("uses authoritative completion history when an auxiliary experiment is latest", () => {
    const entry = teachingScenarioTestCase("fan-out-load-balancing");
    if (entry.primary.scenarioId !== "fan-out-load-balancing") {
      throw new Error("Unexpected fixture scenario");
    }
    const auxiliaryState = {
      ...entry.primary,
      experiment: {
        ...entry.primary.experiment,
        experimentId: "balance-settings" as const,
      },
    };
    const snapshot = runSnapshot({
      scenarioId: entry.scenarioId,
      scenarioState: auxiliaryState,
      completedExperimentIds: ["grow-consumer-group"],
    });

    const frame = projectScenarioExperience(snapshot, auxiliaryState);

    expect(frame.experiment.completedExperimentIds).toEqual([
      "grow-consumer-group",
    ]);
  });
});

describe("scenario experience manifest projections", () => {
  for (const entry of teachingScenarioTestManifest) {
    describe(entry.scenarioId, () => {
      const phases = [
        ["initial", entry.initial, entry.expectation.initialFact],
        ["primary", entry.primary, entry.expectation.primaryFact],
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
              : phase === "primary"
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
        const primary = project(
          entry.scenarioId,
          entry.primary,
          partitionCount(entry.scenarioId),
        );
        const contrast = project(
          entry.scenarioId,
          entry.contrast,
          partitionCount(entry.scenarioId),
        );
        const initialIds = initial.causalGraph.nodes.map((node) => node.id);
        expect(primary.causalGraph.nodes.map((node) => node.id)).toEqual(
          initialIds,
        );
        expect(contrast.causalGraph.nodes.map((node) => node.id)).toEqual(
          initialIds,
        );
      });
    });
  }
});
