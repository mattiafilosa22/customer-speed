/**
 * Free date-range filter for the dashboard (docs/02 §2.2), ADDED alongside the
 * existing `year`/`month` period filter (`period.ts`) — a second, independent
 * way to scope the same KPI widgets, not a replacement. The two filters share
 * the same "half-open UTC bounds" convention (`[gte, lt)`, docs/00 §3) so a
 * caller can treat either result as an interchangeable `{ gte, lt }` range.
 *
 * Precedence when BOTH are present in the URL: the caller (dashboard page)
 * checks `resolveDateRangeBounds` first and, when it returns non-null, uses it
 * INSTEAD of the year/month bounds for every widget query (docs/02 §2.2).
 */
export interface DateRangeInput {
  /** Inclusive lower bound, `YYYY-MM-DD` (UTC calendar day). */
  readonly from?: string;
  /** Inclusive upper bound, `YYYY-MM-DD` (UTC calendar day). */
  readonly to?: string;
  /** "Last 7 days" preset, relative to `now`. Takes precedence over `from`/`to`. */
  readonly preset?: "lastWeek";
}

export interface DateRangeBounds {
  readonly gte: Date;
  readonly lt: Date;
}

/**
 * Resolve `from`/`to`/`preset` into half-open UTC bounds, or `null` when none
 * of them select a range (e.g. no params, or only one of `from`/`to`).
 *
 *  - `preset: "lastWeek"` → the 7 days ending at `now` (exclusive upper bound),
 *    i.e. `[now - 7d, now)`. `now` is injectable for deterministic tests.
 *  - `from` + `to` (both required) → the WHOLE calendar days from `from` to
 *    `to` INCLUSIVE, so `lt` is `to` + 1 day at UTC midnight — same "inclusive
 *    end represented as exclusive next-instant" convention as `periodRange`.
 *  - anything else (no params, or only one of `from`/`to`) → `null`, meaning
 *    "this filter is not active" (the caller falls back to `year`/`month`).
 */
export function resolveDateRangeBounds(
  input: DateRangeInput,
  now: Date = new Date(),
): DateRangeBounds | null {
  if (input.preset === "lastWeek") {
    const lt = now;
    const gte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { gte, lt };
  }
  if (input.from && input.to) {
    const gte = new Date(`${input.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${input.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    return { gte, lt: toExclusive };
  }
  return null;
}
