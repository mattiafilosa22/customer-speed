/**
 * App display time zone (matches the i18n formatter + day helpers).
 */
const APP_TIME_ZONE = "Europe/Rome";

/**
 * Given a civil day `YYYY-MM-DD` in the APP time zone, return the half-open UTC
 * interval `[gte, lt)` that covers it (i.e. 00:00 of that day in Europe/Rome to
 * 00:00 of the next day in Europe/Rome, expressed as absolute UTC instants).
 *
 * Used to filter `Appointment.startAt` (a `timestamptz`/UTC instant) to a single
 * day as the user perceives it (docs/00 §3 — store/compare UTC, present in the
 * app zone). DST-correct: the offset is read from the actual instant, not assumed.
 *
 * Algorithm: take midday UTC of the requested civil day (unambiguous, never near
 * a DST jump), read the Europe/Rome offset at that instant, then the UTC instant
 * of local-midnight is `midnightLocalAsUtc = Date.UTC(day 00:00) - offset`.
 */
export function romeDayRangeUtc(isoDate: string): { gte: Date; lt: Date } {
  const [year, month, day] = isoDate.split("-").map((p) => Number.parseInt(p, 10));
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  const offsetMs = romeOffsetMs(Date.UTC(year, month - 1, day, 12, 0, 0));
  const startUtc = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;
  const gte = new Date(startUtc);
  const lt = new Date(startUtc + 24 * 60 * 60 * 1000);
  return { gte, lt };
}

/**
 * The Europe/Rome UTC offset (in ms) in effect at the given UTC instant.
 * Computed by formatting the instant in the app zone and diffing against the
 * same wall-clock interpreted as UTC.
 */
function romeOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing date part: ${type}`);
    return Number.parseInt(part.value, 10);
  };

  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - utcMs;
}
