import { ValidationError } from "@/lib/errors";
import { hashToken } from "@/lib/tokens";
import { type AuthDeps, clockNow, parseInput } from "@/server/auth/deps";
import { verifyEmailSchema } from "@/server/auth/schemas";

/**
 * Verify a user's email from a one-time token (docs/06 §6.1).
 *
 * The raw token from the link is hashed and looked up; the token must exist, be
 * unconsumed and unexpired. On success: mark `emailVerified`, consume the token,
 * audit. Failures throw a generic validation error (no detail leak).
 */
export async function verifyEmail(deps: AuthDeps, input: unknown): Promise<{ userId: string }> {
  const { token } = parseInput(verifyEmailSchema, input);
  const tokenHash = hashToken(token);
  const now = clockNow(deps);

  const record = await deps.prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { organizationId: true } },
    },
  });

  if (!record || record.consumedAt !== null || record.expiresAt <= now) {
    throw new ValidationError({ token: ["Invalid or expired token"] });
  }

  await deps.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { emailVerified: now },
    });
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });
    // Invalidate any other outstanding verification tokens for this user.
    await tx.emailVerificationToken.updateMany({
      where: { userId: record.userId, consumedAt: null },
      data: { consumedAt: now },
    });
  });

  await deps.audit.record({
    action: "auth.verifyEmail",
    organizationId: record.user.organizationId,
    actorId: record.userId,
    entity: "User",
    entityId: record.userId,
    ip: deps.requestMeta?.ip ?? null,
  });

  return { userId: record.userId };
}
