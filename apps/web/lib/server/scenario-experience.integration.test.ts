import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScenarioState } from "@kplay/contracts";
import { experimentTransitionTrail } from "@/lib/client/scenario-experience/definition-helpers";
import { resolveScenarioExperience } from "@/lib/client/scenario-experience/registry";
import {
  scenarioTeachingManifest,
  type RenderedEvidenceExpectation,
} from "../../../../tests/e2e/scenario-teaching-manifest";

vi.mock("./env", async () => {
  const { createTestServerEnv } = await import("./playground-runtime-test-env");
  return { getServerEnv: () => createTestServerEnv() };
});

describe("authoritative runtime to teaching projector integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const teachingCase of scenarioTeachingManifest) {
    it(`${teachingCase.scenarioId} projects its authoritative primary and contrast states`, async () => {
      const { PlaygroundRuntime } = await import("./playground-runtime");
      const runtime = new PlaygroundRuntime();
      const started = await runtime.createRun(teachingCase.scenarioId);

      const initial = resolveScenarioExperience(started);
      expect(initial.kind).toBe("experience");
      if (initial.kind !== "experience") return;
      expect(started.scenarioState?.revision).toBe(0);
      expect(initial.frame.experiment.status).toBe("idle");
      expect(initial.frame.experiment.experimentId).toBeNull();
      expect(initial.frame.experiment.completedExperimentIds).toEqual([]);

      const primary = await runtime.runExperiment(
        started.runId,
        teachingCase.primaryExperimentId,
      );
      assertProjectedState(
        primary.scenarioState,
        teachingCase.scenarioId,
        teachingCase.primaryExperimentId,
      );
      assertPrimarySemanticInvariants(
        teachingCase.scenarioId,
        primary.scenarioState,
      );
      const primaryResolution = resolveScenarioExperience(primary);
      expect(primaryResolution.kind).toBe("experience");
      if (primaryResolution.kind !== "experience") return;
      assertProjectedEvidence(
        primaryResolution.frame.lens.facts,
        teachingCase.renderedEvidence.primary,
      );
      expect(
        primaryResolution.frame.experiment.completedExperimentIds,
      ).toContain(teachingCase.primaryExperimentId);
      expect(
        experimentTransitionTrail(
          primary.recentEvents,
          teachingCase.scenarioId,
          teachingCase.primaryExperimentId,
        ).length,
      ).toBeGreaterThan(0);

      const contrast = await runtime.runExperiment(
        started.runId,
        teachingCase.contrastExperimentId,
      );
      assertProjectedState(
        contrast.scenarioState,
        teachingCase.scenarioId,
        teachingCase.contrastExperimentId,
      );
      const contrastResolution = resolveScenarioExperience(contrast);
      expect(contrastResolution.kind).toBe("experience");
      if (contrastResolution.kind !== "experience") return;
      assertProjectedEvidence(
        contrastResolution.frame.lens.facts,
        teachingCase.renderedEvidence.contrast,
      );
      expect(
        contrastResolution.frame.experiment.completedExperimentIds,
      ).toEqual(
        expect.arrayContaining([
          teachingCase.primaryExperimentId,
          teachingCase.contrastExperimentId,
        ]),
      );
      expect(contrastResolution.frame.narrative.whatChanged.text).not.toBe("");
      expect(contrastResolution.frame.narrative.why.text).not.toBe("");
      expect(contrastResolution.frame.narrative.next.text).not.toBe("");
      expect(
        experimentTransitionTrail(
          contrast.recentEvents,
          teachingCase.scenarioId,
          teachingCase.contrastExperimentId,
        ).length,
      ).toBeGreaterThan(0);

      assertCorrectedSemanticInvariants(
        teachingCase.scenarioId,
        contrast.scenarioState,
      );
      await runtime.reset(started.runId);
    });
  }
});

function assertProjectedEvidence(
  facts: readonly {
    label: string;
    value: { value: string | number; display?: string };
  }[],
  expectation: RenderedEvidenceExpectation,
) {
  const fact = facts.find(({ label }) => label === expectation.label);
  expect(fact, `Missing evidence fact: ${expectation.label}`).toBeDefined();
  expect(fact?.value.display ?? String(fact?.value.value)).toBe(
    String(expectation.value),
  );
}

function assertProjectedState(
  state: ScenarioState | null | undefined,
  scenarioId: string,
  experimentId: string,
) {
  expect(state).toMatchObject({
    scenarioId,
    experiment: { experimentId, status: "completed" },
  });
}

function assertCorrectedSemanticInvariants(
  scenarioId: string,
  state: ScenarioState | null | undefined,
) {
  if (!state || state.scenarioId !== scenarioId) {
    throw new Error(`Missing ${scenarioId} scenario state`);
  }
  switch (state.scenarioId) {
    case "schema-evolution-karapace":
      expect(state.activeVersion).toBe(2);
      expect(state.topicRecordCount).toBe(1);
      break;
    case "event-replay-sourcing":
      expect(state.cursor).toBe("2");
      expect(state.producedCount).toBe(3);
      break;
    case "streams-joins-windows":
      expect(state.windows[0]).toMatchObject({ closed: true });
      expect(state.joins).toHaveLength(1);
      break;
    case "outbox-cdc":
      expect(state.publishes).toHaveLength(1);
      expect(state.dedupeLedger[0]).toMatchObject({ suppressedAttempts: 1 });
      break;
    default:
      expect(state.revision).toBeGreaterThan(0);
  }
}

function assertPrimarySemanticInvariants(
  scenarioId: string,
  state: ScenarioState | null | undefined,
) {
  if (!state || state.scenarioId !== scenarioId) {
    throw new Error(`Missing ${scenarioId} primary state`);
  }
  switch (state.scenarioId) {
    case "schema-evolution-karapace":
      expect(state.activeVersion).toBe(2);
      expect(state.topicRecordCount).toBe(1);
      break;
    case "event-replay-sourcing":
      expect(state.cursor).toBe("2");
      expect(state.producedCount).toBe(3);
      break;
    case "streams-joins-windows":
      expect(state.windows[0]).toMatchObject({ closed: false });
      expect(state.joins).toHaveLength(1);
      break;
    case "outbox-cdc":
      expect(state.publishes).toHaveLength(1);
      expect(state.dedupeLedger).toHaveLength(0);
      break;
    default:
      expect(state.revision).toBeGreaterThan(0);
  }
}
