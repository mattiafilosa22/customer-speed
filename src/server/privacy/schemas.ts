import { z } from "zod";

import { RETENTION_EXPORT_BATCH_CAP } from "@/server/privacy/list-retention-candidates";

/**
 * Zod schemas for the bulk retention Server Action boundary (docs/00 §2).
 * `listRetentionCandidates` / `exportRetentionCandidates` /
 * `purgeRetentionCandidates` themselves take already-typed parameters (not
 * `unknown`), so — unlike most use cases in this codebase — the runtime
 * validation of what a CLIENT sends happens here, at the Server Action, before
 * those use cases are called. A Server Action argument is only TypeScript-typed
 * at the call site; nothing stops a tampered request from sending a different
 * runtime shape, so this boundary still needs Zod (docs/00 §2: validation on
 * every boundary, not just typed forms).
 */

/**
 * Optional client override of the tenant's configured
 * `Organization.leadRetentionMonths` for a single count/export call. Mirrors
 * the bounds of `updateRetentionSchema` (src/server/organization/schemas.ts).
 */
export const retentionMonthsOverrideSchema = z
  .number()
  .int("Must be a whole number of months")
  .min(1, "Must be at least 1 month")
  .max(120, "Must be at most 120 months");

/**
 * Bulk purge payload: the exact lead id list the client just downloaded as a
 * backup (see `purge-retention-candidates.ts` for the export→purge binding —
 * this Server Action does not re-derive the list, only shape-validates it).
 * Ids are not strictly cuid-checked (mirrors `appointments/schemas.ts`'s
 * `id` — shape only; ownership/existence is verified against the tenant by
 * `purgeRetentionCandidates` itself, which resolves an unknown/foreign id to a
 * recorded per-id failure rather than a shape error).
 */
export const purgeRetentionCandidatesSchema = z.object({
  leadIds: z
    .array(z.string().trim().min(1, "Invalid lead id").max(64))
    .min(1, "At least one lead id is required")
    .max(RETENTION_EXPORT_BATCH_CAP, "Too many lead ids in a single batch"),
});
export type PurgeRetentionCandidatesInput = z.input<typeof purgeRetentionCandidatesSchema>;
