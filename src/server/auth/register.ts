import { ConflictError, RateLimitedError } from "@/lib/errors";
import { EMAIL_VERIFICATION_TTL_MS, generateRawToken, hashToken } from "@/lib/tokens";
import { type AuthDeps, clockNow, parseInput } from "@/server/auth/deps";
import { registerSchema } from "@/server/auth/schemas";

/**
 * Register a user WITHIN an existing tenant.
 *
 * Tenant model decision (docs/02 §2.1 + docs/08): tenants (Organizations) are
 * provisioned by the reseller/superAdmin, NOT created by self-service signup.
 * So registration creates a `User` bound to an existing `organizationId` (for
 * Fase 1, the demo tenant). It does NOT create a new Organization. This keeps
 * the controller/processor model clean: the reseller onboards each tenant.
 *
 * Flow: rate-limit → reCAPTCHA → uniqueness (per tenant) → hash → create user
 * (unverified) → record consents (proof of consent) → issue email verification
 * token → send email → audit. Returns minimal info; never leaks whether the
 * email already existed beyond a generic conflict.
 */
export interface RegisterResult {
  readonly userId: string;
  /** Present only when an email sender is a dev/logging one; for tests. */
  readonly verificationToken?: string;
}

export async function register(
  deps: AuthDeps,
  input: unknown,
  options: { exposeTokenForTests?: boolean } = {},
): Promise<RegisterResult> {
  const data = parseInput(registerSchema, input);

  const ipKey = deps.requestMeta?.ip ?? "unknown";
  const limit = await deps.rateLimiter.consume(`register:ip:${ipKey}`);
  if (!limit.allowed) {
    throw new RateLimitedError(limit.retryAfterSeconds);
  }

  const captcha = await deps.verifyRecaptcha(data.recaptchaToken, {});
  if (captcha.outcome === "failed") {
    throw new ConflictError("Captcha verification failed");
  }

  const existing = await deps.prisma.user.findUnique({
    where: { organizationId_email: { organizationId: data.organizationId, email: data.email } },
    select: { id: true },
  });
  if (existing) {
    // Generic conflict; the UI shows a non-revealing message.
    throw new ConflictError("Registration could not be completed");
  }

  const passwordHash = await deps.hasher.hash(data.password);
  const now = clockNow(deps);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);

  const userId = await deps.prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        name: data.name,
        passwordHash,
        role: "baseUser",
        emailVerified: null,
      },
      select: { id: true },
    });

    if (data.consents.length > 0) {
      await tx.consent.createMany({
        data: data.consents.map((c) => ({
          organizationId: data.organizationId,
          userId: user.id,
          type: c.type,
          granted: c.granted,
          version: c.version,
          ip: deps.requestMeta?.ip ?? null,
          userAgent: deps.requestMeta?.userAgent ?? null,
        })),
      });
    }

    await tx.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return user.id;
  });

  const verifyUrl = `${deps.appUrl}/verify-email?token=${rawToken}`;
  await deps.email.send({
    to: data.email,
    subject: "Conferma il tuo indirizzo email",
    text: `Benvenuto in CustomerSpeed. Conferma la tua email: ${verifyUrl}`,
  });

  await deps.audit.record({
    action: "auth.register",
    organizationId: data.organizationId,
    actorId: userId,
    entity: "User",
    entityId: userId,
    ip: deps.requestMeta?.ip ?? null,
  });

  return {
    userId,
    ...(options.exposeTokenForTests ? { verificationToken: rawToken } : {}),
  };
}
