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
  row,
  table,
} from "../../helpers";

export const lagExperience = experienceDefinition(
  "consumer-lag-backpressure",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const current = scenarioState.samples.at(-1);
    const provenance = current?.provenance ?? "derived";
    const totalLag = scenarioState.partitions.reduce(
      (total, partition) => total + partition.lag,
      0,
    );
    const facts = [
      fact("lag-total", "Total lag", evidence(totalLag, "derived", "current"), {
        emphasis: totalLag > 0 ? "warning" : "positive",
      }),
      fact(
        "production-rate",
        "Production rate",
        evidence(current?.productionRate ?? 0, provenance, "current"),
      ),
      fact(
        "processing-rate",
        "Processing rate",
        evidence(current?.processingRate ?? 0, provenance, "current"),
      ),
      fact(
        "consumer-count",
        "Consumers",
        evidence(scenarioState.consumerCount, provenance, "current"),
      ),
      fact(
        "drain-estimate",
        "Drain estimate",
        evidence(
          scenarioState.drainEstimateMs == null
            ? "Not draining"
            : `${scenarioState.drainEstimateMs} ms`,
          "derived",
          "current",
        ),
      ),
    ];
    const partitionTable = table(
      "lag-by-partition",
      "Per-partition lag",
      [
        { key: "partition", label: "Partition" },
        { key: "end", label: "End offset", align: "end" },
        { key: "committed", label: "Committed", align: "end" },
        { key: "lag", label: "Lag", align: "end" },
      ],
      scenarioState.partitions.map((partition) =>
        row(
          `lag-partition-${partition.partition}`,
          {
            partition: evidence(
              `P${partition.partition}`,
              partition.provenance,
              "current",
            ),
            end: evidence(partition.endOffset, partition.provenance, "current"),
            committed: evidence(
              partition.committedOffset,
              partition.provenance,
              "current",
            ),
            lag: evidence(partition.lag, "derived", "current"),
          },
          entityFocus(
            `lag-partition-${partition.partition}`,
            `partition-${partition.partition}`,
          ),
        ),
      ),
      "Run the pressure experiment to establish partition offsets.",
    );
    const sampleWindow = latestWindow(scenarioState.samples);
    const sampleTable = table(
      "lag-rate-samples",
      "Recent rate and lag samples",
      [
        { key: "time", label: "Virtual time" },
        { key: "production", label: "Produced/s", align: "end" },
        { key: "processing", label: "Processed/s", align: "end" },
        { key: "lag", label: "Lag", align: "end" },
        { key: "trend", label: "Trend" },
      ],
      sampleWindow.items.map((sample) =>
        row(
          sample.id,
          {
            time: evidence(
              `${sample.atVirtualMs} ms`,
              sample.provenance,
              "recent-window",
              sampleWindow.bounded?.label,
            ),
            production: evidence(
              sample.productionRate,
              sample.provenance,
              "recent-window",
              sampleWindow.bounded?.label,
            ),
            processing: evidence(
              sample.processingRate,
              sample.provenance,
              "recent-window",
              sampleWindow.bounded?.label,
            ),
            lag: evidence(
              sample.lag,
              "derived",
              "recent-window",
              sampleWindow.bounded?.label,
            ),
            trend: evidence(
              sample.trend,
              "derived",
              "recent-window",
              sampleWindow.bounded?.label,
            ),
          },
          entityFocus(sample.id, "pressure-meter"),
        ),
      ),
      definition.lesson.emptyCopy,
      sampleWindow.bounded,
    );
    const graph = buildScenarioGraph("consumer-lag-backpressure", snapshot, {
      active: Boolean(current),
      metrics: {
        "backlog-buffer": graphCountMetric(totalLag, "derived"),
        "pressure-meter": evidence(
          current?.trend ?? "empty",
          "derived",
          "current",
        ),
        ...Object.fromEntries(
          scenarioState.partitions.map((partition) => [
            `partition-${partition.partition}`,
            graphCountMetric(partition.lag, "derived"),
          ]),
        ),
      },
    });
    const trend = current?.trend ?? "empty";
    const frameNarrative = current
      ? narrative(
          `Lag is ${totalLag} and the latest trend is ${current.trend}.`,
          current.productionRate > current.processingRate
            ? "Production is outpacing current processing capacity."
            : "Processing is meeting or exceeding the current production rate.",
          current.trend === "falling"
            ? `The backlog is draining${scenarioState.drainEstimateMs == null ? "." : ` in about ${scenarioState.drainEstimateMs} ms.`}`
            : "Run the recovery contrast to add useful capacity and reduce pressure.",
          provenance,
        )
      : narrative(
          "No capacity sample has been recorded yet.",
          "Rate, lag, and drain evidence come from the authoritative experiment state.",
          definition.lesson.emptyCopy,
          "derived",
        );

    return createFrame(
      definition,
      graph,
      {
        kind: "capacity",
        title: "Capacity and recovery",
        summary: "Compare rates, per-partition backlog, trend, and drain time.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: sampleTable,
        trend,
        partitions: partitionTable,
        drainEstimate: facts[4].value,
      },
      frameNarrative,
      undefined,
      experimentEvidence(definition, input, facts, [], current ? facts : []),
    );
  },
);
