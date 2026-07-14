import { z } from "zod";

/**
 * Zod schemas for the loss-reason Settings CRUD (docs/00 §2: single source of
 * truth for input shapes at every boundary). Types are inferred, never
 * hand-written.
 */

/** Trimmed, non-empty label — matches `LossReason.label` / `@@unique([organizationId, label])`. */
const label = z.string().trim().min(1, "Required").max(120);

export const createLossReasonSchema = z.object({ label });
export type CreateLossReasonInput = z.infer<typeof createLossReasonSchema>;

export const updateLossReasonSchema = z.object({
  id: z.string().min(1, "Required"),
  label,
});
export type UpdateLossReasonInput = z.infer<typeof updateLossReasonSchema>;

export const setLossReasonActiveSchema = z.object({
  id: z.string().min(1, "Required"),
  isActive: z.boolean(),
});
export type SetLossReasonActiveInput = z.infer<typeof setLossReasonActiveSchema>;

/**
 * Full ordering payload: every loss reason id of the tenant, in the desired
 * order (mirrors `reorderStagesSchema` — a total order, so the resulting
 * `sortOrder` 0..N-1 is unambiguous). Completeness against the tenant's actual
 * set is checked in the use case (it needs a DB read, not expressible in Zod).
 */
export const reorderLossReasonsSchema = z.object({
  order: z
    .array(z.string().min(1))
    .min(1, "Order cannot be empty")
    .refine((arr) => new Set(arr).size === arr.length, { message: "Ids must be unique" }),
});
export type ReorderLossReasonsInput = z.infer<typeof reorderLossReasonsSchema>;
