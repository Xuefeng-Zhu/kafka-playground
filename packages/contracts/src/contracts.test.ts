import { describe, expect, it } from "vitest";
import {
  connectionTestRequestSchema,
  consumerSnapshotSchema,
  createRunRequestSchema,
  remoteKafkaConfigSchema,
  runtimeEventTypes,
  runtimeEventSchema,
  settingsRequestSchema,
} from "./index";

describe("contracts", () => {
  it("validates committed offset events", () => {
    expect(() =>
      runtimeEventSchema.parse({
        eventId: "evt",
        runId: "run",
        sequence: 1,
        occurredAt: new Date().toISOString(),
        type: "offset.committed",
        consumerId: "consumer-1",
        groupId: "group",
        topic: "topic",
        partition: 0,
        committedOffset: "2",
        messageId: "message",
      }),
    ).not.toThrow();
  });

  it("validates crashed consumers and crash events", () => {
    expect(() =>
      consumerSnapshotSchema.parse({
        consumerId: "consumer-1",
        status: "crashed",
        assignments: [],
        processedCount: 0,
        committedCount: 0,
      }),
    ).not.toThrow();

    expect(() =>
      runtimeEventSchema.parse({
        eventId: "evt",
        runId: "run",
        sequence: 1,
        occurredAt: new Date().toISOString(),
        type: "consumer.crashed",
        consumerId: "consumer-1",
        actor: "consumer-1",
        message: "consumer-1 crashed before a graceful shutdown.",
      }),
    ).not.toThrow();
  });

  it("rejects excessive producer rates", () => {
    expect(() => settingsRequestSchema.parse({ productionRate: 11 })).toThrow();
  });

  it("defaults run creation to demo mode", () => {
    expect(
      createRunRequestSchema.parse({ scenarioId: "partitioning" }),
    ).toEqual({
      scenarioId: "partitioning",
      mode: "demo",
    });
  });

  it("validates remote Kafka run requests", () => {
    const remoteKafkaConfig = remoteKafkaConfigSchema.parse({
      brokers: "broker.example.com:9092",
      username: "service-user",
      password: "service-password",
      saslMechanism: "SCRAM-SHA-512",
      useTls: false,
    });

    expect(
      createRunRequestSchema.parse({
        scenarioId: "partitioning",
        mode: "remote",
        remoteKafkaConfig,
      }),
    ).toEqual({
      scenarioId: "partitioning",
      mode: "remote",
      remoteKafkaConfig,
    });
    expect(() =>
      createRunRequestSchema.parse({
        scenarioId: "partitioning",
        mode: "remote",
      }),
    ).toThrow();
    expect(() => createRunRequestSchema.parse({ mode: "aiven" })).toThrow();
  });

  it("validates remote Kafka connection test requests", () => {
    expect(
      connectionTestRequestSchema.parse({
        mode: "remote",
        remoteKafkaConfig: {
          brokers: "broker.example.com:9092",
          username: "service-user",
          password: "service-password",
        },
      }),
    ).toMatchObject({
      mode: "remote",
      remoteKafkaConfig: {
        saslMechanism: "SCRAM-SHA-256",
        useTls: true,
      },
    });
  });

  it("exports every runtime event type for client listeners", () => {
    expect(runtimeEventTypes).toEqual(
      expect.arrayContaining([
        "message.produced",
        "consumer.crashed",
        "offset.committed",
        "resource.cleanup_failed",
      ]),
    );
    expect(new Set(runtimeEventTypes).size).toBe(runtimeEventTypes.length);
  });
});
