import Link from "next/link";
import type { ScenarioDefinition } from "@kplay/contracts";
import { BookOpen, Grid3X3, Network } from "lucide-react";

export function ScenarioSidebar({
  scenarios,
  scenarioId,
}: {
  scenarios: ScenarioDefinition[];
  scenarioId: string;
}) {
  const current =
    scenarios.find((scenario) => scenario.id === scenarioId) ??
    scenarios.find((scenario) => !scenario.disabled);
  const otherScenarios = scenarios.filter(
    (scenario) => scenario.id !== current?.id,
  );
  return (
    <div className="min-h-0">
      <h2 className="kplay-section-title">Scenario</h2>
      <div className="mt-3 rounded-2xl border-[3px] border-teal-700 bg-teal-100 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
        <div className="flex items-start gap-3">
          <Grid3X3
            className="mt-0.5 shrink-0 text-teal-700"
            size={24}
            aria-hidden
          />
          <div>
            <h3 className="text-sm font-extrabold text-[#123047]">
              {current?.title ?? "Scenario"}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#31566a]">
              {current?.description ??
                "Select a scenario to start exploring Kafka behavior."}
            </p>
            {current && (
              <div className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-teal-700">
                {current.topic.partitions} partitions
              </div>
            )}
          </div>
          <span className="ml-auto mt-7 size-2.5 rounded-full bg-sky-500" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {otherScenarios.map((scenario) =>
          scenario.disabled ? (
            <div
              key={scenario.id}
              className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 text-xs text-[#466778] shadow-[7px_7px_0_rgba(15,118,110,0.1)]"
              aria-disabled
            >
              <div className="flex gap-3">
                <Network
                  className="mt-0.5 shrink-0 text-teal-700"
                  size={22}
                  aria-hidden
                />
                <div>
                  <div className="font-extrabold text-[#123047]">
                    {scenario.title}
                  </div>
                  <div className="mt-1 leading-5">{scenario.description}</div>
                  <div className="mt-2 font-extrabold text-[#60798d]">
                    Locked
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Link
              key={scenario.id}
              href={`/scenarios/${scenario.id}`}
              className="block rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 text-xs text-[#466778] shadow-[7px_7px_0_rgba(15,118,110,0.1)] transition hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-sky-200"
            >
              <div className="flex gap-3">
                <Network
                  className="mt-0.5 shrink-0 text-teal-700"
                  size={22}
                  aria-hidden
                />
                <div>
                  <div className="font-extrabold text-[#123047]">
                    {scenario.title}
                  </div>
                  <div className="mt-1 leading-5">{scenario.description}</div>
                  <div className="mt-2 font-extrabold text-emerald-700">
                    Available
                  </div>
                </div>
              </div>
            </Link>
          ),
        )}
      </div>
      <a
        href="#how-it-works"
        className="mt-3 flex items-center justify-between rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] px-3 py-2 text-xs font-extrabold text-teal-800 shadow-[7px_7px_0_rgba(15,118,110,0.1)]"
      >
        <span className="flex items-center gap-2">
          <BookOpen size={15} aria-hidden /> How it works
        </span>
        <span aria-hidden>{"\u2197"}</span>
      </a>
    </div>
  );
}
