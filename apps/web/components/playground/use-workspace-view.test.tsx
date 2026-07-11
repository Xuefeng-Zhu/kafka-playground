import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useWorkspaceView,
  WORKSPACE_VIEW_STORAGE_KEY,
} from "./use-workspace-view";

describe("useWorkspaceView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
    dispatchStorageEvent(null, null);
  });

  it("defaults first-time demo users to Guided", () => {
    const { result } = renderHook(() => useWorkspaceView(true));

    expect(result.current.workspaceView).toBe("guided");
    expect(window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY)).toBeNull();
  });

  it("restores a validated global preference", () => {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, "explore");

    const { result } = renderHook(() => useWorkspaceView(true));

    expect(result.current.workspaceView).toBe("explore");
  });

  it("falls back to Guided for an invalid stored preference", () => {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, "dashboard");

    const { result } = renderHook(() => useWorkspaceView(true));

    expect(result.current.workspaceView).toBe("guided");
  });

  it("shows the saved preference before a supported scenario run starts", () => {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, "explore");

    const { result } = renderHook(() => useWorkspaceView(false, true));

    expect(result.current.workspaceView).toBe("explore");

    act(() => result.current.setWorkspaceView("guided"));

    expect(window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY)).toBe(
      "explore",
    );
  });

  it("persists view changes and updates mounted consumers", () => {
    const first = renderHook(() => useWorkspaceView(true));
    const second = renderHook(() => useWorkspaceView(true));

    act(() => first.result.current.setWorkspaceView("explore"));

    expect(window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY)).toBe(
      "explore",
    );
    expect(first.result.current.workspaceView).toBe("explore");
    expect(second.result.current.workspaceView).toBe("explore");
  });

  it("keeps a rejected storage write across a complete remount", () => {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, "guided");
    const first = renderHook(() => useWorkspaceView(true));
    const second = renderHook(() => useWorkspaceView(true));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    act(() => first.result.current.setWorkspaceView("explore"));

    expect(first.result.current.workspaceView).toBe("explore");
    expect(second.result.current.workspaceView).toBe("explore");
    expect(window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY)).toBe(
      "guided",
    );

    first.unmount();
    second.unmount();

    const third = renderHook(() => useWorkspaceView(true));
    expect(third.result.current.workspaceView).toBe("explore");

    third.unmount();
  });

  it("reconciles the fallback when the stored value actually changes", () => {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, "guided");
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });
    const failedWrite = renderHook(() => useWorkspaceView(true));

    act(() => failedWrite.result.current.setWorkspaceView("explore"));
    expect(failedWrite.result.current.workspaceView).toBe("explore");
    failedWrite.unmount();

    setItem.mockRestore();
    window.localStorage.removeItem(WORKSPACE_VIEW_STORAGE_KEY);

    const remounted = renderHook(() => useWorkspaceView(true));
    expect(remounted.result.current.workspaceView).toBe("guided");
  });

  it("resets the fallback when a storage event arrives while unmounted", () => {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, "guided");
    const failedWrite = renderHook(() => useWorkspaceView(true));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    act(() => failedWrite.result.current.setWorkspaceView("explore"));
    failedWrite.unmount();

    dispatchStorageEvent(WORKSPACE_VIEW_STORAGE_KEY, "guided");

    const remounted = renderHook(() => useWorkspaceView(true));
    expect(remounted.result.current.workspaceView).toBe("guided");
  });

  it("forces Explore without overwriting the saved demo preference", () => {
    window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, "guided");
    const { result, rerender } = renderHook(
      ({ canUseGuidedView }) => useWorkspaceView(canUseGuidedView),
      { initialProps: { canUseGuidedView: false } },
    );

    expect(result.current.workspaceView).toBe("explore");

    act(() => result.current.setWorkspaceView("explore"));

    expect(window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY)).toBe(
      "guided",
    );

    rerender({ canUseGuidedView: true });
    expect(result.current.workspaceView).toBe("guided");
  });
});

function dispatchStorageEvent(key: string | null, newValue: string | null) {
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
  });
}
