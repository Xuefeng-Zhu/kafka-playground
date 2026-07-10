"use client";

import Link from "next/link";
import { type MouseEvent, useMemo, useState } from "react";
import type { ScenarioDefinition } from "@kplay/contracts";
import { BookOpen, Network, Search, X } from "lucide-react";

export function ScenarioSidebar({
  disabled = false,
  scenarios,
  scenarioId,
  onNavigateScenario,
}: {
  disabled?: boolean;
  scenarios: ScenarioDefinition[];
  scenarioId: string;
  onNavigateScenario?: (scenarioId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredScenarios = useMemo(() => {
    if (!normalizedQuery) return scenarios;
    return scenarios.filter((scenario) =>
      `${scenario.title} ${scenario.description}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, scenarios]);

  return (
    <div className="min-h-0">
      <h2 className="kplay-section-title">Scenario</h2>
      <div className="mt-3">
        <label
          htmlFor="scenario-search"
          className="block text-xs font-extrabold uppercase tracking-[0.16em] text-teal-700"
        >
          Search scenarios
        </label>
        <div className="relative mt-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-700"
            size={15}
            aria-hidden
          />
          <input
            id="scenario-search"
            data-testid="scenario-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search scenarios"
            className="h-10 w-full appearance-none rounded-xl border-[3px] border-teal-700 bg-[#fffdf5] pl-9 pr-9 text-sm font-semibold text-[#123047] shadow-[5px_5px_0_rgba(15,118,110,0.12)] outline-none placeholder:text-[#60798d] focus:ring-4 focus:ring-sky-200 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              data-testid="scenario-search-clear"
              aria-label="Clear scenario search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg border-2 border-teal-700 bg-teal-50 text-teal-800 transition hover:bg-teal-100 focus:outline-none focus:ring-4 focus:ring-sky-200"
            >
              <X size={13} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {filteredScenarios.length > 0 ? (
          filteredScenarios.map((scenario) => {
            const isCurrent = scenario.id === scenarioId;
            if (isCurrent) {
              return (
                <div
                  key={scenario.id}
                  aria-current="page"
                  className="rounded-2xl border-[3px] border-teal-700 bg-teal-100 p-3 text-xs text-[#31566a] shadow-[7px_7px_0_rgba(15,118,110,0.14)]"
                  data-testid="current-scenario-card"
                >
                  <ScenarioCardContent scenario={scenario} />
                </div>
              );
            }

            return scenario.disabled ? (
              <div
                key={scenario.id}
                className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 text-xs text-[#466778] shadow-[7px_7px_0_rgba(15,118,110,0.1)]"
                aria-disabled
              >
                <ScenarioCardContent scenario={scenario} />
                <div className="mt-2 font-extrabold text-[#60798d]">Locked</div>
              </div>
            ) : (
              <Link
                key={scenario.id}
                href={`/scenarios/${scenario.id}`}
                aria-disabled={disabled || undefined}
                onClick={(event) => {
                  if (disabled) {
                    event.preventDefault();
                    return;
                  }
                  if (!onNavigateScenario) return;
                  if (shouldUseNativeLinkBehavior(event)) return;
                  event.preventDefault();
                  onNavigateScenario(scenario.id);
                }}
                className={`block rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 text-xs text-[#466778] shadow-[7px_7px_0_rgba(15,118,110,0.1)] transition focus:outline-none focus:ring-4 focus:ring-sky-200 ${
                  disabled
                    ? "cursor-not-allowed opacity-55"
                    : "hover:bg-teal-50"
                }`}
              >
                <ScenarioCardContent scenario={scenario} />
              </Link>
            );
          })
        ) : (
          <div
            data-testid="scenario-search-empty"
            className="rounded-2xl border-[3px] border-dashed border-teal-700 bg-[#fffdf5] p-3 text-xs font-semibold leading-5 text-[#466778]"
          >
            No scenarios match your search.
          </div>
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

function shouldUseNativeLinkBehavior(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function ScenarioCardContent({ scenario }: { scenario: ScenarioDefinition }) {
  return (
    <div className="flex gap-3">
      <Network
        className="mt-0.5 shrink-0 text-teal-700"
        size={22}
        aria-hidden
      />
      <div>
        <div className="font-extrabold text-[#123047]">{scenario.title}</div>
        <div className="mt-1 leading-5">{scenario.description}</div>
      </div>
    </div>
  );
}
