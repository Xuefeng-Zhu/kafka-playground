"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
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

export function CausalGraphRail({ graph, focus, onFocus }: CausalGraphProps) {
  return (
    <div className="overflow-x-auto pb-2" data-testid="causal-graph-rail">
      <ol className="flex min-w-max items-stretch" aria-label="Causal steps">
        {graph.nodes.map((node, index) => {
          const outgoing = graph.edges.filter(
            (edge) => edge.source === node.id,
          );
          return (
            <li key={node.id} className="flex items-center">
              <CausalNodeButton
                node={node}
                selected={isFocused(focus, node.focus)}
                onFocus={onFocus}
              />
              {index < graph.nodes.length - 1 || outgoing.length > 0 ? (
                <div className="flex w-32 shrink-0 flex-col items-center px-2 text-center">
                  <ArrowRight
                    className="text-teal-700 motion-safe:animate-pulse"
                    size={24}
                    aria-hidden="true"
                  />
                  {outgoing.length > 0 ? (
                    <ul
                      className="mt-1 grid gap-1"
                      aria-label={`From ${node.title}`}
                    >
                      {outgoing.map((edge) => (
                        <li key={edge.id} className="min-w-0">
                          <span className="block break-words text-xs font-extrabold leading-4 text-[#123047] [overflow-wrap:anywhere]">
                            {edge.label}
                          </span>
                          <ProvenanceBadge
                            provenance={edge.provenance}
                            className="mt-1"
                          />
                          <span className="mt-1 block text-xs font-bold text-[#466778]">
                            {evidenceScopeText(edge.scope)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs font-bold text-[#466778]">
                      Then
                    </span>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <UnplacedEdges graph={graph} />
    </div>
  );
}

export function CausalGraphList({
  graph,
  focus,
  onFocus,
  responsive = false,
}: CausalGraphProps & { responsive?: boolean }) {
  return (
    <ol
      className={cn(
        "grid gap-0",
        responsive && "md:flex md:min-w-max md:items-stretch md:pb-2",
      )}
      aria-label="Causal steps"
      data-testid="causal-graph-list"
    >
      {graph.nodes.map((node, index) => {
        const outgoing = graph.edges.filter((edge) => edge.source === node.id);
        return (
          <li
            key={node.id}
            className={cn(responsive && "md:flex md:items-center")}
          >
            <CausalNodeButton
              node={node}
              selected={isFocused(focus, node.focus)}
              onFocus={onFocus}
              wide
              responsiveWide={responsive}
            />
            {index < graph.nodes.length - 1 || outgoing.length > 0 ? (
              <div
                className={cn(
                  "grid grid-cols-[2.75rem_minmax(0,1fr)] items-center py-1",
                  responsive &&
                    "md:flex md:w-32 md:shrink-0 md:flex-col md:justify-center md:px-2 md:text-center",
                )}
              >
                <ArrowDown
                  className={cn(
                    "mx-auto text-teal-700 motion-safe:animate-pulse",
                    responsive && "md:hidden",
                  )}
                  size={22}
                  aria-hidden="true"
                />
                {responsive ? (
                  <ArrowRight
                    className="hidden text-teal-700 motion-safe:animate-pulse md:block"
                    size={24}
                    aria-hidden="true"
                  />
                ) : null}
                <ul
                  className={cn("grid gap-1", responsive && "md:mt-1")}
                  aria-label={`From ${node.title}`}
                >
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
  wide = false,
  responsiveWide = false,
}: {
  node: CausalNode;
  selected: boolean;
  onFocus: (focus: FocusRef) => void;
  wide?: boolean;
  responsiveWide?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-11 rounded-2xl border-2 border-teal-700 bg-[#fffdf5] p-3 text-left shadow-[4px_4px_0_rgba(15,118,110,0.12)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200",
        wide ? "w-full" : "w-48 shrink-0",
        responsiveWide && "md:w-48 md:shrink-0",
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

function UnplacedEdges({ graph }: { graph: CausalGraphModel }) {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const unplaced = graph.edges.filter(
    (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target),
  );
  if (unplaced.length === 0) return null;

  return (
    <ul className="mt-3 grid gap-2" aria-label="Additional causal connections">
      {unplaced.map((edge) => (
        <li
          key={edge.id}
          className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-dashed border-teal-700 bg-white px-3 py-2 text-xs font-bold text-[#123047]"
        >
          {edge.source} → {edge.target}: {edge.label}
          <ProvenanceBadge provenance={edge.provenance} />
          <span className="text-xs font-bold text-[#466778]">
            {evidenceScopeText(edge.scope)}
          </span>
        </li>
      ))}
    </ul>
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
