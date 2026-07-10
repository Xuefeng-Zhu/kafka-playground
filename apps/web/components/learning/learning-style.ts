import type { Provenance } from "@/lib/client/scenario-experience/model";

export const provenanceStyle: Record<
  Provenance,
  { label: string; badge: string; dot: string }
> = {
  observed: {
    label: "Observed",
    badge: "border-rose-600 bg-rose-50 text-rose-900",
    dot: "bg-rose-500",
  },
  derived: {
    label: "Derived",
    badge: "border-violet-600 bg-violet-50 text-violet-900",
    dot: "bg-violet-500",
  },
  simulated: {
    label: "Simulated",
    badge: "border-amber-600 bg-amber-50 text-amber-950",
    dot: "bg-amber-500",
  },
};

export const emphasisStyle = {
  neutral: "border-sky-700 bg-sky-50 text-sky-950",
  positive: "border-emerald-700 bg-emerald-50 text-emerald-950",
  warning: "border-amber-700 bg-amber-50 text-amber-950",
  danger: "border-rose-700 bg-rose-50 text-rose-950",
} as const;

export const lensToneStyle = {
  teal: {
    border: "border-teal-700",
    wash: "bg-teal-50",
    ink: "text-teal-900",
  },
  sky: {
    border: "border-sky-700",
    wash: "bg-sky-50",
    ink: "text-sky-950",
  },
  rose: {
    border: "border-rose-700",
    wash: "bg-rose-50",
    ink: "text-rose-950",
  },
  violet: {
    border: "border-violet-700",
    wash: "bg-violet-50",
    ink: "text-violet-950",
  },
  amber: {
    border: "border-amber-700",
    wash: "bg-amber-50",
    ink: "text-amber-950",
  },
} as const;

export type LensTone = keyof typeof lensToneStyle;
