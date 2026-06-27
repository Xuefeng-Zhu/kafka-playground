import { beforeEach, describe, expect, it, vi } from "vitest";
import { AivenKafkaRuntimeAdapter, loadServerEnv } from "./index";

const kafkaMocks = vi.hoisted(() => ({
  adminConnect: vi.fn(),
  adminDisconnect: vi.fn(),
  adminListTopics: vi.fn(),
  consumerCommitOffsets: vi.fn(),
  consumerConnect: vi.fn(),
  consumerDisconnect: vi.fn(),
  consumerHandlers: new Map<
    string,
    (event: {
      payload: {
        error?: unknown;
        memberAssignment?: Record<string, number[]>;
      };
    }) => void
  >(),
  consumerRun: vi.fn(),
  consumerSubscribe: vi.fn(),
}));

vi.mock("kafkajs", () => ({
  Kafka: vi.fn(function Kafka() {
    return {
      admin: () => ({
        connect: kafkaMocks.adminConnect,
        disconnect: kafkaMocks.adminDisconnect,
        listTopics: kafkaMocks.adminListTopics,
      }),
      consumer: () => ({
        events: {
          CRASH: "CRASH",
          GROUP_JOIN: "GROUP_JOIN",
          REBALANCING: "REBALANCING",
        },
        on: (
          eventName: string,
          handler: (event: {
            payload: {
              error?: unknown;
              memberAssignment?: Record<string, number[]>;
            };
          }) => void,
        ) => {
          kafkaMocks.consumerHandlers.set(eventName, handler);
        },
        connect: kafkaMocks.consumerConnect,
        subscribe: kafkaMocks.consumerSubscribe,
        run: kafkaMocks.consumerRun,
        commitOffsets: kafkaMocks.consumerCommitOffsets,
        disconnect: kafkaMocks.consumerDisconnect,
      }),
    };
  }),
  logLevel: { NOTHING: 0 },
}));

describe("AivenKafkaRuntimeAdapter diagnostics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    kafkaMocks.consumerHandlers.clear();
    kafkaMocks.adminConnect.mockResolvedValue(undefined);
    kafkaMocks.adminListTopics.mockResolvedValue(["topic"]);
    kafkaMocks.adminDisconnect.mockResolvedValue(undefined);
    kafkaMocks.consumerConnect.mockResolvedValue(undefined);
    kafkaMocks.consumerSubscribe.mockResolvedValue(undefined);
    kafkaMocks.consumerRun.mockResolvedValue(undefined);
  });

  it("reports sanitized disconnect failures through diagnostics", async () => {
    kafkaMocks.adminDisconnect.mockRejectedValue(
      new Error("disconnect failed password=super-secret"),
    );
    const onDisconnectError = vi.fn();
    const adapter = new AivenKafkaRuntimeAdapter(
      loadServerEnv({
        KAFKA_MODE: "aiven",
        AIVEN_KAFKA_BROKERS: "broker.example.com:9092",
        AIVEN_KAFKA_USERNAME: "service-user",
        AIVEN_KAFKA_PASSWORD: "service-password",
        AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
      }),
      { onDisconnectError },
    );

    await expect(adapter.testConnection()).resolves.toMatchObject({
      status: "connected",
    });

    expect(onDisconnectError).toHaveBeenCalledWith({
      operation: "connection.admin.disconnect",
      error: {
        code: "Error",
        message: "disconnect failed password=REDACTED",
      },
    });
  });

  it("sanitizes consumer crash errors before invoking callbacks", async () => {
    const adapter = new AivenKafkaRuntimeAdapter(
      loadServerEnv({
        KAFKA_MODE: "aiven",
        AIVEN_KAFKA_BROKERS: "broker.example.com:9092",
        AIVEN_KAFKA_USERNAME: "service-user",
        AIVEN_KAFKA_PASSWORD: "service-password",
        AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
      }),
    );
    const onError = vi.fn();

    await adapter.createConsumer(
      {
        runId: "run-1",
        scenarioId: "partitioning",
        topicName: "topic",
        consumerGroupId: "group",
        partitionCount: 2,
      },
      "consumer-1",
      {
        onAssigned: () => undefined,
        onRevoked: () => undefined,
        onMessage: async () => undefined,
        onError,
      },
    );

    kafkaMocks.consumerHandlers.get("CRASH")?.({
      payload: { error: new Error("crash password=super-secret") },
    });

    expect(onError).toHaveBeenCalledWith({
      code: "CONSUMER_CRASH",
      message: "crash password=REDACTED",
    });
  });
});
