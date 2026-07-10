"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Gauge,
  Minus,
} from "lucide-react";
import type { CapacityLensModel } from "@/lib/client/scenario-experience/model";
import { EvidenceTable } from "../evidence-table";
import { EvidenceValueDisplay } from "../evidence-value";
import {
  CommonLensEvidence,
  LensFrame,
  type LensRendererProps,
} from "./lens-primitives";

const trendMeta = {
  empty: {
    label: "No lag",
    icon: Minus,
    style: "border-emerald-700 bg-emerald-50 text-emerald-950",
  },
  rising: {
    label: "Lag rising",
    icon: ArrowUpRight,
    style: "border-rose-700 bg-rose-50 text-rose-950",
  },
  falling: {
    label: "Lag falling",
    icon: ArrowDownRight,
    style: "border-emerald-700 bg-emerald-50 text-emerald-950",
  },
  steady: {
    label: "Lag steady",
    icon: ArrowRight,
    style: "border-amber-700 bg-amber-50 text-amber-950",
  },
} as const;

export function CapacityLens(props: LensRendererProps<CapacityLensModel>) {
  const { lens, focus, onFocus } = props;
  const trend = trendMeta[lens.trend];
  const TrendIcon = trend.icon;
  return (
    <LensFrame
      lens={lens}
      eyebrow="Capacity pressure"
      icon={Gauge}
      tone="amber"
    >
      <div className="grid overflow-hidden rounded-2xl border-2 border-amber-700 bg-white sm:grid-cols-2 sm:divide-x-2 sm:divide-amber-700">
        <div className={`flex min-h-24 items-center gap-3 p-4 ${trend.style}`}>
          <TrendIcon size={28} strokeWidth={2.5} aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em]">
              Current trend
            </p>
            <p className="mt-1 text-lg font-black">{trend.label}</p>
          </div>
        </div>
        <div className="min-h-24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-amber-900">
            Estimated drain time
          </p>
          <div className="mt-1">
            <EvidenceValueDisplay value={lens.drainEstimate} />
          </div>
        </div>
      </div>
      <EvidenceTable table={lens.partitions} focus={focus} onFocus={onFocus} />
      <CommonLensEvidence {...props} showEmpty={false} />
    </LensFrame>
  );
}
