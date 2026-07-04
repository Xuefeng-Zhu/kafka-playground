import { NextResponse } from "next/server";
import { z, ZodError, type ZodIssue } from "zod";
import { ApiError, problem, requestId } from "@/lib/server/api-errors";

const mutationBuckets = new Map<string, { count: number; resetAt: number }>();
const MUTATION_WINDOW_MS = 10_000;
const MUTATION_LIMIT = 80;
const MUTATION_BUCKET_PRUNE_INTERVAL_MS = MUTATION_WINDOW_MS;
const MUTATION_BUCKET_MAX_SIZE = 1_000;
let lastMutationBucketPrune = 0;
const PLAYGROUND_SESSION_COOKIE = "kplay.session";
const PLAYGROUND_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ParseJsonOptions = {
  code?: string;
  describeIssue?: (issue: ZodIssue) => string;
};

type PlaygroundSession = ReturnType<typeof playgroundSession>;

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function playgroundSession(request: Request) {
  const existingId = parseCookieHeader(request.headers.get("cookie"))[
    PLAYGROUND_SESSION_COOKIE
  ];
  const sessionId = isValidSessionId(existingId)
    ? existingId
    : crypto.randomUUID();
  return {
    id: sessionId,
    commit(response: Response) {
      if (existingId === sessionId) return response;
      response.headers.append(
        "Set-Cookie",
        [
          `${PLAYGROUND_SESSION_COOKIE}=${sessionId}`,
          "Path=/",
          `Max-Age=${PLAYGROUND_SESSION_MAX_AGE_SECONDS}`,
          "HttpOnly",
          "SameSite=Lax",
        ].join("; "),
      );
      return response;
    },
  };
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

export async function safeWithSession(
  request: Request,
  handler: (context: {
    requestId: string;
    session: PlaygroundSession;
  }) => Promise<Response>,
) {
  const session = playgroundSession(request);
  return safe(request, async (id) =>
    session.commit(await handler({ requestId: id, session })),
  );
}

function enforceMutationRateLimit(request: Request) {
  if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "OPTIONS"
  )
    return;
  const now = Date.now();
  pruneMutationBuckets(now);
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const key = forwardedFor || request.headers.get("x-real-ip") || "local";
  const bucket = mutationBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    mutationBuckets.set(key, { count: 1, resetAt: now + MUTATION_WINDOW_MS });
    trimMutationBuckets();
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

function pruneMutationBuckets(now: number) {
  if (
    mutationBuckets.size < MUTATION_BUCKET_MAX_SIZE &&
    now - lastMutationBucketPrune < MUTATION_BUCKET_PRUNE_INTERVAL_MS
  ) {
    return;
  }
  lastMutationBucketPrune = now;
  for (const [key, bucket] of mutationBuckets) {
    if (bucket.resetAt <= now) mutationBuckets.delete(key);
  }
}

function trimMutationBuckets() {
  while (mutationBuckets.size > MUTATION_BUCKET_MAX_SIZE) {
    const oldestKey = mutationBuckets.keys().next().value;
    if (oldestKey === undefined) return;
    mutationBuckets.delete(oldestKey);
  }
}

function parseCookieHeader(header: string | null) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const entry of header.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (!rawName) continue;
    cookies[rawName] = rawValue.join("=");
  }
  return cookies;
}

function isValidSessionId(value: string | undefined) {
  return value !== undefined && SESSION_ID_PATTERN.test(value);
}

export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
  options: ParseJsonOptions = {},
): Promise<z.infer<T>> {
  let body: unknown;
  const rawBody = await request.text();
  if (rawBody.trim() === "") {
    return parseBody(schema, {}, options);
  }
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new ApiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  return parseBody(schema, body, options);
}

function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
  options: ParseJsonOptions,
): z.infer<T> {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(
        options.code ?? "INVALID_REQUEST",
        error.issues
          .map((issue) => options.describeIssue?.(issue) ?? issue.message)
          .join("; "),
        400,
      );
    }
    throw error;
  }
}
