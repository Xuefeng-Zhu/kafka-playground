"use client";

import { ArrowRight, Route } from "lucide-react";
import type { RoutingLensModel } from "@/lib/client/scenario-experience/model";
import { ProvenanceBadge } from "../provenance";
import {
  CommonLensEvidence,
  FocusableEvidence,
  LensFrame,
  focusMatches,
  type LensRendererProps,
} from "./lens-primitives";

export function RoutingLens(props: LensRendererProps<RoutingLensModel>) {
  const { lens, focus, onFocus } = props;
  return (
    <LensFrame lens={lens} eyebrow="Routing trace" icon={Route} tone="rose">
      {lens.traces.length > 0 ? (
        <ol className="grid gap-2" aria-label="Key routing traces">
          {lens.traces.map((trace) => (
            <li key={trace.id}>
              <FocusableEvidence
                focus={trace.focus}
                selected={focusMatches(focus, trace.focus)}
                onFocus={onFocus}
                label={`Focus routing trace for key ${trace.key}`}
              >
                <span className="grid gap-2 sm:grid-cols-[minmax(0,0.65fr)_auto_minmax(0,1fr)] sm:items-center">
                  <span className="min-w-0">
                    <span className="block text-xs font-black uppercase tracking-[0.08em] text-rose-800">
                      Key
                    </span>
                    <code className="mt-1 block break-all text-base font-black text-[#123047]">
                      {trace.key}
                    </code>
                  </span>
                  <ArrowRight
                    className="hidden text-teal-700 sm:block"
                    size={22}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-black text-[#123047] [overflow-wrap:anywhere]">
                      Partition {trace.partition}
                      {trace.offset !== undefined
                        ? ` · offset ${trace.offset}`
                        : ""}
                    </span>
                    <span className="mt-1 block break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
                      {trace.reason}
                    </span>
                    <ProvenanceBadge
                      provenance={trace.provenance}
                      className="mt-2"
                    />
                  </span>
                </span>
              </FocusableEvidence>
            </li>
          ))}
        </ol>
      ) : null}
      <CommonLensEvidence {...props} showEmpty={lens.traces.length === 0} />
    </LensFrame>
  );
}
