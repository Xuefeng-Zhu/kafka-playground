import type {
  PlaygroundMessage,
  RunSnapshot,
  RuntimeEvent,
} from "@kplay/contracts";
import { MessageBody } from "./message-details";

export function EventDetails({
  snapshot,
  event,
  relatedMessage,
}: {
  snapshot: RunSnapshot;
  event: RuntimeEvent;
  relatedMessage: PlaygroundMessage | null;
}) {
  return (
    <>
      <section className="border-b-[3px] border-teal-700 p-5">
        <div className="text-sm font-semibold text-[#466778]">
          Selected event
        </div>
        <div className="mt-3 rounded-2xl border-[3px] border-sky-500 bg-sky-50 px-3 py-2 text-sm font-extrabold text-[#123047] shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
          {event.type} / #{event.sequence}
        </div>
      </section>

      <MessageBody snapshot={snapshot} message={relatedMessage} />

      <section className="mt-auto border-t-[3px] border-teal-700 bg-[#fffdf5] p-5">
        <h3 className="mb-3 kplay-section-title">Selected Event</h3>
        <dl className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[#466778]">Sequence</dt>
          <dd className="font-semibold text-[#123047]">#{event.sequence}</dd>
          <dt className="text-[#466778]">Type</dt>
          <dd className="font-semibold text-[#123047]">{event.type}</dd>
          <dt className="text-[#466778]">Occurred</dt>
          <dd className="font-semibold text-[#123047]">
            {new Date(event.occurredAt).toLocaleTimeString()}
          </dd>
        </dl>
      </section>
    </>
  );
}
