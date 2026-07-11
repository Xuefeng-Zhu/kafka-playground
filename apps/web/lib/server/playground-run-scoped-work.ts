import "server-only";

type RunScopedWork = {
  abortController: AbortController;
  settled: Promise<void>;
};

export class RunScopedWorkTracker {
  private readonly workByRun = new Map<string, Set<RunScopedWork>>();

  async run(runId: string, operation: (signal: AbortSignal) => Promise<void>) {
    const abortController = new AbortController();
    let markSettled: () => void = () => undefined;
    const work: RunScopedWork = {
      abortController,
      settled: new Promise<void>((resolve) => {
        markSettled = resolve;
      }),
    };
    const workForRun = this.workByRun.get(runId) ?? new Set<RunScopedWork>();
    workForRun.add(work);
    this.workByRun.set(runId, workForRun);
    try {
      await operation(abortController.signal);
    } finally {
      workForRun.delete(work);
      if (workForRun.size === 0) this.workByRun.delete(runId);
      markSettled();
    }
  }

  cancel(runId: string) {
    const work = [...(this.workByRun.get(runId) ?? [])];
    for (const item of work) item.abortController.abort();
    return Promise.all(work.map((item) => item.settled)).then(() => undefined);
  }
}

export function waitForAbortableDelay(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(true), delayMs);
    const onAbort = () => finish(false);

    function finish(completed: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(completed);
    }

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) finish(false);
  });
}
