import { scenarioStateIds } from "@kplay/contracts";
import type {
  RunSnapshot,
  RuntimeEvent,
  ScenarioState,
} from "@kplay/contracts";

export const SCENARIO_EXPERIENCE_IDS = scenarioStateIds;

export type ScenarioExperienceId = ScenarioState["scenarioId"];

export type Provenance = "observed" | "derived" | "simulated";

export type EvidenceScope = "current" | "run-total" | "recent-window";

export type EvidenceValue = {
  value: string | number;
  display?: string;
  provenance: Provenance;
  scope: EvidenceScope;
  /** Required for bounded or otherwise non-obvious scopes. */
  scopeLabel?: string;
};

export type EvidenceEmphasis = "neutral" | "positive" | "warning" | "danger";

export type EvidenceFact = {
  id: string;
  label: string;
  value: EvidenceValue;
  detail?: string;
  emphasis?: EvidenceEmphasis;
};

export type MessageFocusRef = {
  kind: "message";
  id: string;
  partition?: number;
  offset?: string;
};

export type EventFocusRef = {
  kind: "event";
  id: string;
};

export type EntityFocusRef = {
  kind: "entity";
  id: string;
  graphEntityId?: string;
};

export type FocusRef = MessageFocusRef | EventFocusRef | EntityFocusRef;

export type EvidenceTableColumn = {
  key: string;
  label: string;
  align?: "start" | "center" | "end";
};

export type EvidenceTableRow = {
  id: string;
  focus?: FocusRef;
  cells: Record<string, EvidenceValue>;
  emphasis?: EvidenceEmphasis;
};

export type EvidenceTableModel = {
  id: string;
  caption: string;
  columns: readonly EvidenceTableColumn[];
  rows: readonly EvidenceTableRow[];
  emptyCopy: string;
  bounded?: {
    shown: number;
    total: number;
    label: string;
  };
};

export type CausalGraphNode = {
  id: string;
  title: string;
  description: string;
  provenance: Provenance;
  focus: EntityFocusRef;
  state?: "idle" | "active" | "complete" | "warning" | "failed";
  metric?: EvidenceValue;
};

export type CausalGraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  provenance: Provenance;
  scope: EvidenceScope;
  active?: boolean;
};

export type CausalGraphModel = {
  nodes: readonly CausalGraphNode[];
  edges: readonly CausalGraphEdge[];
};

export type EvidenceSection = {
  id: string;
  title: string;
  summary?: string;
  facts: readonly EvidenceFact[];
  table?: EvidenceTableModel;
};

type ScenarioLensBase = {
  title: string;
  summary: string;
  emptyCopy: string;
  facts: readonly EvidenceFact[];
  table?: EvidenceTableModel;
  sections?: readonly EvidenceSection[];
};

export type RoutingTraceModel = {
  id: string;
  key: string;
  partition: number;
  offset?: string;
  reason: string;
  provenance: Provenance;
  focus: FocusRef;
};

export type RoutingLensModel = ScenarioLensBase & {
  kind: "routing";
  traces: readonly RoutingTraceModel[];
};

export type AssignmentDeltaModel = {
  id: string;
  partition: number;
  beforeOwner: string | null;
  afterOwner: string | null;
  status: "kept" | "moved" | "assigned" | "revoked" | "idle";
  provenance: Provenance;
  focus: FocusRef;
};

export type AssignmentLensModel = ScenarioLensBase & {
  kind: "assignment";
  beforeLabel: string;
  afterLabel: string;
  deltas: readonly AssignmentDeltaModel[];
};

export type LifecycleRecordModel = {
  id: string;
  recordId: string;
  stage: string;
  attempt: number;
  outcome: "waiting" | "retrying" | "succeeded" | "failed" | "dead-lettered";
  backoffMs?: number;
  provenance: Provenance;
  focus: FocusRef;
};

export type LifecycleLensModel = ScenarioLensBase & {
  kind: "lifecycle";
  records: readonly LifecycleRecordModel[];
};

export type PipelineStageModel = {
  id: string;
  title: string;
  status: "waiting" | "active" | "complete" | "failed" | "deduplicated";
  provenance: Provenance;
  focus: EntityFocusRef;
};

export type PipelineLensModel = ScenarioLensBase & {
  kind: "pipeline";
  stages: readonly PipelineStageModel[];
};

export type GateEvaluationModel = {
  id: string;
  subject: string;
  resource?: string;
  operation?: string;
  outcome: "allowed" | "denied";
  reason: string;
  provenance: Provenance;
  focus: FocusRef;
};

export type GateMatrixCellModel = {
  id: string;
  principal: string;
  operation: string;
  resource: string;
  effect: "allow" | "deny" | "missing";
  highlighted: boolean;
  provenance: Provenance;
  focus: FocusRef;
};

export type GateLensModel = ScenarioLensBase & {
  kind: "gate";
  evaluations: readonly GateEvaluationModel[];
  matrixCells?: readonly GateMatrixCellModel[];
};

export type TransactionBoundaryModel = {
  id: string;
  status: "staged" | "committed" | "aborted" | "deduplicated";
  recordIds: readonly string[];
  visibleRecordIds: readonly string[];
  provenance: Provenance;
  focus: EntityFocusRef;
};

export type TransactionLensModel = ScenarioLensBase & {
  kind: "transaction";
  boundaries: readonly TransactionBoundaryModel[];
};

export type ProjectionLensModel = ScenarioLensBase & {
  kind: "projection";
  source: EvidenceTableModel;
  projection: EvidenceTableModel;
  cursor: EvidenceValue;
};

export type CapacityTrend = "empty" | "rising" | "falling" | "steady";

export type CapacityLensModel = ScenarioLensBase & {
  kind: "capacity";
  trend: CapacityTrend;
  partitions: EvidenceTableModel;
  drainEstimate: EvidenceValue;
};

export type HeatmapPhaseModel = {
  id: string;
  label: string;
  sampleSize: number;
  partitionCounts: Readonly<Record<string, number>>;
  partitionPercentages: Readonly<Record<string, number>>;
  skewRatio: number;
  provenance: Provenance;
  scope: EvidenceScope;
};

export type HeatmapLensModel = ScenarioLensBase & {
  kind: "heatmap";
  phases: readonly HeatmapPhaseModel[];
};

export type WindowJoinRecordModel = {
  id: string;
  key: string;
  side: "left" | "right";
  eventTimeMs: number;
  windowId?: string;
  outcome: "waiting" | "joined" | "unmatched" | "late";
  provenance: Provenance;
  focus: FocusRef;
};

export type WindowJoinLensModel = ScenarioLensBase & {
  kind: "window-join";
  records: readonly WindowJoinRecordModel[];
  outputs: EvidenceTableModel;
};

export type ScenarioLensModel =
  | RoutingLensModel
  | AssignmentLensModel
  | LifecycleLensModel
  | PipelineLensModel
  | GateLensModel
  | TransactionLensModel
  | ProjectionLensModel
  | CapacityLensModel
  | HeatmapLensModel
  | WindowJoinLensModel;

export type ScenarioNarrativeItem = {
  label: "What changed" | "Why" | "What happens next";
  text: string;
  provenance: Provenance;
  scope: EvidenceScope;
};

export type ScenarioNarrative = {
  whatChanged: ScenarioNarrativeItem;
  why: ScenarioNarrativeItem;
  next: ScenarioNarrativeItem;
};

export type ScenarioLesson = {
  objective: string;
  misconception: string;
  emptyCopy: string;
};

export type ScenarioExperimentMetadata = {
  id: string;
  role: "primary" | "contrast";
  label: string;
  hypothesis: string;
  description: string;
  remoteSupport: "supported" | "demo-only";
};

export type ScenarioExperiments = {
  primary: ScenarioExperimentMetadata;
  contrast: ScenarioExperimentMetadata;
};

export type ScenarioCheckpointOption = {
  id: string;
  label: string;
};

export type ScenarioCheckpoint = {
  id: string;
  prompt: string;
  options: readonly ScenarioCheckpointOption[];
  correctOptionId: string;
  explanation: string;
};

export type EntityDetailModel = {
  entityId: string;
  title: string;
  summary: string;
  provenance: Provenance;
  graphEntityId?: string;
  facts: readonly EvidenceFact[];
  focus: EntityFocusRef;
};

export type ScenarioExperimentEvidence = {
  experimentId: string | null;
  status: ScenarioState["experiment"]["status"];
  error: ScenarioState["experiment"]["error"];
  completedExperimentIds: readonly string[];
  hypothesis: string;
  before: readonly EvidenceFact[];
  current: readonly EvidenceFact[];
  after: readonly EvidenceFact[];
};

export type ScenarioExperimentTransitionTrailItem = {
  id: string;
  experimentId: string;
  stepLabel: string;
  stepIndex: number;
  totalSteps: number;
  virtualTimeMs: number;
  provenance: Provenance;
  transition: string;
  focus: EventFocusRef;
};

export type ScenarioExperienceFrame<
  Id extends ScenarioExperienceId = ScenarioExperienceId,
> = {
  scenarioId: Id;
  title: string;
  lesson: ScenarioLesson;
  causalGraph: CausalGraphModel;
  lens: ScenarioLensModel;
  narrative: ScenarioNarrative;
  experiments: ScenarioExperiments;
  experiment: ScenarioExperimentEvidence;
  checkpoint: ScenarioCheckpoint;
  entityDetails: Readonly<Record<string, EntityDetailModel>>;
};

export type ScenarioStateFor<Id extends ScenarioExperienceId> = Extract<
  ScenarioState,
  { scenarioId: Id }
>;

export type ScenarioExperienceSnapshot = Pick<
  RunSnapshot,
  | "scenarioId"
  | "scenarioState"
  | "mode"
  | "partitionCount"
  | "topicName"
  | "recentMessages"
>;

export type ScenarioExperienceProjectionInput<
  Id extends ScenarioExperienceId = ScenarioExperienceId,
> = {
  snapshot: RunSnapshot;
  scenarioState: ScenarioStateFor<Id>;
  events: readonly RuntimeEvent[];
};

export type ScenarioExperienceDefinition<
  Id extends ScenarioExperienceId = ScenarioExperienceId,
> = {
  scenarioId: Id;
  title: string;
  lesson: ScenarioLesson;
  experiments: ScenarioExperiments;
  checkpoint: ScenarioCheckpoint;
  project(
    input: ScenarioExperienceProjectionInput<Id>,
  ): ScenarioExperienceFrame<Id>;
};

export type ScenarioExperienceDefinitionRegistry = {
  [Id in ScenarioExperienceId]: ScenarioExperienceDefinition<Id>;
};

export type AnyScenarioExperienceDefinition = {
  [Id in ScenarioExperienceId]: ScenarioExperienceDefinition<Id>;
}[ScenarioExperienceId];

export type ScenarioExperienceResolution =
  | {
      kind: "experience";
      definition: AnyScenarioExperienceDefinition;
      frame: ScenarioExperienceFrame;
    }
  | {
      kind: "legacy";
      reason: "disabled" | "missing-state" | "mismatched-state";
    };

export function focusRefKey(focus: FocusRef): string {
  return `${focus.kind}:${focus.id}`;
}

export function focusRefsEqual(
  left: FocusRef | null | undefined,
  right: FocusRef | null | undefined,
): boolean {
  return (
    left != null && right != null && focusRefKey(left) === focusRefKey(right)
  );
}
