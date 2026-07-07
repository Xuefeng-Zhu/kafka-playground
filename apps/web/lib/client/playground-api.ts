import {
  connectionStatusSchema,
  runSnapshotSchema,
  scenarioDefinitionSchema,
  type ConnectionStatus,
  type KeyStrategy,
  type RunSnapshot,
  type ScenarioDefinition,
} from "@kplay/contracts";

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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error = await readErrorBody(response);
    throw new ApiRequestError(
      error.message ?? response.statusText,
      response.status,
      error.code,
    );
  }
  return response.json() as Promise<T>;
}

export async function fetchJson(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    const error = await readErrorBody(response);
    throw new ApiRequestError(
      error.message ?? response.statusText,
      response.status,
      error.code,
    );
  }
  return response.json() as Promise<unknown>;
}

export async function loadConnectionStatus(): Promise<
  ClientLoadResult<ConnectionStatus>
> {
  try {
    return {
      ok: true,
      data: connectionStatusSchema.parse(await fetchJson("/api/v1/connection")),
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
    const payload = await fetchJson("/api/v1/scenarios");
    const scenarios =
      payload && typeof payload === "object" && "scenarios" in payload
        ? payload.scenarios
        : [];
    return {
      ok: true,
      data: scenarioDefinitionSchema.array().parse(scenarios),
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
    const payload = await fetchJson("/api/v1/runs");
    const runPayload =
      payload && typeof payload === "object" && "run" in payload
        ? payload.run
        : null;
    return {
      ok: true,
      data: runPayload ? runSnapshotSchema.parse(runPayload) : null,
    };
  } catch (error) {
    return {
      ok: false,
      message: describeClientLoadError(error, "Unable to load the active run."),
    };
  }
}

export async function produceMessage(runId: string, keyStrategy?: KeyStrategy) {
  return api<RunSnapshot>(`/api/v1/runs/${runId}/messages`, {
    method: "POST",
    body: JSON.stringify(keyStrategy ? { keyStrategy } : {}),
  });
}

export async function retireRun(runId: string) {
  const response = await fetch(`/api/v1/runs/${runId}/reset`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
  });
  if (!response.ok) {
    const error = await readErrorBody(response);
    if (response.status === 404) return;
    throw new ApiRequestError(
      error.message ?? response.statusText,
      response.status,
      error.code,
    );
  }
  await response.json().catch(() => null);
}

export async function fetchRunSnapshot(
  runId: string,
): Promise<ClientLoadResult<RunSnapshot | null>> {
  try {
    const response = await fetch(`/api/v1/runs/${runId}`);
    if (!response.ok) {
      const error = await readErrorBody(response);
      if (response.status === 404) return { ok: true, data: null };
      throw new ApiRequestError(
        error.message ?? response.statusText,
        response.status,
        error.code,
      );
    }
    return { ok: true, data: runSnapshotSchema.parse(await response.json()) };
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
