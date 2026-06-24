export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { playgroundRuntime } = await import("./lib/server/runtime-singleton");
    const shutdown = () => {
      void playgroundRuntime.shutdown().finally(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }
}
