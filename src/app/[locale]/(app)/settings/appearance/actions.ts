"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requirePermission } from "@/lib/rbac";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import {
  buildOrganizationDeps,
  updateOrganizationBranding,
  updateOrganizationTheme,
  type UpdateBrandingInput,
  type UpdateThemeInput,
} from "@/server/organization";

/**
 * Appearance & brand Server Actions — the ONLY boundary the white-label panel
 * talks to (docs/00 §1: UI → Server Action → use case → Prisma).
 *
 * Both actions are gated by the `settings.tenant` capability (proUser /
 * superAdmin — NOT baseUser, docs/02 §2.1) resolved from the SERVER context, and
 * the actor (org + user) comes from the session, never the client. They return a
 * small typed result and THROW a STABLE i18n key on failure so the client can
 * localize without the server importing message catalogues.
 *
 * On success the app shell is revalidated so the saved theme/brand is applied
 * across the whole app on the next render (the layout re-reads the org theme).
 */

export interface AppearanceActionResult {
  readonly ok: true;
}

function rethrowAsKey(error: unknown): never {
  if (error instanceof ValidationError) {
    // Contrast failures are tagged on the `theme` field by the use case.
    const themeIssues = error.issues.theme;
    if (themeIssues?.some((m) => m.startsWith("contrast."))) {
      throw new Error("appearance.errors.contrast");
    }
    throw new Error("appearance.errors.invalid");
  }
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    throw new Error("appearance.errors.unauthorized");
  }
  throw new Error("appearance.errors.generic");
}

/** Re-render the themed shell + the appearance page after a save. */
function revalidateShell(): void {
  revalidatePath("/[locale]/(app)", "layout");
}

export async function updateThemeAction(
  input: UpdateThemeInput,
): Promise<AppearanceActionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "settings.tenant");
    const deps = buildOrganizationDeps(ctx);
    await updateOrganizationTheme(deps, input);
    revalidateShell();
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function updateBrandingAction(
  input: UpdateBrandingInput,
): Promise<AppearanceActionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "settings.tenant");
    const deps = buildOrganizationDeps(ctx);
    await updateOrganizationBranding(deps, input);
    revalidateShell();
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}
