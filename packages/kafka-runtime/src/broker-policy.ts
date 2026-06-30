import type { RemoteKafkaConfig } from "@kplay/contracts";
import { brokerHost, parseBrokerList } from "./broker-utils";

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

export async function assertRemoteKafkaBrokersAllowed(
  config: RemoteKafkaConfig,
) {
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
  return ipv4ToNumber(value) !== null || value.includes(":");
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
