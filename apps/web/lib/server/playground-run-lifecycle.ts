import "server-only";

type CleanupBehavior = "allow" | "reject" | "skip";

type MutationOptions = {
  cleanupBehavior?: CleanupBehavior;
  cleanupInProgressError(): Error;
  mutationUnavailableError(): Error | null;
};

export class PlaygroundRunLifecycle {
  private readonly mutationTails = new Map<string, Promise<void>>();
  private readonly cleanupRequestTokens = new Map<string, Set<symbol>>();
  private readonly cleanupOperations = new Map<string, Promise<unknown>>();

  isCleanupRequested(runId: string) {
    return (this.cleanupRequestTokens.get(runId)?.size ?? 0) > 0;
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

  cleanup<T>(
    runId: string,
    perform: (
      pendingMutations: Promise<void> | undefined,
      retainRequestUntil: (
        ...pendingWork: Array<Promise<unknown> | undefined>
      ) => void,
    ) => Promise<T>,
  ): Promise<T> {
    const existingCleanup = this.cleanupOperations.get(runId);
    if (existingCleanup) return existingCleanup as Promise<T>;

    const cleanupToken = Symbol(runId);
    const tokens = this.cleanupRequestTokens.get(runId) ?? new Set<symbol>();
    tokens.add(cleanupToken);
    this.cleanupRequestTokens.set(runId, tokens);
    const retainedWork = new Set<Promise<unknown>>();
    const retainRequestUntil = (
      ...pendingWork: Array<Promise<unknown> | undefined>
    ) => {
      for (const pending of pendingWork) {
        if (pending) retainedWork.add(pending);
      }
    };
    let cleanup: Promise<T>;
    try {
      cleanup = perform(this.mutationTails.get(runId), retainRequestUntil);
    } catch (error) {
      cleanup = Promise.reject(error);
    }
    const trackedCleanup = cleanup.finally(() => {
      this.cleanupOperations.delete(runId);
      void Promise.allSettled([...retainedWork]).then(() => {
        const currentTokens = this.cleanupRequestTokens.get(runId);
        currentTokens?.delete(cleanupToken);
        if (currentTokens?.size === 0) {
          this.cleanupRequestTokens.delete(runId);
        }
      });
    });
    this.cleanupOperations.set(runId, trackedCleanup);
    return trackedCleanup;
  }
}
