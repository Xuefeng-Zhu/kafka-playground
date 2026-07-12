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
  recordFocus,
  row,
  table,
} from "../../helpers";
import type {
  GateEvaluationModel,
  GateMatrixCellModel,
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioStateFor,
} from "../../model";

function aclMatrixCells(
  state: ScenarioStateFor<"acl-least-privilege">,
): GateMatrixCellModel[] {
  const highlighted = state.lastHighlightedCell;
  const cells = new Map<string, GateMatrixCellModel>();
  for (const policy of state.policies) {
    const key = aclCellKey(policy.principal, policy.operation, policy.resource);
    cells.set(key, {
      id: policy.id,
      principal: policy.principal,
      operation: policy.operation,
      resource: policy.resource,
      effect: policy.effect,
      highlighted: isHighlightedAclCell(
        highlighted,
        policy.principal,
        policy.operation,
        policy.resource,
      ),
      provenance: policy.provenance,
      focus: entityFocus(policy.id, "authorization-gate"),
    });
  }
  for (const attempt of state.attempts) {
    const key = aclCellKey(
      attempt.principal,
      attempt.operation,
      attempt.resource,
    );
    if (cells.has(key)) continue;
    cells.set(key, {
      id: attempt.id,
      principal: attempt.principal,
      operation: attempt.operation,
      resource: attempt.resource,
      effect: attempt.decision === "denied" ? "missing" : "allow",
      highlighted: isHighlightedAclCell(
        highlighted,
        attempt.principal,
        attempt.operation,
        attempt.resource,
      ),
      provenance: attempt.provenance,
      focus: entityFocus(attempt.id, "authorization-gate"),
    });
  }
  return [...cells.values()];
}

function aclCellKey(principal: string, operation: string, resource: string) {
  return `${principal}\u0000${operation}\u0000${resource}`;
}

function isHighlightedAclCell(
  highlighted: ScenarioStateFor<"acl-least-privilege">["lastHighlightedCell"],
  principal: string,
  operation: string,
  resource: string,
) {
  return (
    highlighted?.principal === principal &&
    highlighted.operation === operation &&
    highlighted.resource === resource
  );
}

export const aclExperience = experienceDefinition(
  "acl-least-privilege",
  projectAcl,
);

type AclDefinition = ScenarioExperienceDefinition<"acl-least-privilege">;
type AclInput = ScenarioExperienceProjectionInput<"acl-least-privilege">;
type AclState = ScenarioStateFor<"acl-least-privilege">;
type AclAttempt = AclState["attempts"][number];

function projectAcl(definition: AclDefinition, input: AclInput) {
  const { scenarioState } = input;
  const allowedCount = scenarioState.attempts.filter(
    (attempt) =>
      attempt.decision === "allowed" && !attempt.terminatedBeforeKafka,
  ).length;
  const deniedCount = scenarioState.attempts.filter(
    (attempt) => attempt.decision === "denied" && attempt.terminatedBeforeKafka,
  ).length;
  const factSet = buildAclFacts(scenarioState, allowedCount, deniedCount);
  const facts = factSet.all;
  const latest = scenarioState.attempts.at(-1);
  return createFrame(
    definition,
    buildAclGraph(input, latest, deniedCount),
    {
      kind: "gate",
      title: "Least-privilege policy matrix",
      summary:
        "Denied operations terminate before producer and topic boundaries.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildAclAttemptTable(scenarioState, definition.lesson.emptyCopy),
      sections: [
        {
          id: "acl-policy-cells",
          title: "Policy cells",
          facts: [factSet.policyCount, factSet.highlightedCell],
          table: buildAclPolicyTable(scenarioState),
        },
      ],
      evaluations: buildAclEvaluations(input),
      matrixCells: aclMatrixCells(scenarioState),
    },
    buildAclNarrative(definition, latest),
    undefined,
    experimentEvidence(
      definition,
      input,
      facts,
      [
        fact(
          "acl-before-allowed",
          "Allowed before",
          evidence(0, "simulated", "run-total"),
        ),
      ],
      latest ? [factSet.allowedToKafka, factSet.deniedBeforeKafka] : [],
    ),
  );
}

function buildAclFacts(
  state: AclState,
  allowedCount: number,
  deniedCount: number,
) {
  const policyCount = fact(
    "acl-policy-count",
    "Policy cells",
    evidence(state.policies.length, "simulated", "run-total"),
  );
  const allowedToKafka = fact(
    "acl-allowed",
    "Allowed to Kafka",
    evidence(allowedCount, "simulated", "run-total"),
    { emphasis: allowedCount > 0 ? "positive" : "neutral" },
  );
  const deniedBeforeKafka = fact(
    "acl-denied",
    "Denied before Kafka",
    evidence(deniedCount, "simulated", "run-total"),
    { emphasis: deniedCount > 0 ? "warning" : "neutral" },
  );
  const highlightedCell = fact(
    "acl-highlighted-cell",
    "Highlighted cell",
    evidence(
      state.lastHighlightedCell == null
        ? "None"
        : `${state.lastHighlightedCell.principal} × ${state.lastHighlightedCell.operation} × ${state.lastHighlightedCell.resource}`,
      "simulated",
      "current",
    ),
  );
  return {
    all: [policyCount, allowedToKafka, deniedBeforeKafka, highlightedCell],
    policyCount,
    allowedToKafka,
    deniedBeforeKafka,
    highlightedCell,
  };
}

function buildAclAttemptTable(state: AclState, emptyCopy: string) {
  return table(
    "acl-attempts",
    "Authorization attempts before Kafka",
    [
      { key: "principal", label: "Principal" },
      { key: "operation", label: "Operation" },
      { key: "resource", label: "Resource" },
      { key: "decision", label: "Decision" },
      { key: "kafka", label: "Reached Kafka" },
    ],
    state.attempts.map((attempt) =>
      row(
        attempt.id,
        {
          principal: evidence(
            attempt.principal,
            attempt.provenance,
            "run-total",
          ),
          operation: evidence(
            attempt.operation,
            attempt.provenance,
            "run-total",
          ),
          resource: evidence(attempt.resource, attempt.provenance, "run-total"),
          decision: evidence(attempt.decision, attempt.provenance, "current"),
          kafka: evidence(
            attempt.terminatedBeforeKafka ? "No" : "Yes",
            attempt.provenance,
            "current",
          ),
        },
        entityFocus(attempt.id, "authorization-gate"),
        attempt.decision === "denied" ? "danger" : "positive",
      ),
    ),
    emptyCopy,
  );
}

function buildAclPolicyTable(state: AclState) {
  return table(
    "acl-policy-matrix",
    "Principal × operation × resource policy matrix",
    [
      { key: "principal", label: "Principal" },
      { key: "operation", label: "Operation" },
      { key: "resource", label: "Resource" },
      { key: "effect", label: "Effect" },
    ],
    state.policies.map((policy) =>
      row(
        policy.id,
        {
          principal: evidence(policy.principal, policy.provenance, "run-total"),
          operation: evidence(policy.operation, policy.provenance, "run-total"),
          resource: evidence(policy.resource, policy.provenance, "run-total"),
          effect: evidence(policy.effect, policy.provenance, "current"),
        },
        entityFocus(policy.id, "authorization-gate"),
        policy.effect === "deny" ? "warning" : "positive",
      ),
    ),
    "No ACL policy has been added yet.",
  );
}

function buildAclGraph(
  input: AclInput,
  latest: AclAttempt | undefined,
  deniedCount: number,
) {
  return buildScenarioGraph("acl-least-privilege", input.snapshot, {
    active: Boolean(latest),
    inactiveEdgeIds:
      latest?.decision === "denied"
        ? new Set(["gate-producer", "producer-topic", "topic-group"])
        : undefined,
    metrics: {
      "principal-identity": evidence(
        latest?.principal ?? "No request",
        "simulated",
        "current",
      ),
      "authorization-gate": graphCountMetric(
        deniedCount,
        "simulated",
        "run-total",
      ),
    },
    states: {
      "authorization-gate": latest?.decision === "denied" ? "failed" : "active",
    },
  });
}

function buildAclNarrative(
  definition: AclDefinition,
  latest: AclAttempt | undefined,
) {
  if (!latest) {
    return narrative(
      "No authorization attempt has been evaluated yet.",
      "The simulated ACL gate evaluates identity, operation, and resource before Kafka.",
      definition.lesson.emptyCopy,
      "simulated",
    );
  }
  return narrative(
    `${latest.principal} was ${latest.decision} ${latest.operation} on ${latest.resource}.`,
    latest.decision === "denied"
      ? "No matching allow policy granted that exact principal, operation, and resource, so the path terminated before Kafka."
      : `Policy ${latest.matchedPolicyId ?? "default"} allowed the exact requested cell.`,
    latest.decision === "denied"
      ? "Grant only this missing cell, then repeat the operation."
      : "Try an unrelated operation to confirm least privilege still denies it.",
    latest.provenance,
  );
}

function buildAclEvaluations(input: AclInput): GateEvaluationModel[] {
  return input.scenarioState.attempts.map((attempt) => ({
    id: attempt.id,
    subject: attempt.principal,
    operation: attempt.operation,
    resource: attempt.resource,
    outcome: attempt.decision === "allowed" ? "allowed" : "denied",
    reason:
      attempt.matchedPolicyId == null
        ? "No matching allow policy."
        : `Matched ${attempt.matchedPolicyId}.`,
    provenance: attempt.provenance,
    focus: recordFocus(
      input.snapshot,
      attempt.id,
      undefined,
      undefined,
      "authorization-gate",
    ),
  }));
}
