"use client";

import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock3,
  Database,
  Flame,
  Gauge,
  GitBranch,
  KeyRound,
  Layers3,
  Link2,
  LockKeyhole,
  Network,
  Repeat2,
  Route,
  Rows3,
  ShieldCheck,
  Split,
  type LucideIcon,
} from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { EvidenceValueDisplay } from "@/components/learning/evidence-value";
import { ProvenanceBadge } from "@/components/learning/provenance";
import type {
  CausalGraphNode,
  Provenance,
  ScenarioExploreTopologyVisualKind,
} from "@/lib/client/scenario-experience/model";
import type { TopologySelection } from "@/lib/client/topology-selection";

export type ScenarioExploreNodeData = {
  description: string;
  entityId: string;
  metric?: CausalGraphNode["metric"];
  nodeId: string;
  onSelectNode: (selection: TopologySelection) => void;
  provenance: Provenance;
  selected: boolean;
  state?: CausalGraphNode["state"];
  title: string;
  visualKind: ScenarioExploreTopologyVisualKind;
};

const handleClass =
  "!h-3 !w-3 !border-2 !border-teal-700 !bg-[#fffdf5] !opacity-0";

const visualIcons: Record<string, LucideIcon> = {
  acl: LockKeyhole,
  authorization: LockKeyhole,
  backlog: Layers3,
  balance: Network,
  boundary: Link2,
  capacity: Gauge,
  commit: CheckCircle2,
  compact: Layers3,
  connector: Network,
  database: Database,
  dlq: AlertTriangle,
  gate: ShieldCheck,
  handler: Box,
  hot: Flame,
  lag: Gauge,
  log: Rows3,
  principal: KeyRound,
  projection: Rows3,
  rebalance: GitBranch,
  retention: Clock3,
  retry: Repeat2,
  route: Route,
  router: Route,
  schema: ShieldCheck,
  store: Database,
  stream: Split,
  transaction: Link2,
};

const stateAppearance: Record<NonNullable<CausalGraphNode["state"]>, string> = {
  idle: "border-slate-400 bg-slate-100 text-slate-700",
  active: "border-sky-600 bg-sky-100 text-sky-900",
  complete: "border-emerald-600 bg-emerald-100 text-emerald-900",
  warning: "border-amber-500 bg-amber-100 text-amber-900",
  failed: "border-rose-600 bg-rose-100 text-rose-900",
};

export function ScenarioTopologyFlowNode({
  data,
}: NodeProps<Node<ScenarioExploreNodeData, "scenarioExplore">>) {
  const Icon = visualIcons[data.visualKind] ?? Box;

  return (
    <div className="nodrag pointer-events-auto relative">
      <Handle
        id="scenario-in"
        type="target"
        position={Position.Left}
        className={handleClass}
      />
      <Handle
        id="scenario-feedback-in"
        type="target"
        position={Position.Top}
        className={handleClass}
      />
      <Handle
        id="scenario-vertical-out"
        type="source"
        position={Position.Top}
        className={handleClass}
      />
      <button
        type="button"
        aria-label={`Inspect ${data.title}`}
        aria-pressed={data.selected}
        className={`h-full w-full overflow-hidden rounded-2xl border-[3px] bg-[#fffdf5] p-3 text-left shadow-[6px_6px_0_rgba(15,118,110,0.14)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 ${
          data.selected
            ? "border-teal-800 bg-teal-100 outline-2 outline-offset-2 outline-teal-800"
            : "border-teal-700 hover:bg-teal-50"
        }`}
        data-provenance={data.provenance}
        data-testid={`topology-node-scenario-${data.nodeId}`}
        onClick={() =>
          data.onSelectNode({
            type: "scenarioNode",
            nodeId: data.entityId,
          })
        }
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-teal-700 bg-teal-100 text-teal-800">
            <Icon size={19} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block break-words text-base font-black leading-5 text-[#123047] [overflow-wrap:anywhere]">
              {data.title}
            </span>
            <span className="mt-1 block line-clamp-2 break-words text-sm font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
              {data.description}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {data.state ? (
            <span
              className={`inline-flex min-h-7 items-center rounded-full border-2 px-2 text-xs font-extrabold capitalize ${stateAppearance[data.state]}`}
            >
              {data.state}
            </span>
          ) : null}
          <ProvenanceBadge provenance={data.provenance} />
        </div>
        {data.metric ? (
          <div className="mt-3 rounded-xl border-2 border-teal-700/50 bg-white px-2 py-1.5">
            <EvidenceValueDisplay value={data.metric} showProvenance={false} />
          </div>
        ) : null}
      </button>
      <Handle
        id="scenario-out"
        type="source"
        position={Position.Right}
        className={handleClass}
      />
      <Handle
        id="scenario-feedback-out"
        type="source"
        position={Position.Bottom}
        className={handleClass}
      />
      <Handle
        id="scenario-vertical-in"
        type="target"
        position={Position.Bottom}
        className={handleClass}
      />
    </div>
  );
}
