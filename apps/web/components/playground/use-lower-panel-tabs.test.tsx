import { act, renderHook, waitFor } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLowerPanelTabs } from "./use-lower-panel-tabs";

const storageKey = "kplay.lowerPanel.activeTab";

describe("useLowerPanelTabs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists and restores the selected tab", async () => {
    const first = renderHook(() => useLowerPanelTabs());

    act(() => first.result.current.selectLowerPanelTab("timeline"));

    expect(first.result.current.activeLowerPanelTab).toBe("timeline");
    expect(window.localStorage.getItem(storageKey)).toBe("timeline");
    first.unmount();

    const restored = renderHook(() => useLowerPanelTabs());
    await waitFor(() => {
      expect(restored.result.current.activeLowerPanelTab).toBe("timeline");
    });
  });

  it("navigates between the remaining tabs with the keyboard", () => {
    const { result } = renderHook(() => useLowerPanelTabs());
    const timelineButton = document.createElement("button");
    const focus = vi.spyOn(timelineButton, "focus");
    result.current.lowerPanelTabRefs.current.timeline = timelineButton;
    const event = keyboardEvent("ArrowRight");

    act(() => result.current.navigateLowerPanelTabs(event, "controls"));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(result.current.activeLowerPanelTab).toBe("timeline");
  });

  it("clears a saved Insights tab from the retired panel", async () => {
    window.localStorage.setItem(storageKey, "insights");

    const { result } = renderHook(() => useLowerPanelTabs());

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).toBeNull();
    });
    expect(result.current.activeLowerPanelTab).toBe("controls");
  });
});

function keyboardEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLButtonElement>;
}
