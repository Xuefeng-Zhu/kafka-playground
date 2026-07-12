"use client";

import { useSyncExternalStore } from "react";

const mobileTopologyQuery = "(max-width: 767px)";
const listeners = new Set<() => void>();
let mediaQuery: MediaQueryList | null = null;

export function useMobileTopology(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(listener: () => void) {
  const query = getMediaQuery();
  if (!query) return () => undefined;

  listeners.add(listener);
  if (listeners.size === 1) query.addEventListener("change", notifyListeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      query.removeEventListener("change", notifyListeners);
      if (mediaQuery === query) mediaQuery = null;
    }
  };
}

function getSnapshot() {
  return getMediaQuery()?.matches ?? null;
}

function getServerSnapshot() {
  return null;
}

function getMediaQuery() {
  if (typeof window === "undefined") return null;
  mediaQuery ??= window.matchMedia(mobileTopologyQuery);
  return mediaQuery;
}

function notifyListeners() {
  for (const listener of listeners) listener();
}
