import { beforeEach, describe, expect, it, vi } from "vitest";
import { AivenKafkaRuntimeAdapter, loadServerEnv } from "./index";

const kafkaMocks = vi.hoisted(() => ({
  adminConnect: vi.fn(),
  adminDisconnect: vi.fn(),
  adminListTopics: vi.fn(),
}));

vi.mock("kafkajs", () => ({
  Kafka: vi.fn(function Kafka() {
    return {
      admin: () => ({
        connect: kafkaMocks.adminConnect,
        disconnect: kafkaMocks.adminDisconnect,
        listTopics: kafkaMocks.adminListTopics,
      }),
    };
  }),
  logLevel: { NOTHING: 0 },
}));

describe("AivenKafkaRuntimeAdapter diagnostics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    kafkaMocks.adminConnect.mockResolvedValue(undefined);
    kafkaMocks.adminListTopics.mockResolvedValue(["topic"]);
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
});
