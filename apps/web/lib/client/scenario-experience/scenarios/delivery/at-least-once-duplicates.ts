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
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioExperienceSnapshot,
  ScenarioStateFor,
} from "../../model";

export const duplicateExperience = experienceDefinition(
  "at-least-once-duplicates",
  projectDuplicates,
);

type DuplicateDefinition =
  ScenarioExperienceDefinition<"at-least-once-duplicates">;
type DuplicateInput =
  ScenarioExperienceProjectionInput<"at-least-once-duplicates">;
type DuplicateState = ScenarioStateFor<"at-least-once-duplicates">;
type Delivery = DuplicateState["deliveries"][number];

function projectDuplicates(
  definition: DuplicateDefinition,
  input: DuplicateInput,
) {
  const { scenarioState } = input;
  const deliveryWindow = latestWindow(scenarioState.deliveries);
  const totals = duplicateTotals(scenarioState);
  const factSet = buildDuplicateFacts(scenarioState, totals);
  const facts = factSet.all;
  const latest = scenarioState.deliveries.at(-1);
  return createFrame(
    definition,
    buildDuplicateGraph(input, totals),
    {
      kind: "lifecycle",
      title: "Redelivery lifecycle",
      summary: "The same message identity remains visible across attempts.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildDeliveryTable(
        input.snapshot,
        deliveryWindow,
        definition.lesson.emptyCopy,
      ),
      sections: [
        {
          id: "side-effect-comparison",
          title: "Naïve versus idempotent",
          facts: [factSet.naiveSideEffects, factSet.idempotentSideEffects],
          table: buildSideEffectTable(scenarioState),
        },
      ],
      records: buildDeliveryRecords(input.snapshot, deliveryWindow.items),
    },
    buildDuplicateNarrative(definition, latest, totals),
    undefined,
    experimentEvidence(
      definition,
      input,
      facts,
      buildDuplicateBeforeFacts(scenarioState, totals),
      scenarioState.experiment.status === "completed"
        ? [factSet.naiveSideEffects, factSet.idempotentSideEffects]
        : [],
    ),
  );
}

function duplicateTotals(state: DuplicateState) {
  const redeliveries = state.deliveries.filter(
    (delivery) => delivery.attempt > 1,
  );
  return {
    redeliveries,
    naive: state.sideEffects.reduce(
      (total, effect) => total + effect.naiveCount,
      0,
    ),
    idempotent: state.sideEffects.reduce(
      (total, effect) => total + effect.idempotentCount,
      0,
    ),
    provenance: state.deliveries.at(-1)?.provenance ?? "simulated",
  } as const;
}

type DuplicateTotals = ReturnType<typeof duplicateTotals>;

function buildDuplicateFacts(state: DuplicateState, totals: DuplicateTotals) {
  const deliveryCount = fact(
    "delivery-count",
    "Deliveries",
    evidence(state.deliveries.length, totals.provenance, "run-total"),
  );
  const redeliveryCount = fact(
    "redelivery-count",
    "Redeliveries",
    evidence(totals.redeliveries.length, "derived", "run-total"),
    {
      emphasis: totals.redeliveries.length > 0 ? "warning" : "neutral",
    },
  );
  const naiveSideEffects = fact(
    "naive-side-effects",
    "Naïve side effects",
    evidence(totals.naive, "simulated", "run-total"),
  );
  const idempotentSideEffects = fact(
    "idempotent-side-effects",
    "Idempotent side effects",
    evidence(totals.idempotent, "simulated", "run-total"),
    {
      emphasis: totals.naive > totals.idempotent ? "positive" : "neutral",
    },
  );
  return {
    all: [
      deliveryCount,
      redeliveryCount,
      naiveSideEffects,
      idempotentSideEffects,
    ],
    deliveryCount,
    redeliveryCount,
    naiveSideEffects,
    idempotentSideEffects,
  };
}

function buildDeliveryTable(
  snapshot: ScenarioExperienceSnapshot,
  deliveryWindow: ReturnType<typeof latestWindow<Delivery>>,
  emptyCopy: string,
) {
  return table(
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
    emptyCopy,
    deliveryWindow.bounded,
  );
}

function buildSideEffectTable(state: DuplicateState) {
  return table(
    "duplicate-side-effect-comparison",
    "Side-effect strategy comparison",
    [
      { key: "key", label: "Idempotency key" },
      { key: "naive", label: "Naïve count", align: "end" },
      { key: "idempotent", label: "Idempotent count", align: "end" },
    ],
    state.sideEffects.map((effect) =>
      row(
        effect.id,
        {
          key: evidence(effect.idempotencyKey, effect.provenance, "run-total"),
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
}

function buildDuplicateGraph(input: DuplicateInput, totals: DuplicateTotals) {
  return buildScenarioGraph("at-least-once-duplicates", input.snapshot, {
    active: input.scenarioState.deliveries.length > 0,
    inactiveEdgeIds:
      totals.redeliveries.length === 0
        ? new Set(["commit-replay", "replay-group"])
        : undefined,
    metrics: {
      "idempotent-handler": graphCountMetric(
        totals.idempotent,
        "simulated",
        "run-total",
      ),
      "commit-gate": graphCountMetric(
        input.scenarioState.deliveries.filter((delivery) => delivery.committed)
          .length,
        totals.provenance,
        "run-total",
      ),
      "replay-loop": graphCountMetric(
        totals.redeliveries.length,
        totals.provenance,
        "run-total",
      ),
    },
  });
}

function buildDuplicateNarrative(
  definition: DuplicateDefinition,
  latest: Delivery | undefined,
  totals: DuplicateTotals,
) {
  if (!latest) {
    return narrative(
      "No delivery attempt has been recorded yet.",
      "The visualization will not infer redelivery from metadata alone.",
      definition.lesson.emptyCopy,
      totals.provenance,
    );
  }
  return narrative(
    `${latest.messageId} was delivered at P${latest.partition}:${latest.offset} for attempt ${latest.attempt}.`,
    latest.attempt > 1
      ? "The earlier attempt applied work without a commit, so the same Kafka identity was eligible for redelivery."
      : "This first attempt is only a duplicate risk until the server records a second delivery of the same identity.",
    latest.attempt > 1
      ? `Compare the naïve total (${totals.naive}) with the idempotent total (${totals.idempotent}).`
      : "Run the crash-and-redeliver experiment before the commit succeeds.",
    latest.provenance,
  );
}

function buildDeliveryRecords(
  snapshot: ScenarioExperienceSnapshot,
  deliveries: readonly Delivery[],
): LifecycleRecordModel[] {
  return deliveries.map((delivery) => ({
    id: delivery.id,
    recordId: delivery.messageId,
    stage: delivery.committed ? "committed" : "before commit",
    attempt: delivery.attempt,
    outcome: delivery.committed ? "succeeded" : "waiting",
    provenance: delivery.provenance,
    focus: deliveryFocus(snapshot, delivery),
  }));
}

function buildDuplicateBeforeFacts(
  state: DuplicateState,
  totals: DuplicateTotals,
) {
  const comparesExistingRedelivery =
    state.experiment.experimentId === "duplicate-risk-records" &&
    totals.redeliveries.length > 0;
  return [
    fact(
      "before-naive",
      "Naïve before",
      evidence(
        comparesExistingRedelivery ? totals.naive : 0,
        "simulated",
        "run-total",
      ),
    ),
    fact(
      "before-idempotent",
      "Idempotent before",
      evidence(
        comparesExistingRedelivery ? totals.idempotent : 0,
        "simulated",
        "run-total",
      ),
    ),
  ];
}

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
