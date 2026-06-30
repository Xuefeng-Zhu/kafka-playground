import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shutdown = vi.hoisted(() => vi.fn());

vi.mock("./runtime-singleton", () => ({
  playgroundRuntime: { shutdown },
}));

import { registerShutdownHandlers } from "./shutdown-handlers";

describe("shutdown handlers", () => {
  beforeEach(() => {
    shutdown.mockReset();
    delete globalThis.kafkaPlaygroundShutdownHandlersRegistered;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.kafkaPlaygroundShutdownHandlersRegistered;
  });

  it("exits successfully after graceful shutdown", async () => {
    const exit = mockProcessExit();
    const once = vi.spyOn(process, "once").mockReturnThis();
    shutdown.mockResolvedValue(undefined);

    registerShutdownHandlers();
    const handler = once.mock.calls.find(
      ([signal]) => signal === "SIGINT",
    )?.[1];
    expect(handler).toEqual(expect.any(Function));
    if (typeof handler !== "function")
      throw new Error("Missing SIGINT handler.");

    handler("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it("exits with a failure code when shutdown rejects", async () => {
    const exit = mockProcessExit();
    const once = vi.spyOn(process, "once").mockReturnThis();
    shutdown.mockRejectedValue(new Error("cleanup failed"));

    registerShutdownHandlers();
    const handler = once.mock.calls.find(
      ([signal]) => signal === "SIGTERM",
    )?.[1];
    expect(handler).toEqual(expect.any(Function));
    if (typeof handler !== "function")
      throw new Error("Missing SIGTERM handler.");

    handler("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});

function mockProcessExit() {
  return vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as never);
}
