import { requirePermission, type Capability } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { buildPipelineDeps, type PipelineDeps } from "@/server/pipeline";

/**
 * Resolve the tenant context, enforce a capability and build the tenant-scoped
 * pipeline deps — the shared auth→RBAC→tenant prefix for every pipeline Route
 * Handler (DRY). Throws typed errors that `errorResponse` maps to 401/403.
 */
export async function pipelineRouteContext(capability: Capability): Promise<PipelineDeps> {
  const ctx = await requireTenantContext();
  requirePermission(ctx.role, capability);
  return buildPipelineDeps(ctx);
}
