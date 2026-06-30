import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock("@/lib/server/runtime-singleton", () => ({
  playgroundRuntime: runtime,
}));

import { GET } from "./route";

describe("run events stream route", () => {
  beforeEach(() => {
    runtime.subscribe.mockReset();
  });

  it("does not subscribe when the request is already aborted", async () => {
    const abort = new AbortController();
    abort.abort();

    const response = await GET(request({ signal: abort.signal }), context());

    expect(response.status).toBe(200);
    expect(runtime.subscribe).not.toHaveBeenCalled();
  });

  it("streams the initial snapshot and unsubscribes on cancel", async () => {
    const unsubscribe = vi.fn();
    runtime.subscribe.mockImplementation((_runId, _lastEventId, subscriber) => {
      subscriber.enqueue({
        type: "snapshot",
        snapshot: { runId: "run-1", status: "running" },
      });
      return unsubscribe;
    });
    const response = await GET(
      request({ headers: { "last-event-id": "7" } }),
      context(),
    );
    const reader = response.body?.getReader();

    const firstChunk = await reader?.read();
    await reader?.cancel();

    expect(runtime.subscribe).toHaveBeenCalledWith(
      "run-1",
      7,
      expect.objectContaining({ enqueue: expect.any(Function) }),
    );
    expect(new TextDecoder().decode(firstChunk?.value)).toContain(
      "event: snapshot",
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed Last-Event-ID values", async () => {
    runtime.subscribe.mockReturnValue(vi.fn());

    await GET(request({ headers: { "last-event-id": "Infinity" } }), context());

    expect(runtime.subscribe).toHaveBeenCalledWith(
      "run-1",
      null,
      expect.objectContaining({ enqueue: expect.any(Function) }),
    );
  });
});

function request(init: RequestInit = {}) {
  return new Request("http://localhost/api/v1/runs/run-1/events", init);
}

function context() {
  return { params: Promise.resolve({ runId: "run-1" }) };
}
