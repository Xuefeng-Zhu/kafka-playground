"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getStoredValue, setStoredValue } from "@/lib/client/safe-storage";

export type WorkspaceView = "guided" | "explore";

export const WORKSPACE_VIEW_STORAGE_KEY = "kplay.workspace.view";

const workspaceViewChangeEvent = "kplay:workspace-view-change";
let volatileWorkspaceView: WorkspaceView | null = null;
let storageValueAtVolatileWrite: string | null = null;
let storageListenerInstalled = false;
const workspaceViewSubscribers = new Set<() => void>();

function isWorkspaceView(value: string | null): value is WorkspaceView {
  return value === "guided" || value === "explore";
}

function clearVolatileWorkspaceView() {
  volatileWorkspaceView = null;
  storageValueAtVolatileWrite = null;
}

function reconcileVolatileWorkspaceView(storedView: string | null) {
  if (
    volatileWorkspaceView !== null &&
    (storedView !== storageValueAtVolatileWrite ||
      storedView === volatileWorkspaceView)
  ) {
    clearVolatileWorkspaceView();
  }
}

function getPreferredWorkspaceView(): WorkspaceView {
  const storedView = getStoredValue(WORKSPACE_VIEW_STORAGE_KEY);
  reconcileVolatileWorkspaceView(storedView);
  if (volatileWorkspaceView !== null) return volatileWorkspaceView;
  return isWorkspaceView(storedView) ? storedView : "guided";
}

function getServerWorkspaceView(): WorkspaceView {
  return "guided";
}

function ensureStorageListener() {
  if (storageListenerInstalled) return;
  window.addEventListener("storage", (event) => {
    if (event.key !== WORKSPACE_VIEW_STORAGE_KEY && event.key !== null) return;

    clearVolatileWorkspaceView();
    for (const subscriber of workspaceViewSubscribers) {
      subscriber();
    }
  });
  storageListenerInstalled = true;
}

function subscribeToWorkspaceView(onStoreChange: () => void) {
  ensureStorageListener();
  workspaceViewSubscribers.add(onStoreChange);
  window.addEventListener(workspaceViewChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener(workspaceViewChangeEvent, onStoreChange);
    workspaceViewSubscribers.delete(onStoreChange);
  };
}

export function useWorkspaceView(
  canUseGuidedView: boolean,
  showPreferredView = canUseGuidedView,
) {
  const preferredWorkspaceView = useSyncExternalStore(
    subscribeToWorkspaceView,
    getPreferredWorkspaceView,
    getServerWorkspaceView,
  );

  const setWorkspaceView = useCallback(
    (nextView: WorkspaceView) => {
      if (!canUseGuidedView) return;

      volatileWorkspaceView = nextView;
      storageValueAtVolatileWrite = getStoredValue(WORKSPACE_VIEW_STORAGE_KEY);
      setStoredValue(WORKSPACE_VIEW_STORAGE_KEY, nextView);
      reconcileVolatileWorkspaceView(
        getStoredValue(WORKSPACE_VIEW_STORAGE_KEY),
      );
      window.dispatchEvent(new Event(workspaceViewChangeEvent));
    },
    [canUseGuidedView],
  );

  return {
    workspaceView: showPreferredView ? preferredWorkspaceView : "explore",
    setWorkspaceView,
  } as const;
}
