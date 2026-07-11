"use client";

import { ArrowRight, Workflow } from "lucide-react";
import type { PipelineLensModel } from "@/lib/client/scenario-experience/model";
import { ProvenanceBadge } from "../provenance";
import {
  CommonLensEvidence,
  FocusableEvidence,
  LensFrame,
  StatusLabel,
  focusMatches,
  type LensRendererProps,
} from "./lens-primitives";

export function PipelineLens(props: LensRendererProps<PipelineLensModel>) {
  const { lens, focus, onFocus } = props;
  return (
    <LensFrame lens={lens} eyebrow="Causal pipeline" icon={Workflow} tone="sky">
      {lens.stages.length > 0 ? (
        <ol
          className="flex items-stretch overflow-x-auto pb-2"
          aria-label="Pipeline stages"
        >
          {lens.stages.map((stage, index) => (
            <li key={stage.id} className="flex items-center">
              <FocusableEvidence
                focus={stage.focus}
                selected={focusMatches(focus, stage.focus)}
                onFocus={onFocus}
                label={`Focus pipeline stage ${stage.title}`}
                className="w-44 shrink-0"
              >
                <span className="block break-words text-sm font-black leading-5 text-[#123047] [overflow-wrap:anywhere]">
                  {stage.title}
                </span>
                <span className="mt-2 flex flex-wrap gap-2">
                  <StatusLabel status={stage.status} />
                  <ProvenanceBadge provenance={stage.provenance} />
                </span>
              </FocusableEvidence>
              {index < lens.stages.length - 1 ? (
                <ArrowRight
                  className="mx-2 shrink-0 text-teal-700 motion-safe:animate-pulse"
                  size={22}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <CommonLensEvidence {...props} showEmpty={lens.stages.length === 0} />
    </LensFrame>
  );
}
