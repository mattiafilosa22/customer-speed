/**
 * "Giorni" (days-in-stage) calculation — docs/03 §3.4.
 *
 * The product shows how many days a lead has been sitting in its current stage:
 * `now - stageChangedAt`, as a whole number of calendar days. This is a pure,
 * side-effect-free helper so it is trivially testable and reusable across the
 * list, the detail page and the dashboard.
 *
 * Calendar-day semantics (not raw 24h spans): two instants on the same calendar
 * day are "0 days apart", crossing midnight once is "1 day", etc. We compute on
 * the `Europe/Rome` civil calendar (the product's time zone) so the badge does
 * not flip a day early/late around midnight for Italian users — matching the
 * locale/time-zone used by the i18n formatter (`src/i18n/formats.ts`).
 *
 * Negative spans (a future `stageChangedAt`, e.g. clock skew) clamp to 0.
 */

const APP_TIME_ZONE = "Europe/Rome";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns the civil date (year/month/day) of `date` in the given IANA time zone
 * as a UTC midnight `Date`, so two such values can be subtracted to count whole
 * calendar days without DST artifacts.
 */
function civilMidnightUtc(date: Date, timeZone: string): number {
  // `en-CA` yields an ISO-like `YYYY-MM-DD`, stable to parse regardless of the
  // app/user locale (we only need the numbers, not localized presentation).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) {
      throw new Error(`Missing date part: ${type}`);
    }
    return Number.parseInt(part.value, 10);
  };

  return Date.UTC(lookup("year"), lookup("month") - 1, lookup("day"));
}

/**
 * Whole calendar days between `stageChangedAt` and `now` in `Europe/Rome`.
 * Clamped to a non-negative integer.
 *
 * @param stageChangedAt instant the lead entered its current stage
 * @param now reference instant (injectable for deterministic tests)
 */
export function daysInStage(stageChangedAt: Date, now: Date = new Date()): number {
  const from = civilMidnightUtc(stageChangedAt, APP_TIME_ZONE);
  const to = civilMidnightUtc(now, APP_TIME_ZONE);
  const diff = Math.round((to - from) / MS_PER_DAY);
  return diff > 0 ? diff : 0;
}
