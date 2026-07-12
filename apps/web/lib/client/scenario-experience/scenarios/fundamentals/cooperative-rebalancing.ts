import {
  experienceDefinition,
  experimentEvidence,
} from "../../definition-helpers";
import { buildScenarioGraph } from "../../graphs";
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
  AssignmentDeltaModel,
  EvidenceFact,
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioStateFor,
} from "../../model";
import { ownersByPartition } from "./ownership";

export const cooperativeExperience = experienceDefinition(
  "cooperative-rebalancing",
  projectCooperativeRebalancing,
);

type CooperativeComparison =
  ScenarioStateFor<"cooperative-rebalancing">["comparisons"][number];
type CooperativeDefinition =
  ScenarioExperienceDefinition<"cooperative-rebalancing">;
type CooperativeInput =
  ScenarioExperienceProjectionInput<"cooperative-rebalancing">;

function projectCooperativeRebalancing(
  definition: CooperativeDefinition,
  input: CooperativeInput,
) {
  const { scenarioState } = input;
  const eager = scenarioState.comparisons.find(
    (comparison) => comparison.strategy === "eager",
  );
  const cooperative = scenarioState.comparisons.find(
    (comparison) => comparison.strategy === "cooperative_sticky",
  );
  const selected = cooperative ?? eager;
  const facts = buildCooperativeFacts(eager, cooperative);
  return createFrame(
    definition,
    buildCooperativeGraph(input, selected),
    {
      kind: "assignment",
      title: "Rebalance strategy delta",
      summary:
        "Compare ownership preserved and work interrupted under each strategy.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildComparisonTable(scenarioState, definition.lesson.emptyCopy),
      beforeLabel: selected ? `${selected.strategy} before` : "Before",
      afterLabel: selected ? `${selected.strategy} after` : "After",
      deltas: selected ? comparisonDeltas(selected) : [],
    },
    buildCooperativeNarrative(definition, eager, cooperative, selected),
    undefined,
    experimentEvidence(
      definition,
      input,
      facts,
      eager ? comparisonFacts("Eager", eager) : [],
      cooperative ? comparisonFacts("Cooperative", cooperative) : [],
    ),
  );
}

function buildCooperativeFacts(
  eager: CooperativeComparison | undefined,
  cooperative: CooperativeComparison | undefined,
) {
  return [
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
      evidence(cooperative?.pausedPartitions.length ?? 0, "derived", "current"),
    ),
  ];
}

function buildComparisonTable(
  state: ScenarioStateFor<"cooperative-rebalancing">,
  emptyCopy: string,
) {
  return table(
    "rebalance-strategy-comparison",
    "Strategy movement totals",
    [
      { key: "strategy", label: "Strategy" },
      { key: "kept", label: "Kept", align: "end" },
      { key: "moved", label: "Moved", align: "end" },
      { key: "revoked", label: "Revoked", align: "end" },
      { key: "paused", label: "Paused", align: "end" },
    ],
    state.comparisons.map((comparison) =>
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
    emptyCopy,
  );
}

function buildCooperativeGraph(
  input: CooperativeInput,
  selected: CooperativeComparison | undefined,
) {
  return buildScenarioGraph("cooperative-rebalancing", input.snapshot, {
    active: Boolean(selected),
    metrics: {
      "rebalance-coordinator": evidence(
        input.scenarioState.comparisons.length,
        selected?.provenance ?? "simulated",
        "run-total",
      ),
      "incremental-movement": evidence(
        selected?.movedPartitions.length ?? 0,
        "derived",
        "current",
      ),
    },
  });
}

function buildCooperativeNarrative(
  definition: CooperativeDefinition,
  eager: CooperativeComparison | undefined,
  cooperative: CooperativeComparison | undefined,
  selected: CooperativeComparison | undefined,
) {
  if (eager && cooperative) {
    return narrative(
      `Cooperative-sticky kept ${cooperative.keptPartitions.length} partitions; eager kept ${eager.keptPartitions.length}.`,
      "Both results replay the same membership change, isolating the assignment strategy.",
      "Inspect moved, revoked, and paused partitions before choosing a production strategy.",
      "simulated",
    );
  }
  return narrative(
    selected
      ? `${selected.strategy} produced one before/after ownership delta.`
      : "No rebalance comparison has been recorded yet.",
    selected
      ? "A fair comparison still needs the same membership change under the other strategy."
      : "The experiment holds membership constant and varies only assignment strategy.",
    definition.lesson.emptyCopy,
    selected?.provenance ?? "simulated",
  );
}

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
