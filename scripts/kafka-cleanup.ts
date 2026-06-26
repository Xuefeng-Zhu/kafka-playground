import {
  loadServerEnv,
  maskBrokerHost,
  parseBrokerList,
  sanitizeKafkaError,
} from "@kplay/kafka-runtime";

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
  const kafka = await import("@confluentinc/kafka-javascript");
  const Kafka =
    (kafka as any).KafkaJS?.Kafka ?? (kafka as any).default?.KafkaJS?.Kafka;
  if (!Kafka) throw new Error("Confluent KafkaJS promise API is unavailable.");
  const admin = new Kafka().admin({
    "bootstrap.servers": parseBrokerList(env.AIVEN_KAFKA_BROKERS).join(","),
    "security.protocol": "sasl_ssl",
    "sasl.mechanisms": env.AIVEN_KAFKA_SASL_MECHANISM,
    "sasl.username": env.AIVEN_KAFKA_USERNAME,
    "sasl.password": env.AIVEN_KAFKA_PASSWORD,
    "ssl.ca.location": env.AIVEN_KAFKA_CA_PATH,
  });
  try {
    await admin.connect();
    const topics = (await admin.listTopics?.()) as string[];
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
    await admin.deleteTopics?.({ topics: matches });
    console.log("Topic deletion requested.");
  } finally {
    await admin.disconnect?.().catch(() => undefined);
  }
}

main().catch((error) => {
  const sanitized = sanitizeKafkaError(error);
  console.error(`${sanitized.code}: ${sanitized.message}`);
  process.exitCode = 1;
});
