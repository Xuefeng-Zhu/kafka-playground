import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  addConsumer: vi.fn(),
  crashConsumer: vi.fn(),
  deleteRun: vi.fn(),
  pauseProducer: vi.fn(),
  produceOne: vi.fn(),
  reset: vi.fn(),
  snapshot: vi.fn(),
  startProducer: vi.fn(),
  stopConsumer: vi.fn(),
  stopProducer: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/lib/server/runtime-singleton", () => ({
  playgroundRuntime: runtime,
}));

import { DELETE as deleteRunRoute, GET as getRunRoute } from "./route";
import { POST as addConsumerRoute } from "./consumers/route";
import { DELETE as stopConsumerRoute } from "./consumers/[consumerId]/route";
import { POST as crashConsumerRoute } from "./consumers/[consumerId]/crash/route";
import { POST as produceMessageRoute } from "./messages/route";
import { POST as pauseProducerRoute } from "./producer/pause/route";
import { POST as startProducerRoute } from "./producer/start/route";
import { POST as stopProducerRoute } from "./producer/stop/route";
import { POST as resetRunRoute } from "./reset/route";
import { PATCH as updateSettingsRoute } from "./settings/route";

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("nested run route session scoping", () => {
  beforeEach(() => {
    Object.values(runtime).forEach((fn) => fn.mockReset());
  });

  it("scopes read and delete handlers to the session cookie", async () => {
    runtime.snapshot.mockReturnValue({ runId: "run-1" });
    runtime.deleteRun.mockResolvedValue({ cleanupStatus: "completed" });

    await expect(
      getRunRoute(request(), runContext()).then((response) => response.json()),
    ).resolves.toEqual({ runId: "run-1" });
    await deleteRunRoute(request({ method: "DELETE" }), runContext());

    expect(runtime.snapshot).toHaveBeenCalledWith("run-1", sessionId);
    expect(runtime.deleteRun).toHaveBeenCalledWith("run-1", sessionId);
  });

  it.each([
    ["start producer", startProducerRoute, runtime.startProducer],
    ["pause producer", pauseProducerRoute, runtime.pauseProducer],
    ["stop producer", stopProducerRoute, runtime.stopProducer],
    ["reset run", resetRunRoute, runtime.reset],
    ["add consumer", addConsumerRoute, runtime.addConsumer],
  ])("scopes %s to the session cookie", async (_name, route, handler) => {
    handler.mockResolvedValue({ runId: "run-1" });

    await route(request({ method: "POST" }), runContext());

    expect(handler).toHaveBeenCalledWith("run-1", sessionId);
  });

  it("scopes consumer-specific mutations to the session cookie", async () => {
    runtime.stopConsumer.mockResolvedValue({ runId: "run-1" });
    runtime.crashConsumer.mockResolvedValue({ runId: "run-1" });

    await stopConsumerRoute(request({ method: "DELETE" }), consumerContext());
    await crashConsumerRoute(request({ method: "POST" }), consumerContext());

    expect(runtime.stopConsumer).toHaveBeenCalledWith(
      "run-1",
      "consumer-1",
      sessionId,
    );
    expect(runtime.crashConsumer).toHaveBeenCalledWith(
      "run-1",
      "consumer-1",
      sessionId,
    );
  });

  it("scopes message production to the session cookie", async () => {
    runtime.produceOne.mockResolvedValue({ runId: "run-1" });

    await produceMessageRoute(
      request({
        body: JSON.stringify({ keyStrategy: { type: "no_key" } }),
        method: "POST",
      }),
      runContext(),
    );

    expect(runtime.produceOne).toHaveBeenCalledWith(
      "run-1",
      { type: "no_key" },
      sessionId,
    );
  });

  it("scopes settings updates to the session cookie", async () => {
    runtime.updateSettings.mockResolvedValue({ runId: "run-1" });

    await updateSettingsRoute(
      request({
        body: JSON.stringify({ productionRate: 2 }),
        method: "PATCH",
      }),
      runContext(),
    );

    expect(runtime.updateSettings).toHaveBeenCalledWith(
      "run-1",
      { productionRate: 2 },
      sessionId,
    );
  });

  it("creates a session cookie for nested run mutations without one", async () => {
    runtime.startProducer.mockResolvedValue({ runId: "run-1" });

    const response = await startProducerRoute(
      request({ headers: { cookie: "" }, method: "POST" }),
      runContext(),
    );
    const createdSessionId = extractSessionId(
      response.headers.get("set-cookie"),
    );

    expect(createdSessionId).toBeTruthy();
    expect(runtime.startProducer).toHaveBeenCalledWith(
      "run-1",
      createdSessionId,
    );
  });
});

function request(init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("cookie")) {
    headers.set("cookie", `kplay.session=${sessionId}`);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Request("http://localhost/api/v1/runs/run-1", {
    ...init,
    headers,
  });
}

function runContext() {
  return { params: Promise.resolve({ runId: "run-1" }) };
}

function consumerContext() {
  return {
    params: Promise.resolve({ consumerId: "consumer-1", runId: "run-1" }),
  };
}

function extractSessionId(cookie: string | null) {
  return cookie?.match(/(?:^|;\s*)kplay\.session=([^;]+)/)?.[1] ?? null;
}
