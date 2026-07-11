import { Flame } from "lucide-react";
import type { HeatmapLensModel } from "@/lib/client/scenario-experience/model";
import { evidenceScopeText } from "../evidence-value";
import { ProvenanceBadge } from "../provenance";
import {
  CommonLensEvidence,
  LensFrame,
  type LensRendererProps,
} from "./lens-primitives";

export function HeatmapLens(props: LensRendererProps<HeatmapLensModel>) {
  const { lens } = props;
  return (
    <LensFrame
      lens={lens}
      eyebrow="Distribution comparison"
      icon={Flame}
      tone="rose"
    >
      {lens.phases.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {lens.phases.map((phase) => {
            const entries = Object.entries(phase.partitionCounts);
            let max = 1;
            for (const [, count] of entries) max = Math.max(max, count);
            return (
              <section
                key={phase.id}
                className="rounded-2xl border-2 border-rose-700 bg-rose-50 p-3"
                aria-labelledby={`heatmap-${phase.id}-title`}
              >
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4
                      id={`heatmap-${phase.id}-title`}
                      className="text-sm font-black text-[#123047]"
                    >
                      {phase.label}
                    </h4>
                    <p className="mt-1 text-xs font-bold text-[#466778]">
                      {phase.sampleSize} records ·{" "}
                      {evidenceScopeText(phase.scope)} · skew ratio{" "}
                      {phase.skewRatio}
                    </p>
                  </div>
                  <ProvenanceBadge provenance={phase.provenance} />
                </header>
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {entries.map(([partition, count]) => {
                    const intensity = Math.max(0.12, count / max);
                    const percentage =
                      phase.partitionPercentages[partition] ?? 0;
                    return (
                      <div
                        key={partition}
                        className="min-w-0 rounded-xl border-2 border-rose-700 p-3 text-rose-950"
                        style={{
                          backgroundColor: `color-mix(in srgb, #fb7185 ${Math.round(
                            intensity * 66,
                          )}%, #fffdf5)`,
                        }}
                      >
                        <dt className="break-words text-xs font-black uppercase tracking-[0.06em] [overflow-wrap:anywhere]">
                          Partition {partition}
                        </dt>
                        <dd className="mt-1 text-lg font-black">
                          {count}
                          <span className="ml-1 text-xs font-bold">
                            records
                          </span>
                          <span className="block text-xs font-black text-rose-900">
                            {formatPercentage(percentage)} of phase
                          </span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            );
          })}
        </div>
      ) : null}
      <CommonLensEvidence {...props} showEmpty={lens.phases.length === 0} />
    </LensFrame>
  );
}

function formatPercentage(percentage: number) {
  return `${percentage.toFixed(1)}%`;
}
