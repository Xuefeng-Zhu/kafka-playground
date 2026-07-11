import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSnapshot } from "@/lib/client/run-snapshot-test-fixtures";
import { usePlaygroundRunCommands } from "./use-playground-run-commands";

const apiMocks = vi.hoisted(() => ({
  mutateRun: vi.fn(),
  produceMessage: vi.fn(),
  retireRun: vi.fn(),
  startScenarioRun: vi.fn(),
  testKafkaConnection: vi.fn(),
}));

vi.mock("@/lib/client/playground-api", () => apiMocks);

describe("usePlaygroundRunCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps live updates and selection intact when reset fails", async () => {
    apiMocks.retireRun.mockRejectedValue(new Error("cleanup failed"));
    const harness = renderCommands();

    await act(async () => {
      await harness.result.current.resetRun();
    });

    expect(apiMocks.retireRun).toHaveBeenCalledWith("run-1");
    expect(harness.closeLiveUpdates).not.toHaveBeenCalled();
    expect(harness.clearRunSelection).not.toHaveBeenCalled();
    expect(harness.runAction).toHaveReturnedWith(expect.any(Promise));
  });

  it("closes live updates only after a successful reset", async () => {
    apiMocks.retireRun.mockResolvedValue(undefined);
    const harness = renderCommands();

    await act(async () => {
      await harness.result.current.resetRun();
    });

    expect(harness.closeLiveUpdates).toHaveBeenCalledTimes(1);
    expect(harness.clearRunSelection).toHaveBeenCalledTimes(1);
  });

  it("does not navigate away when retiring the active run fails", async () => {
    apiMocks.retireRun.mockRejectedValue(new Error("cleanup failed"));
    const harness = renderCommands();

    await act(async () => {
      await harness.result.current.navigateToScenario("retention-data-loss");
    });

    expect(harness.pushRoute).not.toHaveBeenCalled();
    expect(harness.closeLiveUpdates).not.toHaveBeenCalled();
  });

  it("navigates directly when there is no active run", async () => {
    const harness = renderCommands({ runId: null });

    await act(async () => {
      await harness.result.current.navigateToScenario("retention-data-loss");
    });

    expect(apiMocks.retireRun).not.toHaveBeenCalled();
    expect(harness.pushRoute).toHaveBeenCalledWith(
      "/scenarios/retention-data-loss",
    );
  });

  it("navigates after successfully retiring the active run", async () => {
    apiMocks.retireRun.mockResolvedValue(undefined);
    const harness = renderCommands();

    await act(async () => {
      await harness.result.current.navigateToScenario("retention-data-loss");
    });

    expect(harness.closeLiveUpdates).toHaveBeenCalledTimes(1);
    expect(harness.clearRunSelection).toHaveBeenCalledTimes(1);
    expect(harness.pushRoute).toHaveBeenCalledWith(
      "/scenarios/retention-data-loss",
    );
  });

  it("publishes validated snapshots through focused callbacks", async () => {
    const started = runSnapshot({ runId: "run-started" });
    const produced = runSnapshot({ runId: "run-1", sequence: 2 });
    apiMocks.startScenarioRun.mockResolvedValue(started);
    apiMocks.produceMessage.mockResolvedValue(produced);
    const harness = renderCommands();

    await act(async () => {
      await harness.result.current.startRun({ mode: "demo" });
      await harness.result.current.produceOne();
    });

    expect(harness.onRunStarted).toHaveBeenCalledWith(started);
    expect(harness.onMessageProduced).toHaveBeenCalledWith(produced);
  });

  it("routes to the authoritative scenario when a stale start succeeds", async () => {
    const pending = deferred<ReturnType<typeof runSnapshot>>();
    apiMocks.startScenarioRun.mockReturnValue(pending.promise);
    const harness = renderCommands({ runId: null });
    let command!: Promise<void>;

    act(() => {
      command = harness.result.current.startRun({ mode: "demo" });
    });
    harness.rerender({
      runId: null,
      scenarioId: "retention-data-loss",
    });

    await act(async () => {
      pending.resolve(runSnapshot({ scenarioId: "partitioning" }));
      await command;
    });

    expect(harness.onRunStarted).not.toHaveBeenCalled();
    expect(harness.pushRoute).toHaveBeenCalledWith("/scenarios/partitioning");
    expect(harness.reportActionError).not.toHaveBeenCalled();
  });

  it("ignores an old-run snapshot when the same scenario resets", async () => {
    const pending = deferred<ReturnType<typeof runSnapshot>>();
    apiMocks.produceMessage.mockReturnValue(pending.promise);
    const harness = renderCommands();
    let command!: Promise<void>;

    act(() => {
      command = harness.result.current.produceOne();
    });
    harness.rerender({ runId: null, scenarioId: "partitioning" });

    await act(async () => {
      pending.resolve(runSnapshot({ runId: "run-1", sequence: 3 }));
      await command;
    });

    expect(harness.onMessageProduced).not.toHaveBeenCalled();
    expect(harness.pushRoute).not.toHaveBeenCalled();
    expect(harness.reportActionError).not.toHaveBeenCalled();
  });

  it("does not report a stale rejection after the active run changes", async () => {
    const pending = deferred<ReturnType<typeof runSnapshot>>();
    apiMocks.mutateRun.mockReturnValue(pending.promise);
    const harness = renderCommands();
    let command!: Promise<void>;

    act(() => {
      command = harness.result.current.mutate("/settings", {
        method: "PATCH",
      });
    });
    harness.rerender({ runId: "run-2", scenarioId: "partitioning" });

    await act(async () => {
      pending.reject(new Error("Old run failed"));
      await command;
    });

    expect(harness.onSnapshot).not.toHaveBeenCalled();
    expect(harness.reportActionError).not.toHaveBeenCalled();
  });

  it("ignores a deferred reset after another reset clears the run", async () => {
    const pending = deferred<void>();
    apiMocks.retireRun.mockReturnValue(pending.promise);
    const harness = renderCommands();
    let command!: Promise<void>;

    act(() => {
      command = harness.result.current.resetRun();
    });
    harness.rerender({ runId: null, scenarioId: "partitioning" });

    await act(async () => {
      pending.resolve(undefined);
      await command;
    });

    expect(harness.closeLiveUpdates).not.toHaveBeenCalled();
    expect(harness.clearRunSelection).not.toHaveBeenCalled();
    expect(harness.reportActionError).not.toHaveBeenCalled();
  });

  it("does not complete stale navigation after the route changes", async () => {
    const pending = deferred<void>();
    apiMocks.retireRun.mockReturnValue(pending.promise);
    const harness = renderCommands();
    let command!: Promise<void>;

    act(() => {
      command = harness.result.current.navigateToScenario(
        "retention-data-loss",
      );
    });
    harness.rerender({
      runId: "run-2",
      scenarioId: "consumer-lag-backpressure",
    });

    await act(async () => {
      pending.resolve(undefined);
      await command;
    });

    expect(harness.closeLiveUpdates).not.toHaveBeenCalled();
    expect(harness.clearRunSelection).not.toHaveBeenCalled();
    expect(harness.pushRoute).not.toHaveBeenCalled();
  });

  it("does not publish or report a deferred rejection after unmount", async () => {
    const pending = deferred<ReturnType<typeof runSnapshot>>();
    apiMocks.produceMessage.mockReturnValue(pending.promise);
    const harness = renderCommands();
    let command!: Promise<void>;

    act(() => {
      command = harness.result.current.produceOne();
    });
    harness.unmount();

    await act(async () => {
      pending.reject(new Error("Unmounted request failed"));
      await command;
    });

    expect(harness.onMessageProduced).not.toHaveBeenCalled();
    expect(harness.reportActionError).not.toHaveBeenCalled();
  });
});

function renderCommands({
  runId = "run-1",
  scenarioId = "partitioning",
}: {
  runId?: string | null;
  scenarioId?: string;
} = {}) {
  const closeLiveUpdates = vi.fn();
  const clearRunSelection = vi.fn();
  const onMessageProduced = vi.fn();
  const onRunStarted = vi.fn();
  const onSnapshot = vi.fn();
  const pushRoute = vi.fn();
  const reportActionError = vi.fn();
  const runAction = vi.fn(async (action: () => Promise<void>) => {
    try {
      await action();
      return true;
    } catch (error) {
      reportActionError(error);
      return false;
    }
  });
  const result = renderHook(
    (props: { runId: string | null; scenarioId: string }) =>
      usePlaygroundRunCommands({
        ...props,
        runAction,
        pushRoute,
        closeLiveUpdates,
        clearRunSelection,
        onSnapshot,
        onRunStarted,
        onMessageProduced,
      }),
    { initialProps: { runId, scenarioId } },
  );
  return {
    ...result,
    closeLiveUpdates,
    clearRunSelection,
    onMessageProduced,
    onRunStarted,
    onSnapshot,
    pushRoute,
    reportActionError,
    runAction,
  };
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
