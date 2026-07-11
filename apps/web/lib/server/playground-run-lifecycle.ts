import "server-only";

type CleanupBehavior = "allow" | "reject" | "skip";

type MutationOptions = {
  cleanupBehavior?: CleanupBehavior;
  cleanupInProgressError(): Error;
  mutationUnavailableError(): Error | null;
};

export class PlaygroundRunLifecycle {
  private readonly mutationTails = new Map<string, Promise<void>>();
  private readonly cleanupRequestedRunIds = new Set<string>();
  private readonly cleanupOperations = new Map<string, Promise<void>>();

  isCleanupRequested(runId: string) {
    return this.cleanupRequestedRunIds.has(runId);
  }

  mutate<T>(
    runId: string,
    operation: () => T | Promise<T>,
    options: MutationOptions,
  ): Promise<T> {
    const cleanupBehavior = options.cleanupBehavior ?? "reject";
    if (cleanupBehavior !== "allow" && this.isCleanupRequested(runId)) {
      return cleanupBehavior === "skip"
        ? Promise.resolve(undefined as T)
        : Promise.reject(options.cleanupInProgressError());
    }
    const unavailableError = options.mutationUnavailableError();
    if (cleanupBehavior !== "allow" && unavailableError) {
      return cleanupBehavior === "skip"
        ? Promise.resolve(undefined as T)
        : Promise.reject(unavailableError);
    }

    const previous = this.mutationTails.get(runId);
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.mutationTails.set(runId, current);

    const execute = async () => {
      if (previous) await previous;
      try {
        if (cleanupBehavior !== "allow" && this.isCleanupRequested(runId)) {
          if (cleanupBehavior === "skip") return undefined as T;
          throw options.cleanupInProgressError();
        }
        const queuedUnavailableError = options.mutationUnavailableError();
        if (cleanupBehavior !== "allow" && queuedUnavailableError) {
          if (cleanupBehavior === "skip") return undefined as T;
          throw queuedUnavailableError;
        }
        return await operation();
      } finally {
        release();
        if (this.mutationTails.get(runId) === current) {
          this.mutationTails.delete(runId);
        }
      }
    };
    return execute();
  }

  cleanup(
    runId: string,
    perform: (pendingMutations: Promise<void> | undefined) => Promise<void>,
  ) {
    const existingCleanup = this.cleanupOperations.get(runId);
    if (existingCleanup) return existingCleanup;

    this.cleanupRequestedRunIds.add(runId);
    let cleanup: Promise<void>;
    try {
      cleanup = perform(this.mutationTails.get(runId));
    } catch (error) {
      cleanup = Promise.reject(error);
    }
    const trackedCleanup = cleanup.finally(() => {
      this.cleanupRequestedRunIds.delete(runId);
      this.cleanupOperations.delete(runId);
    });
    this.cleanupOperations.set(runId, trackedCleanup);
    return trackedCleanup;
  }
}
