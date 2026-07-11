"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
} from "react";
import {
  runSnapshotSchema,
  runtimeEventSchema,
  runtimeEventTypes,
  type RunSnapshot,
  type RuntimeEvent,
} from "@kplay/contracts";
import { fetchRunSnapshot } from "@/lib/client/playground-api";

type LiveUpdateAction =
  | { type: "snapshot"; snapshot: RunSnapshot }
  | { type: "event"; event: RuntimeEvent };

export function useRunLiveUpdates({
  dispatch,
  runId,
  setActionError,
}: {
  dispatch: Dispatch<LiveUpdateAction>;
  runId: string | null;
  setActionError: (message: string) => void;
}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const closeLiveUpdatesRef = useRef<() => void>(() => undefined);
  const [deliveryStore] = useState(createLiveUpdateStore);
  const renderToken = deliveryStore.beginRender();
  useSyncExternalStore(
    deliveryStore.subscribe,
    deliveryStore.getSnapshot,
    deliveryStore.getSnapshot,
  );

  const closeLiveUpdates = useCallback(() => {
    closeLiveUpdatesRef.current();
  }, []);

  useLayoutEffect(() => {
    deliveryStore.commitRender(renderToken);
  });

  useEffect(() => {
    const updates = deliveryStore.drain();
    if (updates.length === 0) return;
    startTransition(() => {
      for (const update of updates) update();
    });
  });

  useEffect(() => {
    if (!runId) return;
    let active = true;
    let refreshGeneration = 0;
    let refreshInFlight = false;
    let refreshQueued = false;
    let queuedFallback = "Unable to refresh the latest run snapshot.";
    const source = new EventSource(`/api/v1/runs/${runId}/events`);
    eventSourceRef.current = source;
    const enqueueUpdate = (update: () => void) => {
      if (!active) return;
      deliveryStore.enqueue(update);
    };
    const closeSource = () => {
      if (!active) return;
      active = false;
      refreshGeneration += 1;
      deliveryStore.clear();
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
    };
    const handlePageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) closeSource();
    };
    window.addEventListener("pagehide", handlePageHide);
    closeLiveUpdatesRef.current = closeSource;
    const refreshActiveSnapshot = (fallback: string) => {
      queuedFallback = fallback;
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      const requestGeneration = refreshGeneration;
      void refreshSnapshot(runId)
        .then((snapshot) => {
          if (
            !active ||
            requestGeneration !== refreshGeneration ||
            refreshQueued ||
            !snapshot
          )
            return;
          enqueueUpdate(() => {
            dispatch({ type: "snapshot", snapshot });
          });
        })
        .catch((error) => {
          if (
            !active ||
            requestGeneration !== refreshGeneration ||
            refreshQueued
          )
            return;
          enqueueUpdate(() => {
            setActionError(error instanceof Error ? error.message : fallback);
          });
        })
        .finally(() => {
          if (!active || requestGeneration !== refreshGeneration) return;
          refreshInFlight = false;
          if (refreshQueued) {
            refreshQueued = false;
            refreshActiveSnapshot(queuedFallback);
          }
        });
    };
    source.addEventListener("snapshot", (message) => {
      if (!active) return;
      try {
        const payload = JSON.parse(message.data) as { snapshot: unknown };
        const snapshot = runSnapshotSchema.parse(payload.snapshot);
        enqueueUpdate(() => {
          dispatch({ type: "snapshot", snapshot });
        });
      } catch {
        enqueueUpdate(() => {
          setActionError("Live snapshot payload could not be parsed.");
        });
      }
    });
    source.onmessage = () => undefined;
    runtimeEventTypes.forEach((type) => {
      source.addEventListener(type, (message) => {
        if (!active) return;
        try {
          const event = runtimeEventSchema.parse(JSON.parse(message.data));
          enqueueUpdate(() => {
            dispatch({ type: "event", event });
          });
        } catch {
          enqueueUpdate(() => {
            setActionError("Live event payload could not be parsed.");
          });
          return;
        }
        refreshActiveSnapshot("Unable to refresh the latest run snapshot.");
      });
    });
    source.onerror = () => {
      if (!active) return;
      refreshActiveSnapshot("Live updates disconnected.");
    };
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      closeSource();
      if (closeLiveUpdatesRef.current === closeSource) {
        closeLiveUpdatesRef.current = () => undefined;
      }
    };
  }, [deliveryStore, dispatch, runId, setActionError]);

  return closeLiveUpdates;
}

async function refreshSnapshot(runId: string) {
  const result = await fetchRunSnapshot(runId);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

function createLiveUpdateStore() {
  let version = 0;
  let queuedUpdates: Array<() => void> = [];
  let renderToken = 0;
  let pendingRenderToken: number | null = null;
  const listeners = new Set<() => void>();

  return {
    beginRender() {
      pendingRenderToken = ++renderToken;
      return renderToken;
    },
    clear() {
      queuedUpdates = [];
    },
    commitRender(token: number) {
      if (pendingRenderToken === token) pendingRenderToken = null;
    },
    drain() {
      const updates = queuedUpdates;
      queuedUpdates = [];
      return updates;
    },
    enqueue(update: () => void) {
      queuedUpdates.push(update);
      version += 1;
      if (pendingRenderToken !== null) return;
      for (const listener of listeners) listener();
    },
    getSnapshot() {
      return version;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
