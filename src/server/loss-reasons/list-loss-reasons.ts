import type { LossReasonDeps } from "@/server/loss-reasons/deps";
import type { LossReasonItem } from "@/server/loss-reasons/types";

/**
 * Tenant loss reasons, ordered for both consumers (docs/02 §2.5-bis):
 *
 *  - Settings ("Motivi di perdita" panel): `includeInactive: true` — the
 *    operator manages the full list, including deactivated reasons (they stay
 *    referenced by existing leads and must remain visible/renameable there).
 *  - The "sposta in Perso" picker (`src/server/leads/reference-data.ts`,
 *    re-exported for the lead forms): `includeInactive: false` (default) —
 *    only reasons a user may pick for a NEW loss.
 *
 * Ordered by `sortOrder` then `label` (stable tie-break), matching
 * `LossReason`'s `[organizationId, sortOrder]` index — no in-memory sort of an
 * unbounded set, the DB does it.
 */
export async function listLossReasons(
  deps: LossReasonDeps,
  options: { includeInactive?: boolean } = {},
): Promise<LossReasonItem[]> {
  const includeInactive = options.includeInactive ?? false;
  return deps.prisma.lossReason.findMany({
    where: includeInactive ? {} : { isActive: true },
    select: { id: true, label: true, isActive: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}
