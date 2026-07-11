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
