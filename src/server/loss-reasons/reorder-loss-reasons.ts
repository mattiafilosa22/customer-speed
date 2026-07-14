import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { LossReasonDeps } from "@/server/loss-reasons/deps";
import { reorderLossReasonsSchema } from "@/server/loss-reasons/schemas";

/**
 * Reorder the tenant's whole loss-reason list (Settings, docs/02 §2.5-bis).
 * Input is the COMPLETE ordered set of ids (active + inactive — the Settings
 * panel manages both); we persist a total `sortOrder` (0..n-1), mirroring
 * `reorderStages`.
 *
 * Every id is verified to belong to the tenant BEFORE any write — an unknown
 * or cross-tenant id rejects the WHOLE reorder as `NotFoundError` (404, same
 * non-revealing behaviour as the other ownership checks), rather than silently
 * reordering a partial/foreign set. The order must also be exactly the
 * tenant's current set (no missing id) so the resulting `sortOrder` stays
 * total and unambiguous.
 *
 * Atomicity (docs/00 §3): all per-reason `sortOrder` updates run in ONE
 * `$transaction` — the list never observes a half-applied order.
 */
export interface ReorderLossReasonsResult {
  readonly order: readonly string[];
}

export async function reorderLossReasons(
  deps: LossReasonDeps,
  input: unknown,
): Promise<ReorderLossReasonsResult> {
  const data = parseInput(reorderLossReasonsSchema, input);

  const existing = await deps.prisma.lossReason.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((r) => r.id));

  if (data.order.length !== existingIds.size || data.order.some((id) => !existingIds.has(id))) {
    throw new NotFoundError("Loss reason not found");
  }

  await deps.prisma.$transaction(
    data.order.map((id, index) =>
      deps.prisma.lossReason.update({
        where: { id },
        data: { sortOrder: index },
        select: { id: true },
      }),
    ),
  );

  return { order: data.order };
}
