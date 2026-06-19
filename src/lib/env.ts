import { z } from "zod";

/**
 * Centralized, fail-fast environment validation.
 *
 * Layering: this lives in `lib/` (infrastructure). Server code reads validated,
 * typed values from here instead of touching `process.env` directly, so a missing
 * or malformed variable fails loudly at startup rather than at request time.
 *
 * Variables that belong to later phases (OAuth, reCAPTCHA, Calendly, Resend,
 * encryption) are intentionally NOT required yet. They are declared as optional
 * placeholders and will be promoted to required when the relevant feature lands.
 */
const envSchema = z.object({
  // Node runtime mode.
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── Database (required) ──────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .url("DATABASE_URL must be a valid connection URL"),

  // ── Auth.js / NextAuth v5 (REQUIRED from Fase 1) ─────────────────────
  // Auth.js v5 reads `AUTH_SECRET`; we keep the `NEXTAUTH_*` names from docs/06
  // and bridge them in `src/lib/auth.ts`. The secret signs the session JWT — a
  // missing/weak value breaks session integrity, so it must fail fast.
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 chars"),
  NEXTAUTH_URL: z.string().url(),

  // Public base URL of the app (used to build verification/reset links in emails).
  APP_URL: z.string().url().default("http://localhost:3000"),

  // ── Tenant resolution (PLATFORM default tenant) ──────────────────────
  // This is the NEUTRAL platform tenant — NOT a customer tenant. It owns the
  // public/marketing branding, the anonymous (visitor) cookie consents, and is
  // the default login tenant for the superAdmin. The seed provisions it as
  // slug "customerspeed" (where the superAdmin lives).
  //
  // IMPORTANT: it must never default to a real customer tenant (e.g. "fabio"),
  // otherwise public consent / branding / default login would leak into a
  // client's tenant. Customer tenants (Fabio) are reached via an explicit slug
  // (`/login?org=fabio`) or, in the future, per-subdomain/custom-domain routing
  // (the slug will then be derived from the host and this becomes the fallback).
  DEFAULT_ORG_SLUG: z.string().min(1).default("customerspeed"),

  // ── reCAPTCHA (optional in dev; verification no-ops with a warning) ───
  // When both keys are absent the server-side verifier returns "skipped" so dev
  // works without Google keys. In production these SHOULD be set (see docs/06).
  // Site key is exposed to the browser to render reCAPTCHA v3. Next.js only
  // inlines variables prefixed with `NEXT_PUBLIC_` into client bundles, so the
  // public mirror is the one the client reads; `RECAPTCHA_SITE_KEY` is kept for
  // server-side reference/back-compat.
  RECAPTCHA_SITE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: z.string().min(1).optional(),
  RECAPTCHA_SECRET_KEY: z.string().min(1).optional(),
  // Minimum v3 score to accept (0..1). Below it → reject / fall back to v2.
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),

  // ── Transactional email (optional in dev → logging sender) ───────────
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("CustomerSpeed <no-reply@example.com>"),

  // ── Calendar integrations (Fase 6 — optional, gated by feature flag) ──
  // The whole module is OFF for Fabio (`calendarIntegrations:false`) and stays
  // dormant until real OAuth credentials are provisioned in infra. All vars are
  // OPTIONAL: a tenant with the flag ON but missing keys degrades gracefully
  // (the settings panel shows a "not configured" message, no crash — docs/08
  // Fase 6, docs/06 §6.4).
  //
  // ENCRYPTION_KEY: 32-byte key for AES-256-GCM at-rest encryption of third-party
  // tokens (`CalendarConnection.accessToken/refreshToken`, docs/06 §6.4). Provided
  // as base64 (preferred) or hex; the crypto layer decodes + validates it MUST be
  // exactly 32 bytes. Required at runtime only when the encryption layer is used;
  // declared optional here so the rest of the app boots without it.
  ENCRYPTION_KEY: z.string().min(1).optional(),

  // Google Calendar OAuth2 (web app credentials).
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // Calendly OAuth + webhook signing.
  CALENDLY_CLIENT_ID: z.string().min(1).optional(),
  CALENDLY_CLIENT_SECRET: z.string().min(1).optional(),
  CALENDLY_REDIRECT_URI: z.string().url().optional(),
  // Calendly webhook signing key (verifies `Calendly-Webhook-Signature`).
  CALENDLY_WEBHOOK_SIGNING_KEY: z.string().min(1).optional(),

  // ── Rate limiting (Fase 8 hardening, docs/06 §6.1) ───────────────────
  // Backend selector for the shared auth rate limiter. `memory` is the default
  // (process-local fixed window — fine for a single instance / dev). `redis`
  // is reserved for a distributed store (Upstash/Redis): the `RateLimiter`
  // port is already in place, so swapping the backend needs no call-site
  // changes. The redis backend is NOT implemented yet; selecting it without a
  // concrete adapter falls back to memory with a startup warning (see
  // `src/lib/rate-limit.ts`).
  RATE_LIMIT_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  // Connection URL for the future Redis/Upstash backend (unused until wired).
  RATE_LIMIT_REDIS_URL: z.string().url().optional(),
  // Hard kill-switch: when `true`, the limiter ALLOWS everything (a no-op
  // limiter is used). This exists so the e2e suite can hammer the login form
  // without tripping the per-IP limit. It MUST stay `false`/unset in
  // production; `parseEnv` rejects `RATE_LIMIT_DISABLED=true` when
  // `NODE_ENV=production` (fail-safe — see refinement below).
  RATE_LIMIT_DISABLED: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),

  // Explicit end-to-end test signal. The e2e harness runs a PRODUCTION BUILD
  // (so `NODE_ENV=production` under `next start`) but still needs the rate-limit
  // kill-switch. This flag is the ONLY thing that lets `RATE_LIMIT_DISABLED`
  // through the production fail-safe below — a real deployment must NEVER set it.
  E2E: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),

  // ── Observability (Fase 8 — optional, no-op when absent) ─────────────
  // Sentry DSN for error/performance monitoring. When UNSET the Sentry layer
  // initializes as a NO-OP (no network, no crash) so the app boots without an
  // infra account. Set it (+ the public mirror for the browser SDK) at infra
  // setup time to activate reporting. See `src/lib/observability.ts` and the
  // infra checklist in docs/06 §6.4 / README.
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  // Trace sample rate (0..1) — keep low in prod to control volume/cost.
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  // Logical environment label attached to events (defaults to NODE_ENV).
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  // Fail-safe: the rate-limit kill-switch must NEVER be active in a real
  // production deployment. Disabling brute-force/enumeration protection in prod
  // would be a security regression, so we reject it at startup — UNLESS the
  // explicit e2e signal (`E2E=true`) is present, which the Playwright harness
  // sets because it runs a production BUILD locally/in CI. A real deployment
  // never sets `E2E`, so prod stays protected.
  if (value.NODE_ENV === "production" && value.RATE_LIMIT_DISABLED && !value.E2E) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RATE_LIMIT_DISABLED"],
      message:
        "RATE_LIMIT_DISABLED must not be true in production (set E2E=true only for the e2e harness)",
    });
  }
});

/** Inferred, single source of truth for the shape of validated env. */
export type Env = z.infer<typeof envSchema>;

/**
 * Pure parser: validates an arbitrary source and throws a readable error on
 * failure. Kept side-effect free so it can be unit-tested in isolation.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables. Check your .env file against .env.example:\n${issues}`,
    );
  }

  return parsed.data;
}

export { envSchema };

/**
 * Eagerly validated env for runtime use. Skipped under `NODE_ENV=test` so unit
 * tests can import the pure helpers without a real `.env`; fail-fast behaviour
 * is preserved in development and production.
 */
export const env: Env =
  process.env.NODE_ENV === "test"
    ? ({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://test",
        NEXTAUTH_SECRET: "test-secret-test-secret-test-secret-32",
        NEXTAUTH_URL: "http://localhost:3000",
        APP_URL: "http://localhost:3000",
        DEFAULT_ORG_SLUG: "customerspeed",
        RECAPTCHA_MIN_SCORE: 0.5,
        EMAIL_FROM: "CustomerSpeed <no-reply@example.com>",
        // Rate limiting OFF in the unit-test shape so any code reading `env`
        // does not throttle; e2e drives this via the real `RATE_LIMIT_DISABLED`.
        RATE_LIMIT_BACKEND: "memory",
        RATE_LIMIT_DISABLED: true,
        E2E: false,
        SENTRY_TRACES_SAMPLE_RATE: 0,
      } as Env)
    : parseEnv();
