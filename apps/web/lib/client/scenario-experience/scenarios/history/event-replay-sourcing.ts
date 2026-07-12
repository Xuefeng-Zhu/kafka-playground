import { compareKafkaOffsets } from "@kplay/contracts";
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
import type { ScenarioExperienceSnapshot, ScenarioStateFor } from "../../model";
export const replayExperience = experienceDefinition(
  "event-replay-sourcing",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const logWindow = latestWindow(scenarioState.log);
    const sourceTable = buildReplaySourceTable(snapshot, logWindow);
    const projectionTable = buildReplayProjectionTable(scenarioState);
    const replayCursor = scenarioState.cursor;
    const appliedCount =
      replayCursor == null
        ? 0
        : scenarioState.log.filter(
            (entry) => compareKafkaOffsets(entry.offset, replayCursor) <= 0,
          ).length;
    const factSet = buildReplayFacts(scenarioState, appliedCount);
    const facts = factSet.all;
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
        cursor: factSet.replayCursor.value,
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
        scenarioState.cursor != null
          ? [factSet.producedCount, factSet.appliedCount]
          : [],
      ),
    );
  },
);

type ReplayState = ScenarioStateFor<"event-replay-sourcing">;
type ReplayLogEntry = ReplayState["log"][number];

function buildReplayFacts(state: ReplayState, appliedCountValue: number) {
  const producedCount = fact(
    "replay-produced-count",
    "Produced facts",
    evidence(state.producedCount, "simulated", "run-total"),
  );
  const logRecordCount = fact(
    "replay-log-count",
    "Source log records",
    evidence(state.log.length, "simulated", "run-total"),
  );
  const replayCursor = fact(
    "replay-cursor-value",
    "Replay cursor",
    evidence(state.cursor ?? "Before earliest", "simulated", "current"),
  );
  const appliedCount = fact(
    "replay-applied-count",
    "Events applied",
    evidence(appliedCountValue, "derived", "current"),
  );
  const rebuildStatus = fact(
    "replay-status",
    "Rebuild",
    evidence(
      state.rebuildInProgress ? "In progress" : "Stopped",
      "simulated",
      "current",
    ),
  );
  return {
    all: [
      producedCount,
      logRecordCount,
      replayCursor,
      appliedCount,
      rebuildStatus,
    ],
    producedCount,
    logRecordCount,
    replayCursor,
    appliedCount,
    rebuildStatus,
  };
}

function buildReplaySourceTable(
  snapshot: ScenarioExperienceSnapshot,
  logWindow: ReturnType<typeof latestWindow<ReplayLogEntry>>,
) {
  return table(
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
}

function buildReplayProjectionTable(state: ReplayState) {
  return table(
    "replay-projection-state",
    "Derived projection state",
    [
      { key: "aggregate", label: "Aggregate" },
      { key: "value", label: "Projected value", align: "end" },
    ],
    Object.entries(state.projection).map(([aggregateId, value]) =>
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
}
