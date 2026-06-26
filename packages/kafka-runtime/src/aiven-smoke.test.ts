import { describe, expect, it } from "vitest";
import {
  AivenKafkaRuntimeAdapter,
  loadServerEnv,
  type ConsumedMessage,
  type PlaygroundConsumerHandle,
} from "./index";
import {
  createHeaders,
  createPlaygroundValue,
  createResourceNames,
} from "@kplay/scenario-engine";

const runIfAiven = process.env.RUN_AIVEN_E2E === "true" ? it : it.skip;

describe("optional real Aiven smoke", () => {
  runIfAiven(
    "produces, consumes, commits, and deletes a unique topic",
    async () => {
      const env = loadServerEnv();
      const adapter = new AivenKafkaRuntimeAdapter(env);
      const runId = crypto.randomUUID();
      const names = createResourceNames({
        prefix: env.KAFKA_TOPIC_PREFIX,
        scenarioId: "partitioning",
      });
      const run = {
        runId,
        scenarioId: "partitioning",
        topicName: names.topicName,
        consumerGroupId: names.consumerGroupId,
        partitionCount: 2,
      };
      let consumer: PlaygroundConsumerHandle | null = null;
      try {
        await adapter.createRun(run);
        const eventId = crypto.randomUUID();
        const value = createPlaygroundValue({
          eventId,
          runId,
          scenarioId: "partitioning",
          sequence: 1,
          userId: "user-1",
        });
        const headers = createHeaders({
          runId,
          eventId,
          scenarioId: "partitioning",
          sequence: 1,
          keyStrategy: { type: "fixed", value: "user-1" },
        });
        let resolveConsumed: (message: ConsumedMessage) => void = () =>
          undefined;
        let rejectConsumed: (error: Error) => void = () => undefined;
        const consumed = new Promise<ConsumedMessage>((resolve, reject) => {
          resolveConsumed = resolve;
          rejectConsumed = reject;
          setTimeout(
            () => reject(new Error("Timed out waiting for Aiven message.")),
            30_000,
          );
        });
        consumer = await adapter.createConsumer(run, "consumer-1", {
          onAssigned: () => undefined,
          onRevoked: () => undefined,
          onError: (error) => rejectConsumed(new Error(error.message)),
          onMessage: async (message) => {
            resolveConsumed(message);
          },
        });
        const delivery = await adapter.produce({
          runId,
          topicName: run.topicName,
          key: "user-1",
          value,
          headers,
          keyStrategy: { type: "fixed", value: "user-1" },
        });
        expect(delivery.partition).toEqual(expect.any(Number));
        expect(delivery.offset).toEqual(expect.any(String));
        const message = await consumed;
        expect(message.headers["x-playground-event-id"]).toBe(eventId);
        await consumer.commit({
          topic: message.topic,
          partition: message.partition,
          offset: String(Number(message.offset) + 1),
        });
      } finally {
        await consumer?.disconnect().catch(() => undefined);
        await adapter.deleteRunResources(run).catch(() => undefined);
        await adapter.shutdown();
      }
    },
    60_000,
  );
});
