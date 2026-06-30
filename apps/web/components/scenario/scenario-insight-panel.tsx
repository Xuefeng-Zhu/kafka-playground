"use client";

import type { RunSnapshot } from "@kplay/contracts";
import {
  CheckCircle2,
  HelpCircle,
  Send,
  Settings2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { ScenarioAction } from "@/lib/client/scenario-actions";
import { deriveScenarioActions } from "@/lib/client/scenario-actions";
import type { ScenarioCheckpoint } from "@/lib/client/scenario-checkpoints";
import { deriveScenarioCheckpoint } from "@/lib/client/scenario-checkpoints";
import { deriveScenarioInsight } from "@/lib/client/scenario-insights";

const toneClass = {
  amber: "border-amber-500 bg-amber-100 text-amber-900",
  emerald: "border-emerald-500 bg-emerald-100 text-emerald-900",
  rose: "border-rose-500 bg-rose-100 text-rose-900",
  sky: "border-sky-500 bg-sky-100 text-sky-900",
  violet: "border-violet-500 bg-violet-100 text-violet-900",
} as const;

export function ScenarioInsightPanel({
  snapshot,
  onRunAction,
  disabled = false,
}: {
  snapshot: RunSnapshot;
  disabled?: boolean;
  onRunAction: (action: ScenarioAction) => void;
}) {
  const insight = deriveScenarioInsight(snapshot);
  const actions = deriveScenarioActions(snapshot);
  const checkpoint = deriveScenarioCheckpoint(snapshot);
  const checkpointKey = `${snapshot.runId}:${checkpoint.id}`;

  return (
    <section
      className="mx-3 mt-2 rounded-2xl border-2 border-teal-700 bg-[#fffdf5] p-3 shadow-[5px_5px_0_rgba(15,118,110,0.1)]"
      data-testid="scenario-insight-panel"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-56 flex-1">
          <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-teal-700">
            {insight.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#31566a]">
            {insight.summary}
          </p>
        </div>
        <dl className="grid min-w-[260px] flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          {insight.metrics.map((metric, index) => (
            <div
              key={`${metric.label}-${index}`}
              className={`rounded-xl border-2 px-3 py-2 ${toneClass[metric.tone ?? "sky"]}`}
            >
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] opacity-75">
                {metric.label}
              </dt>
              <dd className="mt-1 truncate text-sm font-extrabold">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {insight.chips.map((chip, index) => (
          <span
            key={`${chip}-${index}`}
            className="rounded-full border-2 border-teal-700 bg-teal-50 px-2 py-0.5 text-[11px] font-extrabold text-teal-800"
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onRunAction(action)}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-3 py-2 text-xs font-extrabold text-teal-800 shadow-[3px_3px_0_rgba(15,118,110,0.12)] hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
            title={action.description}
          >
            {action.settings ? (
              <Settings2 size={14} aria-hidden />
            ) : (
              <Send size={14} aria-hidden />
            )}
            {action.label}
          </button>
        ))}
      </div>
      <ScenarioCheckpointPanel key={checkpointKey} checkpoint={checkpoint} />
    </section>
  );
}

function ScenarioCheckpointPanel({
  checkpoint,
}: {
  checkpoint: ScenarioCheckpoint;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const isCorrect = selectedOptionId === checkpoint.correctOptionId;
  const selectedOption = checkpoint.options.find(
    (option) => option.id === selectedOptionId,
  );
  const correctOption = checkpoint.options.find(
    (option) => option.id === checkpoint.correctOptionId,
  );

  return (
    <div
      className="mt-3 rounded-xl border-2 border-sky-700 bg-sky-50 p-3"
      data-testid="scenario-checkpoint-panel"
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="mt-0.5 rounded-full border-2 border-sky-700 bg-white p-1 text-sky-800">
          <HelpCircle size={14} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-sky-800">
            {checkpoint.title}
          </h4>
          <p className="mt-1 text-xs font-extrabold leading-5 text-[#123047]">
            {checkpoint.prompt}
          </p>
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {checkpoint.options.map((option) => {
          const isSelected = selectedOptionId === option.id;
          const isAnswer = option.id === checkpoint.correctOptionId;
          const revealCorrect = selectedOptionId !== null && isAnswer;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedOptionId(option.id)}
              className={`min-h-12 rounded-xl border-2 px-3 py-2 text-left text-xs font-extrabold leading-4 focus:outline-none focus:ring-4 focus:ring-sky-200 ${
                revealCorrect
                  ? "border-emerald-700 bg-emerald-100 text-emerald-950"
                  : isSelected
                    ? "border-rose-700 bg-rose-100 text-rose-950"
                    : "border-sky-700 bg-white text-sky-950 hover:bg-sky-100"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {selectedOptionId && (
        <div
          className={`mt-2 flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-xs leading-5 ${
            isCorrect
              ? "border-emerald-700 bg-emerald-50 text-emerald-950"
              : "border-rose-700 bg-rose-50 text-rose-950"
          }`}
          data-testid="scenario-checkpoint-feedback"
        >
          {isCorrect ? (
            <CheckCircle2 className="mt-0.5 shrink-0" size={15} aria-hidden />
          ) : (
            <XCircle className="mt-0.5 shrink-0" size={15} aria-hidden />
          )}
          <p>
            <span className="font-extrabold">
              {isCorrect ? "Correct." : "Try again."}
            </span>{" "}
            {isCorrect
              ? checkpoint.explanation
              : `${selectedOption?.label ?? "That answer"} misses it. ${
                  correctOption
                    ? `Look for: ${correctOption.label}`
                    : checkpoint.explanation
                }`}
          </p>
        </div>
      )}
    </div>
  );
}
