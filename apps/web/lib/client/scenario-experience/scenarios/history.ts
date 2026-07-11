import {
  experienceDefinition,
  experimentEvidence,
} from "../definition-helpers";
import { buildScenarioGraph, graphCountMetric } from "../graphs";
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
} from "../helpers";
import type { LifecycleRecordModel } from "../model";

export const replayExperience = experienceDefinition(
  "event-replay-sourcing",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const logWindow = latestWindow(scenarioState.log);
    const sourceTable = table(
      "replay-source-log",
      "Immutable source log",
      [
        { key: "offset", label: "Offset", align: "end" },
        { key: "aggregate", label: "Aggregate" },
        { key: "event", label: "Event" },
        { key: "delta", label: "Delta", align: "end" },
      ],
      logWindow.items.map((entry) =>
        row(
          entry.id,
          {
            offset: evidence(
              entry.offset,
              entry.provenance,
              "recent-window",
              logWindow.bounded?.label,
            ),
            aggregate: evidence(
              entry.aggregateId,
              entry.provenance,
              "recent-window",
              logWindow.bounded?.label,
            ),
            event: evidence(
              entry.eventName,
              entry.provenance,
              "recent-window",
              logWindow.bounded?.label,
            ),
            delta: evidence(
              entry.delta,
              entry.provenance,
              "recent-window",
              logWindow.bounded?.label,
            ),
          },
          recordFocus(
            snapshot,
            entry.id,
            undefined,
            entry.offset,
            "replay-cursor",
          ),
        ),
      ),
      "Append original events before rebuilding a projection.",
      logWindow.bounded,
    );
    const projectionTable = table(
      "replay-projection-state",
      "Derived projection state",
      [
        { key: "aggregate", label: "Aggregate" },
        { key: "value", label: "Projected value", align: "end" },
      ],
      Object.entries(scenarioState.projection).map(([aggregateId, value]) =>
        row(
          `projection-${aggregateId}`,
          {
            aggregate: evidence(aggregateId, "derived", "current"),
            value: evidence(value, "derived", "current"),
          },
          entityFocus("cart-projection", "projection-store"),
        ),
      ),
      "The projection is empty until replay applies source events.",
    );
    const appliedCount =
      scenarioState.cursor == null
        ? 0
        : scenarioState.log.filter(
            (entry) => Number(entry.offset) <= Number(scenarioState.cursor),
          ).length;
    const facts = [
      fact(
        "replay-produced-count",
        "Produced facts",
        evidence(scenarioState.producedCount, "simulated", "run-total"),
      ),
      fact(
        "replay-log-count",
        "Source log records",
        evidence(scenarioState.log.length, "simulated", "run-total"),
      ),
      fact(
        "replay-cursor-value",
        "Replay cursor",
        evidence(
          scenarioState.cursor ?? "Before earliest",
          "simulated",
          "current",
        ),
      ),
      fact(
        "replay-applied-count",
        "Events applied",
        evidence(appliedCount, "derived", "current"),
      ),
      fact(
        "replay-status",
        "Rebuild",
        evidence(
          scenarioState.rebuildInProgress ? "In progress" : "Stopped",
          "simulated",
          "current",
        ),
      ),
    ];
    const graph = buildScenarioGraph("event-replay-sourcing", snapshot, {
      active: scenarioState.log.length > 0,
      inactiveEdgeIds:
        scenarioState.cursor == null
          ? new Set(["cursor-projection", "projection-group"])
          : undefined,
      metrics: {
        "replay-cursor": evidence(
          scenarioState.cursor ?? "reset",
          "simulated",
          "current",
        ),
        "projection-store": graphCountMetric(
          Object.keys(scenarioState.projection).length,
          "derived",
        ),
      },
    });
    const frameNarrative =
      scenarioState.log.length > 0
        ? narrative(
            scenarioState.cursor == null
              ? "The projection was cleared and the replay cursor reset before the earliest offset."
              : `Replay advanced to offset ${scenarioState.cursor} and applied ${appliedCount} source event(s).`,
            `Produced count remains ${scenarioState.producedCount}; replay reads existing facts instead of appending new ones.`,
            scenarioState.rebuildInProgress
              ? "Advance to the next immutable log offset."
              : "Compare the rebuilt projection with the full source log.",
            "simulated",
          )
        : narrative(
            "The immutable source log is empty.",
            "Replay cannot rebuild state until original facts exist.",
            definition.lesson.emptyCopy,
            "simulated",
          );

    return createFrame(
      definition,
      graph,
      {
        kind: "projection",
        title: "Source log and rebuilt projection",
        summary:
          "The source stays fixed while the cursor and derived state move.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        source: sourceTable,
        projection: projectionTable,
        cursor: facts[2].value,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "replay-before-produced",
            "Produced before replay",
            evidence(scenarioState.producedCount, "simulated", "run-total"),
          ),
          fact(
            "replay-before-projection",
            "Projection before",
            evidence(0, "derived", "current"),
          ),
        ],
        scenarioState.cursor != null ? [facts[0], facts[3]] : [],
      ),
    );
  },
);

export const compactionExperience = experienceDefinition(
  "log-compaction-tombstones",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const rawWindow = latestWindow(scenarioState.rawLog);
    const rawTable = table(
      "compaction-raw-log",
      "Raw append log",
      [
        { key: "offset", label: "Offset", align: "end" },
        { key: "key", label: "Key" },
        { key: "value", label: "Value" },
        { key: "recordType", label: "Record type" },
        { key: "removed", label: "Removed at" },
      ],
      rawWindow.items.map((entry) =>
        row(
          entry.id,
          {
            offset: evidence(
              entry.offset,
              entry.provenance,
              "recent-window",
              rawWindow.bounded?.label,
            ),
            key: evidence(
              entry.key,
              entry.provenance,
              "recent-window",
              rawWindow.bounded?.label,
            ),
            value: evidence(
              entry.value ?? "null",
              entry.provenance,
              "recent-window",
              rawWindow.bounded?.label,
            ),
            recordType: evidence(
              entry.tombstone ? "Tombstone" : "Value",
              entry.provenance,
              "recent-window",
              rawWindow.bounded?.label,
            ),
            removed: evidence(
              entry.removedAtStage ?? "Present",
              "simulated",
              "current",
            ),
          },
          recordFocus(
            snapshot,
            entry.id,
            undefined,
            entry.offset,
            entry.tombstone ? "tombstone-marker" : "topic",
          ),
          entry.removedAtStage ? "warning" : "neutral",
        ),
      ),
      definition.lesson.emptyCopy,
      rawWindow.bounded,
    );
    const materializedTable = table(
      "compaction-materialized-state",
      "Materialized latest state",
      [
        { key: "key", label: "Key" },
        { key: "value", label: "Latest value" },
        { key: "source", label: "Source offset", align: "end" },
      ],
      scenarioState.materialized.map((entry) =>
        row(
          entry.id,
          {
            key: evidence(entry.key, entry.provenance, "current"),
            value: evidence(entry.value ?? "Deleted", "derived", "current"),
            source: evidence(entry.sourceOffset, entry.provenance, "current"),
          },
          entityFocus(entry.id, "compacted-state-store"),
        ),
      ),
      "The materialized state is empty until keyed records are appended.",
    );
    const cleanerTable = table(
      "compaction-cleaner-passes",
      "Cleaner stages",
      [
        { key: "stage", label: "Stage" },
        { key: "time", label: "Virtual time" },
        { key: "removed", label: "Removed offsets" },
      ],
      scenarioState.cleanerPasses.map((pass) =>
        row(
          pass.id,
          {
            stage: evidence(pass.stage, pass.provenance, "run-total"),
            time: evidence(
              `${pass.atVirtualMs} ms`,
              pass.provenance,
              "run-total",
            ),
            removed: evidence(
              pass.removedOffsets.length > 0
                ? pass.removedOffsets.join(", ")
                : "None",
              pass.provenance,
              "run-total",
            ),
          },
          entityFocus(
            pass.id,
            pass.stage === "compaction"
              ? "compacted-state-store"
              : "tombstone-marker",
          ),
        ),
      ),
      "Run compaction to record a cleaner stage.",
    );
    const compacted = scenarioState.rawLog.filter(
      (entry) => entry.removedAtStage === "compaction",
    ).length;
    const cleanedTombstones = scenarioState.rawLog.filter(
      (entry) => entry.removedAtStage === "tombstone_cleanup",
    ).length;
    const activeTombstones = scenarioState.rawLog.filter(
      (entry) => entry.tombstone && entry.removedAtStage == null,
    ).length;
    const facts = [
      fact(
        "compaction-raw-count",
        "Raw log records",
        evidence(scenarioState.rawLog.length, "simulated", "run-total"),
      ),
      fact(
        "compaction-state-count",
        "Materialized keys",
        evidence(scenarioState.materialized.length, "derived", "current"),
      ),
      fact(
        "compaction-removed",
        "Removed by compaction",
        evidence(compacted, "simulated", "run-total"),
      ),
      fact(
        "compaction-tombstones",
        "Active tombstones",
        evidence(activeTombstones, "simulated", "current"),
      ),
      fact(
        "compaction-cleaned-tombstones",
        "Tombstones cleaned later",
        evidence(cleanedTombstones, "simulated", "run-total"),
      ),
    ];
    const graph = buildScenarioGraph("log-compaction-tombstones", snapshot, {
      active: scenarioState.rawLog.length > 0,
      metrics: {
        "compacted-state-store": graphCountMetric(
          scenarioState.materialized.length,
          "derived",
        ),
        "tombstone-marker": graphCountMetric(activeTombstones, "simulated"),
      },
    });
    const latestPass = scenarioState.cleanerPasses.at(-1);
    const frameNarrative = latestPass
      ? narrative(
          `${latestPass.stage} removed ${latestPass.removedOffsets.length} offset(s).`,
          latestPass.stage === "compaction"
            ? "Compaction removes superseded values but retains the newest tombstone as the delete marker."
            : "Tombstone cleanup is a later lifecycle stage after the delete marker has served its purpose.",
          latestPass.stage === "compaction"
            ? "Advance virtual time before running tombstone cleanup."
            : "Compare the surviving raw log with the materialized key state.",
          latestPass.provenance,
        )
      : narrative(
          scenarioState.rawLog.length > 0
            ? `${scenarioState.rawLog.length} append-log records exist; no cleaner pass has run.`
            : "No compacted-topic history exists yet.",
          "Appending a tombstone marks deletion but does not immediately erase history.",
          definition.lesson.emptyCopy,
          "simulated",
        );

    return createFrame(
      definition,
      graph,
      {
        kind: "projection",
        title: "Raw log and materialized state",
        summary:
          "Each removal is tied to compaction or later tombstone cleanup.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        sections: [
          {
            id: "cleaner-passes",
            title: "Cleaner passes",
            facts: [facts[2], facts[4]],
            table: cleanerTable,
          },
        ],
        source: rawTable,
        projection: materializedTable,
        cursor: evidence(
          latestPass?.stage ?? "No cleaner pass",
          "simulated",
          "current",
        ),
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "before-cleaner",
            "Cleaner passes before",
            evidence(0, "simulated", "run-total"),
          ),
        ],
        latestPass ? facts : [],
      ),
    );
  },
);

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
