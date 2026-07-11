"use client";

import { ArrowRight, UsersRound } from "lucide-react";
import type { AssignmentLensModel } from "@/lib/client/scenario-experience/model";
import { ProvenanceBadge } from "../provenance";
import {
  CommonLensEvidence,
  FocusableEvidence,
  LensFrame,
  StatusLabel,
  focusMatches,
  type LensRendererProps,
} from "./lens-primitives";

export function AssignmentLens(props: LensRendererProps<AssignmentLensModel>) {
  const { lens, focus, onFocus } = props;
  return (
    <LensFrame
      lens={lens}
      eyebrow="Ownership change"
      icon={UsersRound}
      tone="violet"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl border-2 border-violet-700 bg-violet-50 px-3 py-3 text-center">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-violet-800">
            Before
          </p>
          <p className="mt-1 break-words text-sm font-black text-[#123047] [overflow-wrap:anywhere]">
            {lens.beforeLabel}
          </p>
        </div>
        <ArrowRight className="text-violet-700" size={22} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-violet-800">
            After
          </p>
          <p className="mt-1 break-words text-sm font-black text-[#123047] [overflow-wrap:anywhere]">
            {lens.afterLabel}
          </p>
        </div>
      </div>
      {lens.deltas.length > 0 ? (
        <ul
          className="grid gap-2 sm:grid-cols-2"
          aria-label="Assignment deltas"
        >
          {lens.deltas.map((delta) => (
            <li key={delta.id}>
              <FocusableEvidence
                focus={delta.focus}
                selected={focusMatches(focus, delta.focus)}
                onFocus={onFocus}
                label={`Focus partition ${delta.partition} assignment`}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-black text-[#123047]">
                    Partition {delta.partition}
                  </span>
                  <StatusLabel status={delta.status} />
                </span>
                <span className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <span className="break-words text-xs font-bold text-[#466778] [overflow-wrap:anywhere]">
                    {delta.beforeOwner ?? "Unassigned"}
                  </span>
                  <ArrowRight
                    size={16}
                    className="text-teal-700"
                    aria-hidden="true"
                  />
                  <span className="break-words text-right text-xs font-black text-[#123047] [overflow-wrap:anywhere]">
                    {delta.afterOwner ?? "Unassigned"}
                  </span>
                </span>
                <ProvenanceBadge
                  provenance={delta.provenance}
                  className="mt-2"
                />
              </FocusableEvidence>
            </li>
          ))}
        </ul>
      ) : null}
      <CommonLensEvidence {...props} showEmpty={lens.deltas.length === 0} />
    </LensFrame>
  );
}
