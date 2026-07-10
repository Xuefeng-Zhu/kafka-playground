import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useWorkspaceView,
  WORKSPACE_VIEW_STORAGE_KEY,
} from "./use-workspace-view";

describe("useWorkspaceView", () => {
  afterEach(() => {
    window.localStorage.clear();
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

  it("shows the saved preference before a converted scenario run starts", () => {
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
