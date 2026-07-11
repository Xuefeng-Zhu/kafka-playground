"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  LoaderCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  FocusRef,
  ScenarioLensModel,
} from "@/lib/client/scenario-experience/model";
import { cn } from "@/lib/client/cn";
import { EvidenceFactList, EvidenceFactStrip } from "../evidence-facts";
import { EvidenceTable } from "../evidence-table";
import { lensToneStyle, type LensTone } from "../learning-style";

export type LensRendererProps<T extends ScenarioLensModel> = {
  lens: T;
  focus: FocusRef | null;
  onFocus: (focus: FocusRef) => void;
};

export function LensFrame({
  lens,
  eyebrow,
  icon: Icon,
  tone,
  children,
}: {
  lens: ScenarioLensModel;
  eyebrow: string;
  icon: LucideIcon;
  tone: LensTone;
  children: React.ReactNode;
}) {
  const style = lensToneStyle[tone];

  return (
    <section aria-labelledby={`lens-${lens.kind}-title`}>
      <header
        className={cn(
          "grid gap-3 border-b-[3px] px-4 py-4 sm:grid-cols-[3rem_minmax(0,1fr)]",
          style.border,
          style.wash,
        )}
      >
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl border-2 bg-[#fffdf5] shadow-[3px_3px_0_rgba(15,118,110,0.12)]",
            style.border,
            style.ink,
          )}
        >
          <Icon size={22} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-black uppercase tracking-[0.12em]",
              style.ink,
            )}
          >
            {eyebrow}
          </p>
          <h3
            id={`lens-${lens.kind}-title`}
            className="mt-1 break-words text-xl font-black leading-tight text-[#123047] [overflow-wrap:anywhere]"
          >
            {lens.title}
          </h3>
          <p className="mt-1 break-words text-sm font-semibold leading-6 text-[#31566a] [overflow-wrap:anywhere]">
            {lens.summary}
          </p>
        </div>
      </header>
      <div className="grid gap-4 p-4">{children}</div>
    </section>
  );
}

export function CommonLensEvidence<T extends ScenarioLensModel>({
  lens,
  focus,
  onFocus,
  includeTable = true,
  showEmpty = true,
}: LensRendererProps<T> & { includeTable?: boolean; showEmpty?: boolean }) {
  const hasEvidence =
    lens.facts.length > 0 ||
    lens.sections?.some(
      (section) => section.facts.length > 0 || section.table !== undefined,
    ) ||
    (includeTable && lens.table !== undefined);

  if (!hasEvidence) {
    return showEmpty ? <EmptyEvidence copy={lens.emptyCopy} /> : null;
  }

  return (
    <div className="grid gap-4">
      {lens.facts.length > 0 ? (
        lens.facts.length <= 3 ? (
          <EvidenceFactStrip facts={lens.facts} />
        ) : (
          <EvidenceFactList facts={lens.facts} />
        )
      ) : null}
      {includeTable && lens.table ? (
        <EvidenceTable table={lens.table} focus={focus} onFocus={onFocus} />
      ) : null}
      {lens.sections?.map((section) => (
        <section
          key={section.id}
          className="border-l-4 border-teal-700 pl-3"
          aria-labelledby={`${lens.kind}-${section.id}-title`}
        >
          <h4
            id={`${lens.kind}-${section.id}-title`}
            className="text-sm font-black text-[#123047]"
          >
            {section.title}
          </h4>
          {section.summary ? (
            <p className="mt-1 break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
              {section.summary}
            </p>
          ) : null}
          {section.facts.length > 0 ? (
            <EvidenceFactList facts={section.facts} className="mt-2" />
          ) : null}
          {section.table ? (
            <div className="mt-2">
              <EvidenceTable
                table={section.table}
                focus={focus}
                onFocus={onFocus}
              />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function FocusableEvidence({
  focus,
  selected,
  onFocus,
  label,
  children,
  className,
}: {
  focus: FocusRef;
  selected: boolean;
  onFocus: (focus: FocusRef) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        "min-h-11 w-full rounded-xl border-2 border-teal-700 bg-white p-3 text-left shadow-[3px_3px_0_rgba(15,118,110,0.1)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200",
        selected && "bg-teal-100 outline-2 outline-offset-2 outline-teal-800",
        className,
      )}
      onClick={() => onFocus(focus)}
    >
      {children}
    </button>
  );
}

export function StatusLabel({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const state = statusAppearance[normalized] ?? statusAppearance.neutral;
  const Icon = state.Icon;

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border-2 px-2 text-xs font-extrabold",
        state.className,
      )}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {humanizeStatus(status)}
    </span>
  );
}

function EmptyEvidence({ copy }: { copy: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-teal-700 bg-teal-50 px-4 py-8 text-center">
      <p className="break-words text-sm font-bold leading-6 text-[#31566a] [overflow-wrap:anywhere]">
        {copy}
      </p>
    </div>
  );
}

export function focusMatches(left: FocusRef | null, right: FocusRef) {
  return left?.kind === right.kind && left.id === right.id;
}

const statusAppearance: Record<
  string,
  { Icon: LucideIcon; className: string }
> = {
  active: {
    Icon: LoaderCircle,
    className: "border-sky-700 bg-sky-50 text-sky-950",
  },
  waiting: {
    Icon: Circle,
    className: "border-slate-500 bg-slate-50 text-slate-800",
  },
  idle: {
    Icon: Circle,
    className: "border-slate-500 bg-slate-50 text-slate-800",
  },
  complete: {
    Icon: CheckCircle2,
    className: "border-emerald-700 bg-emerald-50 text-emerald-950",
  },
  succeeded: {
    Icon: CheckCircle2,
    className: "border-emerald-700 bg-emerald-50 text-emerald-950",
  },
  committed: {
    Icon: CheckCircle2,
    className: "border-emerald-700 bg-emerald-50 text-emerald-950",
  },
  allowed: {
    Icon: CheckCircle2,
    className: "border-emerald-700 bg-emerald-50 text-emerald-950",
  },
  joined: {
    Icon: CheckCircle2,
    className: "border-emerald-700 bg-emerald-50 text-emerald-950",
  },
  deduplicated: {
    Icon: CheckCircle2,
    className: "border-violet-700 bg-violet-50 text-violet-950",
  },
  warning: {
    Icon: AlertTriangle,
    className: "border-amber-700 bg-amber-50 text-amber-950",
  },
  retrying: {
    Icon: AlertTriangle,
    className: "border-amber-700 bg-amber-50 text-amber-950",
  },
  late: {
    Icon: AlertTriangle,
    className: "border-amber-700 bg-amber-50 text-amber-950",
  },
  failed: {
    Icon: XCircle,
    className: "border-rose-700 bg-rose-50 text-rose-950",
  },
  denied: {
    Icon: XCircle,
    className: "border-rose-700 bg-rose-50 text-rose-950",
  },
  aborted: {
    Icon: XCircle,
    className: "border-rose-700 bg-rose-50 text-rose-950",
  },
  "dead-lettered": {
    Icon: XCircle,
    className: "border-rose-700 bg-rose-50 text-rose-950",
  },
  neutral: {
    Icon: Circle,
    className: "border-teal-700 bg-white text-teal-950",
  },
};

function humanizeStatus(status: string) {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
