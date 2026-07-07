import { parseRemoteKafkaBrokerList } from "@kplay/contracts";

export const parseBrokerList = parseRemoteKafkaBrokerList;

export function brokerHost(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) {
    const endIndex = trimmed.indexOf("]");
    return endIndex > 1 ? trimmed.slice(1, endIndex) : trimmed;
  }
  return trimmed.split(":")[0] ?? "";
}

export function maskBrokerHost(value: string | undefined) {
  if (!value) return null;
  const first = parseBrokerList(value)[0];
  if (!first) return null;
  const host = brokerHost(first);
  const pieces = host.split(".");
  if (pieces.length <= 2) return `${host.slice(0, 2)}***`;
  return `${pieces[0]?.slice(0, 2)}***.${pieces.slice(-2).join(".")}`;
}

export function stablePartition(key: string, partitionCount: number) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % partitionCount;
}
