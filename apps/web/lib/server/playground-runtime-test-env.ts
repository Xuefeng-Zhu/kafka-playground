import type { ServerEnv } from "@kplay/kafka-runtime";

const defaultTestServerEnv: ServerEnv = {
  KAFKA_MODE: "demo",
  AIVEN_KAFKA_BROKERS: "",
  AIVEN_KAFKA_USERNAME: "",
  AIVEN_KAFKA_PASSWORD: "",
  AIVEN_KAFKA_SASL_MECHANISM: "SCRAM-SHA-256",
  AIVEN_KAFKA_CA_PATH: "./certs/ca.pem",
  KAFKA_TOPIC_PREFIX: "kplay",
  MAX_CONSUMERS_PER_RUN: 10,
  MAX_PRODUCE_RATE: 10,
  EVENT_HISTORY_LIMIT: 2000,
  TIMELINE_DISPLAY_LIMIT: 1000,
  LOG_MESSAGE_PAYLOADS: false,
};

export function createTestServerEnv(
  overrides: Partial<ServerEnv> = {},
): ServerEnv {
  return { ...defaultTestServerEnv, ...overrides };
}
