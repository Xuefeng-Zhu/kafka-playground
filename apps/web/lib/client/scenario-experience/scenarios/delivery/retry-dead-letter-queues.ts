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
import type { LifecycleRecordModel, ScenarioStateFor } from "../../model";

export const retryExperience = experienceDefinition(
  "retry-dead-letter-queues",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const currentRecord = scenarioState.records.at(-1);
    const transientSucceeded = scenarioState.records.filter(
      (record) => record.kind === "transient" && record.status === "succeeded",
    ).length;
    const deadLettered = scenarioState.records.filter(
      (record) => record.status === "dlq",
    ).length;
    const inBackoff = scenarioState.records.filter(
      (record) => record.status === "backoff",
    ).length;
    const facts = [
      fact(
        "retry-records",
        "Lifecycle records",
        evidence(scenarioState.records.length, "simulated", "run-total"),
      ),
      fact(
        "transient-recovered",
        "Transient recovered",
        evidence(transientSucceeded, "simulated", "run-total"),
        { emphasis: transientSucceeded > 0 ? "positive" : "neutral" },
      ),
      fact(
        "retry-backoff",
        "In backoff",
        evidence(inBackoff, "simulated", "current"),
      ),
      fact(
        "retry-dead-lettered",
        "Dead-lettered",
        evidence(deadLettered, "simulated", "run-total"),
        { emphasis: deadLettered > 0 ? "danger" : "neutral" },
      ),
    ];
    const recordTable = table(
      "retry-current-route",
      "Exactly one current route per record",
      [
        { key: "record", label: "Record" },
        { key: "kind", label: "Failure kind" },
        { key: "status", label: "Current route" },
        { key: "attempt", label: "Attempt", align: "end" },
        { key: "countdown", label: "Backoff remaining", align: "end" },
      ],
      scenarioState.records.map((record) =>
        row(
          record.id,
          {
            record: evidence(record.messageId, record.provenance, "current"),
            kind: evidence(record.kind, record.provenance, "current"),
            status: evidence(record.status, record.provenance, "current"),
            attempt: evidence(
              `${record.attempt}/${record.maxAttempts}`,
              record.provenance,
              "current",
            ),
            countdown: evidence(
              record.backoffUntilVirtualMs == null
                ? "—"
                : `${Math.max(0, record.backoffUntilVirtualMs - scenarioState.virtualTimeMs)} ms`,
              "simulated",
              "current",
            ),
          },
          entityFocus(record.id, retryGraphEntity(record.status)),
          record.status === "dlq"
            ? "danger"
            : record.status === "backoff" || record.status === "retry"
              ? "warning"
              : record.status === "succeeded"
                ? "positive"
                : "neutral",
        ),
      ),
      definition.lesson.emptyCopy,
    );
    const inactiveEdges = retryInactiveEdges(currentRecord?.status);
    const graph = buildScenarioGraph("retry-dead-letter-queues", snapshot, {
      active: Boolean(currentRecord),
      inactiveEdgeIds: inactiveEdges,
      metrics: {
        "retry-topic": graphCountMetric(
          scenarioState.records.filter((record) =>
            ["retry", "backoff"].includes(record.status),
          ).length,
          "simulated",
        ),
        "dead-letter-topic": graphCountMetric(
          deadLettered,
          "simulated",
          "run-total",
        ),
      },
    });
    const frameNarrative = currentRecord
      ? narrative(
          `${currentRecord.messageId} is ${currentRecord.status} on attempt ${currentRecord.attempt} of ${currentRecord.maxAttempts}.`,
          currentRecord.status === "dlq"
            ? "Its retry budget was exhausted, so the terminal route is now the DLQ."
            : currentRecord.status === "succeeded"
              ? "The transient condition cleared before retry exhaustion."
              : "The deterministic lifecycle keeps the record on one route at a time.",
          currentRecord.status === "backoff"
            ? "Advance virtual time until the countdown reaches the next attempt."
            : currentRecord.kind === "transient" &&
                currentRecord.status === "succeeded"
              ? "Run the poison contrast to observe terminal exhaustion."
              : "Inspect the route history and final outcome.",
          currentRecord.provenance,
        )
      : narrative(
          "No retry lifecycle has been recorded yet.",
          "A failure will be shown only in its authoritative current route.",
          definition.lesson.emptyCopy,
          "simulated",
        );
    const records: LifecycleRecordModel[] = scenarioState.records.map(
      (record) => ({
        id: record.id,
        recordId: record.messageId,
        stage: record.status,
        attempt: record.attempt,
        outcome: retryOutcome(record.status),
        ...(record.backoffUntilVirtualMs == null
          ? {}
          : {
              backoffMs: Math.max(
                0,
                record.backoffUntilVirtualMs - scenarioState.virtualTimeMs,
              ),
            }),
        provenance: record.provenance,
        focus: entityFocus(record.id, retryGraphEntity(record.status)),
      }),
    );

    return createFrame(
      definition,
      graph,
      {
        kind: "lifecycle",
        title: "Retry lifecycle",
        summary: "Countdown, attempt, and route are explicit for every record.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: recordTable,
        records,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "before-retry",
            "Terminal records before",
            evidence(0, "simulated", "run-total"),
          ),
        ],
        transientSucceeded > 0 || deadLettered > 0 ? facts : [],
      ),
    );
  },
);

function retryInactiveEdges(
  status:
    | ScenarioStateFor<"retry-dead-letter-queues">["records"][number]["status"]
    | undefined,
) {
  const all = new Set([
    "producer-topic",
    "topic-group",
    "group-retry",
    "retry-group",
    "retry-dlq",
  ]);
  const activeByStatus: Record<
    NonNullable<typeof status>,
    readonly string[]
  > = {
    main: ["producer-topic", "topic-group"],
    retry: ["group-retry"],
    backoff: ["group-retry"],
    succeeded: ["retry-group"],
    dlq: ["retry-dlq"],
  };
  for (const active of status ? activeByStatus[status] : []) {
    all.delete(active);
  }
  return all;
}

function retryOutcome(
  status: ScenarioStateFor<"retry-dead-letter-queues">["records"][number]["status"],
): LifecycleRecordModel["outcome"] {
  if (status === "succeeded") return "succeeded";
  if (status === "dlq") return "dead-lettered";
  if (status === "retry" || status === "backoff") return "retrying";
  return "waiting";
}

function retryGraphEntity(
  status: ScenarioStateFor<"retry-dead-letter-queues">["records"][number]["status"],
) {
  if (status === "dlq") return "dead-letter-topic";
  if (status === "retry" || status === "backoff") return "retry-topic";
  return "consumerGroup";
}
