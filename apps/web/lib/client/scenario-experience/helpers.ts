import type {
  CausalGraphEdge,
  CausalGraphModel,
  CausalGraphNode,
  EntityDetailModel,
  EntityFocusRef,
  EvidenceEmphasis,
  EvidenceFact,
  EvidenceScope,
  EvidenceTableColumn,
  EvidenceTableModel,
  EvidenceTableRow,
  EvidenceValue,
  FocusRef,
  Provenance,
  ScenarioExperienceDefinition,
  ScenarioExperienceFrame,
  ScenarioExperienceId,
  ScenarioExperienceSnapshot,
  ScenarioExperimentEvidence,
  ScenarioLensModel,
  ScenarioNarrative,
} from "./model";

export function evidence(
  value: string | number,
  provenance: Provenance,
  scope: EvidenceScope,
  scopeLabel?: string,
): EvidenceValue {
  return { value, provenance, scope, ...(scopeLabel ? { scopeLabel } : {}) };
}

export function fact(
  id: string,
  label: string,
  value: EvidenceValue,
  options: { detail?: string; emphasis?: EvidenceEmphasis } = {},
): EvidenceFact {
  return { id, label, value, ...options };
}

export function entityFocus(
  id: string,
  graphEntityId?: string,
): EntityFocusRef {
  return {
    kind: "entity",
    id,
    ...(graphEntityId ? { graphEntityId } : {}),
  };
}

export function messageFocus(
  id: string,
  partition?: number,
  offset?: string,
): FocusRef {
  return {
    kind: "message",
    id,
    ...(partition == null ? {} : { partition }),
    ...(offset == null ? {} : { offset }),
  };
}

export function recordFocus(
  snapshot: ScenarioExperienceSnapshot,
  id: string,
  partition?: number,
  offset?: string,
  graphEntityId?: string,
): FocusRef {
  return snapshot.recentMessages.some((message) => message.messageId === id)
    ? messageFocus(id, partition, offset)
    : entityFocus(id, graphEntityId);
}

export function table(
  id: string,
  caption: string,
  columns: readonly EvidenceTableColumn[],
  rows: readonly EvidenceTableRow[],
  emptyCopy: string,
  bounded?: EvidenceTableModel["bounded"],
): EvidenceTableModel {
  return {
    id,
    caption,
    columns,
    rows,
    emptyCopy,
    ...(bounded ? { bounded } : {}),
  };
}

export function row(
  id: string,
  cells: Record<string, EvidenceValue>,
  focus?: FocusRef,
  emphasis?: EvidenceEmphasis,
): EvidenceTableRow {
  return {
    id,
    cells,
    ...(focus ? { focus } : {}),
    ...(emphasis ? { emphasis } : {}),
  };
}

export type GraphNodeSpec = Omit<CausalGraphNode, "focus"> & {
  focusId?: string;
};

export type GraphEdgeSpec = CausalGraphEdge;

export function causalGraph(
  nodes: readonly GraphNodeSpec[],
  edges: readonly GraphEdgeSpec[],
): CausalGraphModel {
  return {
    nodes: nodes.map(({ focusId, ...node }) => ({
      ...node,
      focus: { kind: "entity", id: focusId ?? node.id },
    })),
    edges,
  };
}

export function narrative(
  whatChanged: string,
  why: string,
  next: string,
  provenance: Provenance,
  scope: EvidenceScope = "current",
): ScenarioNarrative {
  return {
    whatChanged: {
      label: "What changed",
      text: whatChanged,
      provenance,
      scope,
    },
    why: { label: "Why", text: why, provenance, scope },
    next: {
      label: "What happens next",
      text: next,
      provenance,
      scope,
    },
  };
}

function entityDetailsFromGraph(
  graph: CausalGraphModel,
  factsByEntity: Readonly<Record<string, readonly EvidenceFact[]>> = {},
  graphTargets: Readonly<Record<string, string>> = {},
): Readonly<Record<string, EntityDetailModel>> {
  const graphDetails = Object.fromEntries(
    graph.nodes.map((node) => [
      node.id,
      {
        entityId: node.id,
        title: node.title,
        summary: node.description,
        provenance: node.provenance,
        facts:
          factsByEntity[node.id] ??
          (node.metric
            ? [fact(`${node.id}-metric`, "Current evidence", node.metric)]
            : []),
        focus: node.focus,
      },
    ]),
  );
  const extraDetails = Object.fromEntries(
    Object.entries(factsByEntity)
      .filter(([entityId]) => !(entityId in graphDetails))
      .map(([entityId, facts]) => [
        entityId,
        {
          entityId,
          title: entityId,
          summary: "Scenario experiment evidence record.",
          provenance: facts[0]?.value.provenance ?? "derived",
          ...(graphTargets[entityId]
            ? { graphEntityId: graphTargets[entityId] }
            : {}),
          facts,
          focus: entityFocus(entityId),
        },
      ]),
  );
  return { ...graphDetails, ...extraDetails };
}

export function createFrame<Id extends ScenarioExperienceId>(
  definition: Pick<
    ScenarioExperienceDefinition<Id>,
    "scenarioId" | "title" | "lesson" | "experiments" | "checkpoint"
  >,
  graph: CausalGraphModel,
  lens: ScenarioLensModel,
  frameNarrative: ScenarioNarrative,
  factsByEntity?: Readonly<Record<string, readonly EvidenceFact[]>>,
  experiment?: ScenarioExperimentEvidence,
): ScenarioExperienceFrame<Id> {
  const lensFacts = entityFactsFromLens(lens);
  const graphTargets = entityGraphTargetsFromLens(lens);
  return {
    scenarioId: definition.scenarioId,
    title: definition.title,
    lesson: definition.lesson,
    causalGraph: graph,
    lens,
    narrative: frameNarrative,
    experiments: definition.experiments,
    experiment: experiment ?? {
      experimentId: definition.experiments.primary.id,
      status: "idle",
      error: null,
      completedExperimentIds: [],
      hypothesis: definition.experiments.primary.hypothesis,
      before: [],
      current: lens.facts,
      after: [],
    },
    checkpoint: definition.checkpoint,
    entityDetails: entityDetailsFromGraph(
      graph,
      {
        ...lensFacts,
        ...(factsByEntity ?? {}),
      },
      graphTargets,
    ),
  };
}

function entityGraphTargetsFromLens(
  lens: ScenarioLensModel,
): Readonly<Record<string, string>> {
  const targets: Record<string, string> = {};
  for (const evidenceTable of lensTables(lens)) {
    for (const evidenceRow of evidenceTable.rows) {
      if (
        evidenceRow.focus?.kind === "entity" &&
        evidenceRow.focus.graphEntityId
      ) {
        targets[evidenceRow.focus.id] = evidenceRow.focus.graphEntityId;
      }
    }
  }
  return targets;
}

function entityFactsFromLens(
  lens: ScenarioLensModel,
): Readonly<Record<string, readonly EvidenceFact[]>> {
  const entries: Array<[string, readonly EvidenceFact[]]> = [];
  for (const evidenceTable of lensTables(lens)) {
    const labels = new Map(
      evidenceTable.columns.map((column) => [column.key, column.label]),
    );
    for (const evidenceRow of evidenceTable.rows) {
      if (evidenceRow.focus?.kind !== "entity") continue;
      entries.push([
        evidenceRow.focus.id,
        Object.entries(evidenceRow.cells).map(([key, value]) =>
          fact(
            `${evidenceTable.id}-${evidenceRow.id}-${key}`,
            labels.get(key) ?? key,
            value,
          ),
        ),
      ]);
    }
  }
  return Object.fromEntries(entries);
}

function lensTables(lens: ScenarioLensModel): EvidenceTableModel[] {
  return [
    lens.table,
    ...(lens.sections?.map((section) => section.table) ?? []),
    ...(lens.kind === "projection" ? [lens.source, lens.projection] : []),
    ...(lens.kind === "capacity" ? [lens.partitions] : []),
    ...(lens.kind === "window-join" ? [lens.outputs] : []),
  ].filter((item): item is EvidenceTableModel => item != null);
}

export function latestWindow<T>(items: readonly T[], size = 8) {
  const shown = Math.min(items.length, size);
  return {
    items: items.slice(-size),
    bounded: {
      shown,
      total: items.length,
      label: `Latest ${shown} of ${items.length} records`,
    },
  };
}
