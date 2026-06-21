import { parseInput } from "@/server/validation";
import type { PasswordHasher } from "@/lib/password";
import type { RateLimiter } from "@/lib/rate-limit";
import type { verifyRecaptcha, verifyRecaptchaV2 } from "@/lib/recaptcha";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AuditLogger } from "@/server/audit/audit-log";
import type { EmailSender } from "@/server/email/types";

/**
 * Dependencies for the auth use cases. Everything the use cases touch is
 * injected (Dependency Inversion, docs/00 §1), so they can be unit-tested with
 * fakes and have no hidden imports of Prisma/crypto/email/recaptcha.
 *
 * The Prisma surface is the BASE client (not tenant-scoped): auth operates on
 * `User` by global id and by the `[organizationId, email]` unique key, and must
 * be able to create users / write tokens for a given tenant explicitly. Tenant
 * isolation here is enforced by always pinning `organizationId` in queries.
 */
export interface AuthDeps {
  readonly prisma: PrismaClient;
  readonly hasher: PasswordHasher;
  readonly email: EmailSender;
  readonly audit: AuditLogger;
  readonly rateLimiter: RateLimiter;
  readonly verifyRecaptcha: typeof verifyRecaptcha;
  /** v2 checkbox fallback verifier, invoked only when the v3 score is low. */
  readonly verifyRecaptchaV2: typeof verifyRecaptchaV2;
  /**
   * Whether the v2 checkbox fallback is configured (a v2 secret is present).
   * Injected as a boolean — derived from `env.RECAPTCHA_V2_SECRET_KEY` at the
   * real wiring point — so the low-score branch is testable without env: when
   * false the use cases keep the current "low score → reject" behaviour; when
   * true they challenge with v2 (Dependency Inversion, docs/00 §1).
   */
  readonly recaptchaV2Enabled: boolean;
  /** Base URL for links in emails (verification/reset). */
  readonly appUrl: string;
  /** Injectable clock for deterministic token expiry in tests. */
  readonly now?: () => Date;
  /** Optional request metadata for audit/consent records. */
  readonly requestMeta?: { ip?: string | null; userAgent?: string | null };
}

/** Re-exported from the shared validation module (single implementation). */
export { parseInput };

export function clockNow(deps: Pick<AuthDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}
