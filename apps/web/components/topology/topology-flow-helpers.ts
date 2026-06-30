import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock3,
  Database,
  Flame,
  Gauge,
  GitBranch,
  Layers3,
  Link2,
  LockKeyhole,
  Repeat2,
  Route,
  Rows3,
  ShieldCheck,
  Shuffle,
  Split,
  type LucideIcon,
} from "lucide-react";
import type {
  ScenarioTopologyIcon,
  ScenarioTopologyTone,
} from "@/lib/client/scenario-topology";

export type TopologyLayout = "auto" | "spread";

type LayoutMetrics = {
  producer: { x: number; y: number };
  producerWidth: number;
  topic: { x: number; y: number };
  topicWidth: number;
  consumerGroup: { x: number; y: number };
  consumerGroupWidth: number;
};

export const scenarioToneColor: Record<ScenarioTopologyTone, string> = {
  amber: "#f59e0b",
  emerald: "#10b981",
  rose: "#e11d48",
  sky: "#0ea5e9",
  teal: "#0f766e",
  violet: "#8b5cf6",
};

export const scenarioToneClass: Record<
  ScenarioTopologyTone,
  { border: string; chip: string; text: string }
> = {
  amber: {
    border: "border-amber-500",
    chip: "border-amber-500 bg-amber-100 text-amber-900",
    text: "text-amber-700",
  },
  emerald: {
    border: "border-emerald-500",
    chip: "border-emerald-500 bg-emerald-100 text-emerald-900",
    text: "text-emerald-700",
  },
  rose: {
    border: "border-rose-500",
    chip: "border-rose-500 bg-rose-100 text-rose-900",
    text: "text-rose-700",
  },
  sky: {
    border: "border-sky-500",
    chip: "border-sky-500 bg-sky-100 text-sky-900",
    text: "text-sky-700",
  },
  teal: {
    border: "border-teal-700",
    chip: "border-teal-700 bg-teal-100 text-teal-900",
    text: "text-teal-700",
  },
  violet: {
    border: "border-violet-500",
    chip: "border-violet-500 bg-violet-100 text-violet-900",
    text: "text-violet-700",
  },
};

export const scenarioIconMap: Record<ScenarioTopologyIcon, LucideIcon> = {
  acl: LockKeyhole,
  balance: Shuffle,
  commit: CheckCircle2,
  compact: Layers3,
  database: Database,
  dlq: AlertTriangle,
  handler: Box,
  hot: Flame,
  lag: Gauge,
  projection: Rows3,
  rebalance: GitBranch,
  retention: Clock3,
  retry: Repeat2,
  route: Route,
  schema: ShieldCheck,
  stream: Split,
  transaction: Link2,
};

export function topologyMetrics(
  layout: TopologyLayout,
  compact: boolean,
): LayoutMetrics {
  if (compact) {
    return {
      producer: { x: 26, y: 116 },
      producerWidth: 170,
      topic: { x: 26, y: 320 },
      topicWidth: 332,
      consumerGroup: { x: 26, y: 610 },
      consumerGroupWidth: 332,
    };
  }

  return layout === "auto"
    ? {
        producer: { x: 28, y: 214 },
        producerWidth: 170,
        topic: { x: 312, y: 124 },
        topicWidth: 520,
        consumerGroup: { x: 860, y: 182 },
        consumerGroupWidth: 280,
      }
    : {
        producer: { x: 24, y: 236 },
        producerWidth: 190,
        topic: { x: 344, y: 112 },
        topicWidth: 560,
        consumerGroup: { x: 950, y: 172 },
        consumerGroupWidth: 310,
      };
}

export function assignmentHandleTop(index: number, assignmentCount: number) {
  if (assignmentCount <= 1) return 50;
  const first = 40;
  const last = 60;
  return first + (index * (last - first)) / (assignmentCount - 1);
}

export function scenarioFlowNodeId(id: string) {
  return `scenario-${id}`;
}

export function topologyEndpointId(id: string, scenarioNodeIds: Set<string>) {
  return scenarioNodeIds.has(id) ? scenarioFlowNodeId(id) : id;
}
