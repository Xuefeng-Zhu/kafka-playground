"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
} from "@xyflow/react";
import { ProvenanceBadge } from "@/components/learning/provenance";
import type { Provenance } from "@/lib/client/scenario-experience/model";

export type ScenarioCausalEdgeKind =
  | "data"
  | "control"
  | "ownership"
  | "feedback";

export type ScenarioCausalEdgeData = {
  active: boolean;
  kind: ScenarioCausalEdgeKind;
  label: string;
  provenance: Provenance;
};

export type ScenarioCausalFlowEdge = Edge<
  ScenarioCausalEdgeData,
  "scenarioCausal"
>;

const edgeAppearance: Record<
  ScenarioCausalEdgeKind,
  { color: string; dash?: string; label: string }
> = {
  data: { color: "#0f766e", label: "Data" },
  control: { color: "#7c3aed", dash: "7 6", label: "Control" },
  ownership: { color: "#0284c7", dash: "3 5", label: "Ownership" },
  feedback: { color: "#e11d48", dash: "8 6", label: "Feedback" },
};

export function scenarioCausalEdgeColor(kind: ScenarioCausalEdgeKind) {
  return edgeAppearance[kind].color;
}

export const topologyEdgeTypes = {
  scenarioCausal: ScenarioCausalEdge,
} satisfies EdgeTypes;

function ScenarioCausalEdge({
  id,
  data,
  markerEnd,
  sourcePosition,
  sourceX,
  sourceY,
  style,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps<ScenarioCausalFlowEdge>) {
  const edgeData = data ?? {
    active: false,
    kind: "data",
    label: "Causal connection",
    provenance: "derived",
  };
  const appearance = edgeAppearance[edgeData.kind];
  const [path, pathLabelX, pathLabelY] =
    edgeData.kind === "feedback"
      ? getBezierPath({
          sourcePosition,
          sourceX,
          sourceY,
          targetPosition,
          targetX,
          targetY,
          curvature: 0.42,
        })
      : getSmoothStepPath({
          borderRadius: 18,
          offset: 24,
          sourcePosition,
          sourceX,
          sourceY,
          targetPosition,
          targetX,
          targetY,
        });
  const labelX =
    edgeData.kind === "feedback" ? pathLabelX : (sourceX + targetX) / 2;
  const labelY =
    edgeData.kind === "feedback" ? pathLabelY + 80 : (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          ...style,
          opacity: edgeData.active ? 1 : 0.7,
          stroke: appearance.color,
          strokeDasharray: appearance.dash,
          strokeWidth: edgeData.active ? 3 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute max-w-52 rounded-lg border-2 bg-[#fffdf5] px-2 py-1 text-sm font-extrabold leading-5 text-[#123047] shadow-[3px_3px_0_rgba(15,118,110,0.12)]"
          data-edge-kind={edgeData.kind}
          data-provenance={edgeData.provenance}
          data-testid={`topology-edge-label-${id}`}
          style={{
            borderColor: appearance.color,
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <span className="block break-words">{edgeData.label}</span>
          <span className="mt-1 flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-[#466778]">
            <span>{appearance.label}</span>
            <ProvenanceBadge
              provenance={edgeData.provenance}
              className="min-h-6 px-1.5 text-xs"
            />
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
