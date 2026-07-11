import { CircleDot, FlaskConical, Sigma } from "lucide-react";
import { useId } from "react";
import type { Provenance } from "@/lib/client/scenario-experience/model";
import { cn } from "@/lib/client/cn";
import { provenanceStyle } from "./learning-style";

const provenanceIcon = {
  observed: CircleDot,
  derived: Sigma,
  simulated: FlaskConical,
} as const;

const provenanceExplanation = {
  observed: "Reported directly by the Kafka broker or runtime.",
  derived: "Calculated from observed or authoritative scenario state.",
  simulated:
    "Created by a deterministic teaching experiment, not observed broker behavior.",
} as const;

const tooltipAlignment = {
  observed: "left-0",
  derived: "left-1/2 -translate-x-1/2",
  simulated: "right-0",
} as const;

export function ProvenanceBadge({
  provenance,
  className,
}: {
  provenance: Provenance;
  className?: string;
}) {
  const Icon = provenanceIcon[provenance];
  const style = provenanceStyle[provenance];

  return (
    <span
      className={cn(
        "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border-2 px-2 text-xs font-extrabold leading-none",
        style.badge,
        className,
      )}
      data-provenance={provenance}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {style.label}
    </span>
  );
}

export function ProvenanceLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-wrap gap-x-4 gap-y-2", className)}
      aria-label="Evidence provenance"
    >
      {(["observed", "derived", "simulated"] as const).map((provenance) => (
        <ProvenanceLegendItem key={provenance} provenance={provenance} />
      ))}
    </div>
  );
}

function ProvenanceLegendItem({ provenance }: { provenance: Provenance }) {
  const tooltipId = useId();

  return (
    <span
      aria-describedby={tooltipId}
      className="group relative inline-flex cursor-help rounded-full outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
      tabIndex={0}
    >
      <ProvenanceBadge provenance={provenance} />
      <span
        className={cn(
          "pointer-events-none invisible absolute top-[calc(100%+0.5rem)] z-50 w-64 max-w-[calc(100vw-2rem)] rounded-xl border-2 border-teal-800 bg-[#123047] px-3 py-2 text-xs font-bold leading-5 text-white opacity-0 shadow-[4px_4px_0_rgba(15,118,110,0.2)] transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
          tooltipAlignment[provenance],
        )}
        id={tooltipId}
        role="tooltip"
      >
        {provenanceExplanation[provenance]}
      </span>
    </span>
  );
}
