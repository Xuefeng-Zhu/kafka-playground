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
    <div className="flex h-full flex-col text-[#123047]">
      <header className="flex items-center justify-between border-b-[3px] border-teal-700 bg-[#fff7ed] px-5 py-4">
        <h2 className="kplay-section-title">Message Inspector</h2>
        <X size={16} className="text-teal-700" aria-hidden />
      </header>

      {!snapshot && (
        <div className="p-5 text-sm text-[#466778]">Start a run to inspect messages and events.</div>
      )}

      {snapshot && (
        <>
          <section className="border-b-[3px] border-teal-700 p-5">
            <div className="text-sm font-semibold text-[#466778]">Selected message</div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="rounded-2xl border-[3px] border-sky-500 bg-sky-50 px-3 py-2 text-sm font-extrabold text-[#123047] shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
                {message ? `Partition ${message.partition ?? "?"} / Offset ${message.offset ?? "pending"}` : "No message selected"}
              </div>
              <div className="flex gap-2">
                <button className="grid size-8 place-items-center rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-teal-800" aria-label="Previous message">
                  <ChevronLeft size={16} aria-hidden />
                </button>
                <button className="grid size-8 place-items-center rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-teal-800" aria-label="Next message">
                  <ChevronRight size={16} aria-hidden />
                </button>
              </div>
            </div>
          </section>

          {message ? (
            <>
              <section className="border-b-[3px] border-teal-700 p-5">
                <h3 className="mb-3 kplay-section-title">Overview</h3>
                <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-[#466778]">Topic</dt><dd className="min-w-0 break-all font-semibold text-[#123047]">{message.topic}</dd>
                  <dt className="text-[#466778]">Partition</dt><dd className="font-extrabold text-sky-700">{message.partition ?? "Pending delivery"}</dd>
                  <dt className="text-[#466778]">Offset</dt><dd className="font-semibold text-[#123047]">{message.offset ?? "Pending delivery"}</dd>
                  <dt className="text-[#466778]">Timestamp</dt><dd className="font-semibold text-[#123047]">{message.timestamp ?? "Pending"}</dd>
                  <dt className="text-[#466778]">Key</dt><dd className="font-semibold text-[#123047]">{message.key ?? "No key"}</dd>
                  <dt className="text-[#466778]">Value</dt><dd className="font-semibold text-[#123047]">{JSON.stringify(message.value).length} bytes</dd>
                  <dt className="text-[#466778]">Headers</dt><dd className="font-semibold text-[#123047]">{Object.keys(message.headers).length}</dd>
                  <dt className="text-[#466778]">State</dt><dd className="font-extrabold text-emerald-700">{message.state}</dd>
                </dl>
              </section>

              <section className="border-b-[3px] border-teal-700 p-5">
                <h3 className="mb-3 kplay-section-title">Processing State</h3>
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
                <h3 className="mb-3 kplay-section-title">Commit Details</h3>
                <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-[#466778]">Committer</dt><dd className="font-semibold text-[#123047]">{message.assignedConsumerId ?? "None"}</dd>
                  <dt className="text-[#466778]">Commit latency</dt><dd className="font-semibold text-[#123047]">{snapshot.processingLatencyMs + 2} ms</dd>
                  <dt className="text-[#466778]">Commit strategy</dt><dd className="font-semibold text-[#123047]">Enable.auto.commit = false</dd>
                  <dt className="text-[#466778]">Isolation level</dt><dd className="font-semibold text-[#123047]">read_committed</dd>
                </dl>
              </section>
            </>
          ) : (
            <div className="p-5 text-sm text-[#466778]">Produce a message to populate overview, processing, and commit details.</div>
          )}

          {event && (
            <section className="mt-auto border-t-[3px] border-teal-700 bg-[#fffdf5] p-5">
              <h3 className="mb-3 kplay-section-title">Selected Event</h3>
              <dl className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-[#466778]">Sequence</dt><dd className="font-semibold text-[#123047]">#{event.sequence}</dd>
                <dt className="text-[#466778]">Type</dt><dd className="font-semibold text-[#123047]">{event.type}</dd>
                <dt className="text-[#466778]">Occurred</dt><dd className="font-semibold text-[#123047]">{new Date(event.occurredAt).toLocaleTimeString()}</dd>
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
        <CheckCircle2 className="mt-0.5 text-emerald-600" size={16} aria-hidden />
      ) : (
        <CircleDot className={active ? "mt-0.5 text-amber-500" : "mt-0.5 text-slate-500"} size={16} aria-hidden />
      )}
      <div className="flex-1">
        <div className={done ? "font-extrabold text-emerald-700" : active ? "font-extrabold text-amber-700" : "font-extrabold text-[#123047]"}>{label}</div>
        <div className="mt-0.5 text-xs text-[#466778]">{detail}</div>
      </div>
    </li>
  );
}
