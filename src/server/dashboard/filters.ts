import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { periodSchema } from "@/server/dashboard/period";

/**
 * Shared "provenienza" (lead source) filter for the dashboard (docs/02 §2.2) —
 * the SECOND dimension every widget is scoped by, alongside the period.
 *
 * It is deliberately a module of its own rather than a field of `periodSchema`:
 * the period answers "WHEN", the source answers "WHICH CHANNEL", and the two are
 * independent (Single Responsibility, docs/00 §1). `dashboardFilterSchema` is
 * simply the composition of the two, so a widget still parses ONE input shape.
 *
 * Sources are tenant data (`LeadSource`), so the filter carries an OPAQUE id —
 * never a label, never an enum. Two values are special:
 *  - absent/empty → no source bound at all ("Tutte le provenienze"),
 *  - `UNSPECIFIED_SOURCE` → the leads with NO source recorded, i.e. exactly the
 *    `sourceId: null` bucket `getSourceBreakdown` renders as "Non specificato".
 *    A sentinel is needed because an empty query param cannot express "null" —
 *    it already means "no filter".
 *
 * An id that does not belong to the tenant (hand-edited URL) needs no special
 * handling: the tenant-scoped client filters every query by `organizationId`, so
 * it simply matches nothing — it can never surface another tenant's rows
 * (docs/00 §2, non-negotiable #1).
 */

/** Query value selecting the leads with no source recorded (`sourceId IS NULL`). */
export const UNSPECIFIED_SOURCE = "none";

/**
 * The source dimension on its own. Kept exported so use cases whose input is NOT
 * period-based (e.g. `getActiveLeads`, which takes a `limit`) can compose the
 * same field into their own schema instead of redeclaring it.
 */
export const sourceFilterSchema = z.object({
  sourceId: z.string().min(1).optional(),
});

/** Period + source: the input shape of every period-scoped dashboard widget. */
export const dashboardFilterSchema = periodSchema.extend(sourceFilterSchema.shape);

export type SourceFilterInput = z.infer<typeof sourceFilterSchema>;
export type DashboardFilterInput = z.infer<typeof dashboardFilterSchema>;

/**
 * The `Lead` where-fragment for the selected source, ready to be spread into a
 * widget's own `where` (and into a `lead: { is: … }` relation filter for the
 * invoice-anchored ones). Empty object when no source is selected, so spreading
 * it is always safe and adds no clause.
 */
export function leadSourceFilter(input: SourceFilterInput): Prisma.LeadWhereInput {
  if (!input.sourceId) {
    return {};
  }
  return { sourceId: input.sourceId === UNSPECIFIED_SOURCE ? null : input.sourceId };
}
