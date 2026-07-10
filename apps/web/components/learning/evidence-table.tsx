"use client";

import { CheckCircle2, Circle, TriangleAlert } from "lucide-react";
import type {
  EvidenceTableModel,
  FocusRef,
} from "@/lib/client/scenario-experience/model";
import { focusRefKey } from "@/lib/client/scenario-experience/model";
import { cn } from "@/lib/client/cn";
import { evidenceScopeText, evidenceValueText } from "./evidence-value";
import { emphasisStyle } from "./learning-style";
import { ProvenanceBadge } from "./provenance";

export function EvidenceTable({
  table,
  focus,
  onFocus,
}: {
  table: EvidenceTableModel;
  focus: FocusRef | null;
  onFocus: (focus: FocusRef) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-teal-700 bg-[#fffdf5]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-teal-700 bg-teal-50 px-3 py-2">
        <p className="text-sm font-extrabold text-[#123047]">{table.caption}</p>
        {table.bounded ? (
          <p className="text-xs font-bold text-[#466778]">
            {table.bounded.label}
          </p>
        ) : null}
      </div>
      {table.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-left text-xs">
            <caption className="sr-only">{table.caption}</caption>
            <thead>
              <tr className="border-b-2 border-teal-700 bg-[#fffdf5]">
                <th scope="col" className="w-12 px-3 py-3">
                  <span className="sr-only">Focus</span>
                </th>
                {table.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      "px-3 py-3 text-xs font-black uppercase tracking-[0.08em] text-teal-900",
                      column.align === "end" && "text-right",
                      column.align === "center" && "text-center",
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => {
                const selected =
                  row.focus !== undefined &&
                  focus !== null &&
                  focusRefKey(row.focus) === focusRefKey(focus);
                const Icon =
                  row.emphasis === "danger" || row.emphasis === "warning"
                    ? TriangleAlert
                    : selected
                      ? CheckCircle2
                      : Circle;

                return (
                  <tr
                    key={row.id}
                    data-testid={`evidence-row-${row.id}`}
                    className={cn(
                      "border-b border-teal-700/35 last:border-b-0",
                      row.emphasis
                        ? emphasisStyle[row.emphasis]
                        : "bg-white text-[#123047]",
                      selected &&
                        "outline-2 -outline-offset-2 outline-teal-800",
                    )}
                    data-selected={selected ? "true" : undefined}
                  >
                    <td className="px-2 py-1 align-top">
                      {row.focus ? (
                        <button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-teal-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                          aria-label={`${selected ? "Focused" : "Focus"} row ${row.id}`}
                          aria-pressed={selected}
                          onClick={() => onFocus(row.focus!)}
                        >
                          <Icon
                            size={18}
                            strokeWidth={2.5}
                            aria-hidden="true"
                          />
                        </button>
                      ) : (
                        <Icon
                          className="mx-auto mt-3 text-[#466778]"
                          size={16}
                          aria-hidden="true"
                        />
                      )}
                    </td>
                    {table.columns.map((column) => {
                      const value = row.cells[column.key];
                      return (
                        <td
                          key={column.key}
                          className={cn(
                            "max-w-72 px-3 py-3 align-top",
                            column.align === "end" && "text-right",
                            column.align === "center" && "text-center",
                          )}
                        >
                          {value ? (
                            <div className="min-w-0">
                              <div className="break-words text-sm font-extrabold leading-5 [overflow-wrap:anywhere]">
                                {evidenceValueText(value)}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <ProvenanceBadge
                                  provenance={value.provenance}
                                />
                                <span className="text-xs font-semibold text-[#466778]">
                                  {evidenceScopeText(
                                    value.scope,
                                    value.scopeLabel,
                                  )}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm font-bold text-[#466778]">
                              Not available
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-6 text-sm font-semibold leading-6 text-[#466778]">
          {table.emptyCopy}
        </p>
      )}
    </div>
  );
}
