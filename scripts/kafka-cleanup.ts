import {
  loadServerEnv,
  maskBrokerHost,
  parseBrokerList,
  sanitizeKafkaError,
} from "@kplay/kafka-runtime";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Kafka, logLevel, type SASLOptions } from "kafkajs";

const confirm = process.argv.includes("--confirm");
const dryRun = process.argv.includes("--dry-run") || !confirm;

async function main() {
  const env = loadServerEnv();
  if (env.KAFKA_MODE !== "aiven") {
    console.log("Kafka cleanup skipped: KAFKA_MODE is demo.");
    return;
  }
  if (!confirm && !dryRun) {
    throw new Error("Pass --dry-run or --confirm.");
  }
  const missing = [
    env.AIVEN_KAFKA_BROKERS ? null : "AIVEN_KAFKA_BROKERS",
    env.AIVEN_KAFKA_USERNAME ? null : "AIVEN_KAFKA_USERNAME",
    env.AIVEN_KAFKA_PASSWORD ? null : "AIVEN_KAFKA_PASSWORD",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `Missing required Aiven configuration: ${missing.join(", ")}`,
    );
  }
  const kafka = new Kafka({
    clientId: "kafka-playground-cleanup",
    brokers: parseBrokerList(env.AIVEN_KAFKA_BROKERS),
    ssl: { ca: [await readCaCertificate(env.AIVEN_KAFKA_CA_PATH)] },
    sasl: createSaslOptions(env),
    logLevel: logLevel.NOTHING,
  });
  const admin = kafka.admin();
  try {
    await admin.connect();
    const topics = await admin.listTopics();
    const matches = topics.filter((topic) =>
      topic.startsWith(`${env.KAFKA_TOPIC_PREFIX}.`),
    );
    console.log(`Connected to ${maskBrokerHost(env.AIVEN_KAFKA_BROKERS)}.`);
    if (matches.length === 0) {
      console.log("No matching playground topics found.");
      return;
    }
    console.log(`Matching topics (${matches.length}):`);
    for (const topic of matches) console.log(`- ${topic}`);
    if (!confirm) {
      console.log(
        "Dry run only. Re-run with --confirm to delete these topics.",
      );
      return;
    }
    for (const topic of matches) {
      if (!topic.startsWith(`${env.KAFKA_TOPIC_PREFIX}.`)) {
        throw new Error(`Refusing to delete topic outside prefix: ${topic}`);
      }
    }
    await admin.deleteTopics({ topics: matches });
    console.log("Topic deletion requested.");
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

async function readCaCertificate(caPath: string) {
  const candidates = path.isAbsolute(caPath)
    ? [caPath]
    : [path.resolve(process.cwd(), caPath)];
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

function createSaslOptions(env: ReturnType<typeof loadServerEnv>): SASLOptions {
  const credentials = {
    username: env.AIVEN_KAFKA_USERNAME,
    password: env.AIVEN_KAFKA_PASSWORD,
  };
  if (env.AIVEN_KAFKA_SASL_MECHANISM === "PLAIN") {
    return { mechanism: "plain", ...credentials };
  }
  if (env.AIVEN_KAFKA_SASL_MECHANISM === "SCRAM-SHA-512") {
    return { mechanism: "scram-sha-512", ...credentials };
  }
  return { mechanism: "scram-sha-256", ...credentials };
}

main().catch((error) => {
  const sanitized = sanitizeKafkaError(error);
  console.error(`${sanitized.code}: ${sanitized.message}`);
  process.exitCode = 1;
});
