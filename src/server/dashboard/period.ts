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
 */
export const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
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
 * was supplied (meaning "no time bound"). Callers spread it into the column they
 * want to filter (e.g. `createdAt` for leads, `issuedAt` for invoices).
 */
export function periodFilter(period: PeriodInput): PeriodRange | undefined {
  if (!period.year) {
    return undefined;
  }
  return periodRange(period.year, period.month);
}
