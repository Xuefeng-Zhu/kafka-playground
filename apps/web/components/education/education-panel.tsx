import type { PlaygroundMessage, RunSnapshot } from "@kplay/contracts";

export function EducationPanel({
  snapshot,
  selectedMessage
}: {
  snapshot: RunSnapshot | null;
  selectedMessage: PlaygroundMessage | null;
}) {
  const text = explain(snapshot, selectedMessage);
  return (
    <section className="mt-4 rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-4 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
      <h2 className="kplay-section-title">What you are seeing</h2>
      <p className="mt-3 text-sm leading-6 text-[#31566a]">{text}</p>
    </section>
  );
}

function explain(snapshot: RunSnapshot | null, selectedMessage: PlaygroundMessage | null) {
  if (!snapshot) {
    return "Start a run to create the two-partition scenario and begin observing Kafka behavior.";
  }
  if (!Array.isArray(snapshot.consumers)) {
    return "The run is changing state. Waiting for the next authoritative snapshot.";
  }
  if (snapshot.consumers.some((consumer) => consumer.assignments.length === 0)) {
    return "This topic has two partitions, so only two members of this consumer group can consume actively. The third member remains idle until an assignment becomes available.";
  }
  if (snapshot.consumers.length >= 2) {
    return "Members of the same consumer group divide partitions among themselves. Each partition is assigned to only one member of the group at a time.";
  }
  if (selectedMessage?.state === "received" || selectedMessage?.state === "processing") {
    return "The consumer has received the message, but the group committed position has not advanced yet.";
  }
  if (selectedMessage?.state === "committed") {
    return "The committed offset is the next offset the consumer group should read for this partition.";
  }
  if (snapshot.keyStrategy.type === "fixed") {
    return "Kafka hashes the message key to select a partition. Messages with the same key normally remain on the same partition while the topic partition count is unchanged.";
  }
  return "Ordering is guaranteed only within a partition. Use different key strategies to observe how messages spread across the two partitions.";
}
