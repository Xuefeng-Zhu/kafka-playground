"use client";

import { ArrowRight, DatabaseZap } from "lucide-react";
import type { ProjectionLensModel } from "@/lib/client/scenario-experience/model";
import { EvidenceTable } from "../evidence-table";
import { EvidenceValueDisplay } from "../evidence-value";
import {
  CommonLensEvidence,
  LensFrame,
  type LensRendererProps,
} from "./lens-primitives";

export function ProjectionLens(props: LensRendererProps<ProjectionLensModel>) {
  const { lens, focus, onFocus } = props;
  return (
    <LensFrame
      lens={lens}
      eyebrow="Replay and rebuild"
      icon={DatabaseZap}
      tone="sky"
    >
      <div className="grid gap-3 rounded-2xl border-2 border-sky-700 bg-sky-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-sky-900">
            Immutable source
          </p>
          <p className="mt-1 text-sm font-black text-[#123047]">
            {lens.source.rows.length} visible records
          </p>
        </div>
        <ArrowRight className="text-sky-800" size={22} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-sky-900">
            Projection cursor
          </p>
          <div className="mt-1">
            <EvidenceValueDisplay value={lens.cursor} />
          </div>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <EvidenceTable table={lens.source} focus={focus} onFocus={onFocus} />
        <EvidenceTable
          table={lens.projection}
          focus={focus}
          onFocus={onFocus}
        />
      </div>
      <CommonLensEvidence {...props} showEmpty={false} />
    </LensFrame>
  );
}
