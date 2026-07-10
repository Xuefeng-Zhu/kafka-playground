"use client";

import { Clock3, RotateCcw } from "lucide-react";
import type { LifecycleLensModel } from "@/lib/client/scenario-experience/model";
import { ProvenanceBadge } from "../provenance";
import {
  CommonLensEvidence,
  FocusableEvidence,
  LensFrame,
  StatusLabel,
  focusMatches,
  type LensRendererProps,
} from "./lens-primitives";

export function LifecycleLens(props: LensRendererProps<LifecycleLensModel>) {
  const { lens, focus, onFocus } = props;
  return (
    <LensFrame
      lens={lens}
      eyebrow="Record lifecycle"
      icon={RotateCcw}
      tone="amber"
    >
      {lens.records.length > 0 ? (
        <ol className="relative grid gap-2 before:absolute before:bottom-6 before:left-[1.6rem] before:top-6 before:w-0.5 before:bg-amber-600/40">
          {lens.records.map((record) => (
            <li key={record.id} className="relative pl-12">
              <span className="absolute left-3 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-700 bg-amber-50 text-amber-900">
                <Clock3 size={14} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <FocusableEvidence
                focus={record.focus}
                selected={focusMatches(focus, record.focus)}
                onFocus={onFocus}
                label={`Focus lifecycle stage ${record.stage} for ${record.recordId}`}
              >
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block break-all text-xs font-black uppercase tracking-[0.08em] text-amber-900">
                      {record.recordId}
                    </span>
                    <span className="mt-1 block break-words text-sm font-black text-[#123047] [overflow-wrap:anywhere]">
                      {record.stage} · attempt {record.attempt}
                    </span>
                  </span>
                  <StatusLabel status={record.outcome} />
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  {record.backoffMs !== undefined ? (
                    <span className="text-xs font-extrabold text-[#466778]">
                      Backoff: {record.backoffMs} ms
                    </span>
                  ) : null}
                  <ProvenanceBadge provenance={record.provenance} />
                </span>
              </FocusableEvidence>
            </li>
          ))}
        </ol>
      ) : null}
      <CommonLensEvidence {...props} showEmpty={lens.records.length === 0} />
    </LensFrame>
  );
}
