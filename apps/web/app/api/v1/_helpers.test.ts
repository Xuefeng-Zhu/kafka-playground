import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseJson, safe } from "./_helpers";

describe("parseJson", () => {
  const schema = z.object({
    scenarioId: z.string().default("partitioning"),
  });

  it("allows empty request bodies to use schema defaults", async () => {
    await expect(
      parseJson(new Request("http://test.local"), schema),
    ).resolves.toEqual({
      scenarioId: "partitioning",
    });
  });

  it("reports malformed non-empty JSON", async () => {
    await expect(
      parseJson(
        new Request("http://test.local", {
          method: "POST",
          body: "{",
        }),
        schema,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_JSON",
      status: 400,
    });
  });

  it("wraps schema validation with route-specific problem details", async () => {
    await expect(
      parseJson(
        new Request("http://test.local", {
          method: "POST",
          body: JSON.stringify({ rate: 99 }),
        }),
        z.object({ rate: z.number().max(10) }),
        {
          code: "INVALID_RATE",
          describeIssue: () => "Rate is too high.",
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_RATE",
      message: "Rate is too high.",
      status: 400,
    });
  });
});

describe("safe", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets the request id on successful responses", async () => {
    const response = await safe(
      new Request("http://test.local", {
        headers: { "x-request-id": "request-1" },
      }),
      async () => Response.json({ ok: true }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("request-1");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rate limits mutation requests by client key", async () => {
    const headers = { "x-forwarded-for": "198.51.100.10" };

    for (let index = 0; index < 80; index += 1) {
      const response = await safe(
        new Request("http://test.local", { method: "POST", headers }),
        async () => Response.json({ ok: true }),
      );
      expect(response.status).toBe(200);
    }

    const limited = await safe(
      new Request("http://test.local", { method: "POST", headers }),
      async () => Response.json({ ok: true }),
    );

    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("starts a fresh mutation bucket after the rate-limit window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const headers = { "x-forwarded-for": "198.51.100.11" };
    for (let index = 0; index < 80; index += 1) {
      await safe(
        new Request("http://test.local", { method: "POST", headers }),
        async () => Response.json({ ok: true }),
      );
    }

    vi.setSystemTime(new Date("2026-01-01T00:00:10.001Z"));
    const response = await safe(
      new Request("http://test.local", { method: "POST", headers }),
      async () => Response.json({ ok: true }),
    );

    expect(response.status).toBe(200);
  });

  it("bounds mutation buckets when many client keys are seen", async () => {
    const firstClient = "rate-limit-cap-first";
    for (let index = 0; index < 80; index += 1) {
      const response = await safe(
        new Request("http://test.local", {
          method: "POST",
          headers: { "x-forwarded-for": firstClient },
        }),
        async () => Response.json({ ok: true }),
      );
      expect(response.status).toBe(200);
    }

    for (let index = 0; index < 1000; index += 1) {
      await safe(
        new Request("http://test.local", {
          method: "POST",
          headers: { "x-forwarded-for": `rate-limit-cap-${index}` },
        }),
        async () => Response.json({ ok: true }),
      );
    }

    const response = await safe(
      new Request("http://test.local", {
        method: "POST",
        headers: { "x-forwarded-for": firstClient },
      }),
      async () => Response.json({ ok: true }),
    );
    expect(response.status).toBe(200);
  });
});
