import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-errors";

const runtime = vi.hoisted(() => ({
  runExperiment: vi.fn(),
}));

vi.mock("@/lib/server/runtime-singleton", () => ({
  playgroundRuntime: runtime,
}));

import { POST } from "./route";

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("experiment route", () => {
  beforeEach(() => {
    runtime.runExperiment.mockReset();
  });

  it("awaits Next 16 params and scopes execution to the session", async () => {
    runtime.runExperiment.mockResolvedValue({
      runId: "run-1",
      scenarioState: { scenarioId: "partitioning" },
    });

    const response = await POST(request(), context());

    await expect(response.json()).resolves.toMatchObject({ runId: "run-1" });
    expect(runtime.runExperiment).toHaveBeenCalledWith(
      "run-1",
      "produce-keyed-record",
      sessionId,
    );
  });

  it("returns the stable 409 problem for unavailable experiments", async () => {
    runtime.runExperiment.mockRejectedValue(
      new ApiError(
        "SCENARIO_EXPERIMENT_UNAVAILABLE",
        "This experiment is unavailable.",
        409,
      ),
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "SCENARIO_EXPERIMENT_UNAVAILABLE",
    });
  });
});

function request() {
  return new Request(
    "http://localhost/api/v1/runs/run-1/experiments/produce-keyed-record",
    {
      method: "POST",
      headers: { cookie: `kplay.session=${sessionId}` },
    },
  );
}

function context() {
  return {
    params: Promise.resolve({
      runId: "run-1",
      experimentId: "produce-keyed-record",
    }),
  };
}
