"use client";

import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Circle,
  LoaderCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  CausalGraphModel,
  FocusRef,
} from "@/lib/client/scenario-experience/model";
import { focusRefKey } from "@/lib/client/scenario-experience/model";
import { cn } from "@/lib/client/cn";
import { EvidenceValueDisplay, evidenceScopeText } from "./evidence-value";
import { ProvenanceBadge } from "./provenance";

export function CausalGraphView({ graph, focus, onFocus }: CausalGraphProps) {
  return (
    <section
      className="overflow-hidden rounded-2xl border-[3px] border-teal-700 bg-sky-50 shadow-[6px_6px_0_rgba(15,118,110,0.14)]"
      aria-labelledby="causal-graph-heading"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-teal-700 bg-[#fffdf5] px-4 py-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-teal-800">
            Causal view
          </p>
          <h2
            id="causal-graph-heading"
            className="text-base font-black text-[#123047]"
          >
            Follow the change
          </h2>
        </div>
        <p className="text-xs font-bold text-[#466778]">
          Select a step to trace its evidence
        </p>
      </header>
      <div className="p-3 md:p-4">
        <CausalGraphList graph={graph} focus={focus} onFocus={onFocus} />
      </div>
    </section>
  );
}

function CausalGraphList({ graph, focus, onFocus }: CausalGraphProps) {
  return (
    <ol
      className="grid gap-0"
      aria-label="Causal steps"
      data-testid="causal-graph-list"
    >
      {graph.nodes.map((node, index) => {
        const outgoing = graph.edges.filter((edge) => edge.source === node.id);
        return (
          <li key={node.id}>
            <CausalNodeButton
              node={node}
              selected={isFocused(focus, node.focus)}
              onFocus={onFocus}
            />
            {index < graph.nodes.length - 1 || outgoing.length > 0 ? (
              <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center py-1">
                <ArrowDown
                  className="mx-auto text-teal-700 motion-safe:animate-pulse"
                  size={22}
                  aria-hidden="true"
                />
                <ul className="grid gap-1" aria-label={`From ${node.title}`}>
                  {outgoing.length > 0 ? (
                    outgoing.map((edge) => (
                      <li
                        key={edge.id}
                        className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border-l-2 border-dashed border-teal-700 px-3 py-2"
                      >
                        <span className="break-words text-xs font-extrabold leading-5 text-[#123047] [overflow-wrap:anywhere]">
                          {edge.label}
                        </span>
                        <ProvenanceBadge provenance={edge.provenance} />
                        <span className="text-xs font-bold text-[#466778]">
                          {evidenceScopeText(edge.scope)}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs font-bold text-[#466778]">Then</li>
                  )}
                </ul>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

type CausalGraphProps = {
  graph: CausalGraphModel;
  focus: FocusRef | null;
  onFocus: (focus: FocusRef) => void;
};

type CausalNode = CausalGraphModel["nodes"][number];

function CausalNodeButton({
  node,
  selected,
  onFocus,
}: {
  node: CausalNode;
  selected: boolean;
  onFocus: (focus: FocusRef) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-11 w-full rounded-2xl border-2 border-teal-700 bg-[#fffdf5] p-3 text-left shadow-[4px_4px_0_rgba(15,118,110,0.12)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200",
        selected && "bg-teal-100 outline-2 outline-offset-2 outline-teal-800",
      )}
      aria-pressed={selected}
      data-testid={`causal-node-${node.id}`}
      onClick={() => onFocus(node.focus)}
    >
      <span className="flex min-w-0 items-start gap-2">
        {selected ? (
          <CheckCircle2
            className="mt-0.5 shrink-0 text-teal-800"
            size={18}
            aria-hidden="true"
          />
        ) : (
          <Circle
            className="mt-0.5 shrink-0 text-teal-800"
            size={18}
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-black leading-5 text-[#123047] [overflow-wrap:anywhere]">
            {node.title}
          </span>
          <span className="mt-1 block break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
            {node.description}
          </span>
          {node.state ? <NodeStateLabel state={node.state} /> : null}
          {node.metric ? (
            <span className="mt-2 block">
              <EvidenceValueDisplay value={node.metric} />
            </span>
          ) : null}
          <ProvenanceBadge provenance={node.provenance} className="mt-2" />
        </span>
      </span>
    </button>
  );
}

function NodeStateLabel({
  state,
}: {
  state: NonNullable<CausalNode["state"]>;
}) {
  const appearance = nodeStateAppearance[state];
  const Icon = appearance.Icon;
  return (
    <span
      className={`mt-2 inline-flex min-h-7 items-center gap-1.5 rounded-full border-2 px-2 text-xs font-extrabold ${appearance.className}`}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {state.charAt(0).toUpperCase() + state.slice(1)}
    </span>
  );
}

function isFocused(focus: FocusRef | null, candidate: FocusRef) {
  return focus !== null && focusRefKey(focus) === focusRefKey(candidate);
}

const nodeStateAppearance: Record<
  NonNullable<CausalNode["state"]>,
  { Icon: LucideIcon; className: string }
> = {
  idle: {
    Icon: Circle,
    className: "border-slate-500 bg-slate-50 text-slate-800",
  },
  active: {
    Icon: LoaderCircle,
    className: "border-sky-700 bg-sky-50 text-sky-950",
  },
  complete: {
    Icon: CheckCircle2,
    className: "border-emerald-700 bg-emerald-50 text-emerald-950",
  },
  warning: {
    Icon: AlertTriangle,
    className: "border-amber-700 bg-amber-50 text-amber-950",
  },
  failed: {
    Icon: XCircle,
    className: "border-rose-700 bg-rose-50 text-rose-950",
  },
};
