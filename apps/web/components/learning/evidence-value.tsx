import type {
  EvidenceScope,
  EvidenceValue,
} from "@/lib/client/scenario-experience/model";
import { ProvenanceBadge } from "./provenance";

export function evidenceValueText(value: EvidenceValue) {
  return value.display ?? String(value.value);
}

export function evidenceScopeText(scope: EvidenceScope, scopeLabel?: string) {
  return scopeLabel ?? scopeLabels[scope];
}

export function EvidenceValueDisplay({
  value,
  showProvenance = true,
  secondary,
}: {
  value: EvidenceValue;
  showProvenance?: boolean;
  secondary?: string;
}) {
  const display = evidenceValueText(value);
  const scope = evidenceScopeText(value.scope, value.scopeLabel);

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 break-words text-sm font-extrabold leading-5 text-[#123047] [overflow-wrap:anywhere]">
          {display}
        </span>
        {showProvenance ? (
          <ProvenanceBadge provenance={value.provenance} />
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold leading-5 text-[#466778]">
        <span>{scope}</span>
        {secondary ? <ExpandableIdentifier value={secondary} /> : null}
      </div>
    </div>
  );
}

export function ExpandableIdentifier({ value }: { value: string }) {
  return (
    <details className="group max-w-full">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg px-1 font-extrabold text-teal-800 underline decoration-dotted underline-offset-4 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Show ID</span>
        <span className="hidden group-open:inline">Hide ID</span>
      </summary>
      <code className="block max-w-full break-all rounded-lg border-2 border-teal-700 bg-white px-2 py-1 text-xs font-bold leading-5 text-[#123047]">
        {value}
      </code>
    </details>
  );
}

const scopeLabels = {
  current: "Current state",
  "run-total": "Full run",
  "recent-window": "Recent window",
} as const;
