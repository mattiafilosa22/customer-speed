import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { isPrismaErrorCode } from "@/server/loss-reasons/prisma-errors";
import type { LossReasonDeps } from "@/server/loss-reasons/deps";
import { setLossReasonActiveSchema } from "@/server/loss-reasons/schemas";
import type { LossReasonItem } from "@/server/loss-reasons/types";

/**
 * Deactivate/reactivate a tenant loss reason (Settings, docs/02 §2.5-bis) — one
 * toggle, both directions (`isActive: false | true`), matching the single
 * `toggleLossReasonActiveAction` Server Action.
 *
 * A deactivated reason is NOT deleted: it disappears from the "sposta in
 * Perso" picker (`listLossReasons(deps, { includeInactive: false })`) for NEW
 * losses, but stays referenced — unchanged — on every lead that already used
 * it (no cascade, no data touched here beyond the `LossReason` row itself).
 *
 * Isolation: `update` on the tenant-scoped client; a cross-tenant/unknown id
 * matches no row → `P2025` → `NotFoundError` (404).
 */
export async function setLossReasonActive(
  deps: LossReasonDeps,
  input: unknown,
): Promise<LossReasonItem> {
  const data = parseInput(setLossReasonActiveSchema, input);

  try {
    return await deps.prisma.lossReason.update({
      where: { id: data.id },
      data: { isActive: data.isActive },
      select: { id: true, label: true, isActive: true, sortOrder: true },
    });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2025")) {
      throw new NotFoundError("Loss reason not found");
    }
    throw error;
  }
}
