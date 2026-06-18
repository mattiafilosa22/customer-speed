import { ValidationError } from "@/lib/errors";
import { hashToken } from "@/lib/tokens";
import { type AuthDeps, clockNow, parseInput } from "@/server/auth/deps";
import { resetPasswordSchema } from "@/server/auth/schemas";

/**
 * Reset a password from a one-time token (docs/06 §6.1).
 *
 * Validates the token (exists, unconsumed, unexpired), sets the new hash,
 * consumes the token, and bumps `sessionVersion` to invalidate ALL existing
 * sessions of that user (a reset must log the attacker/old sessions out).
 * Invalid/expired tokens fail with a generic error.
 */
export async function resetPassword(deps: AuthDeps, input: unknown): Promise<{ userId: string }> {
  const data = parseInput(resetPasswordSchema, input);
  const tokenHash = hashToken(data.token);
  const now = clockNow(deps);

  const record = await deps.prisma.passwordResetToken.findUnique({
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

  const newHash = await deps.hasher.hash(data.newPassword);

  await deps.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: newHash,
        sessionVersion: { increment: 1 }, // invalidate all sessions
      },
    });
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });
    // Burn any other outstanding reset tokens.
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, consumedAt: null },
      data: { consumedAt: now },
    });
  });

  await deps.audit.record({
    action: "auth.resetPassword",
    organizationId: record.user.organizationId,
    actorId: record.userId,
    entity: "User",
    entityId: record.userId,
    ip: deps.requestMeta?.ip ?? null,
  });

  return { userId: record.userId };
}
