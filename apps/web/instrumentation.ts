export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { registerShutdownHandlers } =
    await import("./lib/server/shutdown-handlers");
  registerShutdownHandlers();
}
