import "server-only";
import { complete, step, upsertById } from "./shared";
import type { ScenarioExperimentHandler, StateFor } from "./types";

export const buildEventReplayExperiment: ScenarioExperimentHandler<
  "event-replay-sourcing"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const rebuild = experimentId === "rebuild-projection";
  const transitions = rebuild
    ? [
        step(
          "clear",
          "Clear projection",
          "projection.cleared",
          ["cart-projection"],
          100,
        ),
        step(
          "reset",
          "Reset replay cursor",
          "cursor.reset",
          ["replay-cursor"],
          100,
        ),
        ...state.log.map((event) => ({
          ...step(
            `replay-${event.offset}`,
            `Replay offset ${event.offset}`,
            "event.replayed",
            [event.id],
            100,
          ),
          partition: 0,
          offset: event.offset,
        })),
      ]
    : [0, 1, 2].map((index) => {
        const offset = state.log.length + index;
        return step(
          `append-${offset}`,
          `Append event ${offset}`,
          "event.produced",
          [`event-${offset}`],
          100,
        );
      });
  const appended = [
    replayEvent(state.log.length, "cart-1", "ItemAdded", 1),
    replayEvent(state.log.length + 1, "cart-1", "ItemAdded", 1),
    replayEvent(state.log.length + 2, "cart-1", "ItemRemoved", -1),
  ];
  const log = rebuild ? state.log : [...state.log, ...appended];
  const projection = projectReplayLog(log);
  const nextState = complete(
    {
      ...state,
      log,
      cursor: log.at(-1)?.offset ?? null,
      projection,
      rebuildInProgress: false,
      producedCount: rebuild
        ? state.producedCount
        : state.producedCount + appended.length,
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

export const buildLogCompactionExperiment: ScenarioExperimentHandler<
  "log-compaction-tombstones"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const simulated = "simulated" as const;

  const append = experimentId === "compacted-key-series";
  const compact = experimentId === "run-compaction";
  const transitions = append
    ? [
        step(
          "append",
          "Append key history",
          "log.appended",
          [
            "record-a1",
            "record-b1",
            "record-a2",
            "record-b-tombstone",
            "materialized-a",
            "materialized-b",
          ],
          100,
        ),
      ]
    : compact
      ? [
          ...(state.rawLog.length === 0
            ? [
                step(
                  "materialize-log-history",
                  "Append A1, B1, A2, and tombstone B",
                  "log.appended",
                  [
                    "record-a1",
                    "record-b1",
                    "record-a2",
                    "record-b-tombstone",
                    "materialized-a",
                    "materialized-b",
                  ],
                  100,
                ),
              ]
            : []),
          step(
            "compact",
            "Run cleaner pass",
            "log.compacted",
            [
              "cleaner-compaction",
              "record-a1",
              "record-b1",
              "record-a2",
              "record-b-tombstone",
              "materialized-a",
              "materialized-b",
            ],
            5_000,
          ),
        ]
      : [
          step(
            "cleanup",
            "Expire tombstone",
            "tombstone.expired",
            ["cleaner-tombstone", "record-b-tombstone", "materialized-b"],
            60_000,
          ),
        ];
  const appendedLog = [
    compactedRecord("record-a1", 0, "A", "A1", false, null),
    compactedRecord("record-b1", 1, "B", "B1", false, null),
    compactedRecord("record-a2", 2, "A", "A2", false, null),
    compactedRecord("record-b-tombstone", 3, "B", null, true, null),
  ];
  const sourceLog = state.rawLog.length > 0 ? state.rawLog : appendedLog;
  const rawLog = append
    ? appendedLog
    : sourceLog.map((record) => {
        if (compact && ["0", "1"].includes(record.offset)) {
          return { ...record, removedAtStage: "compaction" as const };
        }
        if (!compact && record.offset === "3") {
          return {
            ...record,
            removedAtStage: "tombstone_cleanup" as const,
          };
        }
        return record;
      });
  const cleanerCompletedAt =
    startedAtVirtualMs +
    transitions.reduce((total, transition) => total + transition.advanceMs, 0);
  const cleanerPass = compact
    ? {
        id: "cleaner-compaction",
        provenance: simulated,
        stage: "compaction" as const,
        removedOffsets: ["0", "1"],
        atVirtualMs: cleanerCompletedAt,
      }
    : {
        id: "cleaner-tombstone",
        provenance: simulated,
        stage: "tombstone_cleanup" as const,
        removedOffsets: ["3"],
        atVirtualMs: cleanerCompletedAt,
      };
  const nextState = complete(
    {
      ...state,
      rawLog,
      materialized: append
        ? [
            {
              id: "materialized-a",
              provenance: simulated,
              key: "A",
              value: "A2",
              sourceOffset: "2",
            },
            {
              id: "materialized-b",
              provenance: simulated,
              key: "B",
              value: null,
              sourceOffset: "3",
            },
          ]
        : compact
          ? [
              {
                id: "materialized-a",
                provenance: simulated,
                key: "A",
                value: "A2",
                sourceOffset: "2",
              },
              {
                id: "materialized-b",
                provenance: simulated,
                key: "B",
                value: null,
                sourceOffset: "3",
              },
            ]
          : [
              {
                id: "materialized-a",
                provenance: simulated,
                key: "A",
                value: "A2",
                sourceOffset: "2",
              },
            ],
      cleanerPasses: append
        ? state.cleanerPasses
        : upsertById(state.cleanerPasses, cleanerPass),
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

export const buildRetentionExperiment: ScenarioExperimentHandler<
  "retention-data-loss"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const simulated = "simulated" as const;

  const fill = experimentId === "retention-window";
  const advance = experimentId === "advance-retention";
  const retentionEntityIds = [0, 1, 2, 3, 4].map(
    (offset) => `retention-record-${offset}`,
  );
  const transitions = fill
    ? [
        step(
          "append",
          "Append retained records",
          "log.appended",
          ["retention-records", ...retentionEntityIds],
          500,
        ),
      ]
    : advance
      ? [
          ...(state.records.length === 0
            ? [
                step(
                  "materialize-retention-window",
                  "Append records across the retention window",
                  "log.appended",
                  ["retention-records", ...retentionEntityIds],
                  500,
                ),
              ]
            : []),
          step(
            "advance",
            "Advance past retention",
            "virtual_time.advanced",
            ["retention-clock", ...retentionEntityIds],
            59_550,
          ),
          step(
            "expire",
            "Move log start offset",
            "retention.expired",
            ["log-start-offset", ...retentionEntityIds],
            100,
          ),
          step(
            "replay",
            "Attempt stale replay",
            "offset.out_of_range",
            ["consumer-group", ...retentionEntityIds],
            100,
          ),
        ]
      : [
          step(
            "recover",
            "Reset to earliest retained offset",
            "offset.recovered",
            ["consumer-group", ...retentionEntityIds],
            100,
          ),
        ];
  const records =
    state.records.length > 0
      ? state.records
      : [0, 1, 2, 3, 4].map((offset) => ({
          id: `retention-record-${offset}`,
          provenance: simulated,
          offset: String(offset),
          createdAtVirtualMs: offset * 100,
          expired: false,
        }));
  const completedAtVirtualMs =
    startedAtVirtualMs +
    transitions.reduce((total, transition) => total + transition.advanceMs, 0);
  const cutoffVirtualMs = advance
    ? Math.max(0, completedAtVirtualMs - state.retentionMs)
    : state.cutoffVirtualMs;
  const retainedRecords = advance
    ? records.map((record) => ({
        ...record,
        expired: record.createdAtVirtualMs < cutoffVirtualMs,
      }))
    : records;
  const firstRetained = retainedRecords.find((record) => !record.expired);
  const nextLogStartOffset =
    firstRetained?.offset ??
    String(Number(retainedRecords.at(-1)?.offset ?? "-1") + 1);
  const committedOffset =
    state.records.length === 0 ? "1" : state.committedOffset;
  const nextState = complete(
    {
      ...state,
      records: retainedRecords,
      cutoffVirtualMs,
      logStartOffset: advance ? nextLogStartOffset : state.logStartOffset,
      committedOffset: fill
        ? "1"
        : advance
          ? committedOffset
          : state.logStartOffset,
      error: advance
        ? {
            code: "offset_out_of_range",
            requestedOffset: committedOffset,
            recoveryOptions: ["earliest", "latest", "restore"],
            provenance: simulated,
          }
        : fill
          ? null
          : null,
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

function replayEvent(
  offset: number,
  aggregateId: string,
  eventName: string,
  delta: number,
) {
  return {
    id: `event-${offset}`,
    provenance: "simulated" as const,
    offset: String(offset),
    aggregateId,
    eventName,
    delta,
  };
}

function projectReplayLog(log: StateFor<"event-replay-sourcing">["log"]) {
  return log.reduce<Record<string, number>>((projection, event) => {
    projection[event.aggregateId] =
      (projection[event.aggregateId] ?? 0) + event.delta;
    return projection;
  }, {});
}

function compactedRecord(
  id: string,
  offset: number,
  key: string,
  value: string | null,
  tombstone: boolean,
  removedAtStage: "compaction" | "tombstone_cleanup" | null,
) {
  return {
    id,
    provenance: "simulated" as const,
    offset: String(offset),
    key,
    value,
    tombstone,
    removedAtStage,
  };
}
