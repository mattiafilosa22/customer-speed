import type { LeadDeps } from "@/server/leads/deps";

/**
 * Read-only reference lists used by the lead forms / filters: the tenant's lead
 * sources (active, ordered) and loss reasons. Both are tenant-scoped by the
 * client and use the `[organizationId, sortOrder]` / `[organizationId, label]`
 * indexes. Separate from the lead use cases (Single Responsibility): these are
 * pure reads with no audit.
 */

export interface ReferenceItem {
  readonly id: string;
  readonly label: string;
}

/** Active lead sources for the tenant, ordered for selects (docs/03 §3.4). */
export async function listLeadSources(deps: LeadDeps): Promise<ReferenceItem[]> {
  return deps.prisma.leadSource.findMany({
    where: { isActive: true },
    select: { id: true, label: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

/** Loss reasons for the tenant, ordered by label. */
export async function listLossReasons(deps: LeadDeps): Promise<ReferenceItem[]> {
  return deps.prisma.lossReason.findMany({
    select: { id: true, label: true },
    orderBy: { label: "asc" },
  });
}

/**
 * Upper bound on the number of leads offered in a picker `<select>` (e.g. the
 * appointment form's "lead collegato"). Single-consultant tenants (Fabio) have
 * few leads; a generous cap keeps the select usable while guaranteeing the query
 * is never unbounded (docs/00 §3 — paginate/limit growing tables).
 */
const LEAD_OPTIONS_LIMIT = 500;

/**
 * Lead options for a picker select (id + full name), newest first, capped. Used
 * by the appointment form to link an appointment to a lead. Soft-deleted leads
 * are excluded by the tenant client; tenant-scoped via `[organizationId,
 * createdAt]`.
 */
export async function listLeadOptions(
  deps: LeadDeps,
): Promise<ReadonlyArray<{ id: string; firstName: string; lastName: string }>> {
  return deps.prisma.lead.findMany({
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: "desc" },
    take: LEAD_OPTIONS_LIMIT,
  });
}
