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
  narrative,
  row,
  table,
} from "../../helpers";
import type {
  EvidenceFact,
  HeatmapPhaseModel,
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioStateFor,
} from "../../model";

export const hotPartitionExperience = experienceDefinition(
  "hot-partitions-key-skew",
  projectHotPartitions,
);

type HotPartitionDefinition =
  ScenarioExperienceDefinition<"hot-partitions-key-skew">;
type HotPartitionInput =
  ScenarioExperienceProjectionInput<"hot-partitions-key-skew">;
type HotPartitionPhase =
  ScenarioStateFor<"hot-partitions-key-skew">["phases"][number];

function projectHotPartitions(
  definition: HotPartitionDefinition,
  input: HotPartitionInput,
) {
  const { snapshot, scenarioState } = input;
  const hot = scenarioState.phases.find((phase) => phase.kind === "hot");
  const balanced = scenarioState.phases.find(
    (phase) => phase.kind === "balanced",
  );
  const latest = scenarioState.phases.at(-1);
  const maxPartitions = Math.max(
    snapshot.partitionCount,
    ...scenarioState.phases.map((phase) => phase.partitionCounts.length),
  );
  const facts = buildHotPartitionFacts(hot, balanced);

  return createFrame(
    definition,
    buildHotPartitionGraph(input, latest),
    {
      kind: "heatmap",
      title: "Independent skew heatmaps",
      summary: "Compare percentages and skew without merging phase totals.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildPhaseTable(
        scenarioState,
        maxPartitions,
        definition.lesson.emptyCopy,
      ),
      phases: buildHeatmapPhases(scenarioState),
    },
    buildHotPartitionNarrative(definition, hot, balanced, latest),
    undefined,
    experimentEvidence(
      definition,
      input,
      facts,
      hot ? phaseFacts(hot) : [],
      balanced ? phaseFacts(balanced) : [],
    ),
  );
}

function buildHotPartitionFacts(
  hot: HotPartitionPhase | undefined,
  balanced: HotPartitionPhase | undefined,
) {
  const phasesHaveEqualSize =
    hot != null && balanced != null && hot.total === balanced.total;
  return [
    fact(
      "hot-phase-size",
      "Hot phase size",
      evidence(hot?.total ?? 0, hot?.provenance ?? "derived", "run-total"),
    ),
    fact(
      "balanced-phase-size",
      "Balanced phase size",
      evidence(
        balanced?.total ?? 0,
        balanced?.provenance ?? "derived",
        "run-total",
      ),
    ),
    fact(
      "equal-phase-size",
      "Equal-size comparison",
      evidence(phasesHaveEqualSize ? "Yes" : "Not yet", "derived", "current"),
      { emphasis: phasesHaveEqualSize ? "positive" : "warning" },
    ),
    fact(
      "hot-skew-ratio",
      "Hot skew ratio",
      evidence(hot?.skewRatio ?? 0, "derived", "current"),
    ),
    fact(
      "balanced-skew-ratio",
      "Balanced skew ratio",
      evidence(balanced?.skewRatio ?? 0, "derived", "current"),
    ),
  ];
}

function buildPhaseTable(
  state: ScenarioStateFor<"hot-partitions-key-skew">,
  maxPartitions: number,
  emptyCopy: string,
) {
  const columns = [
    { key: "phase", label: "Independent phase" },
    { key: "sample", label: "Sample", align: "end" as const },
    ...Array.from({ length: maxPartitions }, (_, partition) => ({
      key: `partition-${partition}`,
      label: `P${partition}`,
      align: "end" as const,
    })),
    { key: "skew", label: "Skew ratio", align: "end" as const },
  ];
  return table(
    "hot-phase-comparison",
    "Independent routing phase comparison",
    columns,
    state.phases.map((phase) =>
      row(
        phase.id,
        {
          phase: evidence(phase.kind, phase.provenance, "run-total"),
          sample: evidence(phase.total, phase.provenance, "run-total"),
          ...Object.fromEntries(
            Array.from({ length: maxPartitions }, (_, partition) => [
              `partition-${partition}`,
              evidence(
                countWithPercentage(
                  phase.partitionCounts[partition] ?? 0,
                  phase.percentages[partition] ?? 0,
                ),
                phase.provenance,
                "run-total",
              ),
            ]),
          ),
          skew: evidence(phase.skewRatio, "derived", "current"),
        },
        entityFocus(phase.id, "hottest-partition"),
      ),
    ),
    emptyCopy,
  );
}

function buildHeatmapPhases(
  state: ScenarioStateFor<"hot-partitions-key-skew">,
): HeatmapPhaseModel[] {
  return state.phases.map((phase) => ({
    id: phase.id,
    label: phase.kind === "hot" ? "Fixed hot key" : "No-key comparison",
    sampleSize: phase.total,
    partitionCounts: Object.fromEntries(
      phase.partitionCounts.map((count, partition) => [
        String(partition),
        count,
      ]),
    ),
    partitionPercentages: Object.fromEntries(
      phase.percentages.map((percentage, partition) => [
        String(partition),
        percentage,
      ]),
    ),
    skewRatio: phase.skewRatio,
    provenance: phase.provenance,
    scope: "run-total",
  }));
}

function buildHotPartitionGraph(
  input: HotPartitionInput,
  latest: HotPartitionPhase | undefined,
) {
  const hottestPartition = latest
    ? latest.partitionCounts.reduce(
        (best, count, partition) =>
          count > best.count ? { partition, count } : best,
        { partition: 0, count: 0 },
      )
    : { partition: 0, count: 0 };
  return buildScenarioGraph("hot-partitions-key-skew", input.snapshot, {
    active: Boolean(latest),
    metrics: {
      "hot-key-router": graphCountMetric(
        latest?.total ?? 0,
        latest?.provenance ?? "derived",
        "run-total",
      ),
      "hottest-partition": evidence(
        latest
          ? `P${hottestPartition.partition}: ${hottestPartition.count}`
          : "No phase",
        "derived",
        "current",
      ),
      ...Object.fromEntries(
        Array.from(
          { length: input.snapshot.partitionCount },
          (_, partition) => [
            `partition-${partition}`,
            graphCountMetric(
              latest?.partitionCounts[partition] ?? 0,
              "derived",
              "run-total",
            ),
          ],
        ),
      ),
    },
  });
}

function buildHotPartitionNarrative(
  definition: HotPartitionDefinition,
  hot: HotPartitionPhase | undefined,
  balanced: HotPartitionPhase | undefined,
  latest: HotPartitionPhase | undefined,
) {
  if (hot && balanced) {
    return narrative(
      `The hot phase skew ratio is ${hot.skewRatio}; the independent balanced phase is ${balanced.skewRatio}.`,
      "The two equal-size phases use separate counters, so the comparison is not diluted by earlier hot traffic.",
      "Inspect individual route traces to connect each key choice to its partition.",
      "derived",
    );
  }
  return narrative(
    latest
      ? `${latest.kind} routing completed with ${latest.total} records.`
      : "No routing phase has been recorded yet.",
    latest
      ? "This phase retains its own totals and will not be mutated by the contrast."
      : "A fair skew comparison requires two independent, equal-size phases.",
    hot
      ? "Run the balanced comparison with the same sample size."
      : definition.lesson.emptyCopy,
    latest?.provenance ?? "derived",
  );
}

function countWithPercentage(count: number, percentage: number) {
  return `${count} (${formatPercentage(percentage)})`;
}

function formatPercentage(percentage: number) {
  return `${percentage.toFixed(1)}%`;
}

function phaseFacts(
  phase: ScenarioStateFor<"hot-partitions-key-skew">["phases"][number],
): EvidenceFact[] {
  return [
    fact(
      `${phase.id}-sample`,
      `${phase.kind} sample`,
      evidence(phase.total, phase.provenance, "run-total"),
    ),
    fact(
      `${phase.id}-skew`,
      `${phase.kind} skew`,
      evidence(phase.skewRatio, "derived", "current"),
    ),
  ];
}
