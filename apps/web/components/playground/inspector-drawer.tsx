"use client";

import { useEffect, useRef } from "react";
import {
  InspectorPanel,
  inspectorLabels,
  type InspectorContent,
} from "@/components/inspector/inspector-panel";

export function InspectorDrawer({
  content,
  onClose,
}: {
  content: InspectorContent;
  onClose(): void;
}) {
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    drawerRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current
        ? Array.from(
            drawerRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[#123047]/25"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        id="message-inspector-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={inspectorLabels[content.kind].dialog}
        tabIndex={-1}
        className="fixed bottom-0 right-0 top-0 z-50 w-[min(100vw,390px)] overflow-y-auto border-l-[3px] border-teal-700 bg-[#fff7ed] shadow-[-14px_0_0_rgba(15,118,110,0.16)]"
      >
        <InspectorPanel content={content} onClose={onClose} />
      </aside>
    </>
  );
}
