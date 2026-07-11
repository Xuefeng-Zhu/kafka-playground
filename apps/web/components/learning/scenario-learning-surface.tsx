"use client";

import { BookOpenCheck, Lightbulb } from "lucide-react";
import type { KafkaMode, ScenarioExperimentId } from "@kplay/contracts";
import type {
  FocusRef,
  ScenarioExperienceFrame,
  ScenarioExperimentTransitionTrailItem,
} from "@/lib/client/scenario-experience/model";
import { CausalGraphView } from "./causal-graph";
import { GuidedExperimentBar } from "./guided-experiment-bar";
import { ProvenanceLegend } from "./provenance";
import { ScenarioCheckpoint } from "./scenario-checkpoint";
import { ScenarioEvidenceLens } from "./scenario-evidence-lens";
import { ScenarioNarrative } from "./scenario-narrative";

export type ScenarioLearningSurfaceProps = {
  frame: ScenarioExperienceFrame;
  focus: FocusRef | null;
  graphFocus?: FocusRef | null;
  evidenceFocus?: FocusRef | null;
  onFocus: (focus: FocusRef) => void;
  onRunExperiment: (experimentId: ScenarioExperimentId) => void;
  onAnswerCheckpoint: (optionId: string) => void;
  runtimeMode?: KafkaMode;
  pendingExperimentId?: ScenarioExperimentId | null;
  experimentError?: string | null;
  experimentTransitions?: readonly ScenarioExperimentTransitionTrailItem[];
  announcement?: string;
  selectedCheckpointOptionId?: string | null;
};

export function ScenarioLearningSurface({
  frame,
  focus,
  graphFocus = focus,
  evidenceFocus = focus,
  onFocus,
  onRunExperiment,
  onAnswerCheckpoint,
  runtimeMode = "demo",
  pendingExperimentId = null,
  experimentError = null,
  experimentTransitions = [],
  announcement,
  selectedCheckpointOptionId,
}: ScenarioLearningSurfaceProps) {
  const experimentOptions = [
    frame.experiments.primary,
    frame.experiments.contrast,
  ];
  const activeExperiment =
    experimentOptions.find(
      (experiment) =>
        experiment.id ===
        (pendingExperimentId ?? frame.experiment.experimentId),
    ) ?? frame.experiments.primary;
  const displayedExperimentError = pendingExperimentId
    ? experimentError
    : (experimentError ?? frame.experiment.error?.message ?? null);
  const latestTransition = experimentTransitions.at(-1);
  const liveMessage =
    pendingExperimentId && latestTransition
      ? `Step ${latestTransition.stepIndex} of ${latestTransition.totalSteps}: ${latestTransition.stepLabel}. Virtual time ${latestTransition.virtualTimeMs} milliseconds. ${latestTransition.provenance} evidence.`
      : (announcement ??
        (pendingExperimentId
          ? `Running ${activeExperiment.label}.`
          : displayedExperimentError
            ? `${activeExperiment.label} failed: ${displayedExperimentError}`
            : `Experiment evidence updated. ${frame.narrative.whatChanged.text}`));

  return (
    <section
      className="min-w-0 bg-[#fffaf0] text-[#123047]"
      data-testid="scenario-learning-surface"
      data-scenario-id={frame.scenarioId}
      data-experiment-id={frame.experiment.experimentId}
      data-pending={pendingExperimentId ? "true" : "false"}
      aria-labelledby="scenario-learning-title"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      <header className="border-y-[3px] border-teal-700 bg-[#fffdf5] px-4 py-4 shadow-[0_6px_0_rgba(15,118,110,0.1)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">
              Teaching-first scenario
            </p>
            <h2
              id="scenario-learning-title"
              className="mt-1 break-words text-2xl font-black leading-tight text-[#123047] [overflow-wrap:anywhere]"
            >
              {frame.title}
            </h2>
            <p className="mt-2 break-words text-sm font-semibold leading-6 text-[#31566a] [overflow-wrap:anywhere]">
              {frame.lesson.objective}
            </p>
          </div>
          <ProvenanceLegend />
        </div>
        <div className="mt-3 flex min-w-0 items-start gap-2 border-l-4 border-amber-600 bg-amber-50 px-3 py-2">
          <Lightbulb
            className="mt-0.5 shrink-0 text-amber-800"
            size={18}
            aria-hidden="true"
          />
          <p className="break-words text-xs font-bold leading-5 text-amber-950 [overflow-wrap:anywhere]">
            Misconception to test: {frame.lesson.misconception}
          </p>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 p-4 xl:grid-cols-[minmax(22rem,0.8fr)_minmax(30rem,1.2fr)] xl:items-start">
        <div className="min-w-0 xl:sticky xl:top-3">
          <CausalGraphView
            graph={frame.causalGraph}
            focus={graphFocus}
            onFocus={onFocus}
          />
        </div>

        <div className="min-w-0">
          <section
            className="overflow-hidden rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] shadow-[9px_9px_0_rgba(15,118,110,0.16)]"
            aria-labelledby="evidence-control-room-title"
          >
            <header className="flex flex-wrap items-start gap-3 border-b-[3px] border-teal-700 bg-teal-50 px-4 py-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-teal-700 bg-teal-100 text-teal-900">
                <BookOpenCheck size={20} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">
                  Evidence lens
                </p>
                <h2
                  id="evidence-control-room-title"
                  className="mt-1 break-words text-xl font-black leading-tight text-[#123047] [overflow-wrap:anywhere]"
                >
                  Evidence control room
                </h2>
                <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#31566a] [overflow-wrap:anywhere]">
                  Ask: what changed, why, and what happens next?
                </p>
              </div>
            </header>

            <div className="grid gap-5 p-3 sm:p-4">
              <GuidedExperimentBar
                experiments={frame.experiments}
                evidence={frame.experiment}
                runtimeMode={runtimeMode}
                onRunExperiment={onRunExperiment}
                onFocus={onFocus}
                focus={focus}
                transitions={experimentTransitions}
                pendingExperimentId={pendingExperimentId}
                error={displayedExperimentError}
              />
              <ScenarioNarrative narrative={frame.narrative} />
              <ScenarioEvidenceLens
                lens={frame.lens}
                focus={evidenceFocus}
                onFocus={onFocus}
              />
              <ScenarioCheckpoint
                key={frame.checkpoint.id}
                checkpoint={frame.checkpoint}
                selectedOptionId={selectedCheckpointOptionId}
                onAnswer={onAnswerCheckpoint}
              />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
