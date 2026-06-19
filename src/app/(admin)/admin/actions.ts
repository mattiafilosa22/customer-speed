"use server";

import { revalidatePath } from "next/cache";

import { UnauthorizedError, ValidationError, ConflictError, NotFoundError } from "@/lib/errors";
import { ForbiddenError, requirePermission } from "@/lib/rbac";
import { requireSuperAdminContext } from "@/lib/tenant";
import {
  buildAdminDeps,
  buildOrganizationDepsForTarget,
  createOrganization,
  createUser,
  resetUserPassword,
  setOrganizationActive,
  updateOrganization,
  updateOrganizationFeatureFlags,
  updateUser,
  type CreateOrganizationInput,
  type CreateUserInput,
  type ResetUserPasswordInput,
  type SetOrganizationActiveInput,
  type UpdateFeatureFlagsInput,
  type UpdateOrganizationInput,
  type UpdateUserInput,
} from "@/server/admin";
import {
  updateOrganizationBranding,
  updateOrganizationTheme,
  type UpdateBrandingInput,
  type UpdateThemeInput,
} from "@/server/organization";

/**
 * Cross-tenant ADMIN Server Actions — the ONLY mutation boundary the `(admin)/`
 * UI talks to (docs/00 §1: UI → Server Action → use case → Prisma).
 *
 * DECISION (docs/04 §4.10 vs codebase): docs/04 sketches REST endpoints under
 * `/api/admin/...`, but the whole product uses Server Actions for UI mutations
 * and the admin area REUSES the white-label panel (which is wired to Server
 * Actions). To keep one consistent boundary and reuse the panel verbatim, the
 * admin UI uses Server Actions. The REST contract remains documented for any
 * future external/admin API; both would call the SAME use cases.
 *
 * Every action enforces the full chain (docs/00 §4):
 *   auth → superAdmin context → RBAC (`admin.tenants`) → Zod (in the use case)
 *   → use case (audited) → typed result.
 * The superAdmin context comes from the SERVER session, never client input. On
 * failure a STABLE i18n key is thrown so the client localizes without the server
 * importing message catalogues.
 */

export interface AdminActionResult {
  readonly ok: true;
}

function rethrowAsKey(error: unknown): never {
  if (error instanceof ValidationError) {
    const themeIssues = error.issues.theme;
    if (themeIssues?.some((m) => m.startsWith("contrast."))) {
      throw new Error("admin.errors.contrast");
    }
    throw new Error("admin.errors.invalid");
  }
  if (error instanceof ConflictError) {
    // Carry the specific conflict reason (slug.taken / email.taken / generic).
    throw new Error(`admin.errors.${error.message}`);
  }
  if (error instanceof NotFoundError) {
    throw new Error("admin.errors.notFound");
  }
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    throw new Error("admin.errors.unauthorized");
  }
  throw new Error("admin.errors.generic");
}

/** Resolve + authorize the superAdmin for an admin action (defense in depth). */
async function authorizeAdmin() {
  const ctx = await requireSuperAdminContext();
  requirePermission(ctx.role, "admin.tenants");
  return ctx;
}

function revalidateTenant(organizationId: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${organizationId}`);
}

// ── Organizations ────────────────────────────────────────────────────────────

export async function createOrganizationAction(
  input: CreateOrganizationInput,
): Promise<AdminActionResult & { organizationId: string }> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildAdminDeps(ctx);
    const result = await createOrganization(deps, input);
    revalidatePath("/admin");
    revalidatePath("/admin/tenants");
    return { ok: true, organizationId: result.organizationId };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function updateOrganizationAction(
  input: UpdateOrganizationInput,
): Promise<AdminActionResult> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildAdminDeps(ctx);
    await updateOrganization(deps, input);
    revalidateTenant(input.organizationId);
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function updateFeatureFlagsAction(
  input: UpdateFeatureFlagsInput,
): Promise<AdminActionResult> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildAdminDeps(ctx);
    await updateOrganizationFeatureFlags(deps, input);
    revalidateTenant(input.organizationId);
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function setOrganizationActiveAction(
  input: SetOrganizationActiveInput,
): Promise<AdminActionResult> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildAdminDeps(ctx);
    await setOrganizationActive(deps, input);
    revalidateTenant(input.organizationId);
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

// ── White-label theme/brand (REUSES the tenant use cases on a target org) ─────

export async function updateTenantThemeAction(
  organizationId: string,
  input: UpdateThemeInput,
): Promise<AdminActionResult> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildOrganizationDepsForTarget(ctx, organizationId);
    await updateOrganizationTheme(deps, input);
    revalidateTenant(organizationId);
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function updateTenantBrandingAction(
  organizationId: string,
  input: UpdateBrandingInput,
): Promise<AdminActionResult> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildOrganizationDepsForTarget(ctx, organizationId);
    await updateOrganizationBranding(deps, input);
    revalidateTenant(organizationId);
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function createUserAction(input: CreateUserInput): Promise<AdminActionResult> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildAdminDeps(ctx);
    await createUser(deps, input);
    revalidateTenant(input.organizationId);
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function updateUserAction(input: UpdateUserInput): Promise<AdminActionResult> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildAdminDeps(ctx);
    await updateUser(deps, input);
    revalidateTenant(input.organizationId);
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function resetUserPasswordAction(
  input: ResetUserPasswordInput,
): Promise<AdminActionResult> {
  try {
    const ctx = await authorizeAdmin();
    const deps = buildAdminDeps(ctx);
    await resetUserPassword(deps, input);
    revalidateTenant(input.organizationId);
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}
