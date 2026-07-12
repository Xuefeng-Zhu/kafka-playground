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
import type {
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioExperienceSnapshot,
  ScenarioStateFor,
} from "../../model";
export const compactionExperience = experienceDefinition(
  "log-compaction-tombstones",
  projectCompaction,
);

type CompactionDefinition =
  ScenarioExperienceDefinition<"log-compaction-tombstones">;
type CompactionInput =
  ScenarioExperienceProjectionInput<"log-compaction-tombstones">;
type CompactionState = ScenarioStateFor<"log-compaction-tombstones">;
type RawLogEntry = CompactionState["rawLog"][number];
type CleanerPass = CompactionState["cleanerPasses"][number];

function projectCompaction(
  definition: CompactionDefinition,
  input: CompactionInput,
) {
  const { scenarioState } = input;
  const rawWindow = latestWindow(scenarioState.rawLog);
  const counts = compactionCounts(scenarioState);
  const factSet = buildCompactionFacts(scenarioState, counts);
  const facts = factSet.all;
  const latestPass = scenarioState.cleanerPasses.at(-1);
  return createFrame(
    definition,
    buildCompactionGraph(input, counts.activeTombstones),
    {
      kind: "projection",
      title: "Raw log and materialized state",
      summary: "Each removal is tied to compaction or later tombstone cleanup.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      sections: [
        {
          id: "cleaner-passes",
          title: "Cleaner passes",
          facts: [factSet.removedByCompaction, factSet.cleanedTombstones],
          table: buildCleanerTable(scenarioState),
        },
      ],
      source: buildRawLogTable(
        input.snapshot,
        rawWindow,
        definition.lesson.emptyCopy,
      ),
      projection: buildMaterializedTable(scenarioState),
      cursor: evidence(
        latestPass?.stage ?? "No cleaner pass",
        "simulated",
        "current",
      ),
    },
    buildCompactionNarrative(definition, scenarioState, latestPass),
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
}

function buildRawLogTable(
  snapshot: ScenarioExperienceSnapshot,
  rawWindow: ReturnType<typeof latestWindow<RawLogEntry>>,
  emptyCopy: string,
) {
  return table(
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
    emptyCopy,
    rawWindow.bounded,
  );
}

function buildMaterializedTable(state: CompactionState) {
  return table(
    "compaction-materialized-state",
    "Materialized latest state",
    [
      { key: "key", label: "Key" },
      { key: "value", label: "Latest value" },
      { key: "source", label: "Source offset", align: "end" },
    ],
    state.materialized.map((entry) =>
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
}

function buildCleanerTable(state: CompactionState) {
  return table(
    "compaction-cleaner-passes",
    "Cleaner stages",
    [
      { key: "stage", label: "Stage" },
      { key: "time", label: "Virtual time" },
      { key: "removed", label: "Removed offsets" },
    ],
    state.cleanerPasses.map((pass) =>
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
}

function compactionCounts(state: CompactionState) {
  return {
    compacted: state.rawLog.filter(
      (entry) => entry.removedAtStage === "compaction",
    ).length,
    cleanedTombstones: state.rawLog.filter(
      (entry) => entry.removedAtStage === "tombstone_cleanup",
    ).length,
    activeTombstones: state.rawLog.filter(
      (entry) => entry.tombstone && entry.removedAtStage == null,
    ).length,
  };
}

type CompactionCounts = ReturnType<typeof compactionCounts>;

function buildCompactionFacts(
  state: CompactionState,
  counts: CompactionCounts,
) {
  const rawRecordCount = fact(
    "compaction-raw-count",
    "Raw log records",
    evidence(state.rawLog.length, "simulated", "run-total"),
  );
  const materializedKeyCount = fact(
    "compaction-state-count",
    "Materialized keys",
    evidence(state.materialized.length, "derived", "current"),
  );
  const removedByCompaction = fact(
    "compaction-removed",
    "Removed by compaction",
    evidence(counts.compacted, "simulated", "run-total"),
  );
  const activeTombstones = fact(
    "compaction-tombstones",
    "Active tombstones",
    evidence(counts.activeTombstones, "simulated", "current"),
  );
  const cleanedTombstones = fact(
    "compaction-cleaned-tombstones",
    "Tombstones cleaned later",
    evidence(counts.cleanedTombstones, "simulated", "run-total"),
  );
  return {
    all: [
      rawRecordCount,
      materializedKeyCount,
      removedByCompaction,
      activeTombstones,
      cleanedTombstones,
    ],
    rawRecordCount,
    materializedKeyCount,
    removedByCompaction,
    activeTombstones,
    cleanedTombstones,
  };
}

function buildCompactionGraph(
  input: CompactionInput,
  activeTombstones: number,
) {
  return buildScenarioGraph("log-compaction-tombstones", input.snapshot, {
    active: input.scenarioState.rawLog.length > 0,
    metrics: {
      "compacted-state-store": graphCountMetric(
        input.scenarioState.materialized.length,
        "derived",
      ),
      "tombstone-marker": graphCountMetric(activeTombstones, "simulated"),
    },
  });
}

function buildCompactionNarrative(
  definition: CompactionDefinition,
  state: CompactionState,
  latestPass: CleanerPass | undefined,
) {
  if (!latestPass) {
    return narrative(
      state.rawLog.length > 0
        ? `${state.rawLog.length} append-log records exist; no cleaner pass has run.`
        : "No compacted-topic history exists yet.",
      "Appending a tombstone marks deletion but does not immediately erase history.",
      definition.lesson.emptyCopy,
      "simulated",
    );
  }
  return narrative(
    `${latestPass.stage} removed ${latestPass.removedOffsets.length} offset(s).`,
    latestPass.stage === "compaction"
      ? "Compaction removes superseded values but retains the newest tombstone as the delete marker."
      : "Tombstone cleanup is a later lifecycle stage after the delete marker has served its purpose.",
    latestPass.stage === "compaction"
      ? "Advance virtual time before running tombstone cleanup."
      : "Compare the surviving raw log with the materialized key state.",
    latestPass.provenance,
  );
}
