import { UnauthorizedError } from "@/lib/errors";
import { type AuthDeps, parseInput } from "@/server/auth/deps";
import { changePasswordSchema } from "@/server/auth/schemas";

/**
 * Change password for the authenticated user ("Cambio Password", docs/06 §6.1).
 *
 * Requires the current password. On success, sets the new hash and bumps
 * `sessionVersion`, which invalidates all OTHER JWT sessions of the user
 * (the current request can re-issue a fresh session). `userId` and
 * `organizationId` are resolved by the caller from the tenant context — never
 * trusted from the client.
 */
export async function changePassword(
  deps: AuthDeps,
  actor: { userId: string; organizationId: string },
  input: unknown,
): Promise<{ sessionVersion: number }> {
  const data = parseInput(changePasswordSchema, input);

  const user = await deps.prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, passwordHash: true, organizationId: true },
  });

  // The user must exist, belong to the claimed tenant, and have a password.
  if (!user || user.organizationId !== actor.organizationId || !user.passwordHash) {
    throw new UnauthorizedError("Cannot change password");
  }

  const ok = await deps.hasher.verify(data.currentPassword, user.passwordHash);
  if (!ok) {
    await deps.audit.record({
      action: "auth.changePassword.failed",
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entity: "User",
      entityId: actor.userId,
      ip: deps.requestMeta?.ip ?? null,
    });
    throw new UnauthorizedError("Current password is incorrect");
  }

  const newHash = await deps.hasher.hash(data.newPassword);
  const updated = await deps.prisma.user.update({
    where: { id: actor.userId },
    data: { passwordHash: newHash, sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });

  await deps.audit.record({
    action: "auth.changePassword",
    organizationId: actor.organizationId,
    actorId: actor.userId,
    entity: "User",
    entityId: actor.userId,
    ip: deps.requestMeta?.ip ?? null,
  });

  return { sessionVersion: updated.sessionVersion };
}
