import { NotFoundError } from "@/lib/errors";
import type { AppointmentDeps } from "@/server/appointments/deps";

/**
 * Verify that an optional `leadId` belongs to the current tenant before linking
 * an appointment to it.
 *
 * Tenant isolation (docs/00 §3, §4): the lookup uses the tenant-scoped client,
 * so a cross-tenant / soft-deleted / missing lead is simply "not found" and we
 * raise a `NotFoundError` (404, non-revealing — the caller cannot distinguish
 * "other tenant" from "missing"). A null/undefined `leadId` means "no link" and
 * passes through untouched.
 */
export async function assertLeadInTenant(
  deps: AppointmentDeps,
  leadId: string | null | undefined,
): Promise<void> {
  if (!leadId) {
    return;
  }
  const lead = await deps.prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) {
    throw new NotFoundError("Lead not found");
  }
}
