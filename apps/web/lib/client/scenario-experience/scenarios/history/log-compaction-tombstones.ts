import {
  experienceDefinition,
  experimentEvidence,
} from "../../definition-helpers";
import { buildScenarioGraph, graphCountMetric } from "../../graphs";
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
