import { requirePermission, type Capability } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { buildLeadDeps } from "@/server/leads";
import type { LeadDeps } from "@/server/leads";

/**
 * Resolve the tenant context, enforce a capability and build the tenant-scoped
 * lead deps — the shared auth→RBAC→tenant prefix for every lead Route Handler
 * (DRY). Throws typed errors that `errorResponse` maps to 401/403.
 */
export async function leadRouteContext(capability: Capability): Promise<LeadDeps> {
  const ctx = await requireTenantContext();
  requirePermission(ctx.role, capability);
  return buildLeadDeps(ctx);
}
