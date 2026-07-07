"use client";

import {
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

  function maxTimelineHeight() {
    const workspaceHeight =
      workspaceGridRef.current?.getBoundingClientRect().height ?? 780;
    return Math.min(
      MAX_TIMELINE_HEIGHT,
      Math.max(MIN_TIMELINE_HEIGHT, workspaceHeight - MIN_TOPOLOGY_HEIGHT),
    );
  }

  function clampTimelineHeight(nextHeight: number) {
    return Math.min(
      maxTimelineHeight(),
      Math.max(MIN_TIMELINE_HEIGHT, Math.round(nextHeight)),
    );
  }

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
