import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import { ProvenanceBadge } from "@/components/learning/provenance";
import { evidenceScopeText } from "@/components/learning/evidence-value";
import type { ScenarioExploreTopologyProjection } from "@/lib/client/scenario-experience/explore-topology";
import type {
  CausalGraphNode,
  Provenance,
} from "@/lib/client/scenario-experience/model";

export function TopologyStep({
  provenance,
  children,
}: {
  provenance: Provenance;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <div className="absolute right-2 top-2 z-10">
        <ProvenanceBadge provenance={provenance} />
      </div>
      <div className="pt-9">{children}</div>
    </li>
  );
}

export function ScenarioTopologyConnector({
  edge,
  sourceTitle,
  targetTitle,
}: {
  edge: ScenarioExploreTopologyProjection["edges"][number];
  sourceTitle: string;
  targetTitle: string;
}) {
  const isFeedback = edge.kind === "feedback";
  const DirectionIcon = isFeedback ? ArrowUp : ArrowDown;
  return (
    <li
      aria-label={`${sourceTitle} ${isFeedback ? "back to" : "to"} ${targetTitle}: ${edge.label}. ${humanize(edge.kind)}. ${humanize(edge.provenance)}.`}
      className={`flex min-h-11 items-center gap-3 rounded-xl border-l-[3px] border-dashed px-3 py-2 ${
        isFeedback
          ? "border-violet-600 bg-violet-50"
          : edge.active
            ? "border-emerald-600 bg-emerald-50"
            : "border-teal-700 bg-[#fffdf5]/80"
      }`}
      data-direction={isFeedback ? "backward" : "forward"}
      data-edge-kind={edge.kind}
      data-provenance={edge.provenance}
      data-testid={`semantic-scenario-edge-${edge.id}`}
    >
      <DirectionIcon
        className={`shrink-0 ${isFeedback ? "text-violet-700" : "text-teal-700"}`}
        data-testid={`semantic-edge-direction-${edge.id}`}
        size={18}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-xs font-black leading-5 text-[#123047] [overflow-wrap:anywhere]">
          {edge.label}
        </span>
        <span className="block break-words text-xs font-semibold leading-4 text-[#466778] [overflow-wrap:anywhere]">
          {sourceTitle} {isFeedback ? "↩ back to" : "→"} {targetTitle} ·{" "}
          {humanize(edge.kind)} · {evidenceScopeText(edge.scope)}
        </span>
      </span>
      {edge.active ? (
        <span className="rounded-full border-2 border-emerald-600 bg-emerald-100 px-2 py-1 text-xs font-black uppercase tracking-[0.08em] text-emerald-900">
          Active route
        </span>
      ) : null}
      <ProvenanceBadge provenance={edge.provenance} />
    </li>
  );
}

export function TopologyConnector({
  label,
  provenance,
  testId,
}: {
  label: string;
  provenance: Provenance;
  testId: string;
}) {
  return (
    <li
      aria-label={`${label}. ${humanize(provenance)}.`}
      className="flex min-h-11 flex-wrap items-center justify-center gap-2 text-center text-xs font-extrabold text-teal-800"
      data-provenance={provenance}
      data-testid={testId}
    >
      <ArrowDown size={18} aria-hidden />
      <span>{label}</span>
      <ProvenanceBadge provenance={provenance} />
    </li>
  );
}

export function ScenarioNodeState({
  state,
}: {
  state: CausalGraphNode["state"];
}) {
  if (!state) return null;
  return (
    <span className="rounded-full border-2 border-sky-700 bg-sky-50 px-2 py-1 text-xs font-black uppercase tracking-[0.08em] text-sky-900">
      {humanize(state)}
    </span>
  );
}

function humanize(value: string) {
  return value.replaceAll("-", " ");
}
