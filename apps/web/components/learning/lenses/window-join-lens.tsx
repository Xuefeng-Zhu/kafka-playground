"use client";

import { Braces, Clock3 } from "lucide-react";
import type { WindowJoinLensModel } from "@/lib/client/scenario-experience/model";
import { EvidenceTable } from "../evidence-table";
import { ProvenanceBadge } from "../provenance";
import {
  CommonLensEvidence,
  FocusableEvidence,
  LensFrame,
  StatusLabel,
  focusMatches,
  type LensRendererProps,
} from "./lens-primitives";

export function WindowJoinLens(props: LensRendererProps<WindowJoinLensModel>) {
  const { lens, focus, onFocus } = props;
  const left = lens.records.filter((record) => record.side === "left");
  const right = lens.records.filter((record) => record.side === "right");

  return (
    <LensFrame lens={lens} eyebrow="Window match" icon={Braces} tone="violet">
      {lens.records.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <JoinSide
            title="Left stream"
            records={left}
            focus={focus}
            onFocus={onFocus}
          />
          <JoinSide
            title="Right stream"
            records={right}
            focus={focus}
            onFocus={onFocus}
          />
        </div>
      ) : null}
      <EvidenceTable table={lens.outputs} focus={focus} onFocus={onFocus} />
      <CommonLensEvidence {...props} showEmpty={false} />
    </LensFrame>
  );
}

type JoinRecord = WindowJoinLensModel["records"][number];

function JoinSide({
  title,
  records,
  focus,
  onFocus,
}: {
  title: string;
  records: readonly JoinRecord[];
  focus: LensRendererProps<WindowJoinLensModel>["focus"];
  onFocus: LensRendererProps<WindowJoinLensModel>["onFocus"];
}) {
  return (
    <section className="rounded-2xl border-2 border-violet-700 bg-violet-50 p-3">
      <h4 className="text-sm font-black text-violet-950">{title}</h4>
      {records.length > 0 ? (
        <ol className="mt-2 grid gap-2">
          {records.map((record) => (
            <li key={record.id}>
              <FocusableEvidence
                focus={record.focus}
                selected={focusMatches(focus, record.focus)}
                onFocus={onFocus}
                label={`Focus ${record.side} join record ${record.id}`}
              >
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <code className="block break-all text-sm font-black text-[#123047]">
                      {record.key}
                    </code>
                    <span className="mt-1 flex items-center gap-1 text-xs font-bold text-[#466778]">
                      <Clock3 size={14} aria-hidden="true" />
                      {record.eventTimeMs} ms
                      {record.windowId ? ` · ${record.windowId}` : ""}
                    </span>
                  </span>
                  <StatusLabel status={record.outcome} />
                </span>
                <ProvenanceBadge
                  provenance={record.provenance}
                  className="mt-2"
                />
              </FocusableEvidence>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs font-semibold leading-5 text-[#466778]">
          No records on this side yet.
        </p>
      )}
    </section>
  );
}
