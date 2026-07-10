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
  EvidenceFact,
  LifecycleRecordModel,
  ScenarioStateFor,
  TransactionBoundaryModel,
} from "../model";

export const duplicateExperience = experienceDefinition(
  "at-least-once-duplicates",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const deliveryWindow = latestWindow(scenarioState.deliveries);
    const redeliveries = scenarioState.deliveries.filter(
      (delivery) => delivery.attempt > 1,
    );
    const naiveTotal = scenarioState.sideEffects.reduce(
      (total, effect) => total + effect.naiveCount,
      0,
    );
    const idempotentTotal = scenarioState.sideEffects.reduce(
      (total, effect) => total + effect.idempotentCount,
      0,
    );
    const provenance =
      scenarioState.deliveries.at(-1)?.provenance ?? "simulated";
    const comparesExistingRedelivery =
      scenarioState.experiment.experimentId === "duplicate-risk-records" &&
      redeliveries.length > 0;
    const facts = [
      fact(
        "delivery-count",
        "Deliveries",
        evidence(scenarioState.deliveries.length, provenance, "run-total"),
      ),
      fact(
        "redelivery-count",
        "Redeliveries",
        evidence(redeliveries.length, "derived", "run-total"),
        { emphasis: redeliveries.length > 0 ? "warning" : "neutral" },
      ),
      fact(
        "naive-side-effects",
        "Naïve side effects",
        evidence(naiveTotal, "simulated", "run-total"),
      ),
      fact(
        "idempotent-side-effects",
        "Idempotent side effects",
        evidence(idempotentTotal, "simulated", "run-total"),
        {
          emphasis: naiveTotal > idempotentTotal ? "positive" : "neutral",
        },
      ),
    ];
    const deliveryTable = table(
      "duplicate-delivery-attempts",
      "Delivery attempts for stable partition and offset identities",
      [
        { key: "record", label: "Record" },
        { key: "partition", label: "Partition" },
        { key: "offset", label: "Offset", align: "end" },
        { key: "attempt", label: "Attempt", align: "end" },
        { key: "sideEffect", label: "Side effect" },
        { key: "commit", label: "Commit" },
      ],
      deliveryWindow.items.map((delivery) =>
        row(
          delivery.id,
          {
            record: evidence(
              delivery.messageId,
              delivery.provenance,
              "recent-window",
              deliveryWindow.bounded?.label,
            ),
            partition: evidence(
              `P${delivery.partition}`,
              delivery.provenance,
              "recent-window",
              deliveryWindow.bounded?.label,
            ),
            offset: evidence(
              delivery.offset,
              delivery.provenance,
              "recent-window",
              deliveryWindow.bounded?.label,
            ),
            attempt: evidence(
              delivery.attempt,
              delivery.provenance,
              "recent-window",
              deliveryWindow.bounded?.label,
            ),
            sideEffect: evidence(
              delivery.sideEffectApplied ? "Applied" : "Skipped",
              "simulated",
              "recent-window",
              deliveryWindow.bounded?.label,
            ),
            commit: evidence(
              delivery.committed ? "Committed" : "Not committed",
              delivery.provenance,
              "recent-window",
              deliveryWindow.bounded?.label,
            ),
          },
          deliveryFocus(snapshot, delivery),
          delivery.attempt > 1 ? "warning" : "neutral",
        ),
      ),
      definition.lesson.emptyCopy,
      deliveryWindow.bounded,
    );
    const sideEffectTable = table(
      "duplicate-side-effect-comparison",
      "Side-effect strategy comparison",
      [
        { key: "key", label: "Idempotency key" },
        { key: "naive", label: "Naïve count", align: "end" },
        { key: "idempotent", label: "Idempotent count", align: "end" },
      ],
      scenarioState.sideEffects.map((effect) =>
        row(
          effect.id,
          {
            key: evidence(
              effect.idempotencyKey,
              effect.provenance,
              "run-total",
            ),
            naive: evidence(effect.naiveCount, "simulated", "run-total"),
            idempotent: evidence(
              effect.idempotentCount,
              "simulated",
              "run-total",
            ),
          },
          entityFocus(effect.id, "idempotent-handler"),
        ),
      ),
      "Crash and redeliver a record to compare handler outcomes.",
    );
    const graph = buildScenarioGraph("at-least-once-duplicates", snapshot, {
      active: scenarioState.deliveries.length > 0,
      inactiveEdgeIds:
        redeliveries.length === 0
          ? new Set(["commit-replay", "replay-group"])
          : undefined,
      metrics: {
        "idempotent-handler": graphCountMetric(
          idempotentTotal,
          "simulated",
          "run-total",
        ),
        "commit-gate": graphCountMetric(
          scenarioState.deliveries.filter((delivery) => delivery.committed)
            .length,
          provenance,
          "run-total",
        ),
        "replay-loop": graphCountMetric(
          redeliveries.length,
          provenance,
          "run-total",
        ),
      },
    });
    const latest = scenarioState.deliveries.at(-1);
    const frameNarrative = latest
      ? narrative(
          `${latest.messageId} was delivered at P${latest.partition}:${latest.offset} for attempt ${latest.attempt}.`,
          latest.attempt > 1
            ? "The earlier attempt applied work without a commit, so the same Kafka identity was eligible for redelivery."
            : "This first attempt is only a duplicate risk until the server records a second delivery of the same identity.",
          latest.attempt > 1
            ? `Compare the naïve total (${naiveTotal}) with the idempotent total (${idempotentTotal}).`
            : "Run the crash-and-redeliver experiment before the commit succeeds.",
          latest.provenance,
        )
      : narrative(
          "No delivery attempt has been recorded yet.",
          "The visualization will not infer redelivery from metadata alone.",
          definition.lesson.emptyCopy,
          provenance,
        );
    const records: LifecycleRecordModel[] = deliveryWindow.items.map(
      (delivery) => ({
        id: delivery.id,
        recordId: delivery.messageId,
        stage: delivery.committed ? "committed" : "before commit",
        attempt: delivery.attempt,
        outcome: delivery.committed ? "succeeded" : "waiting",
        provenance: delivery.provenance,
        focus: deliveryFocus(snapshot, delivery),
      }),
    );

    return createFrame(
      definition,
      graph,
      {
        kind: "lifecycle",
        title: "Redelivery lifecycle",
        summary: "The same message identity remains visible across attempts.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: deliveryTable,
        sections: [
          {
            id: "side-effect-comparison",
            title: "Naïve versus idempotent",
            facts: [facts[2], facts[3]],
            table: sideEffectTable,
          },
        ],
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
            "before-naive",
            "Naïve before",
            evidence(
              comparesExistingRedelivery ? naiveTotal : 0,
              "simulated",
              "run-total",
            ),
          ),
          fact(
            "before-idempotent",
            "Idempotent before",
            evidence(
              comparesExistingRedelivery ? idempotentTotal : 0,
              "simulated",
              "run-total",
            ),
          ),
        ],
        scenarioState.experiment.status === "completed"
          ? [facts[2], facts[3]]
          : [],
      ),
    );
  },
);

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

export const transactionExperience = experienceDefinition(
  "transactional-producers",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const staged = scenarioState.transactions.reduce(
      (total, transaction) =>
        total + transaction.records.filter((record) => record.staged).length,
      0,
    );
    const visible = scenarioState.transactions.reduce(
      (total, transaction) => total + transaction.visibleRecordIds.length,
      0,
    );
    const aborted = scenarioState.transactions.filter(
      (transaction) => transaction.status === "aborted",
    ).length;
    const deduplicated = scenarioState.transactions.reduce(
      (total, transaction) =>
        total +
        transaction.dedupe.filter((attempt) => !attempt.accepted).length,
      0,
    );
    const facts = [
      fact(
        "transaction-staged",
        "Staged records",
        evidence(staged, "simulated", "run-total"),
      ),
      fact(
        "transaction-visible",
        "Visible records",
        evidence(visible, "simulated", "run-total"),
        {
          emphasis: visible > 0 ? "positive" : "neutral",
        },
      ),
      fact(
        "transaction-aborted",
        "Aborted transactions",
        evidence(aborted, "simulated", "run-total"),
      ),
      fact(
        "transaction-deduplicated",
        "Suppressed resends",
        evidence(deduplicated, "simulated", "run-total"),
      ),
    ];
    const transactionTable = table(
      "transaction-boundaries",
      "Transaction visibility boundaries",
      [
        { key: "transaction", label: "Transaction" },
        { key: "status", label: "Status" },
        { key: "staged", label: "Staged", align: "end" },
        { key: "visible", label: "Visible", align: "end" },
        { key: "offsets", label: "Offsets committed" },
      ],
      scenarioState.transactions.map((transaction) =>
        row(
          transaction.id,
          {
            transaction: evidence(
              transaction.transactionId,
              transaction.provenance,
              "run-total",
            ),
            status: evidence(
              transaction.status,
              transaction.provenance,
              "current",
            ),
            staged: evidence(
              transaction.records.filter((record) => record.staged).length,
              transaction.provenance,
              "run-total",
            ),
            visible: evidence(
              transaction.visibleRecordIds.length,
              transaction.provenance,
              "run-total",
            ),
            offsets: evidence(
              transaction.offsetsCommitted ? "Yes" : "No",
              transaction.provenance,
              "current",
            ),
          },
          entityFocus(transaction.id, "commit-boundary"),
          transaction.status === "aborted"
            ? "warning"
            : transaction.status === "committed"
              ? "positive"
              : "neutral",
        ),
      ),
      definition.lesson.emptyCopy,
    );
    const recordTable = table(
      "transaction-record-visibility",
      "Per-record staged and visible state",
      [
        { key: "transaction", label: "Transaction" },
        { key: "record", label: "Record" },
        { key: "sequence", label: "Producer sequence", align: "end" },
        { key: "staged", label: "Staged" },
        { key: "visible", label: "Visible" },
      ],
      scenarioState.transactions.flatMap((transaction) =>
        transaction.records.map((record) =>
          row(
            `${transaction.id}-${record.recordId}`,
            {
              transaction: evidence(
                transaction.transactionId,
                transaction.provenance,
                "run-total",
              ),
              record: evidence(
                record.recordId,
                transaction.provenance,
                "run-total",
              ),
              sequence: evidence(
                record.producerSequence,
                transaction.provenance,
                "run-total",
              ),
              staged: evidence(
                record.staged ? "Yes" : "No",
                transaction.provenance,
                "current",
              ),
              visible: evidence(
                record.visible ? "Yes" : "No",
                transaction.provenance,
                "current",
              ),
            },
            recordFocus(
              snapshot,
              record.recordId,
              undefined,
              undefined,
              "commit-boundary",
            ),
          ),
        ),
      ),
      "Stage a transaction to see record visibility.",
    );
    const graph = buildScenarioGraph("transactional-producers", snapshot, {
      active: scenarioState.transactions.length > 0,
      inactiveEdgeIds:
        visible === 0 ? new Set(["boundary-topic", "topic-group"]) : undefined,
      metrics: {
        "transaction-coordinator": graphCountMetric(
          scenarioState.transactions.length,
          "simulated",
          "run-total",
        ),
        "commit-boundary": graphCountMetric(visible, "simulated", "run-total"),
      },
    });
    const latest = scenarioState.transactions.at(-1);
    const frameNarrative = latest
      ? narrative(
          `${latest.transactionId} is ${latest.status}; ${latest.visibleRecordIds.length} record(s) are visible.`,
          latest.status === "committed"
            ? "The simulated read-committed boundary released the transaction as one unit."
            : latest.status === "aborted"
              ? "Aborted staged records never crossed the visibility boundary."
              : "Open records remain staged and hidden.",
          deduplicated > 0
            ? `${deduplicated} repeated producer sequence was suppressed.`
            : "Run the abort-and-dedupe contrast to test hidden output and resend suppression.",
          latest.provenance,
        )
      : narrative(
          "No transaction has been staged yet.",
          "Visibility evidence begins at the server-owned transaction boundary.",
          definition.lesson.emptyCopy,
          "simulated",
        );
    const boundaries: TransactionBoundaryModel[] =
      scenarioState.transactions.map((transaction) => ({
        id: transaction.id,
        status: transaction.status === "open" ? "staged" : transaction.status,
        recordIds: transaction.records.map((record) => record.recordId),
        visibleRecordIds: transaction.visibleRecordIds,
        provenance: transaction.provenance,
        focus: entityFocus(transaction.id, "commit-boundary"),
      }));

    return createFrame(
      definition,
      graph,
      {
        kind: "transaction",
        title: "Transactional visibility",
        summary:
          "Staged does not mean visible; aborts and resends remain explicit.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: transactionTable,
        sections: [
          {
            id: "transaction-records",
            title: "Record visibility",
            facts: [facts[0], facts[1]],
            table: recordTable,
          },
        ],
        boundaries,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "before-visible",
            "Visible before",
            evidence(0, "simulated", "run-total"),
          ),
        ],
        latest?.status === "committed" || aborted > 0 ? facts : [],
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

function deliveryFocus(
  snapshot: RunSnapshot,
  delivery: ScenarioStateFor<"at-least-once-duplicates">["deliveries"][number],
) {
  const hasMessage = snapshot.recentMessages.some(
    (message) => message.messageId === delivery.messageId,
  );
  return recordFocus(
    snapshot,
    hasMessage ? delivery.messageId : delivery.id,
    delivery.partition,
    delivery.offset,
    delivery.attempt > 1 ? "replay-loop" : "commit-gate",
  );
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

export function duplicateSideEffectFacts(
  state: ScenarioStateFor<"at-least-once-duplicates">,
): EvidenceFact[] {
  return state.sideEffects.flatMap((effect) => [
    fact(
      `${effect.id}-naive`,
      "Naïve",
      evidence(effect.naiveCount, "simulated", "run-total"),
    ),
    fact(
      `${effect.id}-idempotent`,
      "Idempotent",
      evidence(effect.idempotentCount, "simulated", "run-total"),
    ),
  ]);
}
import type { RunSnapshot } from "@kplay/contracts";
