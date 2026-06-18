import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { TenantContext } from "@/lib/tenant";
import type { DashboardDeps } from "@/server/dashboard/deps";

/**
 * Build `DashboardDeps` from an authenticated tenant context (the wiring used by
 * the dashboard Server Component).
 *
 * The Prisma surface is the TENANT-SCOPED client (forces `organizationId` +
 * soft-delete default); the dashboard performs no writes, so no audit logger /
 * actor is needed.
 */
export function buildDashboardDeps(ctx: TenantContext): DashboardDeps {
  return {
    prisma: getTenantPrisma(ctx),
  };
}
