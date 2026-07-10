"use client";

import type {
  FocusRef,
  ScenarioLensModel,
} from "@/lib/client/scenario-experience/model";
import { AssignmentLens } from "./lenses/assignment-lens";
import { CapacityLens } from "./lenses/capacity-lens";
import { GateLens } from "./lenses/gate-lens";
import { HeatmapLens } from "./lenses/heatmap-lens";
import { LifecycleLens } from "./lenses/lifecycle-lens";
import { PipelineLens } from "./lenses/pipeline-lens";
import { ProjectionLens } from "./lenses/projection-lens";
import { RoutingLens } from "./lenses/routing-lens";
import { TransactionLens } from "./lenses/transaction-lens";
import { WindowJoinLens } from "./lenses/window-join-lens";

export function ScenarioEvidenceLens({
  lens,
  focus,
  onFocus,
}: {
  lens: ScenarioLensModel;
  focus: FocusRef | null;
  onFocus: (focus: FocusRef) => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] shadow-[7px_7px_0_rgba(15,118,110,0.14)]"
      data-testid="scenario-evidence-lens"
      data-lens-kind={lens.kind}
    >
      {renderLens(lens, focus, onFocus)}
    </div>
  );
}

function renderLens(
  lens: ScenarioLensModel,
  focus: FocusRef | null,
  onFocus: (focus: FocusRef) => void,
) {
  switch (lens.kind) {
    case "routing":
      return <RoutingLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "assignment":
      return <AssignmentLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "lifecycle":
      return <LifecycleLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "pipeline":
      return <PipelineLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "gate":
      return <GateLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "transaction":
      return <TransactionLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "projection":
      return <ProjectionLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "capacity":
      return <CapacityLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "heatmap":
      return <HeatmapLens lens={lens} focus={focus} onFocus={onFocus} />;
    case "window-join":
      return <WindowJoinLens lens={lens} focus={focus} onFocus={onFocus} />;
    default:
      return assertNever(lens);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported evidence lens: ${JSON.stringify(value)}`);
}
