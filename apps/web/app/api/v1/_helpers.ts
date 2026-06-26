import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, problem, requestId } from "@/lib/server/api-errors";

const mutationBuckets = new Map<string, { count: number; resetAt: number }>();
const MUTATION_WINDOW_MS = 10_000;
const MUTATION_LIMIT = 80;

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function safe(
  request: Request,
  handler: (requestId: string) => Promise<Response>,
) {
  const id = requestId(request);
  try {
    enforceMutationRateLimit(request);
    const response = await handler(id);
    response.headers.set("x-request-id", id);
    return response;
  } catch (error) {
    return problem(error, id);
  }
}

function enforceMutationRateLimit(request: Request) {
  if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "OPTIONS"
  )
    return;
  const now = Date.now();
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const key = forwardedFor || request.headers.get("x-real-ip") || "local";
  const bucket = mutationBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    mutationBuckets.set(key, { count: 1, resetAt: now + MUTATION_WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > MUTATION_LIMIT) {
    throw new ApiError(
      "RATE_LIMIT_EXCEEDED",
      "Too many mutation requests. Please slow down.",
      429,
    );
  }
}

export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  const rawBody = await request.text();
  if (rawBody.trim() === "") {
    return schema.parse({});
  }
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new ApiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  return schema.parse(body);
}
