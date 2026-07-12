import { z } from "zod";

export const kafkaOffsetSchema = z
  .string()
  .regex(/^\d+$/, "Kafka offsets must be nonnegative decimal strings.");

export function compareKafkaOffsets(left: string, right: string) {
  const leftOffset = parseKafkaOffset(left);
  const rightOffset = parseKafkaOffset(right);
  if (leftOffset < rightOffset) return -1;
  if (leftOffset > rightOffset) return 1;
  return 0;
}

export function addToKafkaOffset(offset: string, delta: bigint) {
  const result = parseKafkaOffset(offset) + delta;
  if (result < 0n) {
    throw new RangeError(
      "Kafka offset arithmetic cannot produce a negative offset.",
    );
  }
  return String(result);
}

export function kafkaOffsetWindow(latestOffset: string, maximumSize: number) {
  if (!Number.isSafeInteger(maximumSize) || maximumSize < 0) {
    throw new RangeError(
      "Kafka offset window size must be a nonnegative safe integer.",
    );
  }
  if (maximumSize === 0) return [];

  const latest = parseKafkaOffset(latestOffset);
  const width = BigInt(maximumSize - 1);
  const first = latest > width ? latest - width : 0n;
  const size = Number(latest - first + 1n);
  return Array.from({ length: size }, (_, index) =>
    String(first + BigInt(index)),
  );
}

function parseKafkaOffset(offset: string) {
  return BigInt(kafkaOffsetSchema.parse(offset));
}
