import {
  DemoKafkaRuntimeAdapter,
  type KafkaRuntimeAdapter,
} from "@kplay/kafka-runtime";
import { PlaygroundRunRegistry } from "./playground-run-registry";
import type { PlaygroundRuntimeDependencies } from "./playground-runtime";
import {
  PlaygroundRuntimeMessages,
  type PlaygroundRuntimeMessageDependencies,
} from "./playground-runtime-messages";

export async function createPlaygroundRuntimeTestHarness(
  demoAdapter: KafkaRuntimeAdapter = new DemoKafkaRuntimeAdapter(),
) {
  const runRegistry = new PlaygroundRunRegistry();
  let messages: PlaygroundRuntimeMessages | undefined;
  const dependencies: PlaygroundRuntimeDependencies = {
    demoAdapter,
    runRegistry,
    createMessages: (
      messageDependencies: PlaygroundRuntimeMessageDependencies,
    ) => {
      messages = new PlaygroundRuntimeMessages(messageDependencies);
      return messages;
    },
  };
  const { PlaygroundRuntime } = await import("./playground-runtime");
  const runtime = new PlaygroundRuntime(dependencies);
  if (!messages)
    throw new Error("Runtime message collaborator was not created");

  return {
    adapter: demoAdapter,
    getInternalRun: (sessionId = "default") =>
      runRegistry.getSessionRun(sessionId),
    messages,
    runtime,
  };
}

export function createDeferred<T = void>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return {
    promise,
    reject,
    resolve,
  };
}

export function remoteKafkaConfig() {
  return {
    brokers: "broker.example.com:9092",
    username: "service-user",
    password: "service-password",
    saslMechanism: "SCRAM-SHA-256" as const,
    useTls: true,
    caCertificate: "",
  };
}
