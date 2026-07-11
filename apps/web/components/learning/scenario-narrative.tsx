import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";
import type { ScenarioExperienceFrame } from "@/lib/client/scenario-experience/model";
import { evidenceScopeText } from "./evidence-value";
import { ProvenanceBadge } from "./provenance";

type ScenarioNarrativeModel = ScenarioExperienceFrame["narrative"];

export function ScenarioNarrative({
  narrative,
}: {
  narrative: ScenarioNarrativeModel;
}) {
  const items = [
    {
      key: "changed",
      title: narrative.whatChanged.label,
      item: narrative.whatChanged,
      Icon: Sparkles,
      accent: "border-rose-500 bg-rose-50 text-rose-800",
    },
    {
      key: "why",
      title: narrative.why.label,
      item: narrative.why,
      Icon: Lightbulb,
      accent: "border-violet-500 bg-violet-50 text-violet-800",
    },
    {
      key: "next",
      title: narrative.next.label,
      item: narrative.next,
      Icon: ArrowRight,
      accent: "border-amber-500 bg-amber-50 text-amber-900",
    },
  ] as const;

  return (
    <section aria-labelledby="scenario-narrative-title">
      <h3 id="scenario-narrative-title" className="sr-only">
        Scenario explanation
      </h3>
      <ol className="divide-y-2 divide-teal-700/25 border-y-2 border-teal-700/40">
        {items.map(({ key, title, item, Icon, accent }) => (
          <li
            key={key}
            className="grid gap-3 py-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]"
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 ${accent}`}
            >
              <Icon size={19} strokeWidth={2.5} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-black text-[#123047]">{title}</h4>
              <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#31566a] [overflow-wrap:anywhere]">
                {item.text}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ProvenanceBadge provenance={item.provenance} />
                <span className="text-xs font-bold text-[#466778]">
                  {evidenceScopeText(item.scope)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
