import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shutdown = vi.hoisted(() => vi.fn());

vi.mock("./lib/server/runtime-singleton", () => ({
  playgroundRuntime: { shutdown },
}));

describe("instrumentation", () => {
  beforeEach(() => {
    vi.resetModules();
    shutdown.mockReset();
    delete globalThis.kafkaPlaygroundShutdownHandlersRegistered;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete globalThis.kafkaPlaygroundShutdownHandlersRegistered;
  });

  it("does not register shutdown handlers outside the Node runtime", async () => {
    const once = vi.spyOn(process, "once");
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await import("./instrumentation");

    await register();

    expect(once).not.toHaveBeenCalled();
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("registers Node shutdown handlers only once", async () => {
    const once = vi.spyOn(process, "once").mockReturnThis();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("./instrumentation");

    await register();
    await register();

    expect(once).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(once).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
  });
});
