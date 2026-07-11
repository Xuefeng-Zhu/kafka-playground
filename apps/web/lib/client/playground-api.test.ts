import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  fetchRunSnapshot,
  loadActiveRunSnapshot,
  loadConnectionStatus,
  loadScenarioDefinitions,
  mutateRun,
  retireRun,
  runScenarioExperiment,
} from "./playground-api";
import { runSnapshot } from "./run-snapshot-test-fixtures";

describe("playground api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses response error messages for failed mutations", async () => {
    mockFetch(
      { ok: false, status: 409, statusText: "Conflict" },
      {
        code: "RUN_ALREADY_ACTIVE",
        message: "Only one scenario run can be active.",
      },
    );

    const error = await mutateRun("run-1", "/settings", {
      method: "PATCH",
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      code: "RUN_ALREADY_ACTIVE",
      message: "Only one scenario run can be active.",
      status: 409,
    });
  });

  it("returns typed connection load errors for non-OK responses", async () => {
    mockFetch(
      { ok: false, status: 503, statusText: "Unavailable" },
      {
        message: "Kafka unavailable",
      },
    );

    await expect(loadConnectionStatus()).resolves.toEqual({
      ok: false,
      message: "Unable to load Kafka connection. (503: Kafka unavailable)",
    });
  });

  it("reports schema mismatches distinctly from request failures", async () => {
    mockFetch({ ok: true, status: 200, statusText: "OK" }, { scenarios: [{}] });

    await expect(loadScenarioDefinitions()).resolves.toEqual({
      ok: false,
      message:
        "Unable to load scenarios. The response payload did not match the expected shape.",
    });
  });

  it("requires the scenarios response envelope on successful requests", async () => {
    mockFetch({ ok: true, status: 200, statusText: "OK" }, []);

    await expect(loadScenarioDefinitions()).resolves.toEqual({
      ok: false,
      message:
        "Unable to load scenarios. The response payload did not match the expected shape.",
    });
  });

  it("parses a missing active run as a successful empty state", async () => {
    mockFetch({ ok: true, status: 200, statusText: "OK" }, { run: null });

    await expect(loadActiveRunSnapshot()).resolves.toEqual({
      ok: true,
      data: null,
    });
  });

  it("requires the active-run response envelope on successful requests", async () => {
    mockFetch({ ok: true, status: 200, statusText: "OK" }, {});

    await expect(loadActiveRunSnapshot()).resolves.toEqual({
      ok: false,
      message:
        "Unable to load the active run. The response payload did not match the expected shape.",
    });
  });

  it("distinguishes missing run snapshots from refresh failures", async () => {
    mockFetch(
      { ok: false, status: 404, statusText: "Not Found" },
      { message: "The scenario run does not exist." },
    );

    await expect(fetchRunSnapshot("missing")).resolves.toEqual({
      ok: true,
      data: null,
    });

    mockFetch(
      { ok: false, status: 503, statusText: "Unavailable" },
      { message: "Runtime unavailable" },
    );

    await expect(fetchRunSnapshot("run-1")).resolves.toEqual({
      ok: false,
      message: "Unable to refresh run snapshot. (503: Runtime unavailable)",
    });
  });

  it("does not treat a malformed 200 run response as a missing run", async () => {
    mockFetch({ ok: true, status: 200, statusText: "OK" }, null);

    await expect(fetchRunSnapshot("run-1")).resolves.toEqual({
      ok: false,
      message:
        "Unable to refresh run snapshot. The response payload did not match the expected shape.",
    });
  });

  it("treats missing runs as already retired during reset", async () => {
    mockFetch(
      { ok: false, status: 404, statusText: "Not Found" },
      { message: "The scenario run does not exist." },
    );

    await expect(retireRun("missing")).resolves.toEqual({
      cleanupStatus: "completed",
    });
  });

  it("parses the cleanup status when retiring a run", async () => {
    const parseBody = vi.fn().mockResolvedValue({
      cleanupStatus: "partially_completed",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: parseBody,
    } as unknown as Response);

    await expect(retireRun("run-1")).resolves.toEqual({
      cleanupStatus: "partially_completed",
    });
    expect(parseBody).toHaveBeenCalledTimes(1);
  });

  it("encodes run IDs consistently for reads and retirement", async () => {
    const snapshot = runSnapshot({ runId: "run/one" });
    const fetchMock = mockFetch(
      { ok: true, status: 200, statusText: "OK" },
      snapshot,
    );

    await expect(fetchRunSnapshot("run/one")).resolves.toEqual({
      ok: true,
      data: snapshot,
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/runs/run%2Fone",
      expect.any(Object),
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ cleanupStatus: "completed" }),
    } as Response);
    await retireRun("run/one");

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/runs/run%2Fone/reset",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts stable experiment IDs through encoded run routes", async () => {
    const snapshot = runSnapshot({ runId: "run/one" });
    const fetchMock = mockFetch(
      { ok: true, status: 200, statusText: "OK" },
      snapshot,
    );

    await expect(
      runScenarioExperiment("run/one", "grow-consumer-group"),
    ).resolves.toEqual(snapshot);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/runs/run%2Fone/experiments/grow-consumer-group",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects malformed successful experiment responses", async () => {
    mockFetch({ ok: true, status: 200, statusText: "OK" }, { runId: "run-1" });

    await expect(
      runScenarioExperiment("run-1", "produce-keyed-record"),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects malformed successful run mutation responses", async () => {
    mockFetch({ ok: true, status: 200, statusText: "OK" }, { runId: "run-1" });

    await expect(
      mutateRun("run-1", "/settings", { method: "PATCH" }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

function mockFetch(
  response: Pick<Response, "ok" | "status" | "statusText">,
  body: unknown,
) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ...response,
    json: async () => body,
  } as Response);
}
