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
import type {
  AssignmentDeltaModel,
  EvidenceFact,
  HeatmapPhaseModel,
  Provenance,
  ScenarioStateFor,
} from "../model";

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

export const loadBalancingExperience = experienceDefinition(
  "fan-out-load-balancing",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const isUnkeyedContrast =
      scenarioState.experiment.experimentId === "produce-unkeyed-burst";
    const currentEpoch = scenarioState.epochs.at(-1);
    const before = isUnkeyedContrast
      ? currentEpoch
      : scenarioState.epochs.at(-2);
    const after = scenarioState.epochs.at(-1);
    const provenance =
      after?.provenance ??
      (snapshot.mode === "demo" ? "simulated" : "observed");
    const deltas = assignmentDeltas(before, after, snapshot.partitionCount);
    const idleCount = after?.idleConsumerIds.length ?? 0;
    const ownershipChanged = assignmentOwnershipChanged(before, after);
    const unkeyedRoutes = isUnkeyedContrast
      ? scenarioState.experiment.totalSteps
      : 0;
    const facts = [
      ...assignmentFacts(after, provenance),
      fact(
        "assignment-ownership-changed",
        "Ownership changed",
        evidence(ownershipChanged ? "Yes" : "No", "derived", "current"),
        {
          emphasis:
            isUnkeyedContrast && !ownershipChanged ? "positive" : "neutral",
        },
      ),
      fact(
        "assignment-unkeyed-routes",
        "Unkeyed routes recorded",
        evidence(unkeyedRoutes, provenance, "run-total"),
      ),
    ];
    const assignmentTable = table(
      "assignment-before-after",
      "Partition ownership before and after",
      [
        { key: "partition", label: "Partition" },
        { key: "before", label: "Before" },
        { key: "after", label: "After" },
        { key: "change", label: "Change" },
      ],
      deltas.map((delta) =>
        row(
          delta.id,
          {
            partition: evidence(
              `P${delta.partition}`,
              delta.provenance,
              "current",
            ),
            before: evidence(
              delta.beforeOwner ?? "Unassigned",
              delta.provenance,
              "current",
            ),
            after: evidence(
              delta.afterOwner ?? "Unassigned",
              delta.provenance,
              "current",
            ),
            change: evidence(delta.status, "derived", "current"),
          },
          delta.focus,
          delta.status === "moved" || delta.status === "revoked"
            ? "warning"
            : "neutral",
        ),
      ),
      definition.lesson.emptyCopy,
    );
    const graph = buildScenarioGraph("fan-out-load-balancing", snapshot, {
      active: Boolean(after),
      metrics: {
        "group-balancer": graphCountMetric(after?.epoch ?? 0, provenance),
        "idle-members": graphCountMetric(idleCount, "derived"),
      },
    });
    const frameNarrative =
      isUnkeyedContrast && after
        ? narrative(
            `${unkeyedRoutes} unkeyed records routed while assignment stayed at epoch ${after.epoch}.`,
            "Record routing can spread traffic across owned partitions without changing which group member owns each partition.",
            "Compare the unchanged owner rows with the message partition transitions, then add members only when ownership is the variable under study.",
            provenance,
          )
        : after
          ? narrative(
              `Assignment epoch ${after.epoch} has ${after.memberIds.length} members and ${idleCount} idle.`,
              `Each of the ${snapshot.partitionCount} partitions can have only one owner inside this group.`,
              idleCount > 0
                ? "Produce records to see that idle members still receive no partition ownership."
                : "Add another member and compare the next ownership epoch.",
              provenance,
            )
          : narrative(
              "No assignment epoch has been recorded yet.",
              "Ownership evidence appears when the server grows the consumer group.",
              definition.lesson.emptyCopy,
              provenance,
            );

    return createFrame(
      definition,
      graph,
      {
        kind: "assignment",
        title: "Assignment epochs",
        summary:
          "Every row exposes the owner before and after the group changed.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: assignmentTable,
        beforeLabel: before
          ? isUnkeyedContrast
            ? `Epoch ${before.epoch} before burst`
            : `Epoch ${before.epoch}`
          : "No prior epoch",
        afterLabel: after
          ? isUnkeyedContrast
            ? `Epoch ${after.epoch} after burst`
            : `Epoch ${after.epoch}`
          : "No current epoch",
        deltas,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        isUnkeyedContrast
          ? [
              ...assignmentFacts(before, before?.provenance ?? provenance),
              fact(
                "assignment-before-unkeyed-routes",
                "Unkeyed routes before",
                evidence(0, provenance, "run-total"),
              ),
            ]
          : assignmentFacts(before, before?.provenance ?? provenance),
        after && scenarioState.experiment.status === "completed" ? facts : [],
      ),
    );
  },
);

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

export const cooperativeExperience = experienceDefinition(
  "cooperative-rebalancing",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const eager = scenarioState.comparisons.find(
      (comparison) => comparison.strategy === "eager",
    );
    const cooperative = scenarioState.comparisons.find(
      (comparison) => comparison.strategy === "cooperative_sticky",
    );
    const selected = cooperative ?? eager;
    const provenance = selected?.provenance ?? "simulated";
    const deltas = selected ? comparisonDeltas(selected) : [];
    const facts = [
      fact(
        "eager-kept",
        "Eager kept",
        evidence(eager?.keptPartitions.length ?? 0, "derived", "current"),
      ),
      fact(
        "eager-revoked",
        "Eager revoked",
        evidence(eager?.revokedPartitions.length ?? 0, "derived", "current"),
      ),
      fact(
        "cooperative-kept",
        "Cooperative kept",
        evidence(cooperative?.keptPartitions.length ?? 0, "derived", "current"),
      ),
      fact(
        "cooperative-paused",
        "Cooperative paused",
        evidence(
          cooperative?.pausedPartitions.length ?? 0,
          "derived",
          "current",
        ),
      ),
    ];
    const comparisonTable = table(
      "rebalance-strategy-comparison",
      "Strategy movement totals",
      [
        { key: "strategy", label: "Strategy" },
        { key: "kept", label: "Kept", align: "end" },
        { key: "moved", label: "Moved", align: "end" },
        { key: "revoked", label: "Revoked", align: "end" },
        { key: "paused", label: "Paused", align: "end" },
      ],
      scenarioState.comparisons.map((comparison) =>
        row(
          comparison.id,
          {
            strategy: evidence(
              comparison.strategy,
              comparison.provenance,
              "current",
            ),
            kept: evidence(
              comparison.keptPartitions.length,
              "derived",
              "current",
            ),
            moved: evidence(
              comparison.movedPartitions.length,
              "derived",
              "current",
            ),
            revoked: evidence(
              comparison.revokedPartitions.length,
              "derived",
              "current",
            ),
            paused: evidence(
              comparison.pausedPartitions.length,
              "derived",
              "current",
            ),
          },
          entityFocus(comparison.id, "rebalance-coordinator"),
        ),
      ),
      definition.lesson.emptyCopy,
    );
    const graph = buildScenarioGraph("cooperative-rebalancing", snapshot, {
      active: Boolean(selected),
      metrics: {
        "rebalance-coordinator": evidence(
          scenarioState.comparisons.length,
          provenance,
          "run-total",
        ),
        "incremental-movement": evidence(
          selected?.movedPartitions.length ?? 0,
          "derived",
          "current",
        ),
      },
    });
    const frameNarrative =
      eager && cooperative
        ? narrative(
            `Cooperative-sticky kept ${cooperative.keptPartitions.length} partitions; eager kept ${eager.keptPartitions.length}.`,
            "Both results replay the same membership change, isolating the assignment strategy.",
            "Inspect moved, revoked, and paused partitions before choosing a production strategy.",
            "simulated",
          )
        : narrative(
            selected
              ? `${selected.strategy} produced one before/after ownership delta.`
              : "No rebalance comparison has been recorded yet.",
            selected
              ? "A fair comparison still needs the same membership change under the other strategy."
              : "The experiment holds membership constant and varies only assignment strategy.",
            definition.lesson.emptyCopy,
            provenance,
          );

    return createFrame(
      definition,
      graph,
      {
        kind: "assignment",
        title: "Rebalance strategy delta",
        summary:
          "Compare ownership preserved and work interrupted under each strategy.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: comparisonTable,
        beforeLabel: selected ? `${selected.strategy} before` : "Before",
        afterLabel: selected ? `${selected.strategy} after` : "After",
        deltas,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        eager ? comparisonFacts("Eager", eager) : [],
        cooperative ? comparisonFacts("Cooperative", cooperative) : [],
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

function assignmentOwnershipChanged(
  before:
    | ScenarioStateFor<"fan-out-load-balancing">["epochs"][number]
    | undefined,
  after:
    | ScenarioStateFor<"fan-out-load-balancing">["epochs"][number]
    | undefined,
) {
  if (!before || !after) return false;
  return assignmentDeltas(before, after, 3).some(
    (delta) =>
      delta.status === "moved" ||
      delta.status === "revoked" ||
      delta.status === "assigned",
  );
}

function countWithPercentage(count: number, percentage: number) {
  return `${count} (${formatPercentage(percentage)})`;
}

function formatPercentage(percentage: number) {
  return `${percentage.toFixed(1)}%`;
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

function assignmentFacts(
  epoch:
    | ScenarioStateFor<"fan-out-load-balancing">["epochs"][number]
    | undefined,
  provenance: Provenance,
): EvidenceFact[] {
  return [
    fact(
      "assignment-members",
      "Members",
      evidence(epoch?.memberIds.length ?? 0, provenance, "current"),
    ),
    fact(
      "assignment-owned",
      "Owned partitions",
      evidence(
        epoch?.assignments.reduce(
          (total, assignment) => total + assignment.partitions.length,
          0,
        ) ?? 0,
        provenance,
        "current",
      ),
    ),
    fact(
      "assignment-idle",
      "Idle members",
      evidence(epoch?.idleConsumerIds.length ?? 0, "derived", "current"),
    ),
  ];
}

function assignmentDeltas(
  before:
    | ScenarioStateFor<"fan-out-load-balancing">["epochs"][number]
    | undefined,
  after:
    | ScenarioStateFor<"fan-out-load-balancing">["epochs"][number]
    | undefined,
  partitionCount: number,
): AssignmentDeltaModel[] {
  const beforeOwners = ownersByPartition(before?.assignments ?? []);
  const afterOwners = ownersByPartition(after?.assignments ?? []);
  const provenance = after?.provenance ?? before?.provenance ?? "derived";
  const focusId = after?.id ?? before?.id;
  return Array.from({ length: partitionCount }, (_, partition) => {
    const beforeOwner = beforeOwners.get(partition) ?? null;
    const afterOwner = afterOwners.get(partition) ?? null;
    return {
      id: `assignment-${partition}`,
      partition,
      beforeOwner,
      afterOwner,
      status:
        beforeOwner === afterOwner && afterOwner != null
          ? "kept"
          : beforeOwner != null && afterOwner == null
            ? "revoked"
            : beforeOwner == null && afterOwner != null
              ? "assigned"
              : beforeOwner !== afterOwner
                ? "moved"
                : "idle",
      provenance,
      focus: entityFocus(
        focusId ?? `assignment-partition-${partition}`,
        "group-balancer",
      ),
    };
  });
}

function ownersByPartition(
  assignments: readonly { consumerId: string; partitions: readonly number[] }[],
) {
  const owners = new Map<number, string>();
  for (const assignment of assignments) {
    for (const partition of assignment.partitions) {
      owners.set(partition, assignment.consumerId);
    }
  }
  return owners;
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

type CooperativeComparison =
  ScenarioStateFor<"cooperative-rebalancing">["comparisons"][number];

function comparisonDeltas(
  comparison: CooperativeComparison,
): AssignmentDeltaModel[] {
  const before = ownersByPartition(comparison.before);
  const after = ownersByPartition(comparison.after);
  const partitions = new Set([...before.keys(), ...after.keys()]);
  return [...partitions]
    .sort((left, right) => left - right)
    .map((partition) => {
      const beforeOwner = before.get(partition) ?? null;
      const afterOwner = after.get(partition) ?? null;
      return {
        id: `${comparison.strategy}-${partition}`,
        partition,
        beforeOwner,
        afterOwner,
        status: comparison.keptPartitions.includes(partition)
          ? "kept"
          : beforeOwner != null && afterOwner == null
            ? "revoked"
            : beforeOwner == null
              ? "assigned"
              : "moved",
        provenance: comparison.provenance,
        focus: entityFocus(comparison.id, "incremental-movement"),
      };
    });
}

function comparisonFacts(
  label: string,
  comparison: CooperativeComparison,
): EvidenceFact[] {
  return [
    fact(
      `${comparison.id}-kept`,
      `${label} kept`,
      evidence(comparison.keptPartitions.length, "derived", "current"),
    ),
    fact(
      `${comparison.id}-revoked`,
      `${label} revoked`,
      evidence(comparison.revokedPartitions.length, "derived", "current"),
    ),
  ];
}
