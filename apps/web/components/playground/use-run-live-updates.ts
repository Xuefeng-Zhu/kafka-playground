"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
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

  const closeLiveUpdates = useCallback(() => {
    closeLiveUpdatesRef.current();
  }, []);

  useEffect(() => {
    if (!runId) return;
    let active = true;
    let deliveryScheduled = false;
    let queuedUpdates: Array<() => void> = [];
    let refreshGeneration = 0;
    let refreshInFlight = false;
    let refreshQueued = false;
    let queuedFallback = "Unable to refresh the latest run snapshot.";
    const source = new EventSource(`/api/v1/runs/${runId}/events`);
    eventSourceRef.current = source;
    const enqueueUpdate = (update: () => void) => {
      if (!active) return;
      queuedUpdates.push(update);
      if (deliveryScheduled) return;
      deliveryScheduled = true;
      queueMicrotask(() => {
        deliveryScheduled = false;
        if (!active) {
          queuedUpdates = [];
          return;
        }
        const updates = queuedUpdates;
        queuedUpdates = [];
        startTransition(() => {
          for (const queuedUpdate of updates) queuedUpdate();
        });
      });
    };
    const closeSource = () => {
      if (!active) return;
      active = false;
      refreshGeneration += 1;
      queuedUpdates = [];
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
  }, [dispatch, runId, setActionError]);

  return closeLiveUpdates;
}

async function refreshSnapshot(runId: string) {
  const result = await fetchRunSnapshot(runId);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}
