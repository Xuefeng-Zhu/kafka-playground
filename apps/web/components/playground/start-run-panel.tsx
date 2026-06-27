"use client";

import type { ConnectionStatus, ScenarioDefinition } from "@kplay/contracts";
import { Button } from "@/components/ui/button";

export function StartRunPanel({
  connection,
  disabled,
  onStartRun,
  scenario,
}: {
  connection: ConnectionStatus | null;
  disabled: boolean;
  onStartRun: () => void;
  scenario: ScenarioDefinition | null;
}) {
  const isStartDisabled =
    disabled || connection?.status === "configuration_missing";

  return (
    <div className="kplay-grid-bg flex h-full items-center justify-center p-10">
      <div className="max-w-2xl rounded-3xl border-[3px] border-teal-700 bg-[#fffdf5] p-8 shadow-[12px_12px_0_rgba(15,118,110,0.22)]">
        <h2 className="text-2xl font-extrabold text-[#123047]">
          Start a scenario run
        </h2>
        {scenario ? (
          <div className="mt-4 text-left">
            <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.22em] text-teal-700">
              Selected scenario
            </div>
            <h3 className="mt-1 text-xl font-extrabold text-[#123047]">
              {scenario.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#466778]">
              {scenario.description}
            </p>
            <div className="mt-4 rounded-2xl border-[3px] border-teal-700 bg-teal-50 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-teal-800">
                <span>{scenario.topic.partitions} partitions</span>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-5 text-[#31566a]">
                {scenario.learningObjectives.map((objective) => (
                  <li key={objective} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500"
                    />
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-center text-sm leading-6 text-[#466778]">
            Loading scenario details.
          </p>
        )}
        <ConnectionNotice connection={connection} />
        <Button
          className="mx-auto mt-6 flex"
          variant="primary"
          onClick={onStartRun}
          disabled={isStartDisabled}
        >
          Start scenario run
        </Button>
      </div>
    </div>
  );
}

function ConnectionNotice({
  connection,
}: {
  connection: ConnectionStatus | null;
}) {
  if (!connection || connection.status !== "configuration_missing") return null;
  return (
    <div className="mt-5 rounded-2xl border-[3px] border-amber-500 bg-amber-100 p-3 text-left text-sm text-amber-900 shadow-[7px_7px_0_rgba(245,158,11,0.18)]">
      <div className="font-extrabold">Configuration missing</div>
      <p className="mt-1 text-amber-900/80">
        Set {connection.missingVariables.join(", ")} or switch
        `KAFKA_MODE=demo`.
      </p>
    </div>
  );
}
