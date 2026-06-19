import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { requireTenantContext, type TenantContext } from "@/lib/tenant";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";

/**
 * Shared auth → RBAC → feature-flag prefix for the calendar integration route
 * handlers / actions (docs/00 §4, docs/08 Fase 6).
 *
 *  1. `requireTenantContext()` — 401 when unauthenticated.
 *  2. `requirePermission(..., "calendar.integrations")` — 403 for baseUser
 *     (the capability is proUser/superAdmin only, docs/02 §2.1).
 *  3. feature-flag gate — when `calendarIntegrations` is OFF for the tenant
 *     (e.g. Fabio) the whole module must be UNAVAILABLE. We raise a
 *     `NotFoundError` (404, non-revealing) so a disabled tenant cannot probe the
 *     endpoints — consistent with how the app pages 404 a disabled module.
 *
 * Returns the tenant context so callers can build their deps.
 */
export async function requireCalendarContext(): Promise<TenantContext> {
  const ctx = await requireTenantContext();
  requirePermission(ctx.role, "calendar.integrations");

  const flags = await getTenantFeatureFlags(ctx.organizationId);
  if (!flags.calendarIntegrations) {
    throw new NotFoundError("Calendar integrations are not enabled for this tenant");
  }
  return ctx;
}
