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
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const allowed = scenarioState.attempts.filter(
      (attempt) =>
        attempt.decision === "allowed" && !attempt.terminatedBeforeKafka,
    );
    const denied = scenarioState.attempts.filter(
      (attempt) =>
        attempt.decision === "denied" && attempt.terminatedBeforeKafka,
    );
    const facts = [
      fact(
        "acl-policy-count",
        "Policy cells",
        evidence(scenarioState.policies.length, "simulated", "run-total"),
      ),
      fact(
        "acl-allowed",
        "Allowed to Kafka",
        evidence(allowed.length, "simulated", "run-total"),
        {
          emphasis: allowed.length > 0 ? "positive" : "neutral",
        },
      ),
      fact(
        "acl-denied",
        "Denied before Kafka",
        evidence(denied.length, "simulated", "run-total"),
        {
          emphasis: denied.length > 0 ? "warning" : "neutral",
        },
      ),
      fact(
        "acl-highlighted-cell",
        "Highlighted cell",
        evidence(
          scenarioState.lastHighlightedCell == null
            ? "None"
            : `${scenarioState.lastHighlightedCell.principal} × ${scenarioState.lastHighlightedCell.operation} × ${scenarioState.lastHighlightedCell.resource}`,
          "simulated",
          "current",
        ),
      ),
    ];
    const attemptTable = table(
      "acl-attempts",
      "Authorization attempts before Kafka",
      [
        { key: "principal", label: "Principal" },
        { key: "operation", label: "Operation" },
        { key: "resource", label: "Resource" },
        { key: "decision", label: "Decision" },
        { key: "kafka", label: "Reached Kafka" },
      ],
      scenarioState.attempts.map((attempt) =>
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
            resource: evidence(
              attempt.resource,
              attempt.provenance,
              "run-total",
            ),
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
      definition.lesson.emptyCopy,
    );
    const policyTable = table(
      "acl-policy-matrix",
      "Principal × operation × resource policy matrix",
      [
        { key: "principal", label: "Principal" },
        { key: "operation", label: "Operation" },
        { key: "resource", label: "Resource" },
        { key: "effect", label: "Effect" },
      ],
      scenarioState.policies.map((policy) =>
        row(
          policy.id,
          {
            principal: evidence(
              policy.principal,
              policy.provenance,
              "run-total",
            ),
            operation: evidence(
              policy.operation,
              policy.provenance,
              "run-total",
            ),
            resource: evidence(policy.resource, policy.provenance, "run-total"),
            effect: evidence(policy.effect, policy.provenance, "current"),
          },
          entityFocus(policy.id, "authorization-gate"),
          policy.effect === "deny" ? "warning" : "positive",
        ),
      ),
      "No ACL policy has been added yet.",
    );
    const latest = scenarioState.attempts.at(-1);
    const matrixCells = aclMatrixCells(scenarioState);
    const graph = buildScenarioGraph("acl-least-privilege", snapshot, {
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
          denied.length,
          "simulated",
          "run-total",
        ),
      },
      states: {
        "authorization-gate":
          latest?.decision === "denied" ? "failed" : "active",
      },
    });
    const frameNarrative = latest
      ? narrative(
          `${latest.principal} was ${latest.decision} ${latest.operation} on ${latest.resource}.`,
          latest.decision === "denied"
            ? "No matching allow policy granted that exact principal, operation, and resource, so the path terminated before Kafka."
            : `Policy ${latest.matchedPolicyId ?? "default"} allowed the exact requested cell.`,
          latest.decision === "denied"
            ? "Grant only this missing cell, then repeat the operation."
            : "Try an unrelated operation to confirm least privilege still denies it.",
          latest.provenance,
        )
      : narrative(
          "No authorization attempt has been evaluated yet.",
          "The simulated ACL gate evaluates identity, operation, and resource before Kafka.",
          definition.lesson.emptyCopy,
          "simulated",
        );
    const evaluations: GateEvaluationModel[] = scenarioState.attempts.map(
      (attempt) => ({
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
          snapshot,
          attempt.id,
          undefined,
          undefined,
          "authorization-gate",
        ),
      }),
    );

    return createFrame(
      definition,
      graph,
      {
        kind: "gate",
        title: "Least-privilege policy matrix",
        summary:
          "Denied operations terminate before producer and topic boundaries.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: attemptTable,
        sections: [
          {
            id: "acl-policy-cells",
            title: "Policy cells",
            facts: [facts[0], facts[3]],
            table: policyTable,
          },
        ],
        evaluations,
        matrixCells,
      },
      frameNarrative,
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
        latest ? [facts[1], facts[2]] : [],
      ),
    );
  },
);
