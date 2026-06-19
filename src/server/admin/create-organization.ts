import { ConflictError } from "@/lib/errors";
import { PASSWORD_RESET_TTL_MS, generateRawToken, hashToken } from "@/lib/tokens";
import { clockNow, type AdminDeps } from "@/server/admin/deps";
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_LEAD_SOURCES,
  DEFAULT_LOSS_REASONS,
  DEFAULT_PIPELINE_STAGES,
  DEFAULT_THEME,
} from "@/server/admin/defaults";
import { createOrganizationSchema } from "@/server/admin/schemas";
import { parseInput } from "@/server/validation";

/**
 * Provision a new tenant + its first `proUser`, ATOMICALLY (docs/04 §4.10 POST
 * /admin/organizations, docs/08 Fase 7). superAdmin only; audited.
 *
 * Tenant model (docs/02 §2.1): organizations are created by the reseller, not by
 * self-service signup. The first user is a `proUser` (full tenant access).
 *
 * Invite flow (no password set by the admin):
 *  - the user is created WITHOUT a passwordHash and with `emailVerified` set
 *    (the admin vouches for the address),
 *  - a single-use, time-limited password-RESET token is issued; the raw token is
 *    emailed as a "set your password" link. Only its SHA-256 hash is stored
 *    (docs/06 §6.1) — the admin never sees or sets the password.
 *
 * Atomicity (docs/00 §3): the organization, its default lead sources / loss
 * reasons / 9 pipeline stage configs, the owner user and the invite token are
 * all created in ONE `$transaction`. A duplicate slug or owner email aborts the
 * whole transaction (nothing is partially created).
 *
 * Cross-tenant: BASE client (the admin creates rows across tenants). Uniqueness
 * is enforced at the DB (`Organization.slug @unique`, `User @@unique[orgId,email]`)
 * and surfaced as a typed `ConflictError` (→ 409). We also pre-check the slug to
 * give a clean field-level error before attempting the write.
 */

export interface CreateOrganizationResult {
  readonly organizationId: string;
  readonly ownerUserId: string;
  /** Present only when a dev/logging email sender is used — for tests. */
  readonly inviteToken?: string;
}

export async function createOrganization(
  deps: AdminDeps,
  input: unknown,
  options: { exposeTokenForTests?: boolean } = {},
): Promise<CreateOrganizationResult> {
  const data = parseInput(createOrganizationSchema, input);

  // Pre-check slug uniqueness for a clean error (the @unique constraint is still
  // the authoritative guard inside the transaction against a race).
  const existing = await deps.prisma.organization.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("slug.taken");
  }

  const now = clockNow(deps);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);

  let result: { organizationId: string; ownerUserId: string };
  try {
    result = await deps.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: data.name,
          slug: data.slug,
          appName: data.appName,
          theme: DEFAULT_THEME,
          featureFlags: DEFAULT_FEATURE_FLAGS,
        },
        select: { id: true },
      });

      await tx.leadSource.createMany({
        data: DEFAULT_LEAD_SOURCES.map((s) => ({
          organizationId: organization.id,
          label: s.label,
          sortOrder: s.sortOrder,
        })),
      });

      await tx.lossReason.createMany({
        data: DEFAULT_LOSS_REASONS.map((label) => ({
          organizationId: organization.id,
          label,
        })),
      });

      await tx.pipelineStageConfig.createMany({
        data: DEFAULT_PIPELINE_STAGES.map((cfg) => ({
          organizationId: organization.id,
          stage: cfg.stage,
          isVisible: true,
          sortOrder: cfg.sortOrder,
          colorToken: cfg.colorToken,
        })),
      });

      const owner = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: data.owner.email,
          name: data.owner.name,
          role: "proUser",
          // Invite: admin vouches for the address; password set via the link.
          emailVerified: now,
          passwordHash: null,
          isActive: true,
        },
        select: { id: true },
      });

      await tx.passwordResetToken.create({
        data: { userId: owner.id, tokenHash, expiresAt },
      });

      return { organizationId: organization.id, ownerUserId: owner.id };
    });
  } catch (error) {
    // Unique-constraint violation (slug or owner email raced) → typed conflict.
    if (isUniqueViolation(error)) {
      throw new ConflictError("organization.conflict");
    }
    throw error;
  }

  const setupUrl = `${deps.appUrl}/reset-password?token=${rawToken}`;
  await deps.email.send({
    to: data.owner.email,
    subject: "Imposta la password del tuo account",
    text: `Il tuo account è stato creato. Imposta la password: ${setupUrl}`,
  });

  await deps.audit.record({
    action: "admin.organization.create",
    organizationId: result.organizationId,
    actorId: deps.actor.superAdminUserId,
    entity: "Organization",
    entityId: result.organizationId,
    meta: {
      slug: data.slug,
      appName: data.appName,
      ownerUserId: result.ownerUserId,
      ownerEmail: data.owner.email,
    },
  });

  return {
    organizationId: result.organizationId,
    ownerUserId: result.ownerUserId,
    ...(options.exposeTokenForTests ? { inviteToken: rawToken } : {}),
  };
}

/** Narrows an unknown error to a Prisma P2002 (unique constraint) violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
