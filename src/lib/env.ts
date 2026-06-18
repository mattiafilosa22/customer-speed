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

  // ── reCAPTCHA (optional in dev; verification no-ops with a warning) ───
  // When both keys are absent the server-side verifier returns "skipped" so dev
  // works without Google keys. In production these SHOULD be set (see docs/06).
  RECAPTCHA_SITE_KEY: z.string().min(1).optional(),
  RECAPTCHA_SECRET_KEY: z.string().min(1).optional(),
  // Minimum v3 score to accept (0..1). Below it → reject / fall back to v2.
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),

  // ── Transactional email (optional in dev → logging sender) ───────────
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("CustomerSpeed <no-reply@example.com>"),

  // ── Future variables (declared, not yet required) ────────────────────
  // ENCRYPTION_KEY: z.string().min(1).optional(),   // token di terze parti (Fase calendario)
  // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
  // CALENDLY_CLIENT_ID / CALENDLY_CLIENT_SECRET / CALENDLY_WEBHOOK_SIGNING_KEY
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
        RECAPTCHA_MIN_SCORE: 0.5,
        EMAIL_FROM: "CustomerSpeed <no-reply@example.com>",
      } as Env)
    : parseEnv();
