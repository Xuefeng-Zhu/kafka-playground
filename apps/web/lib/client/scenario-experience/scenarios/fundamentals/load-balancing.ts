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
  AssignmentDeltaModel,
  EvidenceFact,
  Provenance,
  ScenarioStateFor,
} from "../../model";
import { ownersByPartition } from "./ownership";

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
