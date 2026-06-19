import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { parseFeatureFlags } from "@/lib/feature-flags";
import { parseInput } from "@/server/validation";
import type { AdminDeps } from "@/server/admin/deps";
import {
  setOrganizationActiveSchema,
  updateFeatureFlagsSchema,
  updateOrganizationSchema,
} from "@/server/admin/schemas";

/**
 * Admin mutations on a tenant's settings (docs/04 §4.10 PATCH
 * /admin/organizations/:id, docs/08 Fase 7). superAdmin only; BASE client; every
 * mutation audited with the affected `organizationId`.
 *
 * THEME and BRAND are NOT handled here — they are persisted by the REUSED
 * white-label use cases (`updateOrganizationTheme` / `updateOrganizationBranding`)
 * wired with the target org as the actor (see `admin/context-deps.ts`), so the
 * admin panel and the tenant panel share one contract.
 */

export interface AdminMutationResult {
  readonly ok: true;
}

/** Update a tenant's identity + slug/customDomain. Only provided fields change. */
export async function updateOrganization(
  deps: AdminDeps,
  input: unknown,
): Promise<AdminMutationResult> {
  const data = parseInput(updateOrganizationSchema, input);

  // Pre-check slug uniqueness against OTHER organizations for a clean error.
  if (data.slug !== undefined) {
    const clash = await deps.prisma.organization.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (clash && clash.id !== data.organizationId) {
      throw new ConflictError("slug.taken");
    }
  }

  const updateData: Prisma.OrganizationUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.appName !== undefined) updateData.appName = data.appName;
  if (data.slug !== undefined) updateData.slug = data.slug;
  // `customDomain` is nullable: undefined leaves it untouched, null clears it.
  if (data.customDomain !== undefined) updateData.customDomain = data.customDomain;

  await updateOrThrowNotFound(deps, data.organizationId, updateData, () => {
    if (data.slug !== undefined || data.customDomain !== undefined) {
      throw new ConflictError("organization.conflict");
    }
  });

  await deps.audit.record({
    action: "admin.organization.update",
    organizationId: data.organizationId,
    actorId: deps.actor.superAdminUserId,
    entity: "Organization",
    entityId: data.organizationId,
    meta: {
      name: data.name,
      appName: data.appName,
      slug: data.slug,
      customDomain: data.customDomain,
    },
  });

  return { ok: true };
}

/** Toggle per-module feature flags for a tenant (docs/01, docs/08). */
export async function updateOrganizationFeatureFlags(
  deps: AdminDeps,
  input: unknown,
): Promise<AdminMutationResult> {
  const data = parseInput(updateFeatureFlagsSchema, input);

  // Normalize through the shared parser so persisted JSON is always well-formed.
  const flags = parseFeatureFlags(data.flags);

  await updateOrThrowNotFound(deps, data.organizationId, {
    featureFlags: flags as unknown as Prisma.InputJsonValue,
  });

  await deps.audit.record({
    action: "admin.organization.featureFlags.update",
    organizationId: data.organizationId,
    actorId: deps.actor.superAdminUserId,
    entity: "Organization",
    entityId: data.organizationId,
    meta: { flags },
  });

  return { ok: true };
}

/**
 * Suspend (deactivate) or re-activate a whole tenant (docs/08 Fase 7).
 *
 * Suspension model: there is no `Organization.isActive` column, so suspending a
 * tenant means deactivating ALL its users AND bumping their `sessionVersion`
 * (so existing JWT sessions are invalidated immediately — docs/06 §6.1). The
 * global `superAdmin` (if it happened to live in the tenant) is excluded.
 * Re-activating sets users active again (they must re-login). Done in ONE
 * `updateMany` per direction (no per-user loop).
 */
export async function setOrganizationActive(
  deps: AdminDeps,
  input: unknown,
): Promise<AdminMutationResult> {
  const data = parseInput(setOrganizationActiveSchema, input);

  const org = await deps.prisma.organization.findUnique({
    where: { id: data.organizationId },
    select: { id: true },
  });
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  await deps.prisma.user.updateMany({
    where: { organizationId: data.organizationId, role: { not: "superAdmin" } },
    data: data.active
      ? { isActive: true }
      : // Suspend: deactivate + invalidate sessions atomically.
        { isActive: false, sessionVersion: { increment: 1 } },
  });

  await deps.audit.record({
    action: data.active ? "admin.organization.activate" : "admin.organization.suspend",
    organizationId: data.organizationId,
    actorId: deps.actor.superAdminUserId,
    entity: "Organization",
    entityId: data.organizationId,
  });

  return { ok: true };
}

/**
 * `organization.update` scoped by id, mapping Prisma's "record not found" (P2025)
 * to a typed `NotFoundError` and an optional unique-violation hook to a conflict.
 */
async function updateOrThrowNotFound(
  deps: AdminDeps,
  organizationId: string,
  data: Prisma.OrganizationUpdateInput,
  onUniqueViolation?: () => never | void,
): Promise<void> {
  try {
    await deps.prisma.organization.update({ where: { id: organizationId }, data });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2025")) {
      throw new NotFoundError("Organization not found");
    }
    if (isPrismaErrorCode(error, "P2002") && onUniqueViolation) {
      onUniqueViolation();
    }
    throw error;
  }
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
