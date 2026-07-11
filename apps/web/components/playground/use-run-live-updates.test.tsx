import { act, render, waitFor } from "@testing-library/react";
import { useCallback, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSnapshot, RuntimeEvent } from "@kplay/contracts";

const fetchRunSnapshot = vi.hoisted(() => vi.fn());
let reentrantChildRendering = false;
let reentrantEventEmitted = false;

vi.mock("@/lib/client/playground-api", () => ({
  fetchRunSnapshot,
}));

import { useRunLiveUpdates } from "./use-run-live-updates";

describe("useRunLiveUpdates", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    reentrantChildRendering = false;
    reentrantEventEmitted = false;
    fetchRunSnapshot.mockReset();
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("refreshes the run snapshot after runtime events", async () => {
    const dispatch = vi.fn();
    fetchRunSnapshot.mockResolvedValue({ ok: true, data: snapshotFixture });

    render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={vi.fn()}
      />,
    );

    act(() => {
      FakeEventSource.latest().emit("run.started", runtimeEventFixture);
      expect(dispatch).not.toHaveBeenCalled();
    });

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: "event",
        event: runtimeEventFixture,
      }),
    );
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: "snapshot",
        snapshot: snapshotFixture,
      }),
    );
  });

  it("delivers validated snapshot events without an extra refresh", async () => {
    const dispatch = vi.fn();
    const setActionError = vi.fn();

    render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={setActionError}
      />,
    );

    act(() => {
      FakeEventSource.latest().emit("snapshot", {
        snapshot: snapshotFixture,
      });
    });

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: "snapshot",
        snapshot: snapshotFixture,
      }),
    );
    expect(fetchRunSnapshot).not.toHaveBeenCalled();
    expect(setActionError).not.toHaveBeenCalled();
  });

  it("rejects malformed snapshot and runtime event payloads", async () => {
    const dispatch = vi.fn();
    const setActionError = vi.fn();

    render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={setActionError}
      />,
    );
    const source = FakeEventSource.latest();

    act(() => {
      source.emit("snapshot", { snapshot: { runId: "incomplete" } });
      source.emit("run.started", { runId: "incomplete" });
    });

    await waitFor(() => {
      expect(setActionError).toHaveBeenCalledWith(
        "Live snapshot payload could not be parsed.",
      );
      expect(setActionError).toHaveBeenCalledWith(
        "Live event payload could not be parsed.",
      );
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(fetchRunSnapshot).not.toHaveBeenCalled();
  });

  it("ignores refreshed snapshots that resolve after cleanup", async () => {
    const pendingRefresh = deferred<{
      ok: true;
      data: RunSnapshot;
    }>();
    const dispatch = vi.fn();
    const setActionError = vi.fn();
    fetchRunSnapshot.mockReturnValue(pendingRefresh.promise);
    const { unmount } = render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={setActionError}
      />,
    );

    act(() => {
      FakeEventSource.latest().emit("run.started", runtimeEventFixture);
      unmount();
    });
    await act(async () => {
      pendingRefresh.resolve({ ok: true, data: snapshotFixture });
      await pendingRefresh.promise;
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(setActionError).not.toHaveBeenCalled();
  });

  it("cancels queued and in-flight updates before a hard page unload", async () => {
    const pendingRefresh = deferred<{
      ok: true;
      data: RunSnapshot;
    }>();
    const dispatch = vi.fn();
    const setActionError = vi.fn();
    fetchRunSnapshot.mockReturnValue(pendingRefresh.promise);
    render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={setActionError}
      />,
    );
    const source = FakeEventSource.latest();

    act(() => {
      source.emit("run.started", runtimeEventFixture);
      window.dispatchEvent(new PageTransitionEvent("pagehide"));
    });
    await act(async () => {
      pendingRefresh.resolve({ ok: true, data: snapshotFixture });
      await pendingRefresh.promise;
    });

    expect(source.close).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(setActionError).not.toHaveBeenCalled();
  });

  it("defers a reentrant live event until after the child render commits", async () => {
    fetchRunSnapshot.mockReturnValue(new Promise(() => undefined));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const onDelivery = vi.fn();
    const { rerender } = render(
      <ReentrantLiveUpdatesHarness
        emitDuringRender={false}
        onDelivery={onDelivery}
      />,
    );

    rerender(
      <ReentrantLiveUpdatesHarness emitDuringRender onDelivery={onDelivery} />,
    );

    await waitFor(() =>
      expect(
        document.querySelector("[data-testid='delivery-count']")?.textContent,
      ).toBe("1"),
    );
    expect(onDelivery).toHaveBeenCalledWith("after-render");
    expect(onDelivery).not.toHaveBeenCalledWith("during-render");
    expect(
      consoleError.mock.calls.filter((call) =>
        call.some((value) =>
          String(value).includes("Cannot update a component"),
        ),
      ),
    ).toEqual([]);
    consoleError.mockRestore();
  });

  it("coalesces overlapping refreshes and skips stale snapshots", async () => {
    const firstRefresh = deferred<{
      ok: true;
      data: RunSnapshot;
    }>();
    const secondRefresh = deferred<{
      ok: true;
      data: RunSnapshot;
    }>();
    const dispatch = vi.fn();
    fetchRunSnapshot
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise);

    render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={vi.fn()}
      />,
    );

    act(() => {
      FakeEventSource.latest().emit("run.started", runtimeEventFixture);
      FakeEventSource.latest().emit("producer.started", {
        ...runtimeEventFixture,
        eventId: "event-2",
        sequence: 2,
        type: "producer.started",
      });
    });
    expect(fetchRunSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRefresh.resolve({ ok: true, data: snapshotFixture });
      await firstRefresh.promise;
    });
    await waitFor(() => expect(fetchRunSnapshot).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondRefresh.resolve({
        ok: true,
        data: { ...snapshotFixture, sequence: 2 },
      });
      await secondRefresh.promise;
    });

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: "snapshot",
        snapshot: { ...snapshotFixture, sequence: 2 },
      }),
    );
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "snapshot",
      snapshot: snapshotFixture,
    });
  });

  it("surfaces live update disconnects when snapshot refresh fails", async () => {
    const dispatch = vi.fn();
    const setActionError = vi.fn();
    fetchRunSnapshot.mockResolvedValue({
      ok: false,
      message: "Unable to refresh run snapshot.",
    });

    render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={setActionError}
      />,
    );

    act(() => {
      FakeEventSource.latest().emitError();
    });

    await waitFor(() =>
      expect(setActionError).toHaveBeenCalledWith(
        "Unable to refresh run snapshot.",
      ),
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ignores disconnect callbacks after cleanup", () => {
    const dispatch = vi.fn();
    const setActionError = vi.fn();
    const { unmount } = render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={setActionError}
      />,
    );
    const source = FakeEventSource.latest();

    unmount();
    act(() => {
      source.emitError();
    });

    expect(fetchRunSnapshot).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(setActionError).not.toHaveBeenCalled();
  });

  it("ignores live callbacks after manual close", () => {
    const dispatch = vi.fn();
    const setActionError = vi.fn();
    let closeLiveUpdates: (() => void) | null = null;
    render(
      <LiveUpdatesHarness
        dispatch={dispatch}
        runId="run-1"
        setActionError={setActionError}
        onCloseReady={(close) => {
          closeLiveUpdates = close;
        }}
      />,
    );
    const source = FakeEventSource.latest();

    act(() => {
      closeLiveUpdates?.();
      source.emit("run.started", runtimeEventFixture);
      source.emitError();
    });

    expect(source.close).toHaveBeenCalled();
    expect(fetchRunSnapshot).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(setActionError).not.toHaveBeenCalled();
  });
});

function LiveUpdatesHarness({
  dispatch,
  runId,
  setActionError,
  onCloseReady,
}: {
  dispatch: Parameters<typeof useRunLiveUpdates>[0]["dispatch"];
  runId: string | null;
  setActionError: (message: string) => void;
  onCloseReady?: (close: () => void) => void;
}) {
  const closeLiveUpdates = useRunLiveUpdates({
    dispatch,
    runId,
    setActionError,
  });
  useEffect(() => {
    onCloseReady?.(closeLiveUpdates);
  }, [closeLiveUpdates, onCloseReady]);
  return null;
}

function ReentrantLiveUpdatesHarness({
  emitDuringRender,
  onDelivery,
}: {
  emitDuringRender: boolean;
  onDelivery: (phase: "during-render" | "after-render") => void;
}) {
  const [deliveryCount, setDeliveryCount] = useState(0);
  const dispatch = useCallback(() => {
    onDelivery(reentrantChildRendering ? "during-render" : "after-render");
    setDeliveryCount((current) => current + 1);
  }, [onDelivery]);
  const setActionError = useCallback(() => undefined, []);
  useRunLiveUpdates({
    dispatch,
    runId: "run-1",
    setActionError,
  });
  return (
    <>
      <span data-testid="delivery-count">{deliveryCount}</span>
      {emitDuringRender && deliveryCount === 0 ? (
        <EmitLiveEventDuringRender />
      ) : null}
    </>
  );
}

function EmitLiveEventDuringRender() {
  if (reentrantEventEmitted) return null;
  reentrantEventEmitted = true;
  reentrantChildRendering = true;
  try {
    FakeEventSource.latest().emit("run.started", runtimeEventFixture);
  } finally {
    reentrantChildRendering = false;
  }
  return null;
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<(message: MessageEvent) => void>>();
  onmessage: ((message: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  static latest() {
    const source = FakeEventSource.instances.at(-1);
    if (!source) throw new Error("Expected EventSource to be created.");
    return source;
  }

  addEventListener(type: string, listener: (message: MessageEvent) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, payload: unknown) {
    const message = new MessageEvent(type, { data: JSON.stringify(payload) });
    for (const listener of this.listeners.get(type) ?? []) listener(message);
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const runtimeEventFixture = {
  eventId: "event-1",
  runId: "run-1",
  sequence: 1,
  occurredAt: "2026-01-01T00:00:00.000Z",
  type: "run.started",
} satisfies RuntimeEvent;

const snapshotFixture = {
  runId: "run-1",
  scenarioId: "partitioning",
  mode: "demo",
  status: "running",
  topicName: "kplay.partitioning",
  partitionCount: 2,
  consumerLimit: 3,
  consumerGroupId: "kplay-group",
  producerStatus: "running",
  productionRate: 1,
  keyStrategy: { type: "round_robin_users" },
  processingLatencyMs: 0,
  consumers: [],
  latestPartitionOffsets: {},
  latestCommittedOffsets: {},
  messageCounts: {},
  recentMessages: [],
  recentEvents: [runtimeEventFixture],
  cleanupStatus: "not_requested",
  sequence: 1,
} satisfies RunSnapshot;
