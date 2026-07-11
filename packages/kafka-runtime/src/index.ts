import type {
  CleanupResult,
  ConnectionStatus,
  KeyStrategy,
  KafkaMode,
  RemoteKafkaConfig,
} from "@kplay/contracts";
import type { Admin, SASLOptions } from "kafkajs";
import {
  bindConsumerLifecycleHandlers,
  startConsumerRun,
  type ConsumerLifecycleSource,
  type ConsumerRunSource,
} from "./consumer-handlers";
import { assertRemoteKafkaBrokersAllowed } from "./broker-policy";
import {
  maskBrokerHost,
  parseBrokerList,
  stablePartition,
} from "./broker-utils";
import {
  assertAivenConfigured,
  assertRemoteKafkaConfigured,
  aivenSecrets,
  getMissingAivenVariables,
  getMissingRemoteKafkaVariables,
  remoteKafkaSecrets,
  type ServerEnv,
} from "./runtime-config";

export { RemoteKafkaBrokerPolicyError } from "./broker-policy";
export {
  maskBrokerHost,
  parseBrokerList,
  stablePartition,
} from "./broker-utils";
export {
  KafkaConfigurationError,
  RemoteKafkaConfigurationError,
  loadServerEnv,
  serverEnvSchema,
  type ServerEnv,
} from "./runtime-config";

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

export class KafkaConsumerStartupRollbackError extends Error {
  readonly name = "KafkaConsumerStartupRollbackError";

  constructor(
    readonly startupError: unknown,
    readonly rollbackError: unknown,
    readonly consumerHandle: PlaygroundConsumerHandle,
  ) {
    super(
      startupError instanceof Error
        ? startupError.message
        : "Kafka consumer failed to start.",
      { cause: startupError },
    );
  }
}

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

export type DemoKafkaRunCheckpoint = {
  offsets: number[];
  noKeyCursor: number | null;
};

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

  captureRunCheckpoint(topicName: string): DemoKafkaRunCheckpoint {
    const topicOffsets = this.offsets.get(topicName);
    if (!topicOffsets) throw new Error("Demo topic does not exist.");
    return {
      offsets: [...topicOffsets],
      noKeyCursor: this.noKeyCursors.get(topicName) ?? null,
    };
  }

  restoreRunCheckpoint(topicName: string, checkpoint: DemoKafkaRunCheckpoint) {
    if (!this.offsets.has(topicName)) {
      throw new Error("Demo topic does not exist.");
    }
    this.offsets.set(topicName, [...checkpoint.offsets]);
    if (checkpoint.noKeyCursor === null) {
      this.noKeyCursors.delete(topicName);
    } else {
      this.noKeyCursors.set(topicName, checkpoint.noKeyCursor);
    }
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
    return testKafkaConnection(this.operations());
  }

  async createRun(input: CreateRunInput) {
    await createKafkaRunResources(this.operations(), input);
  }

  async produce(input: ProduceInput): Promise<ProduceResult> {
    return produceKafkaMessage(this.operations(), input);
  }

  async createConsumer(
    run: CreateRunInput,
    consumerId: string,
    callbacks: PlaygroundConsumerCallbacks,
  ): Promise<PlaygroundConsumerHandle> {
    return createKafkaConsumerHandle(
      this.operations(),
      run,
      consumerId,
      callbacks,
    );
  }

  async deleteRunResources(input: CreateRunInput): Promise<CleanupResult> {
    return deleteKafkaRunResources(this.operations(), input);
  }

  async shutdown() {
    return;
  }

  private operations(): KafkaJsRuntimeOperations {
    return {
      mode: "aiven",
      brokers: this.env.AIVEN_KAFKA_BROKERS,
      missingVariables: () => getMissingAivenVariables(this.env),
      assertReady: () => assertAivenConfigured(this.env),
      createClient: (clientId) => createAivenKafkaClient(this.env, clientId),
      secrets: () => aivenSecrets(this.env),
      diagnostics: this.diagnostics,
    };
  }
}

export class UserConfiguredKafkaRuntimeAdapter implements KafkaRuntimeAdapter {
  readonly mode = "remote" as const;

  constructor(
    private readonly config: RemoteKafkaConfig,
    private readonly diagnostics: KafkaRuntimeDiagnostics = {},
  ) {}

  async testConnection(): Promise<ConnectionStatus> {
    return testKafkaConnection(this.operations());
  }

  async createRun(input: CreateRunInput) {
    await createKafkaRunResources(this.operations(), input);
  }

  async produce(input: ProduceInput): Promise<ProduceResult> {
    return produceKafkaMessage(this.operations(), input);
  }

  async createConsumer(
    run: CreateRunInput,
    consumerId: string,
    callbacks: PlaygroundConsumerCallbacks,
  ): Promise<PlaygroundConsumerHandle> {
    return createKafkaConsumerHandle(
      this.operations(),
      run,
      consumerId,
      callbacks,
    );
  }

  async deleteRunResources(input: CreateRunInput): Promise<CleanupResult> {
    return deleteKafkaRunResources(this.operations(), input);
  }

  async shutdown() {
    return;
  }

  private operations(): KafkaJsRuntimeOperations {
    return {
      mode: "remote",
      brokers: this.config.brokers,
      missingVariables: () => getMissingRemoteKafkaVariables(this.config),
      assertReady: async () => {
        assertRemoteKafkaConfigured(this.config);
        await assertRemoteKafkaBrokersAllowed(this.config);
      },
      createClient: (clientId) =>
        createRemoteKafkaClient(this.config, clientId),
      secrets: () => remoteKafkaSecrets(this.config),
      diagnostics: this.diagnostics,
    };
  }
}

type KafkaJsClient = Awaited<ReturnType<typeof createRemoteKafkaClient>>;

type KafkaJsRuntimeOperations = {
  mode: "aiven" | "remote";
  brokers: string;
  missingVariables(): string[];
  assertReady(): void | Promise<void>;
  createClient(clientId?: string): Promise<KafkaJsClient>;
  secrets(): string[];
  diagnostics: KafkaRuntimeDiagnostics;
};

async function testKafkaConnection(
  operations: KafkaJsRuntimeOperations,
): Promise<ConnectionStatus> {
  const missingVariables = operations.missingVariables();
  if (missingVariables.length > 0) {
    return kafkaConnectionStatus(operations, {
      status: "configuration_missing",
      topicCount: null,
      missingVariables,
      error: null,
    });
  }

  let admin: Admin | null = null;
  try {
    await operations.assertReady();
    const kafka = await operations.createClient();
    admin = kafka.admin();
    await admin.connect();
    let topicCount: number | null = null;
    let topicListError: ConnectionStatus["error"] = null;
    try {
      topicCount = (await admin.listTopics()).length;
    } catch (error) {
      topicListError = sanitizeKafkaError(error, operations.secrets());
    }
    return kafkaConnectionStatus(operations, {
      status: "connected",
      topicCount,
      missingVariables: [],
      error: topicListError,
    });
  } catch (error) {
    return kafkaConnectionStatus(operations, {
      status: "connection_failed",
      topicCount: null,
      missingVariables: [],
      error: sanitizeKafkaError(error, operations.secrets()),
    });
  } finally {
    await disconnectKafkaHandle(
      operations,
      "connection.admin.disconnect",
      admin,
    );
  }
}

async function createKafkaRunResources(
  operations: KafkaJsRuntimeOperations,
  input: CreateRunInput,
) {
  await operations.assertReady();
  const kafka = await operations.createClient();
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic: input.topicName, numPartitions: input.partitionCount }],
    });
  } finally {
    await disconnectKafkaHandle(operations, "run.admin.disconnect", admin);
  }
}

async function produceKafkaMessage(
  operations: KafkaJsRuntimeOperations,
  input: ProduceInput,
): Promise<ProduceResult> {
  await operations.assertReady();
  const kafka = await operations.createClient();
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
    return normalizeDeliveryReport(result, input.topicName);
  } finally {
    await disconnectKafkaHandle(
      operations,
      "produce.producer.disconnect",
      producer,
    );
  }
}

async function createKafkaConsumerHandle(
  operations: KafkaJsRuntimeOperations,
  run: CreateRunInput,
  consumerId: string,
  callbacks: PlaygroundConsumerCallbacks,
): Promise<PlaygroundConsumerHandle> {
  await operations.assertReady();
  const kafka = await operations.createClient(consumerId);
  const consumer = kafka.consumer({
    groupId: run.consumerGroupId,
    allowAutoTopicCreation: false,
  });
  const sanitizeRuntimeError = (error: unknown) =>
    sanitizeKafkaError(error, operations.secrets());
  bindConsumerLifecycleHandlers(
    consumer as ConsumerLifecycleSource,
    run,
    callbacks,
    operations.diagnostics,
    sanitizeRuntimeError,
  );
  const handle: PlaygroundConsumerHandle = {
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
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: run.topicName, fromBeginning: true });
    await startConsumerRun(
      consumer as ConsumerRunSource,
      callbacks,
      operations.diagnostics,
      sanitizeRuntimeError,
    );
  } catch (error) {
    const rollbackError = await disconnectKafkaHandle(
      operations,
      "consumer.start.rollback.disconnect",
      consumer,
    );
    if (rollbackError !== null) {
      throw new KafkaConsumerStartupRollbackError(error, rollbackError, handle);
    }
    throw error;
  }
  return handle;
}

async function deleteKafkaRunResources(
  operations: KafkaJsRuntimeOperations,
  input: CreateRunInput,
): Promise<CleanupResult> {
  await operations.assertReady();
  const kafka = await operations.createClient();
  const admin = kafka.admin();
  try {
    await admin.connect();
    return await deleteTopicResource(
      admin,
      input.topicName,
      operations.secrets(),
    );
  } catch (error) {
    return failedTopicDelete(input.topicName, error, operations.secrets());
  } finally {
    await disconnectKafkaHandle(operations, "cleanup.admin.disconnect", admin);
  }
}

async function disconnectKafkaHandle(
  operations: KafkaJsRuntimeOperations,
  operation: string,
  handle: { disconnect(): Promise<void> } | null,
) {
  if (!handle) return null;
  try {
    await handle.disconnect();
    return null;
  } catch (error) {
    operations.diagnostics.onDisconnectError?.({
      operation,
      error: sanitizeKafkaError(error, operations.secrets()),
    });
    return error;
  }
}

function kafkaConnectionStatus(
  operations: KafkaJsRuntimeOperations,
  status: Pick<
    ConnectionStatus,
    "status" | "topicCount" | "missingVariables" | "error"
  >,
): ConnectionStatus {
  return {
    mode: operations.mode,
    maskedBrokerHost: maskBrokerHost(operations.brokers),
    brokerCount: parseBrokerList(operations.brokers).length,
    checkedAt: new Date().toISOString(),
    ...status,
  };
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

function normalizeDeliveryReport(
  result:
    | {
        topicName?: string;
        partition?: number;
        offset?: string;
        baseOffset?: string;
        timestamp?: string;
      }
    | Array<{
        topicName?: string;
        partition?: number;
        offset?: string;
        baseOffset?: string;
        timestamp?: string;
      }>,
  fallbackTopic: string,
): ProduceResult {
  const report = Array.isArray(result) ? result[0] : result;
  const partition = report?.partition;
  const offset = report?.offset ?? report?.baseOffset;
  if (partition === undefined || offset === undefined) {
    throw new Error(
      "Kafka delivery report did not include a partition and offset.",
    );
  }
  return {
    topic: report.topicName ?? fallbackTopic,
    partition: Number(partition),
    offset: String(offset),
    timestamp: report.timestamp
      ? String(report.timestamp)
      : new Date().toISOString(),
  };
}

async function deleteTopicResource(
  admin: Admin,
  topicName: string,
  secrets: string[] = [],
): Promise<CleanupResult> {
  try {
    await admin.deleteTopics({ topics: [topicName] });
    return {
      status: "requested",
      steps: [
        {
          name: "topic.delete",
          status: "requested",
          resourceName: topicName,
        },
      ],
    };
  } catch (error) {
    return failedTopicDelete(topicName, error, secrets);
  }
}

function failedTopicDelete(
  topicName: string,
  error: unknown,
  secrets: string[] = [],
): CleanupResult {
  return {
    status: "failed",
    steps: [
      {
        name: "topic.delete",
        status: "failed",
        resourceName: topicName,
        message: sanitizeKafkaError(error, secrets).message,
      },
    ],
  };
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
  const { Kafka, logLevel } = await import("kafkajs");
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
