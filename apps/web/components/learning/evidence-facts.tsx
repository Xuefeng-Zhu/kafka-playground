import type { EvidenceFact } from "@/lib/client/scenario-experience/model";
import { cn } from "@/lib/client/cn";
import { EvidenceValueDisplay } from "./evidence-value";
import { emphasisStyle } from "./learning-style";

export function EvidenceFactList({
  facts,
  className,
  compact = false,
}: {
  facts: readonly EvidenceFact[];
  className?: string;
  compact?: boolean;
}) {
  return (
    <dl
      className={cn(
        "divide-y-2 divide-teal-700/25 overflow-hidden rounded-2xl border-2 border-teal-700 bg-white",
        className,
      )}
    >
      {facts.map((fact) => (
        <div
          key={fact.id}
          className={cn(
            "grid min-w-0 gap-2 px-3 py-3",
            !compact &&
              "sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1.3fr)] sm:items-start",
            fact.emphasis && emphasisStyle[fact.emphasis],
          )}
        >
          <dt className="text-xs font-black uppercase leading-5 tracking-[0.08em] text-teal-900">
            {fact.label}
          </dt>
          <dd className="min-w-0">
            <EvidenceValueDisplay value={fact.value} />
            {fact.detail ? (
              <p className="mt-1 break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
                {fact.detail}
              </p>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function EvidenceFactStrip({
  facts,
}: {
  facts: readonly EvidenceFact[];
}) {
  return (
    <dl className="grid divide-y-2 divide-teal-700/25 overflow-hidden rounded-2xl border-2 border-teal-700 bg-white sm:grid-cols-3 sm:divide-x-2 sm:divide-y-0">
      {facts.map((fact) => (
        <div key={fact.id} className="min-w-0 px-3 py-3">
          <dt className="text-xs font-black uppercase leading-5 tracking-[0.08em] text-teal-900">
            {fact.label}
          </dt>
          <dd className="mt-1 min-w-0">
            <EvidenceValueDisplay value={fact.value} />
            {fact.detail ? (
              <p className="mt-1 break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
                {fact.detail}
              </p>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
