import { z } from "zod";

/**
 * Shared period filter (docs/02 §2.2, docs/04 §4 "?year=&month="), identical to
 * the lead-list / pipeline semantics so the dashboard stays coherent with them:
 *
 *  - `year` present, `month` absent  → the WHOLE calendar year,
 *  - `year` + `month`                → that single month,
 *  - `year` absent                   → NO period bound (all time).
 *
 * Bounds are computed as a half-open UTC interval `[gte, lt)` so a row exactly on
 * the next period's first instant is excluded (no double counting at boundaries).
 * Dates are stored/compared in UTC (docs/00 §3).
 *
 * `range` is an explicit bounds OVERRIDE: the common ground shared with the
 * dashboard's free date-range filter (`date-range.ts`, docs/02 §2.2). When
 * present it takes precedence over `year`/`month` — the dashboard page resolves
 * it via `resolveDateRangeBounds` and threads it through here so every widget
 * (`getDashboardKpis`, `getPipelineDistribution`, …) keeps a SINGLE entrypoint
 * ("give me the period input, I derive the bounds") regardless of which of the
 * two independent, URL-driven filters produced it. This is a small, targeted
 * addition — it does not change the year/month semantics above, and the two
 * filters remain otherwise independent modules.
 */
export const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  range: z.object({ gte: z.date(), lt: z.date() }).optional(),
});

export type PeriodInput = z.infer<typeof periodSchema>;

export interface PeriodRange {
  readonly gte: Date;
  readonly lt: Date;
}

/** Inclusive lower / exclusive upper UTC bounds for a year (+ optional month). */
export function periodRange(year: number, month?: number): PeriodRange {
  if (month) {
    return {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }
  return {
    gte: new Date(Date.UTC(year, 0, 1)),
    lt: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

/**
 * Build a Prisma date range filter for the period, or `undefined` when no year
 * (nor explicit `range`) was supplied (meaning "no time bound"). Callers spread
 * it into the column they want to filter (e.g. `createdAt` for leads, `issuedAt`
 * for invoices). `range`, when present, wins over `year`/`month` (see the
 * `periodSchema` doc comment above).
 */
export function periodFilter(period: PeriodInput): PeriodRange | undefined {
  if (period.range) {
    return period.range;
  }
  if (!period.year) {
    return undefined;
  }
  return periodRange(period.year, period.month);
}
