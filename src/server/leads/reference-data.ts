import type { LeadDeps } from "@/server/leads/deps";
import { listLossReasons as listAllLossReasons } from "@/server/loss-reasons";

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

/**
 * ACTIVE loss reasons for the tenant, ordered by `sortOrder` — the "sposta in
 * Perso" picker (`update-stage-dialog.tsx`, `loss-reason-dialog.tsx`). A thin
 * re-export of the loss-reason domain module's `listLossReasons` with
 * `includeInactive: false` (its default), so the query has exactly ONE
 * implementation (docs/00 §1 DRY) — the full CRUD list (including deactivated
 * reasons) lives in Settings (`src/server/loss-reasons`). `LeadDeps` is
 * structurally assignable to `LossReasonDeps` (same tenant-scoped `prisma` +
 * `actor` shape), so no adapter is needed.
 */
export async function listLossReasons(deps: LeadDeps): Promise<ReferenceItem[]> {
  const items = await listAllLossReasons(deps);
  return items.map(({ id, label }) => ({ id, label }));
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
