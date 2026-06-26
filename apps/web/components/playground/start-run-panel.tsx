"use client";

import type { ConnectionStatus } from "@kplay/contracts";
import { Button } from "@/components/ui/button";

export function StartRunPanel({
  connection,
  disabled,
  onStartRun,
}: {
  connection: ConnectionStatus | null;
  disabled: boolean;
  onStartRun: () => void;
}) {
  return (
    <div className="kplay-grid-bg flex h-full items-center justify-center p-10">
      <div className="max-w-xl rounded-3xl border-[3px] border-teal-700 bg-[#fffdf5] p-8 text-center shadow-[12px_12px_0_rgba(15,118,110,0.22)]">
        <h2 className="text-2xl font-extrabold text-[#123047]">
          Start a scenario run
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#466778]">
          Demo mode creates a scenario-specific topic model and uses simulated
          Kafka behavior. Aiven mode creates real resources and only displays
          observed delivery reports and assignments.
        </p>
        <ConnectionNotice connection={connection} />
        <Button
          className="mt-6"
          variant="primary"
          onClick={onStartRun}
          disabled={disabled}
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
