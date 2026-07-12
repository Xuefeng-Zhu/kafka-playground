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
  Provenance,
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioExperienceSnapshot,
  ScenarioStateFor,
} from "../../model";

export const partitioningExperience = experienceDefinition(
  "partitioning",
  projectPartitioning,
);

type PartitioningDefinition = ScenarioExperienceDefinition<"partitioning">;
type PartitioningInput = ScenarioExperienceProjectionInput<"partitioning">;
type PartitioningState = ScenarioStateFor<"partitioning">;
type RoutingTrace = PartitioningState["routingTraces"][number];

function projectPartitioning(
  definition: PartitioningDefinition,
  input: PartitioningInput,
) {
  const { scenarioState } = input;
  const recent = latestWindow(scenarioState.routingTraces);
  const idleCount = scenarioState.consumers.filter(
    (consumer) => consumer.status === "idle",
  ).length;
  const commitGaps =
    scenarioState.partitionPositions.filter(hasCommitGap).length;
  const provenance = latestProvenance(
    scenarioState.routingTraces,
    input.snapshot.mode === "demo" ? "simulated" : "observed",
  );
  const factSet = buildPartitioningFacts(
    scenarioState,
    provenance,
    commitGaps,
    idleCount,
  );
  const facts = factSet.all;
  return createFrame(
    definition,
    buildPartitioningGraph(input, provenance),
    {
      kind: "routing",
      title: "Routing and commit evidence",
      summary:
        "Trace keys, partitions, offsets, and independent commit progress.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildRoutingTable(
        input.snapshot,
        recent,
        definition.lesson.emptyCopy,
      ),
      sections: [
        {
          id: "commit-watermarks",
          title: "Commit watermarks",
          facts: [factSet.commitGaps],
          table: buildPositionTable(scenarioState),
        },
      ],
      traces: buildRoutingTraces(input.snapshot, recent.items),
    },
    buildPartitioningNarrative(definition, input, idleCount, provenance),
    undefined,
    experimentEvidence(
      definition,
      input,
      facts,
      [
        fact(
          "before-routes",
          "Routes before",
          evidence(
            partitionRoutesBefore(scenarioState),
            provenance,
            "run-total",
          ),
        ),
      ],
      scenarioState.experiment.status === "completed" ? facts : [],
    ),
  );
}

function buildPartitioningFacts(
  state: PartitioningState,
  provenance: Provenance,
  commitGaps: number,
  idleCount: number,
) {
  const routedRecords = fact(
    "routing-trace-count",
    "Routed records",
    evidence(state.routingTraces.length, provenance, "run-total"),
  );
  const assignmentEpoch = fact(
    "assignment-epoch",
    "Assignment epoch",
    evidence(state.assignmentEpoch, provenance, "current"),
  );
  const commitGapsFact = fact(
    "commit-gaps",
    "Processing / commit gaps",
    evidence(commitGaps, "derived", "current"),
    {
      detail:
        "A gap means the committed resume offset is not one past the last processed record.",
      emphasis: commitGaps > 0 ? "warning" : "positive",
    },
  );
  const idleConsumers = fact(
    "idle-consumers",
    "Idle consumers",
    evidence(idleCount, "derived", "current"),
    { emphasis: idleCount > 0 ? "warning" : "neutral" },
  );
  return {
    all: [routedRecords, assignmentEpoch, commitGapsFact, idleConsumers],
    routedRecords,
    assignmentEpoch,
    commitGaps: commitGapsFact,
    idleConsumers,
  };
}

function buildRoutingTable(
  snapshot: ScenarioExperienceSnapshot,
  recent: ReturnType<typeof latestWindow<RoutingTrace>>,
  emptyCopy: string,
) {
  return table(
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
        routingTraceFocus(snapshot, trace),
      ),
    ),
    emptyCopy,
    recent.bounded,
  );
}

function buildPositionTable(state: PartitioningState) {
  return table(
    "partition-watermarks",
    "Processing and committed watermarks",
    [
      { key: "partition", label: "Partition" },
      { key: "processed", label: "Processed through", align: "end" },
      { key: "committed", label: "Resume at offset", align: "end" },
    ],
    state.partitionPositions.map((position) =>
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
}

function buildPartitioningGraph(
  input: PartitioningInput,
  provenance: Provenance,
) {
  return buildScenarioGraph("partitioning", input.snapshot, {
    active: input.scenarioState.revision > 0,
    metrics: {
      "key-router": graphCountMetric(
        input.scenarioState.routingTraces.length,
        provenance,
        "run-total",
      ),
      "commit-progress": graphCountMetric(
        input.scenarioState.partitionPositions.filter(
          (position) => position.committedOffset != null,
        ).length,
        provenance,
      ),
      ...partitionMetrics(
        input.snapshot.partitionCount,
        input.scenarioState.routingTraces,
      ),
    },
  });
}

function buildPartitioningNarrative(
  definition: PartitioningDefinition,
  input: PartitioningInput,
  idleCount: number,
  provenance: Provenance,
) {
  const latest = input.scenarioState.routingTraces.at(-1);
  if (!latest) {
    return narrative(
      "No route has been recorded yet.",
      "Routing evidence begins only after the server executes the keyed experiment.",
      definition.lesson.emptyCopy,
      provenance,
    );
  }
  const repeatedKey = input.scenarioState.routingTraces.find(
    (trace) => trace.id !== latest.id && trace.key === latest.key,
  );
  return narrative(
    `${latest.messageId} routed to P${latest.partition} at offset ${latest.offset}.`,
    repeatedKey
      ? `Its key matches an earlier record on P${repeatedKey.partition}; equal keys preserve one partition route.`
      : "The key router selected one partition before Kafka appended the record.",
    idleCount > 0
      ? `${idleCount} consumer remains idle because this topic has only ${input.snapshot.partitionCount} partitions.`
      : "Process the record and compare the processed and committed watermarks.",
    latest.provenance,
    "current",
  );
}

function buildRoutingTraces(
  snapshot: ScenarioExperienceSnapshot,
  traces: readonly RoutingTrace[],
) {
  return traces.map((trace) => ({
    id: trace.id,
    key: trace.key ?? "No key",
    partition: trace.partition,
    offset: trace.offset,
    reason: trace.key == null ? "Unkeyed routing" : "Stable key hash",
    provenance: trace.provenance,
    focus: routingTraceFocus(snapshot, trace),
  }));
}

function routingTraceFocus(
  snapshot: ScenarioExperienceSnapshot,
  trace: RoutingTrace,
) {
  return recordFocus(
    snapshot,
    trace.messageId,
    trace.partition,
    trace.offset,
    "key-router",
  );
}

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
  return (
    BigInt(position.committedOffset) !== BigInt(position.processedOffset) + 1n
  );
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
