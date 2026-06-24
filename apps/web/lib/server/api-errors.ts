import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export function problem(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { code: error.code, message: error.message, requestId },
      { status: error.status, headers: { "x-request-id": requestId } }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        code: "INVALID_SETTINGS",
        message: error.issues.map((issue) => issue.message).join("; "),
        requestId
      },
      { status: 400, headers: { "x-request-id": requestId } }
    );
  }
  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected server error occurred."
      : error instanceof Error
        ? error.message
        : "An unexpected server error occurred.";
  return NextResponse.json(
    { code: "INTERNAL_ERROR", message, requestId },
    { status: 500, headers: { "x-request-id": requestId } }
  );
}

export function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}
