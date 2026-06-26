import "server-only";
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "AIVEN_KAFKA_USERNAME",
      "AIVEN_KAFKA_PASSWORD",
      "*.password",
      "*.username",
      "*.sasl",
      "*.headers.authorization",
    ],
    censor: "[REDACTED]",
  },
});
