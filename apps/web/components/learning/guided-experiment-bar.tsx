"use client";

import { FlaskConical, LoaderCircle, Play, RotateCcw } from "lucide-react";
import type { KafkaMode, ScenarioExperimentId } from "@kplay/contracts";
import type {
  FocusRef,
  ScenarioExperimentEvidence,
  ScenarioExperimentMetadata,
  ScenarioExperimentTransitionTrailItem,
  ScenarioExperiments,
} from "@/lib/client/scenario-experience/model";
import { focusRefsEqual } from "@/lib/client/scenario-experience/model";
import { cn } from "@/lib/client/cn";
import { EvidenceFactList } from "./evidence-facts";
import { ProvenanceBadge } from "./provenance";

export function GuidedExperimentBar({
  experiments,
  evidence,
  runtimeMode = "demo",
  onRunExperiment,
  onFocus,
  focus = null,
  transitions = [],
  pendingExperimentId = null,
  error = null,
}: {
  experiments: ScenarioExperiments;
  evidence: ScenarioExperimentEvidence;
  runtimeMode?: KafkaMode;
  onRunExperiment: (experimentId: ScenarioExperimentId) => void;
  onFocus?: (focus: FocusRef) => void;
  focus?: FocusRef | null;
  transitions?: readonly ScenarioExperimentTransitionTrailItem[];
  pendingExperimentId?: ScenarioExperimentId | null;
  error?: string | null;
}) {
  const options = [experiments.primary, experiments.contrast];
  const completedExperimentIds = new Set(evidence.completedExperimentIds);
  const primaryCompleted = completedExperimentIds.has(experiments.primary.id);
  const activeExperiment =
    options.find(
      (experiment) =>
        experiment.id === (pendingExperimentId ?? evidence.experimentId),
    ) ?? experiments.primary;

  return (
    <section
      className="overflow-hidden rounded-2xl border-2 border-teal-700 bg-teal-50"
      aria-labelledby="guided-experiment-title"
    >
      <header className="grid gap-3 border-b-2 border-teal-700 bg-teal-100 px-4 py-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-teal-800">
          <FlaskConical size={20} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-teal-800">
            Guided experiment
          </p>
          <h3
            id="guided-experiment-title"
            className="mt-1 break-words text-base font-black leading-6 text-[#123047] [overflow-wrap:anywhere]"
          >
            Hypothesis: {activeExperiment.hypothesis}
          </h3>
        </div>
      </header>

      <div className="grid gap-3 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((experiment) => (
            <ExperimentAction
              key={experiment.id}
              experiment={experiment}
              active={experiment.id === evidence.experimentId}
              completed={completedExperimentIds.has(experiment.id)}
              runtimeMode={runtimeMode}
              pending={pendingExperimentId === experiment.id}
              disabled={pendingExperimentId !== null}
              prerequisiteMissing={
                experiment.role === "contrast" && !primaryCompleted
              }
              prerequisiteLabel={experiments.primary.label}
              onRunExperiment={onRunExperiment}
            />
          ))}
        </div>
        <div
          className="grid gap-2 lg:grid-cols-3"
          aria-label="Experiment evidence phases"
        >
          <ExperimentPhase
            title="Before"
            facts={evidence.before}
            emptyCopy="No baseline evidence yet."
          />
          <ExperimentPhase
            title="Current"
            facts={evidence.current}
            emptyCopy="Run the experiment to observe the current state."
          />
          <ExperimentPhase
            title="After"
            facts={evidence.after}
            emptyCopy="The expected contrast appears after the experiment completes."
          />
        </div>
        <ExperimentTransitionTrail
          transitions={transitions}
          focus={focus}
          onFocus={onFocus}
        />
        {error ? (
          <p
            className="rounded-xl border-2 border-rose-700 bg-rose-50 px-3 py-2 text-sm font-bold leading-6 text-rose-950"
            data-testid="experiment-error"
          >
            Experiment failed: {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ExperimentAction({
  experiment,
  active,
  completed,
  runtimeMode,
  pending,
  disabled,
  prerequisiteMissing,
  prerequisiteLabel,
  onRunExperiment,
}: {
  experiment: ScenarioExperimentMetadata;
  active: boolean;
  completed: boolean;
  runtimeMode: KafkaMode;
  pending: boolean;
  disabled: boolean;
  prerequisiteMissing: boolean;
  prerequisiteLabel: string;
  onRunExperiment: (experimentId: ScenarioExperimentId) => void;
}) {
  const unavailable =
    runtimeMode !== "demo" && experiment.remoteSupport === "demo-only";
  const Icon = pending ? LoaderCircle : completed ? RotateCcw : Play;
  const unavailableHintId = `experiment-${experiment.id}-unavailable-hint`;
  const prerequisiteHintId = `experiment-${experiment.id}-prerequisite-hint`;
  const describedBy = [
    unavailable ? unavailableHintId : null,
    prerequisiteMissing ? prerequisiteHintId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-3",
        active
          ? "border-teal-800 bg-[#fffdf5] shadow-[3px_3px_0_rgba(15,118,110,0.12)]"
          : "border-teal-700/60 bg-white",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-teal-800">
            {experiment.role === "primary" ? "Primary" : "Contrast"}
          </p>
          <h4 className="mt-1 break-words text-sm font-black text-[#123047] [overflow-wrap:anywhere]">
            {experiment.label}
          </h4>
          <p className="mt-1 break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
            {experiment.description}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-teal-700 bg-teal-700 px-3 py-2 text-xs font-black text-white shadow-[3px_3px_0_rgba(15,118,110,0.16)] hover:bg-teal-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:border-slate-500 disabled:bg-slate-200 disabled:text-slate-700 disabled:shadow-none"
          data-testid={`experiment-${experiment.id}`}
          aria-describedby={describedBy || undefined}
          disabled={disabled || unavailable || prerequisiteMissing}
          onClick={() => onRunExperiment(experiment.id)}
        >
          <Icon
            className={pending ? "motion-safe:animate-spin" : undefined}
            size={16}
            aria-hidden="true"
          />
          {pending ? "Running…" : completed ? "Rerun" : "Run"}
        </button>
      </div>
      {unavailable ? (
        <p
          id={unavailableHintId}
          className="mt-2 rounded-lg border-l-4 border-amber-600 bg-amber-50 px-2 py-1 text-xs font-bold leading-5 text-amber-950"
        >
          Demo mode only. Remote mode shows observed broker behavior and does
          not simulate this experiment.
        </p>
      ) : null}
      {prerequisiteMissing ? (
        <p
          id={prerequisiteHintId}
          className="mt-2 rounded-lg border-l-4 border-sky-600 bg-sky-50 px-2 py-1 text-xs font-bold leading-5 text-sky-950"
        >
          Run {prerequisiteLabel} first. This contrast builds on its completed,
          authoritative scenario state.
        </p>
      ) : null}
    </div>
  );
}

function ExperimentTransitionTrail({
  transitions,
  focus,
  onFocus,
}: {
  transitions: readonly ScenarioExperimentTransitionTrailItem[];
  focus: FocusRef | null;
  onFocus?: (focus: FocusRef) => void;
}) {
  return (
    <section
      className="rounded-xl border-2 border-sky-700 bg-sky-50 p-3"
      aria-labelledby="experiment-transition-trail-title"
      data-testid="experiment-transition-trail"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4
          id="experiment-transition-trail-title"
          className="text-xs font-black uppercase tracking-[0.1em] text-sky-900"
        >
          Server transition trail
        </h4>
        <p className="text-xs font-semibold leading-5 text-sky-950">
          Each emitted step keeps its virtual time and provenance.
        </p>
      </div>
      {transitions.length === 0 ? (
        <p className="mt-2 text-xs font-semibold leading-5 text-[#466778]">
          Run the primary experiment to observe its causal progression.
        </p>
      ) : (
        <ol className="mt-2 grid gap-2" aria-label="Experiment transitions">
          {transitions.map((transition) => {
            const selected = focusRefsEqual(focus, transition.focus);
            return (
              <li key={transition.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border-2 px-3 py-2 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 sm:grid-cols-[auto_minmax(0,1fr)_auto]",
                    selected
                      ? "border-sky-700 bg-white shadow-[inset_5px_0_0_#0ea5e9]"
                      : "border-sky-700/50 bg-[#fffdf5] hover:border-sky-700 hover:bg-white",
                  )}
                  data-testid={`experiment-transition-${transition.id}`}
                  onClick={() => onFocus?.(transition.focus)}
                >
                  <span className="rounded-lg bg-sky-100 px-2 py-1 text-xs font-black text-sky-950">
                    Step {transition.stepIndex}/{transition.totalSteps}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-black text-[#123047] [overflow-wrap:anywhere]">
                      {transition.stepLabel}
                    </span>
                    <span className="mt-0.5 block break-words text-xs font-semibold text-[#466778] [overflow-wrap:anywhere]">
                      Virtual time {transition.virtualTimeMs.toLocaleString()}{" "}
                      ms
                    </span>
                  </span>
                  <ProvenanceBadge
                    provenance={transition.provenance}
                    className="col-span-2 justify-self-start sm:col-span-1 sm:justify-self-auto"
                  />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ExperimentPhase({
  title,
  facts,
  emptyCopy,
}: {
  title: string;
  facts: ScenarioExperimentEvidence["before"];
  emptyCopy: string;
}) {
  return (
    <section className="min-w-0 border-l-4 border-teal-700 pl-2">
      <h4 className="text-xs font-black uppercase tracking-[0.1em] text-teal-800">
        {title}
      </h4>
      {facts.length > 0 ? (
        <EvidenceFactList facts={facts} className="mt-2 min-w-0" compact />
      ) : (
        <p className="mt-2 break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
          {emptyCopy}
        </p>
      )}
    </section>
  );
}
