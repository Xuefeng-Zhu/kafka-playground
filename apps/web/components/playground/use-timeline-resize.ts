"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

const COLLAPSED_TIMELINE_HEIGHT = 210;
export const MIN_TIMELINE_HEIGHT = 160;
export const MAX_TIMELINE_HEIGHT = 720;
const MIN_TOPOLOGY_HEIGHT = 220;
const SHORT_WORKSPACE_HEIGHT = 620;
const TIMELINE_RESIZE_STEP = 24;

type TimelineResizeState = {
  pointerId: number;
  startHeight: number;
  startY: number;
};

export function useTimelineResize(
  workspaceGridRef: RefObject<HTMLDivElement | null>,
) {
  const timelineResizeRef = useRef<TimelineResizeState | null>(null);
  const [timelineHeight, setTimelineHeight] = useState(
    COLLAPSED_TIMELINE_HEIGHT,
  );
  const workspaceStyle = {
    "--timeline-height": `${timelineHeight}px`,
  } as CSSProperties;

  const maxTimelineHeight = useCallback(() => {
    const workspaceHeight =
      workspaceGridRef.current?.getBoundingClientRect().height ?? 780;
    return Math.min(
      MAX_TIMELINE_HEIGHT,
      Math.max(MIN_TIMELINE_HEIGHT, workspaceHeight - MIN_TOPOLOGY_HEIGHT),
    );
  }, [workspaceGridRef]);

  const clampTimelineHeight = useCallback(
    (nextHeight: number) => {
      return Math.min(
        maxTimelineHeight(),
        Math.max(MIN_TIMELINE_HEIGHT, Math.round(nextHeight)),
      );
    },
    [maxTimelineHeight],
  );

  useEffect(() => {
    const syncTimelineHeight = () => {
      setTimelineHeight((current) => {
        const clamped = clampTimelineHeight(current);
        const workspaceHeight =
          workspaceGridRef.current?.getBoundingClientRect().height ?? 780;
        if (
          current === COLLAPSED_TIMELINE_HEIGHT &&
          workspaceHeight < SHORT_WORKSPACE_HEIGHT
        ) {
          return Math.min(clamped, MIN_TIMELINE_HEIGHT);
        }
        return clamped;
      });
    };
    syncTimelineHeight();

    window.addEventListener("resize", syncTimelineHeight);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncTimelineHeight);
    const workspaceGrid = workspaceGridRef.current;
    if (workspaceGrid) observer?.observe(workspaceGrid);

    return () => {
      window.removeEventListener("resize", syncTimelineHeight);
      observer?.disconnect();
    };
  }, [clampTimelineHeight, workspaceGridRef]);

  function updateTimelineHeight(nextHeight: number) {
    setTimelineHeight(clampTimelineHeight(nextHeight));
  }

  function startTimelineResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineResizeRef.current = {
      pointerId: event.pointerId,
      startHeight: timelineHeight,
      startY: event.clientY,
    };
  }

  function moveTimelineResize(event: PointerEvent<HTMLDivElement>) {
    const resize = timelineResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    updateTimelineHeight(resize.startHeight + resize.startY - event.clientY);
  }

  function stopTimelineResize(event: PointerEvent<HTMLDivElement>) {
    const resize = timelineResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    timelineResizeRef.current = null;
  }

  function adjustTimelineHeightWithKeyboard(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      updateTimelineHeight(timelineHeight + TIMELINE_RESIZE_STEP);
    }
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      updateTimelineHeight(timelineHeight - TIMELINE_RESIZE_STEP);
    }
  }

  return {
    adjustTimelineHeightWithKeyboard,
    maxTimelineHeight: MAX_TIMELINE_HEIGHT,
    minTimelineHeight: MIN_TIMELINE_HEIGHT,
    moveTimelineResize,
    startTimelineResize,
    stopTimelineResize,
    timelineHeight,
    workspaceStyle,
  };
}
