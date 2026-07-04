import "server-only";
import type { InternalRun } from "./playground-runtime-state";

export const DEFAULT_SESSION_ID = "default";

export class PlaygroundRunRegistry {
  private readonly activeRuns = new Map<string, InternalRun>();
  private readonly runSessions = new Map<string, string>();

  getSessionRun(sessionId = DEFAULT_SESSION_ID) {
    return this.activeRuns.get(sessionId) ?? null;
  }

  setSessionRun(sessionId: string, run: InternalRun) {
    this.activeRuns.set(sessionId, run);
    this.runSessions.set(run.runId, sessionId);
  }

  deleteSessionRun(sessionId: string) {
    const run = this.activeRuns.get(sessionId);
    if (run) this.runSessions.delete(run.runId);
    this.activeRuns.delete(sessionId);
  }

  getOwnedRun(runId: string, sessionId = DEFAULT_SESSION_ID) {
    const run = this.activeRuns.get(sessionId);
    return run?.runId === runId ? run : null;
  }

  findRun(runId: string) {
    const sessionId = this.runSessions.get(runId);
    if (!sessionId) return null;
    return this.getOwnedRun(runId, sessionId);
  }

  values() {
    return this.activeRuns.values();
  }

  clear() {
    this.activeRuns.clear();
    this.runSessions.clear();
  }
}
