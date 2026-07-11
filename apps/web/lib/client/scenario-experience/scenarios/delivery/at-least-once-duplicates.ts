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
  LifecycleRecordModel,
  ScenarioExperienceSnapshot,
  ScenarioStateFor,
} from "../../model";

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

function deliveryFocus(
  snapshot: ScenarioExperienceSnapshot,
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
