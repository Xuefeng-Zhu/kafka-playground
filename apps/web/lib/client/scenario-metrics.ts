import type { PlaygroundMessage, RunSnapshot } from "@kplay/contracts";

export function countPayload(
  messages: PlaygroundMessage[],
  key: string,
  expected: unknown,
) {
  return messages.filter((message) => payloadValue(message, key) === expected)
    .length;
}

export function latestPayloadString(
  message: PlaygroundMessage | undefined,
  key: string,
) {
  const value = message ? payloadValue(message, key) : null;
  return value === null || value === undefined ? null : String(value);
}

export function busiestPartition(snapshot: RunSnapshot) {
  const entries = Object.entries(snapshot.messageCounts)
    .filter(([partition]) => /^\d+$/.test(partition))
    .map(([partition, count]) => ({ partition: `P${partition}`, count }));
  return (
    entries.sort((a, b) => b.count - a.count)[0] ?? {
      partition: "P-",
      count: 0,
    }
  );
}

function payloadValue(message: PlaygroundMessage, key: string) {
  const payload = message.value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  return (payload as Record<string, unknown>)[key];
}
