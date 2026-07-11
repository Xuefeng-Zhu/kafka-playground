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
import type { Provenance, ScenarioStateFor } from "../../model";

export const partitioningExperience = experienceDefinition(
  "partitioning",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const recent = latestWindow(scenarioState.routingTraces);
    const idleCount = scenarioState.consumers.filter(
      (consumer) => consumer.status === "idle",
    ).length;
    const commitGaps =
      scenarioState.partitionPositions.filter(hasCommitGap).length;
    const routesBefore = partitionRoutesBefore(scenarioState);
    const provenance = latestProvenance(
      scenarioState.routingTraces,
      snapshot.mode === "demo" ? "simulated" : "observed",
    );
    const facts = [
      fact(
        "routing-trace-count",
        "Routed records",
        evidence(scenarioState.routingTraces.length, provenance, "run-total"),
      ),
      fact(
        "assignment-epoch",
        "Assignment epoch",
        evidence(scenarioState.assignmentEpoch, provenance, "current"),
      ),
      fact(
        "commit-gaps",
        "Processing / commit gaps",
        evidence(commitGaps, "derived", "current"),
        {
          detail:
            "A gap means the committed resume offset is not one past the last processed record.",
          emphasis: commitGaps > 0 ? "warning" : "positive",
        },
      ),
      fact(
        "idle-consumers",
        "Idle consumers",
        evidence(idleCount, "derived", "current"),
        { emphasis: idleCount > 0 ? "warning" : "neutral" },
      ),
    ];
    const routingTable = table(
      "partition-routing-evidence",
      "Key-to-partition routing trace",
      [
        { key: "record", label: "Record" },
        { key: "key", label: "Key" },
        { key: "partition", label: "Partition", align: "center" },
        { key: "offset", label: "Offset", align: "end" },
      ],
      recent.items.map((trace) =>
        row(
          trace.id,
          {
            record: evidence(
              trace.messageId,
              trace.provenance,
              "recent-window",
              recent.bounded?.label,
            ),
            key: evidence(
              trace.key ?? "No key",
              trace.provenance,
              "recent-window",
              recent.bounded?.label,
            ),
            partition: evidence(
              `P${trace.partition}`,
              trace.provenance,
              "recent-window",
              recent.bounded?.label,
            ),
            offset: evidence(
              trace.offset,
              trace.provenance,
              "recent-window",
              recent.bounded?.label,
            ),
          },
          recordFocus(
            snapshot,
            trace.messageId,
            trace.partition,
            trace.offset,
            "key-router",
          ),
        ),
      ),
      definition.lesson.emptyCopy,
      recent.bounded,
    );
    const positionTable = table(
      "partition-watermarks",
      "Processing and committed watermarks",
      [
        { key: "partition", label: "Partition" },
        { key: "processed", label: "Processed through", align: "end" },
        { key: "committed", label: "Resume at offset", align: "end" },
      ],
      scenarioState.partitionPositions.map((position) =>
        row(
          `watermark-${position.partition}`,
          {
            partition: evidence(
              `P${position.partition}`,
              position.provenance,
              "current",
            ),
            processed: evidence(
              position.processedOffset ?? "None",
              position.provenance,
              "current",
            ),
            committed: evidence(
              position.committedOffset ?? "None",
              position.provenance,
              "current",
            ),
          },
          entityFocus(position.id, "commit-progress"),
        ),
      ),
      "Produce and process a record to establish watermarks.",
    );
    const graph = buildScenarioGraph("partitioning", snapshot, {
      active: scenarioState.revision > 0,
      metrics: {
        "key-router": graphCountMetric(
          scenarioState.routingTraces.length,
          provenance,
          "run-total",
        ),
        "commit-progress": graphCountMetric(
          scenarioState.partitionPositions.filter(
            (position) => position.committedOffset != null,
          ).length,
          provenance,
        ),
        ...partitionMetrics(
          snapshot.partitionCount,
          scenarioState.routingTraces,
        ),
      },
    });
    const latest = scenarioState.routingTraces.at(-1);
    const repeatedKey = latest
      ? scenarioState.routingTraces.find(
          (trace) => trace.id !== latest.id && trace.key === latest.key,
        )
      : undefined;
    const frameNarrative = latest
      ? narrative(
          `${latest.messageId} routed to P${latest.partition} at offset ${latest.offset}.`,
          repeatedKey
            ? `Its key matches an earlier record on P${repeatedKey.partition}; equal keys preserve one partition route.`
            : "The key router selected one partition before Kafka appended the record.",
          idleCount > 0
            ? `${idleCount} consumer remains idle because this topic has only ${snapshot.partitionCount} partitions.`
            : "Process the record and compare the processed and committed watermarks.",
          latest.provenance,
          "current",
        )
      : narrative(
          "No route has been recorded yet.",
          "Routing evidence begins only after the server executes the keyed experiment.",
          definition.lesson.emptyCopy,
          provenance,
        );

    return createFrame(
      definition,
      graph,
      {
        kind: "routing",
        title: "Routing and commit evidence",
        summary:
          "Trace keys, partitions, offsets, and independent commit progress.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: routingTable,
        sections: [
          {
            id: "commit-watermarks",
            title: "Commit watermarks",
            facts: [facts[2]],
            table: positionTable,
          },
        ],
        traces: recent.items.map((trace) => ({
          id: trace.id,
          key: trace.key ?? "No key",
          partition: trace.partition,
          offset: trace.offset,
          reason: trace.key == null ? "Unkeyed routing" : "Stable key hash",
          provenance: trace.provenance,
          focus: recordFocus(
            snapshot,
            trace.messageId,
            trace.partition,
            trace.offset,
            "key-router",
          ),
        })),
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "before-routes",
            "Routes before",
            evidence(routesBefore, provenance, "run-total"),
          ),
        ],
        scenarioState.experiment.status === "completed" ? facts : [],
      ),
    );
  },
);

function latestProvenance(
  records: readonly { provenance: Provenance }[],
  fallback: Provenance,
) {
  return records.at(-1)?.provenance ?? fallback;
}

function hasCommitGap(
  position: ScenarioStateFor<"partitioning">["partitionPositions"][number],
) {
  if (position.processedOffset == null) return false;
  if (position.committedOffset == null) return true;
  try {
    return (
      BigInt(position.committedOffset) !== BigInt(position.processedOffset) + 1n
    );
  } catch {
    return position.committedOffset !== position.processedOffset;
  }
}

function partitionRoutesBefore(state: ScenarioStateFor<"partitioning">) {
  if (state.experiment.experimentId === "grow-consumer-group") {
    return state.routingTraces.length;
  }
  if (state.experiment.experimentId === "produce-keyed-record") {
    return Math.max(0, state.routingTraces.length - 3);
  }
  return state.routingTraces.length;
}

function partitionMetrics(
  partitionCount: number,
  traces: ScenarioStateFor<"partitioning">["routingTraces"],
) {
  return Object.fromEntries(
    Array.from({ length: partitionCount }, (_, partition) => [
      `partition-${partition}`,
      graphCountMetric(
        traces.filter((trace) => trace.partition === partition).length,
        traces.at(-1)?.provenance ?? "derived",
        "run-total",
      ),
    ]),
  );
}
