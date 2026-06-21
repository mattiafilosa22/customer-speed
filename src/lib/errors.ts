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

/**
 * The reCAPTCHA v3 score was too low and the v2 checkbox fallback is configured,
 * so the auth flow needs the user to complete the "I'm not a robot" challenge
 * (docs/06 §6.2). This is NOT an authorization failure and deliberately does NOT
 * extend `UnauthorizedError`: it reveals nothing about the account (it is raised
 * before — or independently of — any credential/account lookup), it only signals
 * the form to render the v2 widget. The form layer maps it to a dedicated,
 * non-revealing state (`recaptchaV2Required`), never to the credential error.
 *
 * Status 428 (Precondition Required): the request can't proceed until the extra
 * verification precondition is satisfied.
 */
export class RecaptchaV2RequiredError extends Error {
  readonly status = 428 as const;
  constructor(message = "reCAPTCHA v2 challenge required") {
    super(message);
    this.name = "RecaptchaV2RequiredError";
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
