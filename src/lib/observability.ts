import { env } from "@/lib/env";

/**
 * Observability layer (Fase 8 hardening, docs/06 §6.4).
 *
 * Provider-agnostic by design (Dependency Inversion): the app talks to the
 * `ErrorReporter` PORT, never to a concrete SDK. The default reporter is a
 * NO-OP unless a `SENTRY_DSN` is configured, so the app boots and runs with no
 * observability account and never crashes for a missing env (the explicit Fase 8
 * requirement: "predisponi l'integrazione dietro env opzionale, no-op se assente").
 *
 * Why no `@sentry/nextjs` dependency yet: until a real DSN/account exists,
 * pulling the SDK would add weight and an instrumentation file with no value.
 * The wiring point is isolated in `initObservability()` / `createReporter()`:
 * at infra setup, install `@sentry/nextjs`, implement `createSentryReporter()`
 * (sketched below), and `initObservability()` will use it whenever the DSN is
 * present. No call site changes — they all depend on the port.
 *
 * Secrets hygiene: the DSN is NOT a user secret in events; we never log tokens,
 * passwords, or PII through the reporter. Callers pass identifiers + context
 * only (mirrors the AuditLog discipline in `src/server/audit`).
 */

export interface ReportContext {
  /** Free-form, non-PII tags/extra to attach to the event. */
  readonly extra?: Record<string, unknown>;
  /** Logical area, e.g. "gdpr.export", "auth.login". */
  readonly tags?: Record<string, string>;
}

export interface ErrorReporter {
  /** Report a caught exception. Best-effort; must never throw. */
  captureException(error: unknown, context?: ReportContext): void;
  /** Report a message-level event (e.g. a recovered anomaly). */
  captureMessage(message: string, context?: ReportContext): void;
  /** Whether a real backend is active (false for the no-op). */
  readonly enabled: boolean;
}

/** The no-op reporter: swallows everything. Used when no DSN is configured. */
class NoopReporter implements ErrorReporter {
  readonly enabled = false;
  captureException(): void {
    /* intentionally empty */
  }
  captureMessage(): void {
    /* intentionally empty */
  }
}

/**
 * Resolve whether observability should be active. Centralized so both the
 * server reporter and the (future) client init agree on the same predicate.
 */
export function isObservabilityEnabled(): boolean {
  return Boolean(env.SENTRY_DSN);
}

/**
 * Factory for the active reporter. Today it always returns the no-op (no SDK
 * installed). When `@sentry/nextjs` is added at infra setup, replace the body
 * with `createSentryReporter()` guarded by `isObservabilityEnabled()`.
 *
 * Kept as a function (not a const) so the wiring is a single, obvious edit.
 */
export function createReporter(): ErrorReporter {
  // INFRA WIRING (when activating Sentry):
  //   if (isObservabilityEnabled()) return createSentryReporter();
  return new NoopReporter();
}

/** Process-wide reporter. Import THIS at call sites; never instantiate ad hoc. */
export const reporter: ErrorReporter = createReporter();

/**
 * One-time observability bootstrap, called from Next's `instrumentation.ts`.
 * No-op when disabled. When the Sentry SDK is wired, this is where
 * `Sentry.init({ dsn, tracesSampleRate, environment })` goes.
 */
export function initObservability(): void {
  if (!isObservabilityEnabled()) return;
  // INFRA WIRING (when activating Sentry), e.g.:
  //   const Sentry = await import("@sentry/nextjs");
  //   Sentry.init({
  //     dsn: env.SENTRY_DSN,
  //     tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  //     environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
  //   });
  // Until then, this is a deliberate no-op even if a DSN is set, so enabling
  // monitoring is a single, reviewable change rather than a silent behaviour.
}
