import "server-only";
import { PlaygroundRuntime } from "./playground-runtime";

declare global {
  var kafkaPlaygroundRuntime: PlaygroundRuntime | undefined;
}

const existingRuntime = globalThis.kafkaPlaygroundRuntime;
const isCompatibleRuntime =
  existingRuntime &&
  typeof existingRuntime.snapshot === "function" &&
  typeof existingRuntime.activeSnapshot === "function" &&
  typeof existingRuntime.shutdown === "function";

export const playgroundRuntime = isCompatibleRuntime
  ? existingRuntime
  : new PlaygroundRuntime();

if (process.env.NODE_ENV !== "production") {
  globalThis.kafkaPlaygroundRuntime = playgroundRuntime;
}
