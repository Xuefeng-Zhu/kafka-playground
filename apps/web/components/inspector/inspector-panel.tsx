import type { PlaygroundMessage, RunSnapshot, RuntimeEvent } from "@kplay/contracts";

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
    <div className="flex h-full flex-col gap-4">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Inspector</h2>
        {!snapshot && <p className="mt-3 text-sm text-slate-400">Start a run to inspect messages and events.</p>}
      </section>

      {message && (
        <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <h3 className="text-sm font-semibold">Selected message</h3>
          <dl className="mt-3 grid grid-cols-[120px_1fr] gap-2 text-xs">
            <dt className="text-slate-500">Key</dt><dd>{message.key ?? "No key"}</dd>
            <dt className="text-slate-500">Partition</dt><dd>{message.partition ?? "Pending delivery"}</dd>
            <dt className="text-slate-500">Offset</dt><dd>{message.offset ?? "Pending delivery"}</dd>
            <dt className="text-slate-500">Timestamp</dt><dd>{message.timestamp ?? "Pending"}</dd>
            <dt className="text-slate-500">Consumer</dt><dd>{message.assignedConsumerId ?? "Not received"}</dd>
            <dt className="text-slate-500">Processing</dt><dd>{message.state}</dd>
            <dt className="text-slate-500">Committed offset</dt><dd>{message.committedOffset ?? "Not committed"}</dd>
          </dl>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Headers</h4>
          <pre className="mt-2 max-h-28 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] text-slate-300">
            {JSON.stringify(message.headers, null, 2)}
          </pre>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Value</h4>
          <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] text-slate-300">
            {JSON.stringify(message.value, null, 2)}
          </pre>
        </section>
      )}

      {event && (
        <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <h3 className="text-sm font-semibold">Selected event</h3>
          <dl className="mt-3 grid grid-cols-[120px_1fr] gap-2 text-xs">
            <dt className="text-slate-500">Sequence</dt><dd>#{event.sequence}</dd>
            <dt className="text-slate-500">Type</dt><dd>{event.type}</dd>
            <dt className="text-slate-500">Occurred</dt><dd>{event.occurredAt}</dd>
          </dl>
          <pre className="mt-3 max-h-52 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] text-slate-300">
            {JSON.stringify(event, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
