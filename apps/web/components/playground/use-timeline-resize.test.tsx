import { act, renderHook } from "@testing-library/react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
  useTimelineResize,
} from "./use-timeline-resize";

describe("useTimelineResize", () => {
  let resizeObserver: ResizeObserverHarness;

  beforeEach(() => {
    resizeObserver = installResizeObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts at the collapsed height in a regular workspace", () => {
    const workspace = workspaceRef(780);
    const { result } = renderHook(() => useTimelineResize(workspace.ref));

    expect(result.current.timelineHeight).toBe(210);
    expect(result.current.workspaceStyle).toMatchObject({
      "--timeline-height": "210px",
    });
    expect(result.current.minTimelineHeight).toBe(MIN_TIMELINE_HEIGHT);
    expect(result.current.maxTimelineHeight).toBe(MAX_TIMELINE_HEIGHT);
    expect(resizeObserver.observe).toHaveBeenCalledWith(workspace.element);
  });

  it("collapses to the minimum in a short workspace", () => {
    const workspace = workspaceRef(500);
    const { result } = renderHook(() => useTimelineResize(workspace.ref));

    expect(result.current.timelineHeight).toBe(MIN_TIMELINE_HEIGHT);
    expect(result.current.workspaceStyle).toMatchObject({
      "--timeline-height": `${MIN_TIMELINE_HEIGHT}px`,
    });
  });

  it("reclamps the current height when its observed workspace shrinks", () => {
    const workspace = workspaceRef(1_000);
    const { result } = renderHook(() => useTimelineResize(workspace.ref));
    const handle = resizeHandle();

    act(() => {
      result.current.startTimelineResize(
        pointerEvent(handle.element, { clientY: 400 }),
      );
      result.current.moveTimelineResize(
        pointerEvent(handle.element, { clientY: 100 }),
      );
    });
    expect(result.current.timelineHeight).toBe(510);

    workspace.setHeight(400);
    act(() => resizeObserver.trigger());

    expect(result.current.timelineHeight).toBe(180);
  });

  it("clamps pointer resizing and releases only the active pointer", () => {
    const workspace = workspaceRef(500);
    const { result } = renderHook(() => useTimelineResize(workspace.ref));
    const handle = resizeHandle();

    act(() => {
      result.current.startTimelineResize(
        pointerEvent(handle.element, { clientY: 300 }),
      );
    });
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);

    act(() => {
      result.current.moveTimelineResize(
        pointerEvent(handle.element, { clientY: -200 }),
      );
    });
    expect(result.current.timelineHeight).toBe(280);

    act(() => {
      result.current.moveTimelineResize(
        pointerEvent(handle.element, { clientY: 900 }),
      );
    });
    expect(result.current.timelineHeight).toBe(MIN_TIMELINE_HEIGHT);

    act(() => {
      result.current.stopTimelineResize(
        pointerEvent(handle.element, { pointerId: 8 }),
      );
    });
    expect(handle.releasePointerCapture).not.toHaveBeenCalled();

    act(() => {
      result.current.stopTimelineResize(pointerEvent(handle.element));
    });
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);

    act(() => {
      result.current.moveTimelineResize(
        pointerEvent(handle.element, { clientY: 100 }),
      );
    });
    expect(result.current.timelineHeight).toBe(MIN_TIMELINE_HEIGHT);
  });

  it("ignores non-primary pointers", () => {
    const workspace = workspaceRef(780);
    const { result } = renderHook(() => useTimelineResize(workspace.ref));
    const handle = resizeHandle();

    act(() => {
      result.current.startTimelineResize(
        pointerEvent(handle.element, { button: 2 }),
      );
      result.current.moveTimelineResize(
        pointerEvent(handle.element, { clientY: 0 }),
      );
    });

    expect(handle.setPointerCapture).not.toHaveBeenCalled();
    expect(result.current.timelineHeight).toBe(210);
  });

  it("supports keyboard resizing and leaves unrelated keys alone", () => {
    const workspace = workspaceRef(780);
    const { result } = renderHook(() => useTimelineResize(workspace.ref));
    const arrowUp = keyboardEvent("ArrowUp");
    const pageDown = keyboardEvent("PageDown");
    const enter = keyboardEvent("Enter");

    act(() => result.current.adjustTimelineHeightWithKeyboard(arrowUp));
    expect(arrowUp.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.timelineHeight).toBe(234);

    act(() => result.current.adjustTimelineHeightWithKeyboard(pageDown));
    expect(pageDown.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.timelineHeight).toBe(210);

    act(() => result.current.adjustTimelineHeightWithKeyboard(enter));
    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(result.current.timelineHeight).toBe(210);
  });

  it("disconnects the observer and removes the resize listener on unmount", () => {
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const workspace = workspaceRef(780);
    const hook = renderHook(() => useTimelineResize(workspace.ref));

    hook.unmount();

    expect(resizeObserver.disconnect).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
  });
});

type ResizeObserverHarness = {
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  trigger: () => void;
};

function installResizeObserver(): ResizeObserverHarness {
  let callback: ResizeObserverCallback = () => undefined;
  const harness: ResizeObserverHarness = {
    disconnect: vi.fn(),
    observe: vi.fn(),
    trigger: () => callback([], {} as ResizeObserver),
  };

  class ResizeObserverMock {
    constructor(nextCallback: ResizeObserverCallback) {
      callback = nextCallback;
    }

    disconnect = harness.disconnect;
    observe = harness.observe;
    unobserve = vi.fn();
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  return harness;
}

function workspaceRef(initialHeight: number) {
  let height = initialHeight;
  const element = document.createElement("div");
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        bottom: height,
        height,
        left: 0,
        right: 1,
        top: 0,
        width: 1,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) satisfies DOMRect,
  );
  return {
    element,
    ref: { current: element } satisfies RefObject<HTMLDivElement>,
    setHeight(nextHeight: number) {
      height = nextHeight;
    },
  };
}

function resizeHandle() {
  const element = document.createElement("div");
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  Object.assign(element, {
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture,
    setPointerCapture,
  });
  return { element, releasePointerCapture, setPointerCapture };
}

function pointerEvent(
  currentTarget: HTMLDivElement,
  overrides: Partial<ReactPointerEvent<HTMLDivElement>> = {},
) {
  return {
    button: 0,
    clientY: 300,
    currentTarget,
    pointerId: 7,
    ...overrides,
  } as ReactPointerEvent<HTMLDivElement>;
}

function keyboardEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as ReactKeyboardEvent<HTMLDivElement>;
}
