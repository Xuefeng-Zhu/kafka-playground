import {
  runSnapshotSchema,
  type KeyStrategy,
  type RunSnapshot,
} from "@kplay/contracts";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export async function fetchJson(path: string) {
  const response = await fetch(path);
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

export async function produceMessage(runId: string, keyStrategy?: KeyStrategy) {
  return api<RunSnapshot>(`/api/v1/runs/${runId}/messages`, {
    method: "POST",
    body: JSON.stringify(keyStrategy ? { keyStrategy } : {}),
  });
}

export async function fetchRunSnapshot(runId: string) {
  const response = await fetch(`/api/v1/runs/${runId}`);
  if (!response.ok) return null;
  return runSnapshotSchema.parse(await response.json());
}
