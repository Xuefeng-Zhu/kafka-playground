import { type RunSnapshot, type ScenarioExperimentId } from "@kplay/contracts";
import { SCENARIOS, SCENARIO_IDS } from "@kplay/scenario-engine";
import { expect } from "vitest";
import { runSnapshot } from "../run-snapshot-test-fixtures";
import type {
  EvidenceFact,
  EvidenceTableModel,
  ScenarioExperienceFrame,
  ScenarioLensModel,
} from "./model";
import { projectScenarioExperience } from "./registry";
import { teachingScenarioTestManifest } from "./scenario-experience.test-manifest";

export function project(
  scenarioId: (typeof SCENARIO_IDS)[number],
  scenarioState: (typeof teachingScenarioTestManifest)[number]["initial"],
  partitions: number,
) {
  const manifestEntry = teachingScenarioTestManifest.find(
    (entry) => entry.scenarioId === scenarioId,
  );
  if (!manifestEntry) throw new Error(`Missing ${scenarioId} test fixture`);
  return projectScenarioExperience(
    snapshotFor(
      scenarioId,
      scenarioState,
      partitions,
      completedExperimentIdsForState(manifestEntry, scenarioState),
    ),
    scenarioState,
  );
}

export function snapshotFor(
  scenarioId: (typeof SCENARIO_IDS)[number],
  scenarioState:
    | (typeof teachingScenarioTestManifest)[number]["initial"]
    | null,
  partitionCount = 2,
  completedExperimentIds: RunSnapshot["completedExperimentIds"] = [],
) {
  return runSnapshot({
    scenarioId,
    partitionCount,
    scenarioState,
    recentMessages: [],
    completedExperimentIds,
  });
}

export function partitionCount(scenarioId: (typeof SCENARIO_IDS)[number]) {
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`Missing ${scenarioId} scenario definition`);
  return scenario.topic.partitions;
}

export function findFact(facts: readonly EvidenceFact[], id: string) {
  return facts.find((candidate) => candidate.id === id);
}

export function collectTables(lens: ScenarioLensModel): EvidenceTableModel[] {
  return [
    lens.table,
    ...(lens.sections?.map((section) => section.table) ?? []),
    ...(lens.kind === "projection" ? [lens.source, lens.projection] : []),
    ...(lens.kind === "capacity" ? [lens.partitions] : []),
    ...(lens.kind === "window-join" ? [lens.outputs] : []),
  ].filter((candidate): candidate is EvidenceTableModel => candidate != null);
}

export function assertGraph(frame: ScenarioExperienceFrame) {
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

export function assertEvidence(frame: ScenarioExperienceFrame) {
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

function completedExperimentIdsForState(
  entry: (typeof teachingScenarioTestManifest)[number],
  scenarioState: (typeof teachingScenarioTestManifest)[number]["initial"],
): RunSnapshot["completedExperimentIds"] {
  const activeId = scenarioState.experiment.experimentId;
  if (activeId === null) return [];
  const primaryId = requiredExperimentId(entry.primary.experiment.experimentId);
  const contrastId = requiredExperimentId(
    entry.contrast.experiment.experimentId,
  );
  if (activeId === contrastId) {
    return scenarioState.experiment.status === "completed"
      ? [primaryId, contrastId]
      : [primaryId];
  }
  return activeId === primaryId &&
    scenarioState.experiment.status === "completed"
    ? [primaryId]
    : [];
}

function requiredExperimentId(
  experimentId: ScenarioExperimentId | null,
): ScenarioExperimentId {
  if (experimentId === null) {
    throw new Error("Expected a completed experiment ID");
  }
  return experimentId;
}

function assertValue(value: EvidenceFact["value"]) {
  expect(value.provenance).toMatch(/^(observed|derived|simulated)$/);
  expect(value.scope).toMatch(/^(current|run-total|recent-window)$/);
  if (value.scope === "recent-window") {
    expect(value.scopeLabel).toMatch(/^Latest \d+ of \d+ records$/);
  }
}
