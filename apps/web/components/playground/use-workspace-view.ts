"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getStoredValue, setStoredValue } from "@/lib/client/safe-storage";

export type WorkspaceView = "guided" | "explore";

export const WORKSPACE_VIEW_STORAGE_KEY = "kplay.workspace.view";

const workspaceViewChangeEvent = "kplay:workspace-view-change";

function isWorkspaceView(value: string | null): value is WorkspaceView {
  return value === "guided" || value === "explore";
}

function getPreferredWorkspaceView(): WorkspaceView {
  const storedView = getStoredValue(WORKSPACE_VIEW_STORAGE_KEY);
  return isWorkspaceView(storedView) ? storedView : "guided";
}

function getServerWorkspaceView(): WorkspaceView {
  return "guided";
}

function subscribeToWorkspaceView(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === WORKSPACE_VIEW_STORAGE_KEY || event.key === null) {
      onStoreChange();
    }
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(workspaceViewChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(workspaceViewChangeEvent, onStoreChange);
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

      setStoredValue(WORKSPACE_VIEW_STORAGE_KEY, nextView);
      window.dispatchEvent(new Event(workspaceViewChangeEvent));
    },
    [canUseGuidedView],
  );

  return {
    workspaceView: showPreferredView ? preferredWorkspaceView : "explore",
    setWorkspaceView,
  } as const;
}
