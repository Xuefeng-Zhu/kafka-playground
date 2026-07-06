import type { RemoteKafkaConfig } from "@kplay/contracts";
import { z } from "zod";
import { parseBrokerList } from "./broker-utils";

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
  MAX_CONSUMERS_PER_RUN: z.coerce.number().int().positive().max(10).default(10),
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

export function getMissingAivenVariables(env: ServerEnv) {
  const missing = [];
  if (!env.AIVEN_KAFKA_BROKERS) missing.push("AIVEN_KAFKA_BROKERS");
  if (!env.AIVEN_KAFKA_USERNAME) missing.push("AIVEN_KAFKA_USERNAME");
  if (!env.AIVEN_KAFKA_PASSWORD) missing.push("AIVEN_KAFKA_PASSWORD");
  return missing;
}

export function assertAivenConfigured(env: ServerEnv) {
  const missing = getMissingAivenVariables(env);
  if (missing.length > 0) {
    throw new KafkaConfigurationError(missing);
  }
}

export function getMissingRemoteKafkaVariables(config: RemoteKafkaConfig) {
  const missing = [];
  if (parseBrokerList(config.brokers).length === 0) missing.push("brokers");
  if (!config.username) missing.push("username");
  if (!config.password) missing.push("password");
  return missing;
}

export function assertRemoteKafkaConfigured(config: RemoteKafkaConfig) {
  const missing = getMissingRemoteKafkaVariables(config);
  if (missing.length > 0) {
    throw new RemoteKafkaConfigurationError(missing);
  }
}

export function aivenSecrets(env: ServerEnv) {
  return [
    env.AIVEN_KAFKA_USERNAME,
    env.AIVEN_KAFKA_PASSWORD,
    env.AIVEN_KAFKA_CA_PATH,
  ].filter(Boolean);
}

export function remoteKafkaSecrets(config: RemoteKafkaConfig) {
  return [config.username, config.password, config.caCertificate].filter(
    Boolean,
  );
}
