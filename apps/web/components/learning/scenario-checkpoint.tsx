"use client";

import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { useState } from "react";
import type { ScenarioCheckpoint as ScenarioCheckpointModel } from "@/lib/client/scenario-experience/model";
import { cn } from "@/lib/client/cn";

export function ScenarioCheckpoint({
  checkpoint,
  selectedOptionId,
  onAnswer,
}: {
  checkpoint: ScenarioCheckpointModel;
  selectedOptionId?: string | null;
  onAnswer: (optionId: string) => void;
}) {
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const selection =
    selectedOptionId === undefined ? localSelection : selectedOptionId;
  const isCorrect = selection === checkpoint.correctOptionId;

  function answer(optionId: string) {
    if (selectedOptionId === undefined) setLocalSelection(optionId);
    onAnswer(optionId);
  }

  return (
    <section
      className="rounded-2xl border-2 border-sky-700 bg-sky-50 p-4"
      aria-labelledby={`checkpoint-${checkpoint.id}-title`}
      data-testid="scenario-checkpoint"
    >
      <div className="grid gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-sky-700 bg-white text-sky-800">
          <HelpCircle size={20} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-sky-800">
            Check your understanding
          </p>
          <h3
            id={`checkpoint-${checkpoint.id}-title`}
            className="mt-1 break-words text-base font-black leading-6 text-[#123047] [overflow-wrap:anywhere]"
          >
            {checkpoint.prompt}
          </h3>
        </div>
      </div>
      <fieldset className="mt-3 grid min-w-0 gap-2 sm:grid-cols-3">
        <legend className="sr-only">{checkpoint.prompt}</legend>
        {checkpoint.options.map((option) => {
          const selected = selection === option.id;
          const correct = option.id === checkpoint.correctOptionId;
          const revealCorrect = selection !== null && correct;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "min-h-11 rounded-xl border-2 px-3 py-2 text-left text-sm font-extrabold leading-5 shadow-[3px_3px_0_rgba(15,118,110,0.1)] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200",
                revealCorrect
                  ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                  : selected
                    ? "border-rose-700 bg-rose-50 text-rose-950"
                    : "border-sky-700 bg-white text-sky-950 hover:bg-sky-100",
              )}
              onClick={() => answer(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>
      {selection !== null ? (
        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold leading-6",
            isCorrect
              ? "border-emerald-700 bg-emerald-50 text-emerald-950"
              : "border-rose-700 bg-rose-50 text-rose-950",
          )}
          data-testid="checkpoint-feedback"
        >
          {isCorrect ? (
            <CheckCircle2
              className="mt-1 shrink-0"
              size={17}
              aria-hidden="true"
            />
          ) : (
            <XCircle className="mt-1 shrink-0" size={17} aria-hidden="true" />
          )}
          <p>
            <span className="font-black">
              {isCorrect ? "Correct." : "Try again."}
            </span>{" "}
            {checkpoint.explanation}
          </p>
        </div>
      ) : null}
    </section>
  );
}
