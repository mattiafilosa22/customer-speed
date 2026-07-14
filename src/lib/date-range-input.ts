/**
 * Pure `from`/`to` calendar-day parsing, shared between the dashboard's
 * server-side bounds resolver (`src/server/dashboard/date-range.ts`) and the
 * client-side `DateRangeFilter` (`src/components/dashboard/date-range-filter.tsx`).
 * Lives in `src/lib/` (side-effect-free, no I/O) per the project's layering
 * rule (docs/00 §2) so BOTH the server (hand-edited URL, no JS) and the
 * client (immediate inline feedback while the user is picking dates, no
 * server round trip) apply the exact SAME validation rule instead of two
 * hand-written copies that could drift apart.
 */

export interface ParsedDateRange {
  readonly gte: Date;
  readonly lt: Date;
}

export type DateRangeInputError = "invalidDate" | "invertedRange";

/**
 * Parses two `YYYY-MM-DD` calendar-day strings (as produced by
 * `<input type="date">`, or a hand-edited URL) into half-open UTC bounds
 * `[gte, lt)`, `to` INCLUSIVE — so `lt` is `to` + 1 day at UTC midnight, same
 * convention as `periodRange` (docs/00 §3).
 *
 * Never throws. Returns a `DateRangeInputError` instead of bounds when:
 *  - either string fails to parse into a valid `Date`, i.e.
 *    `Number.isNaN(date.getTime())` (`"invalidDate"`) — a hand-edited URL with
 *    a non-ISO value, or
 *  - the resulting range is inverted, i.e. `from` is after `to`
 *    (`"invertedRange"`) — the user picks "Dal" after "Al".
 */
export function parseDateRangeInput(
  from: string,
  to: string,
): ParsedDateRange | DateRangeInputError {
  const gte = new Date(`${from}T00:00:00.000Z`);
  const toExclusive = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(gte.getTime()) || Number.isNaN(toExclusive.getTime())) {
    return "invalidDate";
  }
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  if (gte >= toExclusive) {
    return "invertedRange";
  }
  return { gte, lt: toExclusive };
}

/** Narrows a `parseDateRangeInput` result to the error case. */
export function isDateRangeInputError(
  result: ParsedDateRange | DateRangeInputError,
): result is DateRangeInputError {
  return typeof result === "string";
}
