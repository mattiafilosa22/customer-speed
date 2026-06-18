import { z } from "zod";

import { LeadStage } from "@/generated/prisma/enums";

/**
 * Zod schemas for the pipeline-configuration domain — single source of truth for
 * the input shapes at every boundary (Server Action + Route Handler), docs/00 §2.
 * Types are inferred, never hand-written.
 *
 * The configurable surface is `PipelineStageConfig` (per tenant: visibility,
 * order, colour token). The domain RULES (terminal stages cannot be hidden,
 * cannot hide a stage that still holds active leads) are NOT expressible in Zod
 * because they need the DB / the full stage set, so they live in the use cases.
 */

const stage = z.nativeEnum(LeadStage);

/**
 * Stage colour override. We accept either a CSS custom-property reference
 * (`--stage-*`, the design-system tokens — docs/05 §5.3) or `null` to reset to
 * the default token. We DO NOT accept arbitrary CSS so the value can never carry
 * an injection payload into an inline `style`. Empty string → reset (null).
 */
const colorToken = z
  .string()
  .trim()
  .regex(/^--stage-[a-z-]+$/, "Invalid color token")
  .nullable()
  .or(z.literal("").transform(() => null));

// --- Update one stage's visibility ----------------------------------------

export const updateStageVisibilitySchema = z.object({
  stage,
  isVisible: z.boolean(),
});
export type UpdateStageVisibilityInput = z.infer<typeof updateStageVisibilitySchema>;

// --- Reorder the visible/whole stage list ---------------------------------

/**
 * Full ordering payload: the complete list of stages in the desired order. We
 * require ALL nine stages exactly once so the resulting `sortOrder` is total and
 * unambiguous (no gaps, no duplicates) — validated here as a set, the per-stage
 * persistence happens atomically in the use case.
 */
export const reorderStagesSchema = z.object({
  order: z
    .array(stage)
    .length(Object.keys(LeadStage).length, "Must list every stage exactly once")
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Stages must be unique",
    }),
});
export type ReorderStagesInput = z.infer<typeof reorderStagesSchema>;

// --- Set one stage's colour token -----------------------------------------

export const setStageColorSchema = z.object({
  stage,
  colorToken,
});
export type SetStageColorInput = z.infer<typeof setStageColorSchema>;

// --- REST config PATCH (discriminated by `op`) ----------------------------

/**
 * The single `PATCH /api/pipeline/config` endpoint (docs/04 §4.8) carries a
 * discriminated `op` so one route covers all three mutations. The per-op shape
 * reuses the schemas above; the route delegates to the matching use case.
 */
export const configPatchSchema = z.discriminatedUnion("op", [
  updateStageVisibilitySchema.extend({ op: z.literal("visibility") }),
  reorderStagesSchema.extend({ op: z.literal("reorder") }),
  setStageColorSchema.extend({ op: z.literal("color") }),
]);
export type ConfigPatchInput = z.infer<typeof configPatchSchema>;
