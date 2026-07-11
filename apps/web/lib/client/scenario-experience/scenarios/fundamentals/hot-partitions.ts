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
  ScenarioStateFor,
} from "../../model";

export const hotPartitionExperience = experienceDefinition(
  "hot-partitions-key-skew",
  (definition, input) => {
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
    const facts = [
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
        evidence(
          hot != null && balanced != null && hot.total === balanced.total
            ? "Yes"
            : "Not yet",
          "derived",
          "current",
        ),
        {
          emphasis:
            hot != null && balanced != null && hot.total === balanced.total
              ? "positive"
              : "warning",
        },
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
    const phaseTable = table(
      "hot-phase-comparison",
      "Independent routing phase comparison",
      columns,
      scenarioState.phases.map((phase) =>
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
      definition.lesson.emptyCopy,
    );
    const phases: HeatmapPhaseModel[] = scenarioState.phases.map((phase) => ({
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
    const hottestPartition = latest
      ? latest.partitionCounts.reduce(
          (best, count, partition) =>
            count > best.count ? { partition, count } : best,
          { partition: 0, count: 0 },
        )
      : { partition: 0, count: 0 };
    const graph = buildScenarioGraph("hot-partitions-key-skew", snapshot, {
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
          Array.from({ length: snapshot.partitionCount }, (_, partition) => [
            `partition-${partition}`,
            graphCountMetric(
              latest?.partitionCounts[partition] ?? 0,
              "derived",
              "run-total",
            ),
          ]),
        ),
      },
    });
    const frameNarrative =
      hot && balanced
        ? narrative(
            `The hot phase skew ratio is ${hot.skewRatio}; the independent balanced phase is ${balanced.skewRatio}.`,
            "The two equal-size phases use separate counters, so the comparison is not diluted by earlier hot traffic.",
            "Inspect individual route traces to connect each key choice to its partition.",
            "derived",
          )
        : narrative(
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

    return createFrame(
      definition,
      graph,
      {
        kind: "heatmap",
        title: "Independent skew heatmaps",
        summary: "Compare percentages and skew without merging phase totals.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: phaseTable,
        phases,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        hot ? phaseFacts(hot) : [],
        balanced ? phaseFacts(balanced) : [],
      ),
    );
  },
);

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
