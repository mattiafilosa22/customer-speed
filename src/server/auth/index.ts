import { env } from "@/lib/env";
import { argon2PasswordHasher } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { authRateLimiter } from "@/lib/rate-limit";
import { verifyRecaptcha, verifyRecaptchaV2 } from "@/lib/recaptcha";
import { createAuditLogger } from "@/server/audit/audit-log";
import type { AuthDeps } from "@/server/auth/deps";
import { getEmailSender } from "@/server/email";

export type { AuthDeps } from "@/server/auth/deps";
export { register } from "@/server/auth/register";
export { login } from "@/server/auth/login";
export { verifyEmail } from "@/server/auth/verify-email";
export { requestPasswordReset } from "@/server/auth/request-password-reset";
export { resetPassword } from "@/server/auth/reset-password";
export { changePassword } from "@/server/auth/change-password";

/**
 * Build the production `AuthDeps` from the live infrastructure. Server Actions
 * (owned by the UI agent) call this once per request, passing request metadata
 * (IP / user-agent) for audit + consent records, then invoke the use cases.
 *
 * Example (Server Action):
 *   const deps = buildAuthDeps({ ip, userAgent });
 *   await register(deps, formInput);
 */
export function buildAuthDeps(requestMeta?: {
  ip?: string | null;
  userAgent?: string | null;
}): AuthDeps {
  return {
    prisma,
    hasher: argon2PasswordHasher,
    email: getEmailSender(),
    audit: createAuditLogger(prisma),
    rateLimiter: authRateLimiter,
    verifyRecaptcha,
    verifyRecaptchaV2,
    // The v2 fallback is enabled iff its SECRET is configured. Deriving the flag
    // here keeps the use cases env-agnostic and unit-testable.
    recaptchaV2Enabled: Boolean(env.RECAPTCHA_V2_SECRET_KEY),
    appUrl: env.APP_URL,
    requestMeta,
  };
}
