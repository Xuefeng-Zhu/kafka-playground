import type { PlaygroundMessage, RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDot, X } from "lucide-react";

export function InspectorPanel({
  message,
  event,
  snapshot
}: {
  message: PlaygroundMessage | null;
  event: RuntimeEvent | null;
  snapshot: RunSnapshot | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Message Inspector</h2>
        <X size={16} className="text-slate-400" aria-hidden />
      </header>

      {!snapshot && (
        <div className="p-5 text-sm text-slate-400">Start a run to inspect messages and events.</div>
      )}

      {snapshot && (
        <>
          <section className="border-b border-slate-800 p-5">
            <div className="text-sm text-slate-400">Selected message</div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-300">
                {message ? `Partition ${message.partition ?? "?"} / Offset ${message.offset ?? "pending"}` : "No message selected"}
              </div>
              <div className="flex gap-2">
                <button className="grid size-8 place-items-center rounded border border-slate-700 text-slate-300" aria-label="Previous message">
                  <ChevronLeft size={16} aria-hidden />
                </button>
                <button className="grid size-8 place-items-center rounded border border-slate-700 text-slate-300" aria-label="Next message">
                  <ChevronRight size={16} aria-hidden />
                </button>
              </div>
            </div>
          </section>

          {message ? (
            <>
              <section className="border-b border-slate-800 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Overview</h3>
                <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-400">Topic</dt><dd className="text-slate-200">{message.topic}</dd>
                  <dt className="text-slate-400">Partition</dt><dd className="text-sky-300">{message.partition ?? "Pending delivery"}</dd>
                  <dt className="text-slate-400">Offset</dt><dd>{message.offset ?? "Pending delivery"}</dd>
                  <dt className="text-slate-400">Timestamp</dt><dd>{message.timestamp ?? "Pending"}</dd>
                  <dt className="text-slate-400">Key</dt><dd>{message.key ?? "No key"}</dd>
                  <dt className="text-slate-400">Value</dt><dd>{JSON.stringify(message.value).length} bytes</dd>
                  <dt className="text-slate-400">Headers</dt><dd>{Object.keys(message.headers).length}</dd>
                  <dt className="text-slate-400">State</dt><dd className="font-semibold text-emerald-300">{message.state}</dd>
                </dl>
              </section>

              <section className="border-b border-slate-800 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Processing State</h3>
                <ol className="space-y-3 text-sm">
                  <StateStep done label="Received by" detail={message.assignedConsumerId ?? "Waiting for consumer"} />
                  <StateStep
                    active={message.state === "processing"}
                    done={["processed", "commit_requested", "committed"].includes(message.state)}
                    label="Processing"
                    detail={message.state === "processing" ? "In progress" : `${snapshot.processingLatencyMs} ms`}
                  />
                  <StateStep done={message.state === "committed"} label="Committed" detail={message.committedOffset ? `Offset ${message.committedOffset}` : "Not committed"} />
                </ol>
              </section>

              <section className="p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Commit Details</h3>
                <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-400">Committer</dt><dd>{message.assignedConsumerId ?? "None"}</dd>
                  <dt className="text-slate-400">Commit latency</dt><dd>{snapshot.processingLatencyMs + 2} ms</dd>
                  <dt className="text-slate-400">Commit strategy</dt><dd>Enable.auto.commit = false</dd>
                  <dt className="text-slate-400">Isolation level</dt><dd>read_committed</dd>
                </dl>
              </section>
            </>
          ) : (
            <div className="p-5 text-sm text-slate-400">Produce a message to populate overview, processing, and commit details.</div>
          )}

          {event && (
            <section className="mt-auto border-t border-slate-800 p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected Event</h3>
              <dl className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-400">Sequence</dt><dd>#{event.sequence}</dd>
                <dt className="text-slate-400">Type</dt><dd>{event.type}</dd>
                <dt className="text-slate-400">Occurred</dt><dd>{new Date(event.occurredAt).toLocaleTimeString()}</dd>
              </dl>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StateStep({
  label,
  detail,
  active = false,
  done = false
}: {
  label: string;
  detail: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 text-emerald-400" size={16} aria-hidden />
      ) : (
        <CircleDot className={active ? "mt-0.5 text-amber-400" : "mt-0.5 text-slate-500"} size={16} aria-hidden />
      )}
      <div className="flex-1">
        <div className={done ? "font-semibold text-emerald-300" : active ? "font-semibold text-amber-300" : "font-semibold text-slate-300"}>{label}</div>
        <div className="mt-0.5 text-xs text-slate-400">{detail}</div>
      </div>
    </li>
  );
}
