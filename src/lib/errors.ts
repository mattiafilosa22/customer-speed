/**
 * Typed domain errors with HTTP status, so Route Handlers and Server Actions can
 * map them to correct status codes without inspecting messages.
 *
 * Messages here are developer-facing/log-facing. User-facing copy is localized
 * and intentionally NON-revealing (no user enumeration) at the boundary.
 */

export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Input failed validation (Zod). Carries field issues for the form layer. */
export class ValidationError extends Error {
  readonly status = 400 as const;
  readonly issues: Readonly<Record<string, string[]>>;
  constructor(issues: Record<string, string[]>, message = "Validation failed") {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/**
 * Requested entity does not exist OR is not visible in the current tenant
 * context. Tenant-isolation note: a row that belongs to another tenant is
 * reported as 404 (not 403), so callers cannot probe for the existence of
 * cross-tenant ids (no information leak — docs/00 §4, docs/06).
 */
export class NotFoundError extends Error {
  readonly status = 404 as const;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  readonly status = 409 as const;
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

export class RateLimitedError extends Error {
  readonly status = 429 as const;
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = "Too many requests") {
    super(message);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
