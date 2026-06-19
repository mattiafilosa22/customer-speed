import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Role } from "@/generated/prisma/enums";
import { PASSWORD_RESET_TTL_MS, generateRawToken, hashToken } from "@/lib/tokens";
import { parseInput } from "@/server/validation";
import { clockNow, type AdminDeps } from "@/server/admin/deps";
import {
  createUserSchema,
  listUsersSchema,
  resetUserPasswordSchema,
  updateUserSchema,
} from "@/server/admin/schemas";

/**
 * Per-tenant user management for the admin area (docs/04 §4.10
 * GET/POST /admin/organizations/:id/users, docs/02 §2.1). superAdmin only; BASE
 * client; every mutation audited with the tenant's `organizationId`.
 *
 * Isolation note: the admin operates cross-tenant by design, but EVERY query
 * here still pins `organizationId` (from the validated input) so an operation
 * can only ever touch the intended tenant's users — a defensive scope, not an
 * isolation guarantee (the operator is trusted, but mistakes must not leak).
 * Email uniqueness is per tenant (`User @@unique[organizationId, email]`).
 *
 * `passwordHash` is NEVER selected/returned (docs/00 §3) — only safe fields.
 */

export interface AdminUserListItem {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly isActive: boolean;
  readonly emailVerified: boolean;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
}

export interface AdminUserListResult {
  readonly items: ReadonlyArray<AdminUserListItem>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export async function listUsers(deps: AdminDeps, input: unknown): Promise<AdminUserListResult> {
  const { organizationId, page, pageSize } = parseInput(listUsersSchema, input);
  const skip = (page - 1) * pageSize;

  // Exclude the global superAdmin from a tenant's user list.
  const where = { organizationId, role: { not: "superAdmin" as const } };

  const [total, users] = await Promise.all([
    deps.prisma.user.count({ where }),
    deps.prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    items: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      emailVerified: u.emailVerified !== null,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

export interface CreateUserResult {
  readonly userId: string;
  /** Present only when a dev/logging email sender is used — for tests. */
  readonly inviteToken?: string;
}

/**
 * Invite a user into a tenant. Same invite flow as `createOrganization`: no
 * password set by the admin; a single-use reset token is emailed as a
 * "set your password" link. Atomic (user + token in one transaction).
 */
export async function createUser(
  deps: AdminDeps,
  input: unknown,
  options: { exposeTokenForTests?: boolean } = {},
): Promise<CreateUserResult> {
  const data = parseInput(createUserSchema, input);

  const org = await deps.prisma.organization.findUnique({
    where: { id: data.organizationId },
    select: { id: true },
  });
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  const existing = await deps.prisma.user.findUnique({
    where: { organizationId_email: { organizationId: data.organizationId, email: data.email } },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("email.taken");
  }

  const now = clockNow(deps);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);

  const userId = await deps.prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        name: data.name,
        role: data.role,
        emailVerified: now,
        passwordHash: null,
        isActive: true,
      },
      select: { id: true },
    });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
    return user.id;
  });

  const setupUrl = `${deps.appUrl}/reset-password?token=${rawToken}`;
  await deps.email.send({
    to: data.email,
    subject: "Imposta la password del tuo account",
    text: `Il tuo account è stato creato. Imposta la password: ${setupUrl}`,
  });

  await deps.audit.record({
    action: "admin.user.create",
    organizationId: data.organizationId,
    actorId: deps.actor.superAdminUserId,
    entity: "User",
    entityId: userId,
    meta: { email: data.email, role: data.role },
  });

  return { userId, ...(options.exposeTokenForTests ? { inviteToken: rawToken } : {}) };
}

export interface AdminMutationResult {
  readonly ok: true;
}

/**
 * Update a tenant user's role and/or active state. When deactivating (or any
 * change), `sessionVersion` is bumped so the user's current sessions are
 * invalidated (docs/06 §6.1). Scoped by `[organizationId, userId]` so the admin
 * can only touch the intended tenant's user.
 */
export async function updateUser(deps: AdminDeps, input: unknown): Promise<AdminMutationResult> {
  const data = parseInput(updateUserSchema, input);

  const user = await deps.prisma.user.findFirst({
    where: { id: data.userId, organizationId: data.organizationId, role: { not: "superAdmin" } },
    select: { id: true, isActive: true, role: true },
  });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const nextActive = data.isActive ?? user.isActive;
  // Invalidate sessions whenever access changes (role change or deactivation).
  const accessChanged =
    (data.role !== undefined && data.role !== user.role) || nextActive !== user.isActive;

  await deps.prisma.user.update({
    where: { id: data.userId },
    data: {
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(accessChanged ? { sessionVersion: { increment: 1 } } : {}),
    },
  });

  await deps.audit.record({
    action: "admin.user.update",
    organizationId: data.organizationId,
    actorId: deps.actor.superAdminUserId,
    entity: "User",
    entityId: data.userId,
    meta: { role: data.role, isActive: data.isActive },
  });

  return { ok: true };
}

export interface ResetUserPasswordResult {
  readonly ok: true;
  /** Present only when a dev/logging email sender is used — for tests. */
  readonly resetToken?: string;
}

/**
 * Issue a password-reset link for a tenant user (admin-triggered). Single-use,
 * time-limited; only the hash is stored. Does not reveal the password to the
 * admin. Scoped by `[organizationId, userId]`.
 */
export async function resetUserPassword(
  deps: AdminDeps,
  input: unknown,
  options: { exposeTokenForTests?: boolean } = {},
): Promise<ResetUserPasswordResult> {
  const data = parseInput(resetUserPasswordSchema, input);

  const user = await deps.prisma.user.findFirst({
    where: { id: data.userId, organizationId: data.organizationId, role: { not: "superAdmin" } },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new NotFoundError("User not found");
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
    to: user.email,
    subject: "Reimposta la tua password",
    text: `È stata richiesta una reimpostazione della password: ${resetUrl}`,
  });

  await deps.audit.record({
    action: "admin.user.resetPassword",
    organizationId: data.organizationId,
    actorId: deps.actor.superAdminUserId,
    entity: "User",
    entityId: user.id,
  });

  return { ok: true, ...(options.exposeTokenForTests ? { resetToken: rawToken } : {}) };
}
