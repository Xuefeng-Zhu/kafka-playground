"use client";

import { Brackets, Eye, EyeOff } from "lucide-react";
import type { TransactionLensModel } from "@/lib/client/scenario-experience/model";
import { ProvenanceBadge } from "../provenance";
import {
  CommonLensEvidence,
  FocusableEvidence,
  LensFrame,
  StatusLabel,
  focusMatches,
  type LensRendererProps,
} from "./lens-primitives";

export function TransactionLens(
  props: LensRendererProps<TransactionLensModel>,
) {
  const { lens, focus, onFocus } = props;
  return (
    <LensFrame
      lens={lens}
      eyebrow="Atomic visibility"
      icon={Brackets}
      tone="violet"
    >
      {lens.boundaries.length > 0 ? (
        <ul className="grid gap-3" aria-label="Transaction boundaries">
          {lens.boundaries.map((boundary) => (
            <li key={boundary.id}>
              <FocusableEvidence
                focus={boundary.focus}
                selected={focusMatches(focus, boundary.focus)}
                onFocus={onFocus}
                label={`Focus transaction ${boundary.id}`}
                className="border-violet-700 bg-violet-50"
              >
                <span className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-violet-700/30 pb-2">
                  <span className="min-w-0">
                    <span className="block text-xs font-black uppercase tracking-[0.08em] text-violet-800">
                      Transaction boundary
                    </span>
                    <code className="mt-1 block break-all text-sm font-black text-[#123047]">
                      {boundary.id}
                    </code>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <StatusLabel status={boundary.status} />
                    <ProvenanceBadge provenance={boundary.provenance} />
                  </span>
                </span>
                <span className="mt-3 grid gap-3 sm:grid-cols-2">
                  <RecordIdList
                    title="Inside boundary"
                    ids={boundary.recordIds}
                    icon={EyeOff}
                    emptyCopy="No staged records"
                  />
                  <RecordIdList
                    title="Visible to consumers"
                    ids={boundary.visibleRecordIds}
                    icon={Eye}
                    emptyCopy="Nothing visible"
                  />
                </span>
              </FocusableEvidence>
            </li>
          ))}
        </ul>
      ) : null}
      <CommonLensEvidence {...props} showEmpty={lens.boundaries.length === 0} />
    </LensFrame>
  );
}

function RecordIdList({
  title,
  ids,
  icon: Icon,
  emptyCopy,
}: {
  title: string;
  ids: readonly string[];
  icon: typeof Eye;
  emptyCopy: string;
}) {
  return (
    <span className="min-w-0 rounded-xl border-2 border-violet-700/50 bg-white p-3">
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-violet-800">
        <Icon size={16} aria-hidden="true" />
        {title}
      </span>
      {ids.length > 0 ? (
        <span className="mt-2 grid gap-1">
          {ids.map((id) => (
            <code
              key={id}
              className="block break-all text-xs font-bold leading-5 text-[#123047]"
            >
              {id}
            </code>
          ))}
        </span>
      ) : (
        <span className="mt-2 block text-xs font-semibold text-[#466778]">
          {emptyCopy}
        </span>
      )}
    </span>
  );
}
