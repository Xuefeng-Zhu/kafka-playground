import type {
  CleanupResult,
  ConnectionStatus,
  KeyStrategy,
  KafkaMode,
  RemoteKafkaConfig,
} from "@kplay/contracts";
import type { Admin, SASLOptions } from "kafkajs";
import { z } from "zod";

export type RuntimeEventSink = (event: {
  type: string;
  [key: string]: unknown;
}) => void;

export type CreateRunInput = {
  runId: string;
  scenarioId: string;
  topicName: string;
  consumerGroupId: string;
  partitionCount: number;
};

export type ProduceInput = {
  runId: string;
  topicName: string;
  key: string | null;
  value: Record<string, unknown>;
  headers: Record<string, string>;
  keyStrategy: KeyStrategy;
};

export type ProduceResult = {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string | null;
};

export type ConsumerAssignment = {
  topic: string;
  partition: number;
};

export type ConsumedMessage = {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: Record<string, unknown> | null;
  headers: Record<string, string>;
  timestamp: string | null;
};

export type PlaygroundConsumerCallbacks = {
  onAssigned(assignments: ConsumerAssignment[]): void | Promise<void>;
  onRevoked(assignments: ConsumerAssignment[]): void | Promise<void>;
  onMessage(message: ConsumedMessage): Promise<void>;
  onError(error: { code: string; message: string }): void | Promise<void>;
};

export type PlaygroundConsumerHandle = {
  consumerId: string;
  commit(input: {
    topic: string;
    partition: number;
    offset: string;
  }): Promise<void>;
  disconnect(): Promise<void>;
};

export type KafkaRuntimeAdapter = {
  readonly mode: KafkaMode;
  testConnection(): Promise<ConnectionStatus>;
  createRun(input: CreateRunInput): Promise<void>;
  produce(input: ProduceInput): Promise<ProduceResult>;
  createConsumer(
    run: CreateRunInput,
    consumerId: string,
    callbacks: PlaygroundConsumerCallbacks,
  ): Promise<PlaygroundConsumerHandle>;
  deleteRunResources(input: CreateRunInput): Promise<CleanupResult>;
  shutdown(): Promise<void>;
};

export type KafkaRuntimeDiagnostics = {
  onDisconnectError?: (event: {
    operation: string;
    error: ReturnType<typeof sanitizeKafkaError>;
  }) => void;
  onConsumerCallbackError?: (event: {
    operation: string;
    error: ReturnType<typeof sanitizeKafkaError>;
  }) => void;
};

export class KafkaConfigurationError extends Error {
  readonly code = "AIVEN_CONFIGURATION_MISSING";
  readonly status = 503;

  constructor(readonly missingVariables: string[]) {
    super(
      `Aiven Kafka configuration is missing: ${missingVariables.join(", ")}`,
    );
    this.name = "KafkaConfigurationError";
  }
}

export class RemoteKafkaConfigurationError extends Error {
  readonly code = "REMOTE_KAFKA_CONFIGURATION_MISSING";
  readonly status = 503;

  constructor(readonly missingVariables: string[]) {
    super(
      `Remote Kafka configuration is missing: ${missingVariables.join(", ")}`,
    );
    this.name = "RemoteKafkaConfigurationError";
  }
}

export class RemoteKafkaBrokerPolicyError extends Error {
  readonly code = "REMOTE_KAFKA_BROKER_NOT_ALLOWED";
  readonly status = 400;

  constructor(readonly broker: string) {
    super(
      `Remote Kafka broker ${broker} is not allowed. Use a public broker hostname or IP address.`,
    );
    this.name = "RemoteKafkaBrokerPolicyError";
  }
}

export const serverEnvSchema = z.object({
  KAFKA_MODE: z.enum(["demo", "aiven"]).default("demo"),
  AIVEN_KAFKA_BROKERS: z.string().optional().default(""),
  AIVEN_KAFKA_USERNAME: z.string().optional().default(""),
  AIVEN_KAFKA_PASSWORD: z.string().optional().default(""),
  AIVEN_KAFKA_SASL_MECHANISM: z
    .enum(["PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512"])
    .default("SCRAM-SHA-256"),
  AIVEN_KAFKA_CA_PATH: z.string().optional().default("./certs/ca.pem"),
  KAFKA_TOPIC_PREFIX: z.string().default("kplay"),
  MAX_CONSUMERS_PER_RUN: z.coerce.number().int().positive().max(3).default(3),
  MAX_PRODUCE_RATE: z.coerce.number().int().positive().max(10).default(10),
  EVENT_HISTORY_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .max(5000)
    .default(2000),
  TIMELINE_DISPLAY_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .max(2000)
    .default(1000),
  LOG_MESSAGE_PAYLOADS: z.coerce.boolean().default(false),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env) {
  return serverEnvSchema.parse(source);
}

export function parseBrokerList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function maskBrokerHost(value: string | undefined) {
  if (!value) return null;
  const first = parseBrokerList(value)[0];
  if (!first) return null;
  const host = first.split(":")[0] ?? "";
  const pieces = host.split(".");
  if (pieces.length <= 2) return `${host.slice(0, 2)}***`;
  return `${pieces[0]?.slice(0, 2)}***.${pieces.slice(-2).join(".")}`;
}

export function sanitizeKafkaError(error: unknown, secrets: string[] = []) {
  if (error instanceof Error) {
    let message = error.message.replace(
      /(password|username|sasl|secret|caCertificate)=\S+/gi,
      "$1=REDACTED",
    );
    for (const secret of secrets) {
      if (secret.length > 1) message = message.split(secret).join("REDACTED");
    }
    return {
      code: error.name || "KAFKA_ERROR",
      message,
    };
  }
  return { code: "KAFKA_ERROR", message: "Kafka operation failed." };
}

export class DemoKafkaRuntimeAdapter implements KafkaRuntimeAdapter {
  readonly mode = "demo" as const;
  private offsets = new Map<string, number[]>();
  private noKeyCursors = new Map<string, number>();

  async testConnection(): Promise<ConnectionStatus> {
    return {
      status: "demo_mode",
      mode: "demo",
      maskedBrokerHost: null,
      brokerCount: 0,
      topicCount: this.offsets.size,
      missingVariables: [],
      error: null,
      checkedAt: new Date().toISOString(),
    };
  }

  async createRun(input: CreateRunInput) {
    this.offsets.set(
      input.topicName,
      Array.from({ length: input.partitionCount }, () => 0),
    );
  }

  async produce(input: ProduceInput): Promise<ProduceResult> {
    const topicOffsets = this.offsets.get(input.topicName);
    if (!topicOffsets) throw new Error("Demo topic does not exist.");
    const partition =
      input.key === null
        ? this.nextNoKeyPartition(input.topicName, topicOffsets.length)
        : stablePartition(input.key, topicOffsets.length);
    const offset = topicOffsets[partition] ?? 0;
    topicOffsets[partition] = offset + 1;
    return {
      topic: input.topicName,
      partition,
      offset: String(offset),
      timestamp: new Date().toISOString(),
    };
  }

  async createConsumer(
    _run: CreateRunInput,
    consumerId: string,
    _callbacks: PlaygroundConsumerCallbacks,
  ): Promise<PlaygroundConsumerHandle> {
    return {
      consumerId,
      async commit() {
        return;
      },
      async disconnect() {
        return;
      },
    };
  }

  async deleteRunResources(input: CreateRunInput): Promise<CleanupResult> {
    this.offsets.delete(input.topicName);
    this.noKeyCursors.delete(input.topicName);
    return {
      status: "completed",
      steps: [
        { name: "producer.disconnect", status: "completed" },
        { name: "consumer.disconnect", status: "completed" },
        {
          name: "topic.delete",
          status: "completed",
          resourceName: input.topicName,
        },
      ],
    };
  }

  async shutdown() {
    this.offsets.clear();
    this.noKeyCursors.clear();
  }

  private nextNoKeyPartition(topicName: string, partitionCount: number) {
    const next = this.noKeyCursors.get(topicName) ?? 0;
    this.noKeyCursors.set(topicName, next + 1);
    return next % partitionCount;
  }
}

export class AivenKafkaRuntimeAdapter implements KafkaRuntimeAdapter {
  readonly mode = "aiven" as const;

  constructor(
    private readonly env: ServerEnv,
    private readonly diagnostics: KafkaRuntimeDiagnostics = {},
  ) {}

  async testConnection(): Promise<ConnectionStatus> {
    const missingVariables = getMissingAivenVariables(this.env);
    if (missingVariables.length > 0) {
      return {
        status: "configuration_missing",
        mode: "aiven",
        maskedBrokerHost: maskBrokerHost(this.env.AIVEN_KAFKA_BROKERS),
        brokerCount: parseBrokerList(this.env.AIVEN_KAFKA_BROKERS).length,
        topicCount: null,
        missingVariables,
        error: null,
        checkedAt: new Date().toISOString(),
      };
    }

    let admin: Admin | null = null;
    try {
      const kafka = await createAivenKafkaClient(this.env);
      admin = kafka.admin();
      await admin.connect();
      let topicCount: number | null = null;
      let topicListError: ConnectionStatus["error"] = null;
      try {
        topicCount = (await admin.listTopics()).length;
      } catch (error) {
        topicListError = sanitizeKafkaError(error, aivenSecrets(this.env));
      }
      return {
        status: "connected",
        mode: "aiven",
        maskedBrokerHost: maskBrokerHost(this.env.AIVEN_KAFKA_BROKERS),
        brokerCount: parseBrokerList(this.env.AIVEN_KAFKA_BROKERS).length,
        topicCount,
        missingVariables: [],
        error: topicListError,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "connection_failed",
        mode: "aiven",
        maskedBrokerHost: maskBrokerHost(this.env.AIVEN_KAFKA_BROKERS),
        brokerCount: parseBrokerList(this.env.AIVEN_KAFKA_BROKERS).length,
        topicCount: null,
        missingVariables: [],
        error: sanitizeKafkaError(error, aivenSecrets(this.env)),
        checkedAt: new Date().toISOString(),
      };
    } finally {
      await this.disconnectSafely("connection.admin.disconnect", admin);
    }
  }

  async createRun(input: CreateRunInput) {
    assertAivenConfigured(this.env);
    const kafka = await createAivenKafkaClient(this.env);
    const admin = kafka.admin();
    try {
      await admin.connect();
      await admin.createTopics({
        waitForLeaders: true,
        topics: [
          { topic: input.topicName, numPartitions: input.partitionCount },
        ],
      });
    } finally {
      await this.disconnectSafely("run.admin.disconnect", admin);
    }
  }

  async produce(input: ProduceInput): Promise<ProduceResult> {
    assertAivenConfigured(this.env);
    const kafka = await createAivenKafkaClient(this.env);
    const producer = kafka.producer();
    try {
      await producer.connect();
      const result = await producer.send({
        topic: input.topicName,
        messages: [
          {
            key: input.key ?? undefined,
            value: JSON.stringify(input.value),
            headers: input.headers,
          },
        ],
      });
      const report = Array.isArray(result) ? result[0] : result;
      const partition = report?.partition;
      const offset = report?.offset ?? report?.baseOffset;
      if (partition === undefined || offset === undefined) {
        throw new Error(
          "Kafka delivery report did not include a partition and offset.",
        );
      }
      return {
        topic: report.topicName ?? input.topicName,
        partition: Number(partition),
        offset: String(offset),
        timestamp: report.timestamp
          ? String(report.timestamp)
          : new Date().toISOString(),
      };
    } finally {
      await this.disconnectSafely("produce.producer.disconnect", producer);
    }
  }

  async createConsumer(
    run: CreateRunInput,
    consumerId: string,
    callbacks: PlaygroundConsumerCallbacks,
  ): Promise<PlaygroundConsumerHandle> {
    assertAivenConfigured(this.env);
    const kafka = await createAivenKafkaClient(this.env, consumerId);
    const consumer = kafka.consumer({
      groupId: run.consumerGroupId,
      allowAutoTopicCreation: false,
    });
    consumer.on(consumer.events.GROUP_JOIN, (event) => {
      const partitions = event.payload.memberAssignment[run.topicName] ?? [];
      notifyConsumerCallback("consumer.assigned", this.diagnostics, () =>
        callbacks.onAssigned(
          partitions.map((partition: number) => ({
            topic: run.topicName,
            partition,
          })),
        ),
      );
    });
    consumer.on(consumer.events.REBALANCING, () => {
      notifyConsumerCallback("consumer.revoked", this.diagnostics, () =>
        callbacks.onRevoked([]),
      );
    });
    consumer.on(consumer.events.CRASH, (event) => {
      const error = sanitizeKafkaError(event.payload.error);
      notifyConsumerCallback("consumer.crash", this.diagnostics, () =>
        callbacks.onError({
          code: "CONSUMER_CRASH",
          message: error.message,
        }),
      );
    });
    await consumer.connect();
    await consumer.subscribe({ topic: run.topicName, fromBeginning: true });
    void consumer
      .run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
          await callbacks.onMessage({
            topic,
            partition,
            offset: String(message.offset),
            key: bufferToString(message.key),
            value: parseJsonValue(message.value),
            headers: normalizeHeaders(message.headers),
            timestamp: message.timestamp ? String(message.timestamp) : null,
          });
        },
      })
      .catch((error: unknown) => {
        notifyConsumerCallback("consumer.run", this.diagnostics, () =>
          callbacks.onError(sanitizeKafkaError(error)),
        );
      });
    return {
      consumerId,
      async commit(input) {
        await consumer.commitOffsets([
          {
            topic: input.topic,
            partition: input.partition,
            offset: input.offset,
          },
        ]);
      },
      async disconnect() {
        await consumer.disconnect();
      },
    };
  }

  async deleteRunResources(input: CreateRunInput): Promise<CleanupResult> {
    assertAivenConfigured(this.env);
    const kafka = await createAivenKafkaClient(this.env);
    const admin = kafka.admin();
    const steps: CleanupResult["steps"] = [];
    try {
      await admin.connect();
      await admin.deleteTopics({ topics: [input.topicName] });
      steps.push({
        name: "topic.delete",
        status: "requested",
        resourceName: input.topicName,
      });
      return { status: "requested", steps };
    } catch (error) {
      steps.push({
        name: "topic.delete",
        status: "failed",
        resourceName: input.topicName,
        message: sanitizeKafkaError(error).message,
      });
      return { status: "failed", steps };
    } finally {
      await this.disconnectSafely("cleanup.admin.disconnect", admin);
    }
  }

  async shutdown() {
    return;
  }

  private async disconnectSafely(
    operation: string,
    handle: { disconnect(): Promise<void> } | null,
  ) {
    if (!handle) return;
    try {
      await handle.disconnect();
    } catch (error) {
      this.diagnostics.onDisconnectError?.({
        operation,
        error: sanitizeKafkaError(error),
      });
    }
  }
}

export class UserConfiguredKafkaRuntimeAdapter implements KafkaRuntimeAdapter {
  readonly mode = "remote" as const;

  constructor(
    private readonly config: RemoteKafkaConfig,
    private readonly diagnostics: KafkaRuntimeDiagnostics = {},
  ) {}

  async testConnection(): Promise<ConnectionStatus> {
    const missingVariables = getMissingRemoteKafkaVariables(this.config);
    if (missingVariables.length > 0) {
      return {
        status: "configuration_missing",
        mode: "remote",
        maskedBrokerHost: maskBrokerHost(this.config.brokers),
        brokerCount: parseBrokerList(this.config.brokers).length,
        topicCount: null,
        missingVariables,
        error: null,
        checkedAt: new Date().toISOString(),
      };
    }

    let admin: Admin | null = null;
    try {
      await assertRemoteKafkaBrokersAllowed(this.config);
      const kafka = await createRemoteKafkaClient(this.config);
      admin = kafka.admin();
      await admin.connect();
      let topicCount: number | null = null;
      let topicListError: ConnectionStatus["error"] = null;
      try {
        topicCount = (await admin.listTopics()).length;
      } catch (error) {
        topicListError = sanitizeKafkaError(
          error,
          remoteKafkaSecrets(this.config),
        );
      }
      return {
        status: "connected",
        mode: "remote",
        maskedBrokerHost: maskBrokerHost(this.config.brokers),
        brokerCount: parseBrokerList(this.config.brokers).length,
        topicCount,
        missingVariables: [],
        error: topicListError,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "connection_failed",
        mode: "remote",
        maskedBrokerHost: maskBrokerHost(this.config.brokers),
        brokerCount: parseBrokerList(this.config.brokers).length,
        topicCount: null,
        missingVariables: [],
        error: sanitizeKafkaError(error, remoteKafkaSecrets(this.config)),
        checkedAt: new Date().toISOString(),
      };
    } finally {
      await this.disconnectSafely("connection.admin.disconnect", admin);
    }
  }

  async createRun(input: CreateRunInput) {
    assertRemoteKafkaConfigured(this.config);
    await assertRemoteKafkaBrokersAllowed(this.config);
    const kafka = await createRemoteKafkaClient(this.config);
    const admin = kafka.admin();
    try {
      await admin.connect();
      await admin.createTopics({
        waitForLeaders: true,
        topics: [
          { topic: input.topicName, numPartitions: input.partitionCount },
        ],
      });
    } finally {
      await this.disconnectSafely("run.admin.disconnect", admin);
    }
  }

  async produce(input: ProduceInput): Promise<ProduceResult> {
    assertRemoteKafkaConfigured(this.config);
    await assertRemoteKafkaBrokersAllowed(this.config);
    const kafka = await createRemoteKafkaClient(this.config);
    const producer = kafka.producer();
    try {
      await producer.connect();
      const result = await producer.send({
        topic: input.topicName,
        messages: [
          {
            key: input.key ?? undefined,
            value: JSON.stringify(input.value),
            headers: input.headers,
          },
        ],
      });
      const report = Array.isArray(result) ? result[0] : result;
      const partition = report?.partition;
      const offset = report?.offset ?? report?.baseOffset;
      if (partition === undefined || offset === undefined) {
        throw new Error(
          "Kafka delivery report did not include a partition and offset.",
        );
      }
      return {
        topic: report.topicName ?? input.topicName,
        partition: Number(partition),
        offset: String(offset),
        timestamp: report.timestamp
          ? String(report.timestamp)
          : new Date().toISOString(),
      };
    } finally {
      await this.disconnectSafely("produce.producer.disconnect", producer);
    }
  }

  async createConsumer(
    run: CreateRunInput,
    consumerId: string,
    callbacks: PlaygroundConsumerCallbacks,
  ): Promise<PlaygroundConsumerHandle> {
    assertRemoteKafkaConfigured(this.config);
    await assertRemoteKafkaBrokersAllowed(this.config);
    const kafka = await createRemoteKafkaClient(this.config, consumerId);
    const consumer = kafka.consumer({
      groupId: run.consumerGroupId,
      allowAutoTopicCreation: false,
    });
    consumer.on(consumer.events.GROUP_JOIN, (event) => {
      const partitions = event.payload.memberAssignment[run.topicName] ?? [];
      notifyConsumerCallback(
        "consumer.assigned",
        this.diagnostics,
        () =>
          callbacks.onAssigned(
            partitions.map((partition: number) => ({
              topic: run.topicName,
              partition,
            })),
          ),
        remoteKafkaSecrets(this.config),
      );
    });
    consumer.on(consumer.events.REBALANCING, () => {
      notifyConsumerCallback(
        "consumer.revoked",
        this.diagnostics,
        () => callbacks.onRevoked([]),
        remoteKafkaSecrets(this.config),
      );
    });
    consumer.on(consumer.events.CRASH, (event) => {
      notifyConsumerCallback(
        "consumer.crash",
        this.diagnostics,
        () =>
          callbacks.onError({
            code: "CONSUMER_CRASH",
            message: sanitizeKafkaError(
              event.payload.error,
              remoteKafkaSecrets(this.config),
            ).message,
          }),
        remoteKafkaSecrets(this.config),
      );
    });
    await consumer.connect();
    await consumer.subscribe({ topic: run.topicName, fromBeginning: true });
    void consumer
      .run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
          await callbacks.onMessage({
            topic,
            partition,
            offset: String(message.offset),
            key: bufferToString(message.key),
            value: parseJsonValue(message.value),
            headers: normalizeHeaders(message.headers),
            timestamp: message.timestamp ? String(message.timestamp) : null,
          });
        },
      })
      .catch((error: unknown) => {
        notifyConsumerCallback(
          "consumer.run",
          this.diagnostics,
          () =>
            callbacks.onError(
              sanitizeKafkaError(error, remoteKafkaSecrets(this.config)),
            ),
          remoteKafkaSecrets(this.config),
        );
      });
    return {
      consumerId,
      async commit(input) {
        await consumer.commitOffsets([
          {
            topic: input.topic,
            partition: input.partition,
            offset: input.offset,
          },
        ]);
      },
      async disconnect() {
        await consumer.disconnect();
      },
    };
  }

  async deleteRunResources(input: CreateRunInput): Promise<CleanupResult> {
    assertRemoteKafkaConfigured(this.config);
    await assertRemoteKafkaBrokersAllowed(this.config);
    const kafka = await createRemoteKafkaClient(this.config);
    const admin = kafka.admin();
    const steps: CleanupResult["steps"] = [];
    try {
      await admin.connect();
      await admin.deleteTopics({ topics: [input.topicName] });
      steps.push({
        name: "topic.delete",
        status: "requested",
        resourceName: input.topicName,
      });
      return { status: "requested", steps };
    } catch (error) {
      steps.push({
        name: "topic.delete",
        status: "failed",
        resourceName: input.topicName,
        message: sanitizeKafkaError(error, remoteKafkaSecrets(this.config))
          .message,
      });
      return { status: "failed", steps };
    } finally {
      await this.disconnectSafely("cleanup.admin.disconnect", admin);
    }
  }

  async shutdown() {
    return;
  }

  private async disconnectSafely(
    operation: string,
    handle: { disconnect(): Promise<void> } | null,
  ) {
    if (!handle) return;
    try {
      await handle.disconnect();
    } catch (error) {
      this.diagnostics.onDisconnectError?.({
        operation,
        error: sanitizeKafkaError(error, remoteKafkaSecrets(this.config)),
      });
    }
  }
}

export function createKafkaRuntimeAdapter(
  env: ServerEnv,
  diagnostics?: KafkaRuntimeDiagnostics,
): KafkaRuntimeAdapter {
  return env.KAFKA_MODE === "aiven"
    ? new AivenKafkaRuntimeAdapter(env, diagnostics)
    : new DemoKafkaRuntimeAdapter();
}

export function createUserConfiguredKafkaRuntimeAdapter(
  config: RemoteKafkaConfig,
  diagnostics?: KafkaRuntimeDiagnostics,
): KafkaRuntimeAdapter {
  return new UserConfiguredKafkaRuntimeAdapter(config, diagnostics);
}

function getMissingAivenVariables(env: ServerEnv) {
  const missing = [];
  if (!env.AIVEN_KAFKA_BROKERS) missing.push("AIVEN_KAFKA_BROKERS");
  if (!env.AIVEN_KAFKA_USERNAME) missing.push("AIVEN_KAFKA_USERNAME");
  if (!env.AIVEN_KAFKA_PASSWORD) missing.push("AIVEN_KAFKA_PASSWORD");
  return missing;
}

function assertAivenConfigured(env: ServerEnv) {
  const missing = getMissingAivenVariables(env);
  if (missing.length > 0) {
    throw new KafkaConfigurationError(missing);
  }
}

function getMissingRemoteKafkaVariables(config: RemoteKafkaConfig) {
  const missing = [];
  if (parseBrokerList(config.brokers).length === 0) missing.push("brokers");
  if (!config.username) missing.push("username");
  if (!config.password) missing.push("password");
  return missing;
}

function assertRemoteKafkaConfigured(config: RemoteKafkaConfig) {
  const missing = getMissingRemoteKafkaVariables(config);
  if (missing.length > 0) {
    throw new RemoteKafkaConfigurationError(missing);
  }
}

async function assertRemoteKafkaBrokersAllowed(config: RemoteKafkaConfig) {
  for (const broker of parseBrokerList(config.brokers)) {
    const host = brokerHost(broker);
    if (!host || isDisallowedBrokerHost(host)) {
      throw new RemoteKafkaBrokerPolicyError(broker);
    }
    for (const address of await resolveBrokerAddresses(host)) {
      if (isDisallowedIpAddress(address)) {
        throw new RemoteKafkaBrokerPolicyError(broker);
      }
    }
  }
}

function brokerHost(broker: string) {
  const trimmed = broker.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) {
    return trimmed.slice(1, trimmed.indexOf("]"));
  }
  return trimmed.split(":")[0] ?? "";
}

function isDisallowedBrokerHost(host: string) {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isDisallowedIpAddress(normalized)
  );
}

async function resolveBrokerAddresses(host: string) {
  if (isIpAddress(host)) return [host];
  const { lookup } = await import("node:dns/promises");
  return (await lookup(host, { all: true, verbatim: true })).map(
    (item) => item.address,
  );
}

function isIpAddress(value: string) {
  return Boolean(ipv4ToNumber(value)) || value.includes(":");
}

function isDisallowedIpAddress(value: string) {
  const ipv4 = ipv4ToNumber(value);
  if (ipv4 !== null) {
    return (
      inIpv4Range(ipv4, "0.0.0.0", 8) ||
      inIpv4Range(ipv4, "10.0.0.0", 8) ||
      inIpv4Range(ipv4, "100.64.0.0", 10) ||
      inIpv4Range(ipv4, "127.0.0.0", 8) ||
      inIpv4Range(ipv4, "169.254.0.0", 16) ||
      inIpv4Range(ipv4, "172.16.0.0", 12) ||
      inIpv4Range(ipv4, "192.0.0.0", 24) ||
      inIpv4Range(ipv4, "192.0.2.0", 24) ||
      inIpv4Range(ipv4, "192.168.0.0", 16) ||
      inIpv4Range(ipv4, "198.18.0.0", 15) ||
      inIpv4Range(ipv4, "198.51.100.0", 24) ||
      inIpv4Range(ipv4, "203.0.113.0", 24) ||
      inIpv4Range(ipv4, "224.0.0.0", 4) ||
      inIpv4Range(ipv4, "240.0.0.0", 4)
    );
  }
  const normalized = value.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function ipv4ToNumber(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const number = Number(part);
    if (number < 0 || number > 255) return null;
    result = result * 256 + number;
  }
  return result >>> 0;
}

function inIpv4Range(value: number, baseAddress: string, bits: number) {
  const base = ipv4ToNumber(baseAddress);
  if (base === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

function aivenSecrets(env: ServerEnv) {
  return [
    env.AIVEN_KAFKA_USERNAME,
    env.AIVEN_KAFKA_PASSWORD,
    env.AIVEN_KAFKA_CA_PATH,
  ].filter(Boolean);
}

function remoteKafkaSecrets(config: RemoteKafkaConfig) {
  return [config.username, config.password, config.caCertificate].filter(
    Boolean,
  );
}

function notifyConsumerCallback(
  operation: string,
  diagnostics: KafkaRuntimeDiagnostics,
  callback: () => void | Promise<void>,
  secrets: string[] = [],
) {
  void Promise.resolve()
    .then(callback)
    .catch((error: unknown) => {
      diagnostics.onConsumerCallbackError?.({
        operation,
        error: sanitizeKafkaError(error, secrets),
      });
    });
}

async function createAivenKafkaClient(
  env: ServerEnv,
  clientId = "kafka-visual-playground",
) {
  const ca = await readCaCertificate(env.AIVEN_KAFKA_CA_PATH);
  return createRemoteKafkaClient(
    {
      brokers: env.AIVEN_KAFKA_BROKERS,
      username: env.AIVEN_KAFKA_USERNAME,
      password: env.AIVEN_KAFKA_PASSWORD,
      saslMechanism: env.AIVEN_KAFKA_SASL_MECHANISM,
      useTls: true,
      caCertificate: ca,
    },
    clientId,
  );
}

async function createRemoteKafkaClient(
  config: RemoteKafkaConfig,
  clientId = "kafka-visual-playground",
) {
  const [{ Kafka, logLevel }] = await Promise.all([import("kafkajs")]);
  return new Kafka({
    clientId,
    brokers: parseBrokerList(config.brokers),
    ssl: createSslOptions(config),
    sasl: createSaslOptions(config),
    logLevel: logLevel.NOTHING,
  });
}

async function readCaCertificate(caPath: string) {
  const [{ readFile }, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const candidates = path.isAbsolute(caPath)
    ? [caPath]
    : [
        path.resolve(process.cwd(), caPath),
        path.resolve(process.cwd(), "../..", caPath),
      ];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function createSslOptions(config: RemoteKafkaConfig) {
  if (!config.useTls) return false;
  const ca = config.caCertificate.trim();
  return ca ? { ca: [ca] } : true;
}

function createSaslOptions(config: RemoteKafkaConfig): SASLOptions {
  const credentials = {
    username: config.username,
    password: config.password,
  };
  if (config.saslMechanism === "PLAIN") {
    return { mechanism: "plain", ...credentials };
  }
  if (config.saslMechanism === "SCRAM-SHA-512") {
    return { mechanism: "scram-sha-512", ...credentials };
  }
  return { mechanism: "scram-sha-256", ...credentials };
}

export function stablePartition(key: string, partitionCount: number) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % partitionCount;
}

function normalizeHeaders(
  headers:
    | Record<string, Buffer | string | Array<Buffer | string> | undefined>
    | undefined,
) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    normalized[key] = bufferToString(first) ?? "";
  }
  return normalized;
}

function bufferToString(value: Buffer | string | null | undefined) {
  if (value === null || value === undefined) return null;
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

function parseJsonValue(value: Buffer | string | null | undefined) {
  const text = bufferToString(value);
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
