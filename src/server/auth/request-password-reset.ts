import { RateLimitedError } from "@/lib/errors";
import { generateRawToken, hashToken, PASSWORD_RESET_TTL_MS } from "@/lib/tokens";
import { type AuthDeps, clockNow, parseInput } from "@/server/auth/deps";
import { requestPasswordResetSchema } from "@/server/auth/schemas";

/**
 * Request a password reset (docs/06 §6.1).
 *
 * Always returns success regardless of whether the email exists — NO user
 * enumeration. A reset token is created and emailed ONLY when the account
 * actually exists; otherwise the call is a silent no-op (after the same
 * rate-limit + captcha work) so timing and responses are uniform.
 */
export interface RequestPasswordResetResult {
  /** Always true to the caller (non-revealing). */
  readonly accepted: true;
  /** Present only when `exposeTokenForTests` is set. */
  readonly resetToken?: string;
}

export async function requestPasswordReset(
  deps: AuthDeps,
  input: unknown,
  options: { exposeTokenForTests?: boolean } = {},
): Promise<RequestPasswordResetResult> {
  const data = parseInput(requestPasswordResetSchema, input);

  const ipKey = deps.requestMeta?.ip ?? "unknown";
  const limit = await deps.rateLimiter.consume(`forgot:ip:${ipKey}`);
  if (!limit.allowed) {
    throw new RateLimitedError(limit.retryAfterSeconds);
  }

  await deps.verifyRecaptcha(data.recaptchaToken, {});

  const user = await deps.prisma.user.findUnique({
    where: { organizationId_email: { organizationId: data.organizationId, email: data.email } },
    select: { id: true, isActive: true, organizationId: true },
  });

  if (!user || !user.isActive) {
    // Non-revealing: same response as success.
    return { accepted: true };
  }

  const now = clockNow(deps);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);

  await deps.prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${deps.appUrl}/reset-password?token=${rawToken}`;
  await deps.email.send({
    to: data.email,
    subject: "Reimposta la tua password",
    text: `Hai richiesto il reset della password. Reimpostala qui: ${resetUrl} (valido 1 ora).`,
  });

  await deps.audit.record({
    action: "auth.requestPasswordReset",
    organizationId: user.organizationId,
    actorId: user.id,
    entity: "User",
    entityId: user.id,
    ip: deps.requestMeta?.ip ?? null,
  });

  return {
    accepted: true,
    ...(options.exposeTokenForTests ? { resetToken: rawToken } : {}),
  };
}
