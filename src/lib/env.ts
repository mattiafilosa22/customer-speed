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

  // ── Auth.js / NextAuth v5 (required once auth lands; optional in Fase 0) ──
  // Kept optional here so the scaffold builds without secrets. Promote to
  // required in the auth phase (docs/06).
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // ── Future variables (declared, not yet required) ────────────────────
  // ENCRYPTION_KEY: z.string().min(1).optional(),
  // RECAPTCHA_SITE_KEY: z.string().min(1).optional(),
  // RECAPTCHA_SECRET_KEY: z.string().min(1).optional(),
  // GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  // GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // CALENDLY_CLIENT_ID: z.string().min(1).optional(),
  // CALENDLY_CLIENT_SECRET: z.string().min(1).optional(),
  // CALENDLY_WEBHOOK_SIGNING_KEY: z.string().min(1).optional(),
  // RESEND_API_KEY: z.string().min(1).optional(),
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
    ? ({ NODE_ENV: "test", DATABASE_URL: "postgresql://test" } as Env)
    : parseEnv();
