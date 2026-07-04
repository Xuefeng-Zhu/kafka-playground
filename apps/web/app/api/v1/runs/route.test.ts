import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  activeSnapshot: vi.fn(),
  createRun: vi.fn(),
}));

vi.mock("@/lib/server/runtime-singleton", () => ({
  playgroundRuntime: runtime,
}));

import { GET, POST } from "./route";

describe("runs route", () => {
  beforeEach(() => {
    runtime.activeSnapshot.mockReset();
    runtime.createRun.mockReset();
  });

  it("sets a session cookie and scopes active snapshots to that session", async () => {
    runtime.activeSnapshot.mockReturnValue(null);

    const response = await GET(new Request("http://test.local/api/v1/runs"));

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    const sessionId = extractSessionId(cookie);
    expect(sessionId).toBeTruthy();
    expect(runtime.activeSnapshot).toHaveBeenCalledWith(sessionId);
    await expect(response.json()).resolves.toEqual({ run: null });
  });

  it("reuses the session cookie when creating a run", async () => {
    runtime.createRun.mockResolvedValue({ runId: "run-1" });
    const sessionId = "11111111-1111-4111-8111-111111111111";

    const response = await POST(
      new Request("http://test.local/api/v1/runs", {
        method: "POST",
        headers: { cookie: `kplay.session=${sessionId}` },
        body: JSON.stringify({ scenarioId: "partitioning", mode: "demo" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(runtime.createRun).toHaveBeenCalledWith(
      "partitioning",
      {
        mode: "demo",
        remoteKafkaConfig: undefined,
      },
      sessionId,
    );
    await expect(response.json()).resolves.toEqual({ runId: "run-1" });
  });
});

function extractSessionId(cookie: string | null) {
  return cookie?.match(/(?:^|;\s*)kplay\.session=([^;]+)/)?.[1] ?? null;
}
