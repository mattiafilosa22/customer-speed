import type { z } from "zod";

import { ValidationError } from "@/lib/errors";
import type { PasswordHasher } from "@/lib/password";
import type { RateLimiter } from "@/lib/rate-limit";
import type { verifyRecaptcha } from "@/lib/recaptcha";
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
  /** Base URL for links in emails (verification/reset). */
  readonly appUrl: string;
  /** Injectable clock for deterministic token expiry in tests. */
  readonly now?: () => Date;
  /** Optional request metadata for audit/consent records. */
  readonly requestMeta?: { ip?: string | null; userAgent?: string | null };
}

/** Parse with Zod, converting failures to a typed `ValidationError`. */
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "(root)";
      (issues[key] ??= []).push(issue.message);
    }
    throw new ValidationError(issues);
  }
  return result.data;
}

export function clockNow(deps: Pick<AuthDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}
