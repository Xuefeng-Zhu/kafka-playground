import {
  connectionStatusSchema,
  runSnapshotSchema,
  scenarioDefinitionSchema,
  type ConnectionStatus,
  type KeyStrategy,
  type RemoteKafkaConfig,
  type RunSnapshot,
  type ScenarioDefinition,
  type UserSelectableKafkaMode,
} from "@kplay/contracts";
import { z } from "zod";

export type ClientLoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const notFoundResponse = Symbol("not-found-response");

type RequestJsonOptions = {
  init?: RequestInit;
  notFound?: "throw" | "return-not-found";
  responseBody?: "required-json" | "ignore";
};

const scenarioDefinitionsResponseSchema = z.object({
  scenarios: scenarioDefinitionSchema.array(),
});

const activeRunResponseSchema = z.object({
  run: runSnapshotSchema.nullable(),
});

async function requestJson(
  path: string,
  options?: RequestJsonOptions & { notFound?: "throw" },
): Promise<unknown>;
async function requestJson(
  path: string,
  options: RequestJsonOptions & { notFound: "return-not-found" },
): Promise<unknown | typeof notFoundResponse>;
async function requestJson(
  path: string,
  {
    init,
    notFound = "throw",
    responseBody = "required-json",
  }: RequestJsonOptions = {},
): Promise<unknown | typeof notFoundResponse> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    if (response.status === 404 && notFound === "return-not-found") {
      return notFoundResponse;
    }
    const error = await readErrorBody(response);
    throw new ApiRequestError(
      error.message ?? response.statusText,
      response.status,
      error.code,
    );
  }
  if (responseBody === "ignore") return undefined;
  return response.json() as Promise<unknown>;
}

function runApiUrl(runId: string, suffix = "") {
  return `/api/v1/runs/${encodeURIComponent(runId)}${suffix}`;
}

export async function loadConnectionStatus(): Promise<
  ClientLoadResult<ConnectionStatus>
> {
  try {
    return {
      ok: true,
      data: connectionStatusSchema.parse(
        await requestJson("/api/v1/connection"),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      message: describeClientLoadError(
        error,
        "Unable to load Kafka connection.",
      ),
    };
  }
}

export async function loadScenarioDefinitions(): Promise<
  ClientLoadResult<ScenarioDefinition[]>
> {
  try {
    return {
      ok: true,
      data: scenarioDefinitionsResponseSchema.parse(
        await requestJson("/api/v1/scenarios"),
      ).scenarios,
    };
  } catch (error) {
    return {
      ok: false,
      message: describeClientLoadError(error, "Unable to load scenarios."),
    };
  }
}

export async function loadActiveRunSnapshot(): Promise<
  ClientLoadResult<RunSnapshot | null>
> {
  try {
    return {
      ok: true,
      data: activeRunResponseSchema.parse(await requestJson("/api/v1/runs"))
        .run,
    };
  } catch (error) {
    return {
      ok: false,
      message: describeClientLoadError(error, "Unable to load the active run."),
    };
  }
}

export async function produceMessage(runId: string, keyStrategy?: KeyStrategy) {
  const payload = await requestJson(runApiUrl(runId, "/messages"), {
    init: {
      method: "POST",
      body: JSON.stringify(keyStrategy ? { keyStrategy } : {}),
    },
  });
  return runSnapshotSchema.parse(payload);
}

export async function startScenarioRun(input: {
  scenarioId: string;
  mode: UserSelectableKafkaMode;
  remoteKafkaConfig?: RemoteKafkaConfig;
}) {
  const payload = await requestJson("/api/v1/runs", {
    init: {
      method: "POST",
      body: JSON.stringify(input),
    },
  });
  return runSnapshotSchema.parse(payload);
}

export async function testKafkaConnection(
  remoteKafkaConfig: RemoteKafkaConfig,
) {
  const payload = await requestJson("/api/v1/connection/test", {
    init: {
      method: "POST",
      body: JSON.stringify({ mode: "remote", remoteKafkaConfig }),
    },
  });
  return connectionStatusSchema.parse(payload);
}

export async function mutateRun(
  runId: string,
  path: string,
  init?: RequestInit,
) {
  const payload = await requestJson(runApiUrl(runId, path), { init });
  return runSnapshotSchema.parse(payload);
}

export async function runScenarioExperiment(
  runId: string,
  experimentId: string,
) {
  const payload = await requestJson(
    runApiUrl(runId, `/experiments/${encodeURIComponent(experimentId)}`),
    { init: { method: "POST" } },
  );
  return runSnapshotSchema.parse(payload);
}

export async function retireRun(runId: string) {
  await requestJson(runApiUrl(runId, "/reset"), {
    init: {
      method: "POST",
    },
    notFound: "return-not-found",
    responseBody: "ignore",
  });
}

export async function fetchRunSnapshot(
  runId: string,
): Promise<ClientLoadResult<RunSnapshot | null>> {
  try {
    const payload = await requestJson(runApiUrl(runId), {
      notFound: "return-not-found",
    });
    return payload === notFoundResponse
      ? { ok: true, data: null }
      : { ok: true, data: runSnapshotSchema.parse(payload) };
  } catch (error) {
    return {
      ok: false,
      message: describeClientLoadError(
        error,
        "Unable to refresh run snapshot.",
      ),
    };
  }
}

async function readErrorBody(response: Response) {
  const payload = await response.json().catch(() => null);
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return {
      code:
        "code" in payload && typeof payload.code === "string"
          ? payload.code
          : null,
      message: payload.message,
    };
  }
  return { code: null, message: response.statusText };
}

function describeClientLoadError(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    return `${fallback} (${error.status}: ${error.message})`;
  }
  if (error instanceof Error && error.name === "ZodError") {
    return `${fallback} The response payload did not match the expected shape.`;
  }
  if (error instanceof Error && error.message) {
    return `${fallback} ${error.message}`;
  }
  return fallback;
}
