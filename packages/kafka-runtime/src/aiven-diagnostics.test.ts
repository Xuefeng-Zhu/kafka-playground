import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AivenKafkaRuntimeAdapter,
  KafkaConsumerStartupRollbackError,
  loadServerEnv,
} from "./index";

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

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

vi.mock("node:fs/promises", () => ({
  readFile: fsMocks.readFile,
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
    fsMocks.readFile.mockResolvedValue("TEST_CA_CERTIFICATE");
    kafkaMocks.consumerHandlers.clear();
    kafkaMocks.adminConnect.mockResolvedValue(undefined);
    kafkaMocks.adminListTopics.mockResolvedValue(["topic"]);
    kafkaMocks.adminDisconnect.mockResolvedValue(undefined);
    kafkaMocks.consumerConnect.mockResolvedValue(undefined);
    kafkaMocks.consumerDisconnect.mockResolvedValue(undefined);
    kafkaMocks.consumerSubscribe.mockResolvedValue(undefined);
    kafkaMocks.consumerRun.mockResolvedValue(undefined);
  });

  it("disconnects a consumer when subscription fails during startup", async () => {
    kafkaMocks.consumerSubscribe.mockRejectedValueOnce(
      new Error("subscription unavailable"),
    );
    const adapter = new AivenKafkaRuntimeAdapter(
      loadServerEnv({
        KAFKA_MODE: "aiven",
        AIVEN_KAFKA_BROKERS: "broker.example.com:9092",
        AIVEN_KAFKA_USERNAME: "service-user",
        AIVEN_KAFKA_PASSWORD: "service-password",
        AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
      }),
    );

    await expect(
      adapter.createConsumer(
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
          onError: () => undefined,
        },
      ),
    ).rejects.toThrow("subscription unavailable");

    expect(kafkaMocks.consumerDisconnect).toHaveBeenCalledTimes(1);
    expect(kafkaMocks.consumerRun).not.toHaveBeenCalled();
  });

  it("disconnects a consumer when run startup fails", async () => {
    kafkaMocks.consumerRun.mockRejectedValueOnce(
      new Error("consumer run unavailable"),
    );
    const onError = vi.fn();
    const adapter = new AivenKafkaRuntimeAdapter(
      loadServerEnv({
        KAFKA_MODE: "aiven",
        AIVEN_KAFKA_BROKERS: "broker.example.com:9092",
        AIVEN_KAFKA_USERNAME: "service-user",
        AIVEN_KAFKA_PASSWORD: "service-password",
        AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
      }),
    );

    await expect(
      adapter.createConsumer(
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
      ),
    ).rejects.toThrow("consumer run unavailable");

    expect(kafkaMocks.consumerDisconnect).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith({
        code: "Error",
        message: "consumer run unavailable",
      }),
    );
  });

  it("returns a retryable consumer handle when startup rollback also fails", async () => {
    const startupError = new Error("consumer run unavailable");
    const rollbackError = new Error("consumer disconnect unavailable");
    kafkaMocks.consumerRun.mockRejectedValueOnce(startupError);
    kafkaMocks.consumerDisconnect.mockRejectedValueOnce(rollbackError);
    const adapter = new AivenKafkaRuntimeAdapter(
      loadServerEnv({
        KAFKA_MODE: "aiven",
        AIVEN_KAFKA_BROKERS: "broker.example.com:9092",
        AIVEN_KAFKA_USERNAME: "service-user",
        AIVEN_KAFKA_PASSWORD: "service-password",
        AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
      }),
    );

    const error = await adapter
      .createConsumer(
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
          onError: () => undefined,
        },
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(KafkaConsumerStartupRollbackError);
    if (!(error instanceof KafkaConsumerStartupRollbackError)) {
      throw new Error("Missing startup rollback error");
    }
    expect(error.startupError).toBe(startupError);
    expect(error.rollbackError).toBe(rollbackError);
    expect(error.consumerHandle.consumerId).toBe("consumer-1");

    await expect(error.consumerHandle.disconnect()).resolves.toBeUndefined();
    expect(kafkaMocks.consumerDisconnect).toHaveBeenCalledTimes(2);
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

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith({
        code: "CONSUMER_CRASH",
        message: "crash password=REDACTED",
      });
    });
  });

  it("reports async consumer callback rejections through diagnostics", async () => {
    const onConsumerCallbackError = vi.fn();
    const adapter = new AivenKafkaRuntimeAdapter(
      loadServerEnv({
        KAFKA_MODE: "aiven",
        AIVEN_KAFKA_BROKERS: "broker.example.com:9092",
        AIVEN_KAFKA_USERNAME: "service-user",
        AIVEN_KAFKA_PASSWORD: "service-password",
        AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
      }),
      { onConsumerCallbackError },
    );

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
        onAssigned: async () => {
          throw new Error(
            "assignment failed for service-user service-password ./certs/ca.pem",
          );
        },
        onRevoked: () => undefined,
        onMessage: async () => undefined,
        onError: () => undefined,
      },
    );

    kafkaMocks.consumerHandlers.get("GROUP_JOIN")?.({
      payload: { memberAssignment: { topic: [0] } },
    });

    await vi.waitFor(() => {
      expect(onConsumerCallbackError).toHaveBeenCalledWith({
        operation: "consumer.assigned",
        error: {
          code: "Error",
          message: "assignment failed for REDACTED REDACTED REDACTED",
        },
      });
    });
  });
});
