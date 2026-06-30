import "server-only";
import { playgroundRuntime } from "./runtime-singleton";

declare global {
  var kafkaPlaygroundShutdownHandlersRegistered: boolean | undefined;
}

export function registerShutdownHandlers() {
  if (globalThis.kafkaPlaygroundShutdownHandlersRegistered) return;
  globalThis.kafkaPlaygroundShutdownHandlersRegistered = true;

  const shutdown = () => {
    void playgroundRuntime.shutdown().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
