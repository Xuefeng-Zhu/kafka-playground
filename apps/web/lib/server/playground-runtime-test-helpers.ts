import type { PlaygroundRunRegistry } from "./playground-run-registry";
import type { InternalRun } from "./playground-runtime-state";

export function getInternalRun(
  runtime: object,
  sessionId = "default",
): InternalRun | null {
  const { runs } = runtime as unknown as { runs: PlaygroundRunRegistry };
  return runs.getSessionRun(sessionId);
}
