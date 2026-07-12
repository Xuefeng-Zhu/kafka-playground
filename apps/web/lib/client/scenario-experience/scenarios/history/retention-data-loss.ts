import {
  experienceDefinition,
  experimentEvidence,
} from "../../definition-helpers";
import { buildScenarioGraph } from "../../graphs";
import {
  createFrame,
  entityFocus,
  evidence,
  fact,
  latestWindow,
  narrative,
  recordFocus,
  row,
  table,
} from "../../helpers";
import type {
  LifecycleRecordModel,
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioExperienceSnapshot,
  ScenarioStateFor,
} from "../../model";

export const retentionExperience = experienceDefinition(
  "retention-data-loss",
  projectRetention,
);

type RetentionDefinition = ScenarioExperienceDefinition<"retention-data-loss">;
type RetentionInput = ScenarioExperienceProjectionInput<"retention-data-loss">;
type RetentionState = ScenarioStateFor<"retention-data-loss">;
type RetentionRecord = RetentionState["records"][number];

function projectRetention(
  definition: RetentionDefinition,
  input: RetentionInput,
) {
  const { scenarioState } = input;
  const recordWindow = latestWindow(scenarioState.records);
  const expired = scenarioState.records.filter((record) => record.expired);
  const isRecovery =
    scenarioState.experiment.experimentId === "recover-retention";
  const factSet = buildRetentionFacts(scenarioState, expired.length);
  const facts = factSet.all;
  return createFrame(
    definition,
    buildRetentionGraph(input),
    {
      kind: "lifecycle",
      title: "Retention boundary",
      summary:
        "Virtual record age determines whether a committed offset can replay.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildRetentionRecordTable(
        input,
        recordWindow,
        definition.lesson.emptyCopy,
      ),
      sections: [
        {
          id: "retention-recovery",
          title: "Recovery choices",
          facts: [
            factSet.logStart,
            factSet.committedOffset,
            factSet.replayStatus,
          ],
          table: buildRecoveryTable(scenarioState),
        },
      ],
      records: buildRetentionLifecycleRecords(
        input.snapshot,
        recordWindow.items,
      ),
    },
    buildRetentionNarrative(
      definition,
      scenarioState,
      expired.length,
      isRecovery,
    ),
    undefined,
    experimentEvidence(
      definition,
      input,
      facts,
      buildRetentionBeforeFacts(scenarioState, expired, isRecovery),
      scenarioState.experiment.status === "completed" ? facts : [],
    ),
  );
}

function buildRetentionFacts(state: RetentionState, expiredCount: number) {
  const retentionDuration = fact(
    "retention-duration",
    "Retention",
    evidence(`${state.retentionMs} ms`, "simulated", "current"),
  );
  const logStart = fact(
    "retention-log-start",
    "Log-start offset",
    evidence(state.logStartOffset, "simulated", "current"),
  );
  const committedOffset = fact(
    "retention-committed",
    "Committed offset",
    evidence(state.committedOffset, "simulated", "current"),
  );
  const expiredRecords = fact(
    "retention-expired",
    "Expired records",
    evidence(expiredCount, "simulated", "run-total"),
    { emphasis: expiredCount > 0 ? "warning" : "neutral" },
  );
  const replayStatus = fact(
    "retention-error",
    "Replay status",
    evidence(
      state.error?.code ?? "Available",
      state.error?.provenance ?? "simulated",
      "current",
    ),
    { emphasis: state.error ? "danger" : "positive" },
  );
  return {
    all: [
      retentionDuration,
      logStart,
      committedOffset,
      expiredRecords,
      replayStatus,
    ],
    retentionDuration,
    logStart,
    committedOffset,
    expiredRecords,
    replayStatus,
  };
}

function buildRetentionRecordTable(
  input: RetentionInput,
  recordWindow: ReturnType<typeof latestWindow<RetentionRecord>>,
  emptyCopy: string,
) {
  return table(
    "retention-record-window",
    "Record age and retention status",
    [
      { key: "offset", label: "Offset", align: "end" },
      { key: "created", label: "Created at" },
      { key: "age", label: "Age", align: "end" },
      { key: "status", label: "Retention status" },
    ],
    recordWindow.items.map((record) =>
      row(
        record.id,
        {
          offset: evidence(
            record.offset,
            record.provenance,
            "recent-window",
            recordWindow.bounded?.label,
          ),
          created: evidence(
            `${record.createdAtVirtualMs} ms`,
            record.provenance,
            "recent-window",
            recordWindow.bounded?.label,
          ),
          age: evidence(
            `${Math.max(0, input.scenarioState.virtualTimeMs - record.createdAtVirtualMs)} ms`,
            "simulated",
            "current",
          ),
          status: evidence(
            record.expired ? "Expired" : "Retained",
            record.provenance,
            "current",
          ),
        },
        retentionRecordFocus(input.snapshot, record),
        record.expired ? "danger" : "neutral",
      ),
    ),
    emptyCopy,
    recordWindow.bounded,
  );
}

function buildRecoveryTable(state: RetentionState) {
  const context = state.error ?? state.lastOffsetOutOfRange;
  return table(
    "retention-recovery-options",
    "Offset-out-of-range recovery choices",
    [
      { key: "choice", label: "Recovery choice" },
      { key: "effect", label: "Effect" },
    ],
    (context?.recoveryOptions ?? []).map((option) =>
      row(
        `recovery-${option}`,
        {
          choice: evidence(
            option,
            context?.provenance ?? "simulated",
            "current",
          ),
          effect: evidence(
            option === "earliest"
              ? `Resume at ${state.logStartOffset}`
              : option === "latest"
                ? "Skip to the current end"
                : "Restore from an external source",
            "derived",
            "current",
          ),
        },
        entityFocus(`recovery-${option}`, "expired-boundary"),
      ),
    ),
    "Recovery choices appear after offset_out_of_range.",
  );
}

function buildRetentionGraph(input: RetentionInput) {
  const { scenarioState } = input;
  return buildScenarioGraph("retention-data-loss", input.snapshot, {
    active: scenarioState.records.length > 0,
    metrics: {
      "retention-window": evidence(
        `${scenarioState.retentionMs} ms`,
        "simulated",
        "current",
      ),
      "expired-boundary": evidence(
        scenarioState.logStartOffset,
        "simulated",
        "current",
      ),
    },
    states: {
      "expired-boundary": scenarioState.error ? "failed" : "active",
    },
  });
}

function buildRetentionNarrative(
  definition: RetentionDefinition,
  state: RetentionState,
  expiredCount: number,
  isRecovery: boolean,
) {
  if (isRecovery) {
    return narrative(
      `Committed progress recovered to the retained log-start offset ${state.logStartOffset}; replay is available again.`,
      `Recovery changes the cursor, but the ${expiredCount} expired record(s) remain deleted by retention.`,
      "Choose earliest, latest, or external restore deliberately when the next offset-out-of-range error occurs.",
      "simulated",
    );
  }
  if (state.error) {
    return narrative(
      `Log start moved to ${state.logStartOffset}, beyond requested offset ${state.error.requestedOffset}.`,
      "Retention deleted the old record even though the consumer's committed offset still referenced it.",
      `Choose ${state.error.recoveryOptions.join(", ")} based on the application's data-loss policy.`,
      state.error.provenance,
    );
  }
  return narrative(
    state.records.length > 0
      ? `${expiredCount} record(s) are beyond the current retention cutoff.`
      : "No retention records exist yet.",
    "Virtual time moves the cutoff and log-start boundary independently of committed progress.",
    definition.lesson.emptyCopy,
    "simulated",
  );
}

function buildRetentionLifecycleRecords(
  snapshot: ScenarioExperienceSnapshot,
  records: readonly RetentionRecord[],
): LifecycleRecordModel[] {
  return records.map((record) => ({
    id: record.id,
    recordId: record.id,
    stage: record.expired ? "expired" : "retained",
    attempt: 1,
    outcome: record.expired ? "failed" : "waiting",
    provenance: record.provenance,
    focus: retentionRecordFocus(snapshot, record),
  }));
}

function retentionRecordFocus(
  snapshot: ScenarioExperienceSnapshot,
  record: RetentionRecord,
) {
  return recordFocus(
    snapshot,
    record.id,
    undefined,
    record.offset,
    record.expired ? "expired-boundary" : "retention-window",
  );
}

function buildRetentionBeforeFacts(
  state: RetentionState,
  expired: readonly RetentionRecord[],
  isRecovery: boolean,
) {
  const committedBeforeRecovery =
    state.lastOffsetOutOfRange?.requestedOffset ??
    expired.at(0)?.offset ??
    state.committedOffset;
  return [
    fact(
      "retention-before-start",
      "Log start before",
      evidence(isRecovery ? state.logStartOffset : "0", "simulated", "current"),
    ),
    fact(
      "retention-before-committed",
      "Committed before",
      evidence(
        isRecovery ? committedBeforeRecovery : state.committedOffset,
        "simulated",
        "current",
      ),
    ),
    fact(
      "retention-before-error",
      "Replay before",
      evidence(
        isRecovery ? "offset_out_of_range" : "Available",
        "simulated",
        "current",
      ),
    ),
  ];
}
