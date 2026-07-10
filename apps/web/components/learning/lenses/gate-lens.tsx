"use client";

import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import type { GateLensModel } from "@/lib/client/scenario-experience/model";
import { ProvenanceBadge } from "../provenance";
import {
  CommonLensEvidence,
  FocusableEvidence,
  LensFrame,
  StatusLabel,
  focusMatches,
  type LensRendererProps,
} from "./lens-primitives";

export function GateLens(props: LensRendererProps<GateLensModel>) {
  const { lens, focus, onFocus } = props;
  return (
    <LensFrame
      lens={lens}
      eyebrow="Decision gate"
      icon={ShieldCheck}
      tone="teal"
    >
      {lens.matrixCells && lens.matrixCells.length > 0 ? (
        <section aria-labelledby="gate-policy-matrix-title">
          <h4
            id="gate-policy-matrix-title"
            className="text-sm font-black text-[#123047]"
          >
            Principal × operation × resource matrix
          </h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {lens.matrixCells.map((cell) => {
              const missing = cell.effect === "missing";
              return (
                <li key={cell.id} data-highlighted={cell.highlighted}>
                  <FocusableEvidence
                    focus={cell.focus}
                    selected={focusMatches(focus, cell.focus)}
                    onFocus={onFocus}
                    label={`Focus ${cell.principal} ${cell.operation} ${cell.resource} policy cell`}
                    className={matrixCellClassName(
                      cell.effect,
                      cell.highlighted,
                    )}
                  >
                    <span className="grid gap-2">
                      <span className="break-words text-sm font-black text-[#123047] [overflow-wrap:anywhere]">
                        {cell.principal} × {cell.operation} × {cell.resource}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border-2 border-current px-2 py-1 text-xs font-black uppercase tracking-[0.06em]">
                          {missing ? "No matching allow" : cell.effect}
                        </span>
                        {cell.highlighted ? (
                          <span className="text-xs font-black text-rose-900">
                            Highlighted request cell
                          </span>
                        ) : null}
                      </span>
                      <ProvenanceBadge provenance={cell.provenance} />
                    </span>
                  </FocusableEvidence>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {lens.evaluations.length > 0 ? (
        <ul className="grid gap-2" aria-label="Gate evaluations">
          {lens.evaluations.map((evaluation) => {
            const allowed = evaluation.outcome === "allowed";
            const OutcomeIcon = allowed ? CheckCircle2 : XCircle;
            return (
              <li key={evaluation.id}>
                <FocusableEvidence
                  focus={evaluation.focus}
                  selected={focusMatches(focus, evaluation.focus)}
                  onFocus={onFocus}
                  label={`Focus ${evaluation.subject} ${evaluation.outcome} evaluation`}
                  className={
                    allowed
                      ? "border-emerald-700 bg-emerald-50"
                      : "border-rose-700 bg-rose-50"
                  }
                >
                  <span className="grid gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:items-start">
                    <span
                      className={allowed ? "text-emerald-800" : "text-rose-800"}
                    >
                      <OutcomeIcon
                        size={28}
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-black text-[#123047] [overflow-wrap:anywhere]">
                        {evaluation.subject}
                        {evaluation.operation
                          ? ` · ${evaluation.operation}`
                          : ""}
                        {evaluation.resource ? ` · ${evaluation.resource}` : ""}
                      </span>
                      <span className="mt-1 block break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
                        {evaluation.reason}
                      </span>
                      <ProvenanceBadge
                        provenance={evaluation.provenance}
                        className="mt-2"
                      />
                    </span>
                    <StatusLabel status={evaluation.outcome} />
                  </span>
                </FocusableEvidence>
              </li>
            );
          })}
        </ul>
      ) : null}
      <CommonLensEvidence
        {...props}
        showEmpty={lens.evaluations.length === 0}
      />
    </LensFrame>
  );
}

function matrixCellClassName(
  effect: "allow" | "deny" | "missing",
  highlighted: boolean,
) {
  if (highlighted && effect !== "allow") {
    return "border-rose-800 bg-rose-100 outline-2 outline-offset-2 outline-rose-800";
  }
  if (effect === "allow") return "border-emerald-700 bg-emerald-50";
  if (effect === "deny") return "border-rose-700 bg-rose-50";
  return "border-amber-700 bg-amber-50";
}
