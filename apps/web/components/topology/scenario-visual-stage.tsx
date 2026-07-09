"use client";

import { Fragment } from "react";
import {
  ArrowRight,
  Braces,
  CheckCircle2,
  Database,
  Flame,
  Gauge,
  GitCommitHorizontal,
  KeyRound,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";
import type {
  ScenarioVisualization,
  ScenarioVisualizationHotspot,
} from "@/lib/client/scenario-visualization";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { scenarioIconMap, scenarioToneClass } from "./topology-flow-helpers";

type ScenarioVisualStageProps = {
  visualization: ScenarioVisualization;
  selectedNode: TopologySelection | null;
  onSelectNode: (selection: TopologySelection) => void;
};

export function ScenarioVisualStage({
  visualization,
  selectedNode,
  onSelectNode,
}: ScenarioVisualStageProps) {
  const frame = frameForKind(visualization.kind);

  return (
    <section
      className={`nodrag pointer-events-auto overflow-hidden rounded-2xl border-[3px] bg-[#fffdf5]/95 shadow-[8px_8px_0_rgba(15,118,110,0.14)] ${frame.border}`}
      data-testid="topology-scenario-visual"
      data-kind={visualization.kind}
    >
      <div className={`border-b-[3px] px-4 py-3 ${frame.header}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#466778]">
              Scenario visual
            </div>
            <h3 className="mt-1 text-base font-extrabold leading-tight text-[#123047]">
              {visualization.title}
            </h3>
            <p className="mt-1 max-w-[46rem] text-xs font-semibold leading-snug text-[#466778]">
              {visualization.summary}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {visualization.metrics.map((metric) => (
              <div
                key={metric.label}
                className={`min-w-20 rounded-xl border-2 bg-white px-2 py-1 text-right ${scenarioToneClass[metric.tone].border}`}
              >
                <div className="truncate text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
                  {metric.label}
                </div>
                <div className="truncate text-sm font-extrabold text-[#123047]">
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        {renderScenarioBody(visualization)}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visualization.hotspots.map((hotspot) => (
            <HotspotButton
              key={hotspot.id}
              hotspot={hotspot}
              selected={
                selectedNode?.type === "scenarioNode" &&
                selectedNode.nodeId === hotspot.id
              }
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function renderScenarioBody(visualization: ScenarioVisualization) {
  switch (visualization.kind) {
    case "partitioning-routing":
      return (
        <LaneMatrix
          visualization={visualization}
          icon={KeyRound}
          caption="Key route"
        />
      );
    case "fanout-assignment":
      return (
        <AssignmentBoard
          visualization={visualization}
          icon={GitCommitHorizontal}
          caption="Assignment"
        />
      );
    case "duplicate-commit-timeline":
      return (
        <TimelineBoard
          visualization={visualization}
          icon={GitCommitHorizontal}
          caption="Commit boundary"
        />
      );
    case "retry-dlq-conveyor":
      return (
        <PipelineBoard
          visualization={visualization}
          icon={ArrowRight}
          caption="Retry route"
        />
      );
    case "schema-compatibility-gate":
      return (
        <GateBoard
          visualization={visualization}
          icon={Braces}
          caption="Schema gate"
        />
      );
    case "transaction-envelope":
      return (
        <EnvelopeBoard
          visualization={visualization}
          icon={CheckCircle2}
          caption="Transaction"
        />
      );
    case "event-replay-projection":
      return (
        <TimelineBoard
          visualization={visualization}
          icon={GitCommitHorizontal}
          caption="Replay"
        />
      );
    case "lag-backpressure-meter":
      return (
        <PressureBoard
          visualization={visualization}
          icon={Gauge}
          caption="Capacity"
        />
      );
    case "hot-partition-heatmap":
      return (
        <HeatmapBoard
          visualization={visualization}
          icon={Flame}
          caption="Heat"
        />
      );
    case "compaction-state-table":
      return (
        <StateTableBoard
          visualization={visualization}
          icon={Database}
          caption="Compaction"
        />
      );
    case "retention-window-timeline":
      return (
        <TimelineBoard
          visualization={visualization}
          icon={GitCommitHorizontal}
          caption="Retention"
        />
      );
    case "cooperative-rebalance-board":
      return (
        <AssignmentBoard
          visualization={visualization}
          icon={GitCommitHorizontal}
          caption="Rebalance"
        />
      );
    case "streams-window-join":
      return (
        <WindowJoinBoard
          visualization={visualization}
          icon={Braces}
          caption="Window join"
        />
      );
    case "outbox-cdc-pipeline":
      return (
        <PipelineBoard
          visualization={visualization}
          icon={Database}
          caption="CDC pipeline"
        />
      );
    case "acl-permission-matrix":
      return (
        <GateBoard
          visualization={visualization}
          icon={LockKeyhole}
          caption="ACL check"
        />
      );
  }
}

function LaneMatrix({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-3">
      <StepRail visualization={visualization} icon={Icon} caption={caption} />
      <div className="grid gap-2">
        {visualization.lanes.map((lane) => (
          <div
            key={lane.id}
            className={`rounded-xl border-2 bg-white p-2 ${scenarioToneClass[lane.tone].border}`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-xs font-extrabold text-[#123047]">
                {lane.label}
              </div>
              <div
                className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-extrabold ${scenarioToneClass[lane.tone].chip}`}
              >
                {lane.value}
              </div>
            </div>
            <div className="flex min-h-9 items-center gap-1 overflow-hidden rounded-lg border-2 border-dashed border-teal-700 bg-[#fffdf5] px-2 py-1">
              {lane.messages.length ? (
                lane.messages.map((message) => (
                  <span
                    key={message.id}
                    className={`shrink-0 rounded-lg border-2 px-2 py-1 font-mono text-[11px] font-extrabold ${scenarioToneClass[lane.tone].chip}`}
                    title={`${message.key} ${message.partition}@${message.offset}`}
                  >
                    {message.label}
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-extrabold text-[#466778]">
                  waiting for records
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-[11px] font-semibold text-[#466778]">
              {lane.note}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssignmentBoard({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
      <StepRail visualization={visualization} icon={Icon} caption={caption} />
      <div className="grid gap-2">
        {visualization.lanes.length ? (
          visualization.lanes.map((lane) => (
            <div
              key={lane.id}
              className={`grid grid-cols-[92px_1fr_70px] items-center gap-2 rounded-xl border-2 bg-white p-2 ${scenarioToneClass[lane.tone].border}`}
            >
              <div className="truncate text-xs font-extrabold text-[#123047]">
                {lane.label}
              </div>
              <div className="flex min-h-8 items-center gap-1 rounded-lg border-2 border-dashed border-teal-700 bg-[#fffdf5] px-2">
                {lane.value.split(", ").map((value) => (
                  <span
                    key={`${lane.id}-${value}`}
                    className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-extrabold ${scenarioToneClass[lane.tone].chip}`}
                  >
                    {value}
                  </span>
                ))}
              </div>
              <div className="truncate text-right text-[11px] font-bold text-[#466778]">
                {lane.note}
              </div>
            </div>
          ))
        ) : (
          <EmptyBoardCopy />
        )}
      </div>
      <RowsTable visualization={visualization} />
    </div>
  );
}

function TimelineBoard({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-3">
      <StepRail visualization={visualization} icon={Icon} caption={caption} />
      <div className="grid gap-2 md:grid-cols-3">
        {visualization.lanes.map((lane) => (
          <LaneColumn key={lane.id} lane={lane} />
        ))}
      </div>
      <RowsTable visualization={visualization} />
    </div>
  );
}

function PipelineBoard({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        {visualization.steps.map((step, index) => (
          <Fragment key={step.id}>
            <div
              data-testid={`scenario-visual-step-${step.id}`}
              className={`rounded-xl border-2 bg-white p-3 ${scenarioToneClass[step.tone].border}`}
            >
              <div className="mb-3 flex items-center gap-2">
                <div
                  className={`grid size-8 place-items-center rounded-lg border-2 ${scenarioToneClass[step.tone].chip}`}
                >
                  <Icon size={16} aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
                    {caption}
                  </div>
                  <div className="truncate text-sm font-extrabold text-[#123047]">
                    {step.label}
                  </div>
                </div>
              </div>
              <div className="text-2xl font-extrabold text-[#123047]">
                {step.value}
              </div>
            </div>
            {index < visualization.steps.length - 1 ? (
              <div className="hidden items-center justify-center text-teal-700 md:flex">
                <ArrowRight size={22} aria-hidden />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
      <RowsTable visualization={visualization} />
    </div>
  );
}

function GateBoard({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
      <div className="md:col-span-2">
        <StepRail visualization={visualization} icon={Icon} caption={caption} />
      </div>
      <div className="md:col-span-2">
        <RowsTable visualization={visualization} />
      </div>
      <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
        {visualization.lanes.map((lane) => (
          <LaneColumn key={lane.id} lane={lane} />
        ))}
      </div>
    </div>
  );
}

function EnvelopeBoard({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-3">
      <StepRail visualization={visualization} icon={Icon} caption={caption} />
      <div className="grid gap-2 md:grid-cols-2">
        {visualization.lanes.map((lane) => (
          <div
            key={lane.id}
            className={`rounded-2xl border-2 bg-white p-3 ${scenarioToneClass[lane.tone].border}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="truncate text-sm font-extrabold text-[#123047]">
                {lane.label}
              </div>
              <span
                className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-extrabold ${scenarioToneClass[lane.tone].chip}`}
              >
                {lane.value}
              </span>
            </div>
            <div className="rounded-xl border-2 border-dashed border-teal-700 bg-[#fffdf5] p-2">
              <MessageDots lane={lane} />
            </div>
            <div className="mt-2 text-[11px] font-semibold text-[#466778]">
              {lane.note}
            </div>
          </div>
        ))}
      </div>
      <RowsTable visualization={visualization} />
    </div>
  );
}

function PressureBoard({ visualization, icon: Icon, caption }: BoardProps) {
  const max = Math.max(
    1,
    ...visualization.lanes.map((lane) => Number.parseInt(lane.value, 10) || 0),
  );
  return (
    <div className="grid gap-3">
      <StepRail visualization={visualization} icon={Icon} caption={caption} />
      <div className="grid gap-2">
        {visualization.lanes.map((lane) => {
          const width = Math.max(
            8,
            Math.round(((Number.parseInt(lane.value, 10) || 0) / max) * 100),
          );
          return (
            <div
              key={lane.id}
              className={`rounded-xl border-2 bg-white p-3 ${scenarioToneClass[lane.tone].border}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold text-[#123047]">
                  {lane.label}
                </div>
                <div className="text-sm font-extrabold text-[#123047]">
                  {lane.value}
                </div>
              </div>
              <div className="h-5 overflow-hidden rounded-full border-2 border-teal-700 bg-[#fffdf5]">
                <div
                  className={`h-full rounded-full ${barClass(lane.tone)}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] font-semibold text-[#466778]">
                {lane.note}
              </div>
            </div>
          );
        })}
      </div>
      <RowsTable visualization={visualization} />
    </div>
  );
}

function HeatmapBoard({ visualization, icon: Icon, caption }: BoardProps) {
  const max = Math.max(
    1,
    ...visualization.lanes.map((lane) => Number.parseInt(lane.value, 10) || 0),
  );
  return (
    <div className="grid gap-3">
      <StepRail visualization={visualization} icon={Icon} caption={caption} />
      <div className="grid gap-2 sm:grid-cols-2">
        {visualization.lanes.map((lane) => {
          const heat = Number.parseInt(lane.value, 10) || 0;
          const opacity = 0.18 + (heat / max) * 0.72;
          return (
            <div
              key={lane.id}
              className={`rounded-xl border-2 p-3 ${scenarioToneClass[lane.tone].border}`}
              style={{ backgroundColor: `rgba(251, 113, 133, ${opacity})` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold text-[#123047]">
                  {lane.label}
                </div>
                <div className="text-2xl font-extrabold text-[#123047]">
                  {lane.value}
                </div>
              </div>
              <div className="mt-2 text-[11px] font-semibold text-[#31566a]">
                {lane.note}
              </div>
            </div>
          );
        })}
      </div>
      <RowsTable visualization={visualization} />
    </div>
  );
}

function StateTableBoard({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1.15fr]">
      <StepRail visualization={visualization} icon={Icon} caption={caption} />
      <RowsTable visualization={visualization} />
      <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
        {visualization.lanes.map((lane) => (
          <LaneColumn key={lane.id} lane={lane} />
        ))}
      </div>
    </div>
  );
}

function WindowJoinBoard({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-3">
      <StepRail visualization={visualization} icon={Icon} caption={caption} />
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.1fr]">
        {visualization.lanes.map((lane) => (
          <LaneColumn key={lane.id} lane={lane} />
        ))}
      </div>
      <RowsTable visualization={visualization} />
    </div>
  );
}

type BoardProps = {
  visualization: ScenarioVisualization;
  icon: LucideIcon;
  caption: string;
};

function StepRail({ visualization, icon: Icon, caption }: BoardProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {visualization.steps.map((step) => (
        <div
          key={step.id}
          data-testid={`scenario-visual-step-${step.id}`}
          className={`rounded-xl border-2 bg-white p-3 ${scenarioToneClass[step.tone].border} ${
            step.active ? "shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" : ""
          }`}
        >
          <div className="flex items-start gap-2">
            <div
              className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 ${scenarioToneClass[step.tone].chip}`}
            >
              <Icon size={15} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="break-words text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
                {caption}
              </div>
              <div className="break-words text-sm font-extrabold leading-tight text-[#123047]">
                {step.label}
              </div>
            </div>
          </div>
          <div className="mt-2 break-words text-xl font-extrabold leading-tight text-[#123047]">
            {step.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function LaneColumn({
  lane,
}: {
  lane: ScenarioVisualization["lanes"][number];
}) {
  return (
    <div
      className={`rounded-xl border-2 bg-white p-3 ${scenarioToneClass[lane.tone].border}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="truncate text-sm font-extrabold text-[#123047]">
          {lane.label}
        </div>
        <span
          className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-extrabold ${scenarioToneClass[lane.tone].chip}`}
        >
          {lane.value}
        </span>
      </div>
      <div className="min-h-12 rounded-lg border-2 border-dashed border-teal-700 bg-[#fffdf5] p-2">
        <MessageDots lane={lane} />
      </div>
      <div className="mt-1 truncate text-[11px] font-semibold text-[#466778]">
        {lane.note}
      </div>
    </div>
  );
}

function MessageDots({
  lane,
}: {
  lane: ScenarioVisualization["lanes"][number];
}) {
  return lane.messages.length ? (
    <div className="flex flex-wrap gap-1">
      {lane.messages.map((message) => (
        <span
          key={message.id}
          title={`${message.key} ${message.partition}@${message.offset} ${message.state}`}
          className={`rounded-lg border-2 px-2 py-1 font-mono text-[11px] font-extrabold ${scenarioToneClass[lane.tone].chip}`}
        >
          {message.label}
        </span>
      ))}
    </div>
  ) : (
    <span className="text-[11px] font-extrabold text-[#466778]">
      no records yet
    </span>
  );
}

function RowsTable({
  visualization,
}: {
  visualization: ScenarioVisualization;
}) {
  if (visualization.rows.length === 0) {
    return <EmptyBoardCopy />;
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-teal-700 bg-white">
      {visualization.rows.slice(-6).map((row) => (
        <div
          key={row.id}
          className={`grid gap-2 border-b-2 border-teal-700/20 px-3 py-2 text-[11px] font-bold last:border-b-0 ${
            row.emphasis ? "bg-amber-50" : "bg-white"
          }`}
          style={{
            gridTemplateColumns: `repeat(${Math.max(row.cells.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {row.cells.map((cell, index) => (
            <span
              key={`${row.id}-${index}`}
              className={`truncate ${
                index === 0 ? "text-[#123047]" : "text-[#466778]"
              } ${index === row.cells.length - 1 ? scenarioToneClass[row.tone].text : ""}`}
              title={cell}
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function HotspotButton({
  hotspot,
  selected,
  onSelectNode,
}: {
  hotspot: ScenarioVisualizationHotspot;
  selected: boolean;
  onSelectNode: (selection: TopologySelection) => void;
}) {
  const Icon = scenarioIconMap[hotspot.icon];
  const tone = scenarioToneClass[hotspot.tone];

  return (
    <button
      type="button"
      onClick={() => onSelectNode({ type: "scenarioNode", nodeId: hotspot.id })}
      aria-label={`Inspect ${hotspot.title}`}
      data-testid={`topology-scenario-node-${hotspot.id}`}
      className={`min-h-24 rounded-xl border-2 bg-white p-3 text-left focus:outline-none focus:ring-4 focus:ring-sky-200 ${tone.border} ${
        selected ? "ring-4 ring-sky-200" : "hover:bg-teal-50"
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 ${tone.chip}`}
        >
          <Icon size={15} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
            {hotspot.eyebrow}
          </div>
          <div className="mt-0.5 line-clamp-2 text-sm font-extrabold leading-tight text-[#123047]">
            {hotspot.title}
          </div>
        </div>
      </div>
      <div className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-[#466778]">
        {hotspot.description}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
          {hotspot.metricLabel}
        </span>
        <span
          className={`max-w-24 truncate rounded-full border-2 px-2 py-0.5 text-xs font-extrabold ${tone.chip}`}
        >
          {hotspot.metricValue}
        </span>
      </div>
    </button>
  );
}

function EmptyBoardCopy() {
  return (
    <div className="rounded-xl border-2 border-dashed border-teal-700 bg-white p-3 text-xs font-extrabold text-[#466778]">
      Start producing records to populate this view.
    </div>
  );
}

function frameForKind(kind: ScenarioVisualization["kind"]) {
  if (
    kind === "retry-dlq-conveyor" ||
    kind === "acl-permission-matrix" ||
    kind === "hot-partition-heatmap"
  ) {
    return {
      border: "border-rose-500",
      header: "border-rose-500 bg-rose-50",
    };
  }
  if (
    kind === "schema-compatibility-gate" ||
    kind === "transaction-envelope" ||
    kind === "streams-window-join"
  ) {
    return {
      border: "border-violet-500",
      header: "border-violet-500 bg-violet-50",
    };
  }
  if (
    kind === "outbox-cdc-pipeline" ||
    kind === "event-replay-projection" ||
    kind === "compaction-state-table"
  ) {
    return {
      border: "border-emerald-500",
      header: "border-emerald-500 bg-emerald-50",
    };
  }
  return {
    border: "border-teal-700",
    header: "border-teal-700 bg-sky-50",
  };
}

function barClass(tone: ScenarioVisualizationHotspot["tone"]) {
  if (tone === "rose") return "bg-rose-400";
  if (tone === "amber") return "bg-amber-300";
  if (tone === "violet") return "bg-violet-400";
  if (tone === "sky") return "bg-sky-400";
  return "bg-emerald-400";
}
