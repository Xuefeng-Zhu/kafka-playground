import type { RunSnapshot } from "@kplay/contracts";
import { Send, Settings2 } from "lucide-react";
import type { ScenarioAction } from "@/lib/client/scenario-actions";
import { deriveScenarioActions } from "@/lib/client/scenario-actions";
import { deriveScenarioInsight } from "@/lib/client/scenario-insights";

const toneClass = {
  amber: "border-amber-500 bg-amber-100 text-amber-900",
  emerald: "border-emerald-500 bg-emerald-100 text-emerald-900",
  rose: "border-rose-500 bg-rose-100 text-rose-900",
  sky: "border-sky-500 bg-sky-100 text-sky-900",
  violet: "border-violet-500 bg-violet-100 text-violet-900"
} as const;

export function ScenarioInsightPanel({
  snapshot,
  onRunAction
}: {
  snapshot: RunSnapshot;
  onRunAction: (action: ScenarioAction) => void;
}) {
  const insight = deriveScenarioInsight(snapshot);
  const actions = deriveScenarioActions(snapshot);
  return (
    <section
      className="mx-3 mt-2 rounded-2xl border-2 border-teal-700 bg-[#fffdf5] p-3 shadow-[5px_5px_0_rgba(15,118,110,0.1)]"
      data-testid="scenario-insight-panel"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-56 flex-1">
          <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-teal-700">{insight.title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#31566a]">{insight.summary}</p>
        </div>
        <dl className="grid min-w-[260px] flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          {insight.metrics.map((metric) => (
            <div
              key={metric.label}
              className={`rounded-xl border-2 px-3 py-2 ${toneClass[metric.tone ?? "sky"]}`}
            >
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] opacity-75">{metric.label}</dt>
              <dd className="mt-1 truncate text-sm font-extrabold">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {insight.chips.map((chip) => (
          <span key={chip} className="rounded-full border-2 border-teal-700 bg-teal-50 px-2 py-0.5 text-[11px] font-extrabold text-teal-800">
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
            className="inline-flex items-center gap-2 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-3 py-2 text-xs font-extrabold text-teal-800 shadow-[3px_3px_0_rgba(15,118,110,0.12)] hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-sky-200"
            title={action.description}
          >
            {action.settings ? <Settings2 size={14} aria-hidden /> : <Send size={14} aria-hidden />}
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
