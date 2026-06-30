import { describe, expect, it } from "vitest";
import {
  DemoKafkaRuntimeAdapter,
  KafkaConfigurationError,
  RemoteKafkaBrokerPolicyError,
  UserConfiguredKafkaRuntimeAdapter,
  loadServerEnv,
  maskBrokerHost,
  parseBrokerList,
  stablePartition,
} from "./index";

describe("kafka runtime", () => {
  it("parses broker lists", () => {
    expect(parseBrokerList("one:9092, two:9092")).toEqual([
      "one:9092",
      "two:9092",
    ]);
  });

  it("masks broker hostnames", () => {
    expect(maskBrokerHost("kafka.example.com:9092")).toBe("ka***.example.com");
    expect(maskBrokerHost("[2001:db8::1]:9092")).toBe("20***");
    expect(maskBrokerHost("[2001:db8::1]:9092, backup.example.com:9092")).toBe(
      "20***",
    );
  });

  it("validates demo env without Aiven credentials", () => {
    expect(loadServerEnv({ KAFKA_MODE: "demo" }).KAFKA_MODE).toBe("demo");
  });

  it("loads incomplete Aiven env so the app can report configuration missing", async () => {
    const env = loadServerEnv({ KAFKA_MODE: "aiven" });
    const adapter = new (await import("./index")).AivenKafkaRuntimeAdapter(env);
    await expect(adapter.testConnection()).resolves.toMatchObject({
      status: "configuration_missing",
      missingVariables: [
        "AIVEN_KAFKA_BROKERS",
        "AIVEN_KAFKA_USERNAME",
        "AIVEN_KAFKA_PASSWORD",
      ],
    });
  });

  it("rejects Aiven run creation with a typed configuration error", async () => {
    const adapter = new (await import("./index")).AivenKafkaRuntimeAdapter(
      loadServerEnv({ KAFKA_MODE: "aiven" }),
    );

    await expect(
      adapter.createRun({
        runId: "run",
        scenarioId: "partitioning",
        topicName: "topic",
        consumerGroupId: "group",
        partitionCount: 2,
      }),
    ).rejects.toMatchObject({
      code: "AIVEN_CONFIGURATION_MISSING",
      status: 503,
      missingVariables: [
        "AIVEN_KAFKA_BROKERS",
        "AIVEN_KAFKA_USERNAME",
        "AIVEN_KAFKA_PASSWORD",
      ],
    } satisfies Partial<KafkaConfigurationError>);
  });

  it("returns deterministic partitions for fixed keys", () => {
    expect(stablePartition("user-1", 2)).toBe(stablePartition("user-1", 2));
  });

  it("increments demo offsets per partition", async () => {
    const adapter = new DemoKafkaRuntimeAdapter();
    await adapter.createRun({
      runId: "run",
      scenarioId: "partitioning",
      topicName: "topic",
      consumerGroupId: "group",
      partitionCount: 2,
    });
    const first = await adapter.produce({
      runId: "run",
      topicName: "topic",
      key: "user-1",
      value: {},
      headers: {},
      keyStrategy: { type: "fixed", value: "user-1" },
    });
    const second = await adapter.produce({
      runId: "run",
      topicName: "topic",
      key: "user-1",
      value: {},
      headers: {},
      keyStrategy: { type: "fixed", value: "user-1" },
    });
    expect(second.partition).toBe(first.partition);
    expect(second.offset).toBe("1");
  });

  it("assigns no-key demo messages deterministically", async () => {
    const adapter = new DemoKafkaRuntimeAdapter();
    await adapter.createRun({
      runId: "run",
      scenarioId: "partitioning",
      topicName: "topic",
      consumerGroupId: "group",
      partitionCount: 2,
    });
    const first = await adapter.produce({
      runId: "run",
      topicName: "topic",
      key: null,
      value: {},
      headers: {},
      keyStrategy: { type: "no_key" },
    });
    const second = await adapter.produce({
      runId: "run",
      topicName: "topic",
      key: null,
      value: {},
      headers: {},
      keyStrategy: { type: "no_key" },
    });
    expect([first.partition, second.partition]).toEqual([0, 1]);
  });

  it("rejects user-configured remote brokers that target localhost", async () => {
    const adapter = new UserConfiguredKafkaRuntimeAdapter({
      brokers: "127.0.0.1:9092",
      username: "service-user",
      password: "service-password",
      saslMechanism: "SCRAM-SHA-256",
      useTls: true,
      caCertificate: "",
    });

    await expect(
      adapter.createRun({
        runId: "run",
        scenarioId: "partitioning",
        topicName: "topic",
        consumerGroupId: "group",
        partitionCount: 2,
      }),
    ).rejects.toMatchObject({
      code: "REMOTE_KAFKA_BROKER_NOT_ALLOWED",
      status: 400,
      broker: "127.0.0.1:9092",
    } satisfies Partial<RemoteKafkaBrokerPolicyError>);
  });

  it("reports blocked user-configured remote brokers as sanitized connection failures", async () => {
    const adapter = new UserConfiguredKafkaRuntimeAdapter({
      brokers: "localhost:9092",
      username: "service-user",
      password: "service-password",
      saslMechanism: "SCRAM-SHA-256",
      useTls: true,
      caCertificate: "SECRET_CA",
    });

    await expect(adapter.testConnection()).resolves.toMatchObject({
      status: "connection_failed",
      mode: "remote",
      error: {
        code: "RemoteKafkaBrokerPolicyError",
        message:
          "Remote Kafka broker localhost:9092 is not allowed. Use a public broker hostname or IP address.",
      },
    });
  });
});
