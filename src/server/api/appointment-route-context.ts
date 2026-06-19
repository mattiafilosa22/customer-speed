import { requirePermission, type Capability } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { buildAppointmentDeps, type AppointmentDeps } from "@/server/appointments";

/**
 * Resolve the tenant context, enforce a capability and build the tenant-scoped
 * appointment deps — the shared auth→RBAC→tenant prefix for every appointment
 * Route Handler (DRY). Throws typed errors that `errorResponse` maps to 401/403.
 *
 * Appointments are gated by a SINGLE capability `appointment.manage`
 * (proUser/superAdmin, NOT baseUser — docs/02 §2.1) for both reads and writes:
 * the matrix exposes one "Appuntamenti" permission, and baseUser does not get the
 * appointments module at all.
 */
export async function appointmentRouteContext(
  capability: Capability = "appointment.manage",
): Promise<AppointmentDeps> {
  const ctx = await requireTenantContext();
  requirePermission(ctx.role, capability);
  return buildAppointmentDeps(ctx);
}
