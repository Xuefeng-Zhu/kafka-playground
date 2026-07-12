import type { ScenarioState } from "@kplay/contracts";
import type { TeachingScenarioTestCase } from "./helpers";
import { base, completedState, simulated, state, testCase } from "./helpers";

const replayInitial = state({
  ...base("event-replay-sourcing"),
  log: [],
  cursor: null,
  projection: {},
  rebuildInProgress: false,
  producedCount: 0,
});
const replayPrimary = completedState(
  replayInitial,
  "aggregate-events",
  1,
  {
    log: [replayEvent(0, 1), replayEvent(1, 1), replayEvent(2, -1)],
    cursor: "3",
    projection: { "cart-1": 1 },
    producedCount: 3,
  },
  3,
);
const replayContrast = completedState(
  replayPrimary,
  "rebuild-projection",
  2,
  {
    cursor: "3",
    rebuildInProgress: false,
    projection: { "cart-1": 1 },
    producedCount: 3,
  },
  5,
);

const lagInitial = state({
  ...base("consumer-lag-backpressure"),
  samples: [],
  partitions: [lagPartition(0, 0), lagPartition(1, 0), lagPartition(2, 0)],
  consumerCount: 1,
  drainEstimateMs: null,
});
const lagPrimary = completedState(lagInitial, "build-lag", 1, {
  virtualTimeMs: 5_000,
  samples: [lagSample("lag-sample-0", 8, 2, 18, "rising")],
  partitions: [lagPartition(0, 7), lagPartition(1, 5), lagPartition(2, 6)],
  drainEstimateMs: 9_000,
});
const lagContrast = completedState(
  lagPrimary,
  "recover-lag",
  2,
  {
    virtualTimeMs: 10_100,
    samples: [
      ...lagPrimary.samples,
      lagSample("lag-sample-1", 3, 9, 6, "falling"),
      lagSample("lag-sample-2", 3, 9, 0, "steady"),
    ],
    partitions: [lagPartition(0, 0), lagPartition(1, 0), lagPartition(2, 0)],
    consumerCount: 3,
    drainEstimateMs: 0,
  },
  2,
);

const hotInitial = state({
  ...base("hot-partitions-key-skew"),
  phases: [],
});
const hotPrimary = completedState(hotInitial, "hot-key-burst", 1, {
  phases: [hotPhase("phase-hot", "hot", [0, 8, 0, 0], 8)],
});
const hotContrast = completedState(
  hotPrimary,
  "balanced-comparison",
  2,
  {
    phases: [
      ...hotPrimary.phases,
      hotPhase("phase-balanced", "balanced", [2, 2, 2, 2], 1),
    ],
  },
  2,
);

const compactionInitial = state({
  ...base("log-compaction-tombstones"),
  rawLog: [],
  materialized: [],
  cleanerPasses: [],
});
const compactionPrimary = completedState(
  compactionInitial,
  "run-compaction",
  1,
  {
    rawLog: [
      compactedRecord("raw-a1", "0", "A", "A1", "compaction"),
      compactedRecord("raw-b1", "1", "B", "B1", "compaction"),
      compactedRecord("raw-a2", "2", "A", "A2", null),
      compactedRecord("raw-b-delete", "3", "B", null, null),
    ],
    materialized: [
      materialized("state-a", "A", "A2", "2"),
      materialized("state-b", "B", null, "3"),
    ],
    cleanerPasses: [cleaner("cleaner-compaction", "compaction", ["0", "1"])],
  },
  2,
);
const compactionContrast = completedState(
  compactionPrimary,
  "expire-tombstone",
  2,
  {
    rawLog: compactionPrimary.rawLog.map((entry) =>
      entry.id === "raw-b-delete"
        ? { ...entry, removedAtStage: "tombstone_cleanup" as const }
        : entry,
    ),
    materialized: [materialized("state-a", "A", "A2", "2")],
    cleanerPasses: [
      ...compactionPrimary.cleanerPasses,
      cleaner("cleaner-tombstone", "tombstone_cleanup", ["3"]),
    ],
  },
);

const retentionInitial = state({
  ...base("retention-data-loss"),
  records: [],
  retentionMs: 60_000,
  cutoffVirtualMs: 0,
  logStartOffset: "0",
  committedOffset: "0",
  error: null,
  lastOffsetOutOfRange: null,
});
const retentionOffsetOutOfRange: NonNullable<
  Extract<ScenarioState, { scenarioId: "retention-data-loss" }>["error"]
> = {
  code: "offset_out_of_range",
  requestedOffset: "0",
  recoveryOptions: ["earliest", "latest", "restore"],
  provenance: "simulated",
};
const retentionPrimary = completedState(
  retentionInitial,
  "advance-retention",
  1,
  {
    virtualTimeMs: 61_200,
    records: [
      retainedRecord("retention-record-0", "0", 0, true),
      retainedRecord("retention-record-1", "1", 100, true),
      retainedRecord("retention-record-2", "2", 200, true),
      retainedRecord("retention-record-3", "3", 300, false),
      retainedRecord("retention-record-4", "4", 400, false),
    ],
    cutoffVirtualMs: 1_000,
    logStartOffset: "3",
    error: retentionOffsetOutOfRange,
    lastOffsetOutOfRange: retentionOffsetOutOfRange,
  },
  3,
);
const retentionContrast = completedState(
  retentionPrimary,
  "recover-retention",
  2,
  {
    virtualTimeMs: 61_300,
    committedOffset: "3",
    error: null,
  },
);

const cooperativeInitial = state({
  ...base("cooperative-rebalancing"),
  comparisons: [],
});
const cooperativePrimary = completedState(
  cooperativeInitial,
  "compare-rebalance",
  1,
  {
    comparisons: [
      rebalance("rebalance-eager", "eager", [], [0, 1, 2], [0, 1, 2]),
      rebalance(
        "rebalance-cooperative",
        "cooperative_sticky",
        [0, 2],
        [1],
        [1],
      ),
    ],
  },
  3,
);
const cooperativeContrast = completedState(
  cooperativePrimary,
  "cooperative-pressure",
  2,
  {
    comparisons: [
      rebalance("rebalance-eager", "eager", [], [0, 1, 2], [0, 1, 2], true),
      rebalance(
        "rebalance-cooperative",
        "cooperative_sticky",
        [0],
        [1, 2],
        [1, 2],
        true,
      ),
    ],
  },
  3,
);

export const historyCapacityTestCases = [
  testCase(
    "event-replay-sourcing",
    "Did replay append facts or rebuild derived state?",
    replayInitial,
    replayPrimary,
    replayContrast,
    "projection",
    ["replay-produced-count", 0],
    ["replay-produced-count", 3],
    ["replay-produced-count", 3],
  ),
  testCase(
    "consumer-lag-backpressure",
    "Why is lag rising or falling?",
    lagInitial,
    lagPrimary,
    lagContrast,
    "capacity",
    ["lag-total", 0],
    ["lag-total", 18],
    ["lag-total", 0],
  ),
  testCase(
    "hot-partitions-key-skew",
    "How does the equal-size balanced phase differ?",
    hotInitial,
    hotPrimary,
    hotContrast,
    "heatmap",
    ["hot-phase-size", 0],
    ["hot-phase-size", 8],
    ["equal-phase-size", "Yes"],
  ),
  testCase(
    "log-compaction-tombstones",
    "When does a tombstone actually disappear?",
    compactionInitial,
    compactionPrimary,
    compactionContrast,
    "projection",
    ["compaction-raw-count", 0],
    ["compaction-removed", 2],
    ["compaction-cleaned-tombstones", 1],
  ),
  testCase(
    "retention-data-loss",
    "Why can a committed offset become unreadable?",
    retentionInitial,
    retentionPrimary,
    retentionContrast,
    "lifecycle",
    ["retention-expired", 0],
    ["retention-error", "offset_out_of_range"],
    ["retention-error", "Available"],
  ),
  testCase(
    "cooperative-rebalancing",
    "Which strategy keeps more partition ownership?",
    cooperativeInitial,
    cooperativePrimary,
    cooperativeContrast,
    "assignment",
    ["eager-kept", 0],
    ["eager-revoked", 3],
    ["cooperative-kept", 1],
  ),
] as const satisfies readonly TeachingScenarioTestCase[];

function replayEvent(offset: number, delta: number) {
  return {
    ...simulated,
    id: `event-${offset}`,
    offset: String(offset),
    aggregateId: "cart-1",
    eventName: delta > 0 ? "ItemAdded" : "ItemRemoved",
    delta,
  };
}
function lagPartition(partition: number, lag: number) {
  return {
    ...simulated,
    id: `lag-partition-${partition}`,
    partition,
    endOffset: String(lag + 10),
    committedOffset: "10",
    lag,
  };
}
function lagSample(
  id: string,
  productionRate: number,
  processingRate: number,
  lag: number,
  trend: "rising" | "falling" | "steady",
) {
  return {
    ...simulated,
    id,
    atVirtualMs:
      id === "lag-sample-0" ? 5_000 : id === "lag-sample-1" ? 5_100 : 10_100,
    productionRate,
    processingRate,
    lag,
    trend,
  };
}
function hotPhase(
  id: string,
  kind: "hot" | "balanced",
  partitionCounts: number[],
  skewRatio: number,
) {
  const total = partitionCounts.reduce((sum, count) => sum + count, 0);
  return {
    ...simulated,
    id,
    kind,
    total,
    partitionCounts,
    percentages: partitionCounts.map((count) =>
      total === 0 ? 0 : (count / total) * 100,
    ),
    skewRatio,
    routes: partitionCounts.flatMap((count, partition) =>
      Array.from({ length: count }, (_, index) => ({
        messageId: `${id}-${partition}-${index}`,
        key: kind === "hot" ? "celebrity-user" : null,
        partition,
      })),
    ),
  };
}
function compactedRecord(
  id: string,
  offset: string,
  key: string,
  value: string | null,
  removedAtStage: "compaction" | "tombstone_cleanup" | null,
) {
  return {
    ...simulated,
    id,
    offset,
    key,
    value,
    tombstone: value == null,
    removedAtStage,
  };
}
function materialized(
  id: string,
  key: string,
  value: string | null,
  sourceOffset: string,
) {
  return { ...simulated, id, key, value, sourceOffset };
}
function cleaner(
  id: string,
  stage: "compaction" | "tombstone_cleanup",
  removedOffsets: string[],
) {
  return {
    ...simulated,
    id,
    stage,
    removedOffsets,
    atVirtualMs: stage === "compaction" ? 1_000 : 70_000,
  };
}
function retainedRecord(
  id: string,
  offset: string,
  createdAtVirtualMs: number,
  expired: boolean,
) {
  return { ...simulated, id, offset, createdAtVirtualMs, expired };
}
function rebalance(
  id: string,
  strategy: "eager" | "cooperative_sticky",
  keptPartitions: number[],
  revokedPartitions: number[],
  pausedPartitions: number[],
  pressure = false,
) {
  return {
    ...simulated,
    id,
    strategy,
    before: [{ consumerId: "consumer-1", partitions: [0, 1, 2] }],
    after: pressure
      ? [
          { consumerId: "consumer-1", partitions: [0] },
          { consumerId: "consumer-2", partitions: [1] },
          { consumerId: "consumer-3", partitions: [2] },
        ]
      : [
          { consumerId: "consumer-1", partitions: [0, 2] },
          { consumerId: "consumer-2", partitions: [1] },
        ],
    keptPartitions,
    movedPartitions: [
      {
        partition: 1,
        fromConsumerId: "consumer-1",
        toConsumerId: "consumer-2",
      },
      ...(pressure
        ? [
            {
              partition: 2,
              fromConsumerId: "consumer-1",
              toConsumerId: "consumer-3",
            },
          ]
        : []),
    ],
    revokedPartitions,
    pausedPartitions,
  };
}
