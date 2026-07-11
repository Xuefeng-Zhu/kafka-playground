import { act, renderHook } from "@testing-library/react";
import type { RunSnapshot } from "@kplay/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSnapshot } from "@/lib/client/run-snapshot-test-fixtures";
import { useRunAction } from "./use-run-action";
import { useTeachingExperiment } from "./use-teaching-experiment";

const runScenarioExperiment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/client/playground-api", () => ({
  runScenarioExperiment,
}));

describe("useTeachingExperiment", () => {
  beforeEach(() => {
    runScenarioExperiment.mockReset();
  });

  it("applies a successful experiment snapshot and clears pending state", async () => {
    const snapshot = runSnapshot({ sequence: 3 });
    const onSnapshot = vi.fn();
    runScenarioExperiment.mockResolvedValue(snapshot);
    const { result } = renderExperimentHook(onSnapshot);

    let completed = false;
    await act(async () => {
      completed = await result.current.runTeachingExperiment(
        "produce-keyed-record",
      );
    });

    expect(completed).toBe(true);
    expect(runScenarioExperiment).toHaveBeenCalledWith(
      "run-1",
      "produce-keyed-record",
    );
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    expect(result.current.pendingExperimentId).toBeNull();
    expect(result.current.experimentError).toBeNull();
    expect(result.current.announcement).toContain("completed");
  });

  it("reports a rejected experiment and clears pending state", async () => {
    const onSnapshot = vi.fn();
    runScenarioExperiment.mockRejectedValue(new Error("Kafka unavailable"));
    const { result } = renderExperimentHook(onSnapshot);

    let completed = true;
    await act(async () => {
      completed = await result.current.runTeachingExperiment(
        "produce-keyed-record",
      );
    });

    expect(completed).toBe(false);
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(result.current.pendingExperimentId).toBeNull();
    expect(result.current.experimentError).toBe("Kafka unavailable");
    expect(result.current.announcement).toContain(
      "produce-keyed-record failed: Kafka unavailable",
    );
    expect(result.current.actionError).toBeNull();
    expect(result.current.isActionPending).toBe(false);
  });

  it("keeps the first experiment pending and ignores an overlapping invocation", async () => {
    const pending = deferred<RunSnapshot>();
    const onSnapshot = vi.fn();
    runScenarioExperiment.mockReturnValue(pending.promise);
    const { result } = renderExperimentHook(onSnapshot);
    let firstRun!: Promise<boolean>;

    act(() => {
      firstRun = result.current.runTeachingExperiment("produce-keyed-record");
    });

    expect(result.current.pendingExperimentId).toBe("produce-keyed-record");

    let secondCompleted = true;
    await act(async () => {
      secondCompleted = await result.current.runTeachingExperiment(
        "grow-consumer-group",
      );
    });

    expect(secondCompleted).toBe(false);
    expect(runScenarioExperiment).toHaveBeenCalledTimes(1);
    expect(result.current.pendingExperimentId).toBe("produce-keyed-record");

    await act(async () => {
      pending.resolve(runSnapshot({ sequence: 4 }));
      await firstRun;
    });

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(result.current.pendingExperimentId).toBeNull();
  });

  it("ignores a successful result after the experiment state is reset", async () => {
    const pending = deferred<RunSnapshot>();
    const onSnapshot = vi.fn();
    runScenarioExperiment.mockReturnValue(pending.promise);
    const { result } = renderExperimentHook(onSnapshot);
    let completed!: Promise<boolean>;

    act(() => {
      completed = result.current.runTeachingExperiment("produce-keyed-record");
    });
    act(() => result.current.resetTeachingExperiment());

    expect(result.current.pendingExperimentId).toBeNull();
    expect(result.current.announcement).toBe("");

    let resultWasApplied = true;
    await act(async () => {
      pending.resolve(runSnapshot({ sequence: 5 }));
      resultWasApplied = await completed;
    });

    expect(resultWasApplied).toBe(false);
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(result.current.experimentError).toBeNull();
    expect(result.current.announcement).toBe("");
  });

  it("ignores a rejected result after the run id changes", async () => {
    const pending = deferred<RunSnapshot>();
    const onSnapshot = vi.fn();
    runScenarioExperiment.mockReturnValue(pending.promise);
    const { result, rerender } = renderExperimentHook(onSnapshot);
    let completed!: Promise<boolean>;

    act(() => {
      completed = result.current.runTeachingExperiment("produce-keyed-record");
    });
    rerender({ runId: "run-2" });

    let resultWasApplied = true;
    await act(async () => {
      pending.reject(new Error("Old run failed"));
      resultWasApplied = await completed;
    });

    expect(resultWasApplied).toBe(false);
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(result.current.actionError).toBeNull();
    expect(result.current.experimentError).toBeNull();
    expect(result.current.pendingExperimentId).toBeNull();
    expect(result.current.announcement).toBe("");
  });

  it("does not publish a deferred result after unmount", async () => {
    const pending = deferred<RunSnapshot>();
    const onSnapshot = vi.fn();
    runScenarioExperiment.mockReturnValue(pending.promise);
    const { result, unmount } = renderExperimentHook(onSnapshot);
    let completed!: Promise<boolean>;

    act(() => {
      completed = result.current.runTeachingExperiment("produce-keyed-record");
    });
    unmount();

    let resultWasApplied = true;
    await act(async () => {
      pending.resolve(runSnapshot({ sequence: 6 }));
      resultWasApplied = await completed;
    });

    expect(resultWasApplied).toBe(false);
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("updates the error and announcement when the action cannot start", async () => {
    const runAction = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useTeachingExperiment({
        runId: "run-1",
        runAction,
        onSnapshot: vi.fn(),
      }),
    );

    let completed = true;
    await act(async () => {
      completed = await result.current.runTeachingExperiment(
        "produce-keyed-record",
      );
    });

    expect(completed).toBe(false);
    expect(runScenarioExperiment).not.toHaveBeenCalled();
    expect(result.current.experimentError).toBe(
      "The experiment could not start.",
    );
    expect(result.current.announcement).toBe(
      "produce-keyed-record could not start.",
    );
    expect(result.current.pendingExperimentId).toBeNull();
  });
});

function renderExperimentHook(onSnapshot: (snapshot: RunSnapshot) => void) {
  return renderHook(
    ({ runId }: { runId: string | null }) => {
      const runActionState = useRunAction();
      const experimentState = useTeachingExperiment({
        runId,
        runAction: runActionState.runAction,
        onSnapshot,
      });
      return { ...runActionState, ...experimentState };
    },
    { initialProps: { runId: "run-1" } },
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
