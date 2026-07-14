import {
  isDateRangeInputError,
  parseDateRangeInput,
  type DateRangeInputError,
} from "@/lib/date-range-input";

export type { DateRangeInputError } from "@/lib/date-range-input";

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
 * of them select a range (e.g. no params, only one of `from`/`to`, or an
 * INVALID `from`/`to` pair — see below).
 *
 *  - `preset: "lastWeek"` → the 7 days ending at `now` (exclusive upper bound),
 *    i.e. `[now - 7d, now)`. `now` is injectable for deterministic tests.
 *  - `from` + `to` (both required) → the WHOLE calendar days from `from` to
 *    `to` INCLUSIVE, so `lt` is `to` + 1 day at UTC midnight — same "inclusive
 *    end represented as exclusive next-instant" convention as `periodRange`.
 *  - anything else (no params, only one of `from`/`to`, a malformed date
 *    string, or an INVERTED range where `from` is after `to`) → `null`,
 *    meaning "this filter is not active" (the caller falls back to
 *    `year`/`month`).
 *
 * Deliberately never throws: `from`/`to` are untrusted URL input (a
 * hand-edited query string can carry a non-ISO string, and picking "Dal"
 * after "Al" is a completely ordinary UI interaction, not tampering). Either
 * one turning into `Invalid Date` or an inverted range must NOT crash the
 * whole dashboard page server-side — it degrades to "filter not active"
 * instead, same as omitting the params entirely. Callers that need to tell
 * "not active because absent" apart from "not active because invalid" (to
 * show the user an error instead of silently ignoring their input) should
 * use `dateRangeInputError` below.
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
    const result = parseDateRangeInput(input.from, input.to);
    return isDateRangeInputError(result) ? null : result;
  }
  return null;
}

/**
 * Whether `input.from`+`input.to` were BOTH supplied but describe an invalid
 * selection (malformed date, or `from` after `to`) — the case where
 * `resolveDateRangeBounds` safely falls back to `null` (filter inactive)
 * WITHOUT the caller losing the fact that the input was bad. Returns `null`
 * when there is nothing wrong (including "not enough params to say", i.e.
 * only one of `from`/`to`, or neither — that is simply "not active", not an
 * error).
 */
export function dateRangeInputError(input: DateRangeInput): DateRangeInputError | null {
  if (!input.from || !input.to) {
    return null;
  }
  const result = parseDateRangeInput(input.from, input.to);
  return isDateRangeInputError(result) ? result : null;
}
