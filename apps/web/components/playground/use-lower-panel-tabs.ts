"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getStoredValue, setStoredValue } from "@/lib/client/safe-storage";

const LOWER_PANEL_TAB_STORAGE_KEY = "kplay.lowerPanel.activeTab";
const lowerPanelTabIds = ["controls", "insights", "timeline"] as const;

export type LowerPanelTab = (typeof lowerPanelTabIds)[number];

export function useLowerPanelTabs() {
  const lowerPanelTabRefs = useRef<
    Partial<Record<LowerPanelTab, HTMLButtonElement | null>>
  >({});
  const [activeLowerPanelTab, setActiveLowerPanelTab] =
    useState<LowerPanelTab>("controls");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const savedTab = getStoredValue(LOWER_PANEL_TAB_STORAGE_KEY);
      if (isLowerPanelTab(savedTab)) setActiveLowerPanelTab(savedTab);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectLowerPanelTab(tab: LowerPanelTab) {
    setActiveLowerPanelTab(tab);
    setStoredValue(LOWER_PANEL_TAB_STORAGE_KEY, tab);
  }

  function navigateLowerPanelTabs(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: LowerPanelTab,
  ) {
    const currentIndex = lowerPanelTabIds.indexOf(currentTab);
    const lastIndex = lowerPanelTabIds.length - 1;
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (nextIndex === currentIndex) return;

    event.preventDefault();
    const nextTab = lowerPanelTabIds[nextIndex];
    selectLowerPanelTab(nextTab);
    lowerPanelTabRefs.current[nextTab]?.focus();
  }

  return {
    activeLowerPanelTab,
    lowerPanelTabRefs,
    navigateLowerPanelTabs,
    selectLowerPanelTab,
  };
}

function isLowerPanelTab(value: string | null): value is LowerPanelTab {
  return lowerPanelTabIds.some((tab) => tab === value);
}
