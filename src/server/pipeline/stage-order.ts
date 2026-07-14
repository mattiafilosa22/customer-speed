import type { LeadStage } from "@/generated/prisma/enums";
import { STAGE_ORDER } from "@/server/leads/stage";

/**
 * Fills gaps (stages with no persisted `PipelineStageConfig` row, e.g. a stage
 * added to the enum after the tenant was seeded) in a per-canonical-position
 * sortOrder array.
 *
 * A NAIVE default (the stage's raw canonical index) can collide with — or land
 * on the wrong side of — a persisted sortOrder from an OLDER numbering scheme
 * (e.g. a tenant seeded before two stages were inserted in the middle of the
 * pipeline still has sortOrder 0..8 for the original 9 stages; the new stages'
 * canonical indices 0..10 don't line up with that older scale and can tie with,
 * or fall after, a neighbour they should precede).
 *
 * Instead we interpolate a missing stage's default BETWEEN the nearest
 * canonical neighbours that DO have a persisted sortOrder — guaranteeing correct
 * relative placement regardless of the neighbours' absolute numbering. A gap
 * with a persisted value on only one side is offset from that side; a tenant
 * with NO persisted configs at all (brand new) falls back to the canonical
 * index for every stage, which sorts identically to canonical order.
 *
 * Used by `getPipelineConfig` (read: in-memory display order only, never
 * persisted) and by `setStageColor` / `updateStageVisibility` (write: computes
 * the `sortOrder` for the row they self-heal-create — see
 * `synthesizeSortOrderForStage` below).
 */
export function synthesizeMissingOrder(order: ReadonlyArray<number | undefined>): number[] {
  const result: number[] = [...order] as number[];
  for (let i = 0; i < order.length; i += 1) {
    if (order[i] !== undefined) continue;

    let left = i - 1;
    while (left >= 0 && order[left] === undefined) left -= 1;
    let right = i + 1;
    while (right < order.length && order[right] === undefined) right += 1;

    const leftValue = left >= 0 ? order[left] : undefined;
    const rightValue = right < order.length ? order[right] : undefined;

    if (leftValue !== undefined && rightValue !== undefined) {
      result[i] = leftValue + ((rightValue - leftValue) * (i - left)) / (right - left);
    } else if (leftValue !== undefined) {
      result[i] = leftValue + (i - left) * 0.5;
    } else if (rightValue !== undefined) {
      result[i] = rightValue - (right - i) * 0.5;
    } else {
      result[i] = i; // No persisted config anywhere — canonical index order.
    }
  }
  return result;
}

/**
 * Default `sortOrder` for ONE stage that is about to get its FIRST persisted
 * `PipelineStageConfig` row for this tenant (self-heal path in `setStageColor` /
 * `updateStageVisibility` — docs/03 §3.3 "tenant esistenti"). Interpolated the
 * same way `getPipelineConfig` displays it, so the newly-created row lands
 * exactly where the tenant already sees the stage on the board — no visible
 * jump the next time the config is read.
 */
export function synthesizeSortOrderForStage(
  stage: LeadStage,
  existing: ReadonlyArray<{ stage: LeadStage; sortOrder: number }>,
): number {
  const byStage = new Map(existing.map((c) => [c.stage, c.sortOrder]));
  const persistedOrder = STAGE_ORDER.map((s) => byStage.get(s));
  const effectiveOrder = synthesizeMissingOrder(persistedOrder);
  const index = STAGE_ORDER.indexOf(stage);
  return effectiveOrder[index] ?? index;
}
