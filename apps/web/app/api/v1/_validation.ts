import type { ZodIssue } from "zod";

export function describeConnectionTestIssue(issue: ZodIssue) {
  return isRemoteKafkaConfigIssue(issue)
    ? "Remote Kafka configuration is invalid."
    : issue.message;
}

export function describeCreateRunIssue(issue: ZodIssue) {
  const path = issue.path.join(".");
  if (path === "scenarioId") {
    return "Select an available scenario before starting a run.";
  }
  if (isRemoteKafkaConfigIssue(issue)) {
    return "Remote Kafka configuration is invalid.";
  }
  return issue.message;
}

export function describeSettingsIssue(issue: ZodIssue) {
  const path = issue.path.join(".");
  if (path === "productionRate") {
    return "Production rate must be between 1 and 10 messages per second.";
  }
  if (path === "processingLatencyMs") {
    return "Processing latency must be between 0 and 5000 ms.";
  }
  if (path === "keyStrategy.value") {
    return "Fixed keys must be between 1 and 80 characters.";
  }
  return issue.message;
}

function isRemoteKafkaConfigIssue(issue: ZodIssue) {
  return issue.path[0] === "remoteKafkaConfig";
}
