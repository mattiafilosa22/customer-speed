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
