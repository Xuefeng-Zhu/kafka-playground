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
import type { LifecycleRecordModel } from "../../model";

export const retentionExperience = experienceDefinition(
  "retention-data-loss",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const recordWindow = latestWindow(scenarioState.records);
    const expired = scenarioState.records.filter((record) => record.expired);
    const isRecovery =
      scenarioState.experiment.experimentId === "recover-retention";
    const recoveryContext =
      scenarioState.error ?? scenarioState.lastOffsetOutOfRange;
    const committedBeforeRecovery =
      scenarioState.lastOffsetOutOfRange?.requestedOffset ??
      expired.at(0)?.offset ??
      scenarioState.committedOffset;
    const facts = [
      fact(
        "retention-duration",
        "Retention",
        evidence(`${scenarioState.retentionMs} ms`, "simulated", "current"),
      ),
      fact(
        "retention-log-start",
        "Log-start offset",
        evidence(scenarioState.logStartOffset, "simulated", "current"),
      ),
      fact(
        "retention-committed",
        "Committed offset",
        evidence(scenarioState.committedOffset, "simulated", "current"),
      ),
      fact(
        "retention-expired",
        "Expired records",
        evidence(expired.length, "simulated", "run-total"),
        {
          emphasis: expired.length > 0 ? "warning" : "neutral",
        },
      ),
      fact(
        "retention-error",
        "Replay status",
        evidence(
          scenarioState.error?.code ?? "Available",
          scenarioState.error?.provenance ?? "simulated",
          "current",
        ),
        { emphasis: scenarioState.error ? "danger" : "positive" },
      ),
    ];
    const recordTable = table(
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
              `${Math.max(0, scenarioState.virtualTimeMs - record.createdAtVirtualMs)} ms`,
              "simulated",
              "current",
            ),
            status: evidence(
              record.expired ? "Expired" : "Retained",
              record.provenance,
              "current",
            ),
          },
          recordFocus(
            snapshot,
            record.id,
            undefined,
            record.offset,
            record.expired ? "expired-boundary" : "retention-window",
          ),
          record.expired ? "danger" : "neutral",
        ),
      ),
      definition.lesson.emptyCopy,
      recordWindow.bounded,
    );
    const recoveryTable = table(
      "retention-recovery-options",
      "Offset-out-of-range recovery choices",
      [
        { key: "choice", label: "Recovery choice" },
        { key: "effect", label: "Effect" },
      ],
      (recoveryContext?.recoveryOptions ?? []).map((option) =>
        row(
          `recovery-${option}`,
          {
            choice: evidence(
              option,
              recoveryContext?.provenance ?? "simulated",
              "current",
            ),
            effect: evidence(
              option === "earliest"
                ? `Resume at ${scenarioState.logStartOffset}`
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
    const graph = buildScenarioGraph("retention-data-loss", snapshot, {
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
    const frameNarrative = isRecovery
      ? narrative(
          `Committed progress recovered to the retained log-start offset ${scenarioState.logStartOffset}; replay is available again.`,
          `Recovery changes the cursor, but the ${expired.length} expired record(s) remain deleted by retention.`,
          "Choose earliest, latest, or external restore deliberately when the next offset-out-of-range error occurs.",
          "simulated",
        )
      : scenarioState.error
        ? narrative(
            `Log start moved to ${scenarioState.logStartOffset}, beyond requested offset ${scenarioState.error.requestedOffset}.`,
            "Retention deleted the old record even though the consumer's committed offset still referenced it.",
            `Choose ${scenarioState.error.recoveryOptions.join(", ")} based on the application's data-loss policy.`,
            scenarioState.error.provenance,
          )
        : narrative(
            scenarioState.records.length > 0
              ? `${expired.length} record(s) are beyond the current retention cutoff.`
              : "No retention records exist yet.",
            "Virtual time moves the cutoff and log-start boundary independently of committed progress.",
            definition.lesson.emptyCopy,
            "simulated",
          );
    const lifecycleRecords: LifecycleRecordModel[] = recordWindow.items.map(
      (record) => ({
        id: record.id,
        recordId: record.id,
        stage: record.expired ? "expired" : "retained",
        attempt: 1,
        outcome: record.expired ? "failed" : "waiting",
        provenance: record.provenance,
        focus: recordFocus(
          snapshot,
          record.id,
          undefined,
          record.offset,
          record.expired ? "expired-boundary" : "retention-window",
        ),
      }),
    );

    return createFrame(
      definition,
      graph,
      {
        kind: "lifecycle",
        title: "Retention boundary",
        summary:
          "Virtual record age determines whether a committed offset can replay.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: recordTable,
        sections: [
          {
            id: "retention-recovery",
            title: "Recovery choices",
            facts: [facts[1], facts[2], facts[4]],
            table: recoveryTable,
          },
        ],
        records: lifecycleRecords,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "retention-before-start",
            "Log start before",
            evidence(
              isRecovery ? scenarioState.logStartOffset : "0",
              "simulated",
              "current",
            ),
          ),
          fact(
            "retention-before-committed",
            "Committed before",
            evidence(
              isRecovery
                ? committedBeforeRecovery
                : scenarioState.committedOffset,
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
        ],
        scenarioState.experiment.status === "completed" ? facts : [],
      ),
    );
  },
);
