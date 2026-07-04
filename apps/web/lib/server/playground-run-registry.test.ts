import { describe, expect, it } from "vitest";
import type { InternalRun } from "./playground-runtime-state";
import { PlaygroundRunRegistry } from "./playground-run-registry";

describe("PlaygroundRunRegistry", () => {
  it("keeps runs isolated by session and addressable by run id", () => {
    const registry = new PlaygroundRunRegistry();
    const runOne = run("run-1");
    const runTwo = run("run-2");

    registry.setSessionRun("session-one", runOne);
    registry.setSessionRun("session-two", runTwo);

    expect(registry.getOwnedRun("run-1", "session-one")).toBe(runOne);
    expect(registry.getOwnedRun("run-1", "session-two")).toBeNull();
    expect(registry.findRun("run-2")).toBe(runTwo);
  });

  it("removes run-id lookups when a session run is deleted", () => {
    const registry = new PlaygroundRunRegistry();
    const activeRun = run("run-1");
    registry.setSessionRun("session-one", activeRun);

    registry.deleteSessionRun("session-one");

    expect(registry.getSessionRun("session-one")).toBeNull();
    expect(registry.findRun("run-1")).toBeNull();
  });
});

function run(runId: string) {
  return { runId } as InternalRun;
}
