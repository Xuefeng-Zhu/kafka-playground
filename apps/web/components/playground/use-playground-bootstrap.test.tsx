import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus, RunSnapshot } from "@kplay/contracts";
import { runSnapshot } from "@/lib/client/run-snapshot-test-fixtures";
import { usePlaygroundBootstrap } from "./use-playground-bootstrap";

const apiMocks = vi.hoisted(() => ({
  loadActiveRunSnapshot: vi.fn(),
  loadConnectionStatus: vi.fn(),
  loadScenarioDefinitions: vi.fn(),
}));

vi.mock("@/lib/client/playground-api", () => apiMocks);

describe("usePlaygroundBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.loadConnectionStatus.mockResolvedValue({
      ok: true,
      data: { mode: "demo", status: "demo_mode" },
    });
    apiMocks.loadScenarioDefinitions.mockResolvedValue({ ok: true, data: [] });
    apiMocks.loadActiveRunSnapshot.mockResolvedValue({ ok: true, data: null });
  });

  it("restores an active run for the current scenario", async () => {
    const snapshot = runSnapshot();
    apiMocks.loadActiveRunSnapshot.mockResolvedValue({
      ok: true,
      data: snapshot,
    });
    const harness = renderBootstrap("partitioning");

    await waitFor(() => {
      expect(harness.onSnapshot).toHaveBeenCalledWith(snapshot);
    });
    expect(harness.replaceRoute).not.toHaveBeenCalled();
  });

  it("routes to the active run's scenario instead of applying it locally", async () => {
    apiMocks.loadActiveRunSnapshot.mockResolvedValue({
      ok: true,
      data: runSnapshot({ scenarioId: "retention-data-loss" }),
    });
    const harness = renderBootstrap("partitioning");

    await waitFor(() => {
      expect(harness.replaceRoute).toHaveBeenCalledWith(
        "/scenarios/retention-data-loss",
      );
    });
    expect(harness.onSnapshot).not.toHaveBeenCalled();
  });

  it("ignores a stale active-run response after the route changes", async () => {
    const stale = deferred<{
      ok: true;
      data: RunSnapshot | null;
    }>();
    apiMocks.loadActiveRunSnapshot
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ ok: true, data: null });
    const harness = renderBootstrap("partitioning");

    harness.rerender({ scenarioId: "retention-data-loss" });
    await act(async () => {
      stale.resolve({ ok: true, data: runSnapshot() });
      await stale.promise;
    });

    expect(harness.onSnapshot).not.toHaveBeenCalled();
    expect(harness.replaceRoute).not.toHaveBeenCalled();
  });

  it("applies result-only loader failures without a rejected promise", async () => {
    apiMocks.loadConnectionStatus.mockResolvedValue({
      ok: false,
      message: "Unable to load Kafka connection. (503: unavailable)",
    });
    const harness = renderBootstrap("partitioning");

    await waitFor(() => {
      expect(harness.onConnection).toHaveBeenCalledWith(null);
      expect(harness.setActionError).toHaveBeenCalledWith(
        "Unable to load Kafka connection. (503: unavailable)",
      );
    });
  });

  it("preserves unexpected loader rejection details", async () => {
    apiMocks.loadConnectionStatus.mockRejectedValue(new Error("network down"));
    const harness = renderBootstrap("partitioning");

    await waitFor(() => {
      expect(harness.setActionError).toHaveBeenCalledWith(
        "Unable to load Kafka connection. network down",
      );
    });
  });

  it("does not relabel a success callback defect as a load failure", () => {
    const callbackDefect = new Error("connection callback defect");
    let capturedCallbackDefect: unknown;
    apiMocks.loadConnectionStatus.mockReturnValue({
      then(
        onFulfilled: (result: { ok: true; data: ConnectionStatus }) => void,
        onRejected: (error: unknown) => void,
      ) {
        expect(onRejected).toEqual(expect.any(Function));
        try {
          onFulfilled({
            ok: true,
            data: { mode: "demo", status: "demo_mode" } as ConnectionStatus,
          });
        } catch (error) {
          capturedCallbackDefect = error;
        }
      },
    });
    const onConnection = vi.fn(() => {
      throw callbackDefect;
    });
    const harness = renderBootstrap("partitioning", { onConnection });

    expect(capturedCallbackDefect).toBe(callbackDefect);
    expect(harness.setActionError).not.toHaveBeenCalled();
  });
});

function renderBootstrap(
  initialScenarioId: string,
  overrides: {
    onConnection?: (connection: ConnectionStatus | null) => void;
  } = {},
) {
  const clearRunSelection = vi.fn();
  const onConnection = overrides.onConnection ?? vi.fn();
  const onScenarios = vi.fn();
  const onSnapshot = vi.fn();
  const replaceRoute = vi.fn();
  const setActionError = vi.fn();
  const hook = renderHook(
    ({ scenarioId }) =>
      usePlaygroundBootstrap({
        scenarioId,
        clearRunSelection,
        onConnection,
        onScenarios,
        onSnapshot,
        replaceRoute,
        setActionError,
      }),
    { initialProps: { scenarioId: initialScenarioId } },
  );
  return {
    ...hook,
    clearRunSelection,
    onConnection,
    onScenarios,
    onSnapshot,
    replaceRoute,
    setActionError,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
