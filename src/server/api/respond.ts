import { NextResponse } from "next/server";

import { ForbiddenError } from "@/lib/rbac";
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";

/**
 * Uniform Route Handler error envelope (docs/04: `{ error: { code, message,
 * fields? } }`) with correct HTTP status codes (docs/00 §4). The message is
 * developer-facing and non-revealing; clients localize from `code`.
 *
 * Route Handlers are the REST contract surface for integrations / a future
 * mobile app; the web UI itself uses the Server Actions. Each handler still runs
 * the full pipeline: auth → RBAC → tenant → Zod → use case → typed response.
 */

interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string[]> };
}

export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: error.message, fields: error.issues } },
      { status: 400 },
    );
  }
  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Unauthorized" } },
      { status: 401 },
    );
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Forbidden" } },
      { status: 403 },
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Not found" } },
      { status: 404 },
    );
  }
  if (error instanceof ConflictError) {
    return NextResponse.json(
      { error: { code: "conflict", message: error.message } },
      { status: 409 },
    );
  }
  if (error instanceof RateLimitedError) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many requests" } },
      { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
    );
  }
  console.error("[api] unexpected error", error);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Internal error" } },
    { status: 500 },
  );
}

export function jsonResponse<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}
