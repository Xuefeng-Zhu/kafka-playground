import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  fetchRunSnapshot,
  loadActiveRunSnapshot,
  loadConnectionStatus,
  loadScenarioDefinitions,
} from "./playground-api";

describe("playground api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses response error messages for failed mutations", async () => {
    mockFetch(
      { ok: false, status: 409, statusText: "Conflict" },
      {
        message: "Only one scenario run can be active.",
      },
    );

    await expect(api("/api/v1/runs")).rejects.toThrow(
      "Only one scenario run can be active.",
    );
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

  it("parses a missing active run as a successful empty state", async () => {
    mockFetch({ ok: true, status: 200, statusText: "OK" }, { run: null });

    await expect(loadActiveRunSnapshot()).resolves.toEqual({
      ok: true,
      data: null,
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
});

function mockFetch(
  response: Pick<Response, "ok" | "status" | "statusText">,
  body: unknown,
) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ...response,
    json: async () => body,
  } as Response);
}
