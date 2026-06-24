import type {
  CleanupResult,
  ConnectionStatus,
  KeyStrategy,
  KafkaMode
} from "@kplay/contracts";
import type { SASLOptions } from "kafkajs";
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
    callbacks: PlaygroundConsumerCallbacks
  ): Promise<PlaygroundConsumerHandle>;
  deleteRunResources(input: CreateRunInput): Promise<CleanupResult>;
  shutdown(): Promise<void>;
};

export const serverEnvSchema = z
  .object({
    KAFKA_MODE: z.enum(["demo", "aiven"]).default("demo"),
    AIVEN_KAFKA_BROKERS: z.string().optional().default(""),
    AIVEN_KAFKA_USERNAME: z.string().optional().default(""),
    AIVEN_KAFKA_PASSWORD: z.string().optional().default(""),
    AIVEN_KAFKA_SASL_MECHANISM: z
      .enum(["PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512"])
      .default("SCRAM-SHA-256"),
    AIVEN_KAFKA_CA_PATH: z.string().optional().default("./certs/ca.pem"),
    KAFKA_TOPIC_PREFIX: z.string().default("kplay"),
    MAX_ACTIVE_RUNS: z.coerce.number().int().positive().default(1),
    MAX_CONSUMERS_PER_RUN: z.coerce.number().int().positive().max(3).default(3),
    MAX_PRODUCE_RATE: z.coerce.number().int().positive().max(10).default(10),
    EVENT_HISTORY_LIMIT: z.coerce.number().int().positive().max(5000).default(2000),
    TIMELINE_DISPLAY_LIMIT: z.coerce.number().int().positive().max(2000).default(1000),
    LOG_MESSAGE_PAYLOADS: z.coerce.boolean().default(false)
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

export function sanitizeKafkaError(error: unknown) {
  if (error instanceof Error) {
    return {
      code: error.name || "KAFKA_ERROR",
      message: error.message.replace(/(password|username|sasl|secret)=\S+/gi, "$1=REDACTED")
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
      checkedAt: new Date().toISOString()
    };
  }

  async createRun(input: CreateRunInput) {
    this.offsets.set(input.topicName, Array.from({ length: input.partitionCount }, () => 0));
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
      timestamp: new Date().toISOString()
    };
  }

  async createConsumer(
    _run: CreateRunInput,
    consumerId: string,
    _callbacks: PlaygroundConsumerCallbacks
  ): Promise<PlaygroundConsumerHandle> {
    return {
      consumerId,
      async commit() {
        return;
      },
      async disconnect() {
        return;
      }
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
        { name: "topic.delete", status: "completed", resourceName: input.topicName }
      ]
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

  constructor(private readonly env: ServerEnv) {}

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
        checkedAt: new Date().toISOString()
      };
    }

    let admin: any;
    try {
      const kafka = await createAivenKafkaClient(this.env);
      admin = kafka.admin();
      await admin.connect();
      const topics = (await admin.listTopics().catch(() => null)) as string[] | null;
      return {
        status: "connected",
        mode: "aiven",
        maskedBrokerHost: maskBrokerHost(this.env.AIVEN_KAFKA_BROKERS),
        brokerCount: parseBrokerList(this.env.AIVEN_KAFKA_BROKERS).length,
        topicCount: Array.isArray(topics) ? topics.length : null,
        missingVariables: [],
        error: null,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: "connection_failed",
        mode: "aiven",
        maskedBrokerHost: maskBrokerHost(this.env.AIVEN_KAFKA_BROKERS),
        brokerCount: parseBrokerList(this.env.AIVEN_KAFKA_BROKERS).length,
        topicCount: null,
        missingVariables: [],
        error: sanitizeKafkaError(error),
        checkedAt: new Date().toISOString()
      };
    } finally {
      await admin?.disconnect?.().catch(() => undefined);
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
        topics: [{ topic: input.topicName, numPartitions: input.partitionCount }]
      });
    } finally {
      await admin.disconnect().catch(() => undefined);
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
            headers: input.headers
          }
        ]
      });
      const report = Array.isArray(result) ? result[0] : result;
      const partition = report?.partition;
      const offset = report?.offset ?? report?.baseOffset;
      if (partition === undefined || offset === undefined) {
        throw new Error("Kafka delivery report did not include a partition and offset.");
      }
      return {
        topic: report.topicName ?? input.topicName,
        partition: Number(partition),
        offset: String(offset),
        timestamp: report.timestamp ? String(report.timestamp) : new Date().toISOString()
      };
    } finally {
      await producer.disconnect().catch(() => undefined);
    }
  }

  async createConsumer(
    run: CreateRunInput,
    consumerId: string,
    callbacks: PlaygroundConsumerCallbacks
  ): Promise<PlaygroundConsumerHandle> {
    assertAivenConfigured(this.env);
    const kafka = await createAivenKafkaClient(this.env, consumerId);
    const consumer = kafka.consumer({
      groupId: run.consumerGroupId,
      allowAutoTopicCreation: false
    });
    consumer.on(consumer.events.GROUP_JOIN, (event) => {
      const partitions = event.payload.memberAssignment[run.topicName] ?? [];
      void callbacks.onAssigned(
        partitions.map((partition: number) => ({ topic: run.topicName, partition }))
      );
    });
    consumer.on(consumer.events.REBALANCING, () => {
      void callbacks.onRevoked([]);
    });
    consumer.on(consumer.events.CRASH, (event) => {
      void callbacks.onError({
        code: "CONSUMER_CRASH",
        message: event.payload.error.message
      });
    });
    await consumer.connect();
    await consumer.subscribe({ topic: run.topicName, fromBeginning: true });
    void consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        await callbacks.onMessage({
          topic,
          partition,
          offset: String(message.offset),
          key: bufferToString(message.key),
          value: parseJsonValue(message.value),
          headers: normalizeHeaders(message.headers),
          timestamp: message.timestamp ? String(message.timestamp) : null
        });
      }
    }).catch((error: unknown) => {
      void callbacks.onError(sanitizeKafkaError(error));
    });
    return {
      consumerId,
      async commit(input) {
        await consumer.commitOffsets([
          {
            topic: input.topic,
            partition: input.partition,
            offset: input.offset
          }
        ]);
      },
      async disconnect() {
        await consumer.disconnect();
      }
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
      steps.push({ name: "topic.delete", status: "requested", resourceName: input.topicName });
      return { status: "requested", steps };
    } catch (error) {
      steps.push({
        name: "topic.delete",
        status: "failed",
        resourceName: input.topicName,
        message: sanitizeKafkaError(error).message
      });
      return { status: "failed", steps };
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  async shutdown() {
    return;
  }
}

export function createKafkaRuntimeAdapter(env: ServerEnv): KafkaRuntimeAdapter {
  return env.KAFKA_MODE === "aiven"
    ? new AivenKafkaRuntimeAdapter(env)
    : new DemoKafkaRuntimeAdapter();
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
    throw new Error(`Missing required Aiven configuration: ${missing.join(", ")}`);
  }
}

async function createAivenKafkaClient(env: ServerEnv, clientId = "kafka-visual-playground") {
  const [{ Kafka, logLevel }] = await Promise.all([
    import("kafkajs"),
  ]);
  const ca = await readCaCertificate(env.AIVEN_KAFKA_CA_PATH);
  return new Kafka({
    clientId,
    brokers: parseBrokerList(env.AIVEN_KAFKA_BROKERS),
    ssl: { ca: [ca] },
    sasl: createSaslOptions(env),
    logLevel: logLevel.NOTHING
  });
}

async function readCaCertificate(caPath: string) {
  const [{ readFile }, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:path")
  ]);
  const candidates = path.isAbsolute(caPath)
    ? [caPath]
    : [
        path.resolve(process.cwd(), caPath),
        path.resolve(process.cwd(), "../..", caPath)
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

function createSaslOptions(env: ServerEnv): SASLOptions {
  const credentials = {
    username: env.AIVEN_KAFKA_USERNAME,
    password: env.AIVEN_KAFKA_PASSWORD
  };
  if (env.AIVEN_KAFKA_SASL_MECHANISM === "PLAIN") {
    return { mechanism: "plain", ...credentials };
  }
  if (env.AIVEN_KAFKA_SASL_MECHANISM === "SCRAM-SHA-512") {
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

function normalizeAssignments(
  assignment: Array<{ topic: string; partition: number }> | undefined
) {
  return (assignment ?? []).map((item) => ({
    topic: item.topic,
    partition: Number(item.partition)
  }));
}

function normalizeHeaders(
  headers: Record<string, Buffer | string | Array<Buffer | string> | undefined> | undefined
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
