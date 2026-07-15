import { romeOffsetMs } from "@/lib/rome-day";

/**
 * App display time zone (matches the i18n formatter + day helpers).
 */
const APP_TIME_ZONE = "Europe/Rome";

/** Matches a bare `datetime-local` value: `YYYY-MM-DDTHH:mm` (optionally `:ss`), no offset/Z. */
const BARE_LOCAL_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(:(?<second>\d{2}))?$/;

/**
 * Format a UTC `Date` as the value for an `<input type="datetime-local">`
 * (`YYYY-MM-DDTHH:mm`) in the APP time zone, so the edit form shows the same
 * wall-clock time the user sees in the list (not the server's local time).
 *
 * Pure + deterministic (uses `Intl.DateTimeFormat` parts), safe to call from a
 * Server Component. The browser re-interprets the bare value in the user's local
 * zone on submit; for the product's Italian audience this coincides with the app
 * zone, and the value is re-rendered through the localized formatter on read.
 */
export function toDatetimeLocalValue(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing date part: ${type}`);
    return part.value;
  };

  // `hour` can be "24" at midnight in some environments; normalize to "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/**
 * Parse a `datetime-local` input value (`YYYY-MM-DDTHH:mm[:ss]`, no offset) as
 * a wall-clock time in the APP time zone (Europe/Rome), returning the
 * corresponding UTC `Date`.
 *
 * This is the counterpart to `toDatetimeLocalValue` and MUST be used instead of
 * a bare `new Date(value)` for these values: an offset-less date-time string is
 * parsed by the JS runtime in ITS OWN local zone, which on the server is
 * whatever the Node process's `TZ` is (e.g. UTC on Vercel), not Europe/Rome —
 * silently shifting every manually-entered appointment time by the current
 * Rome/UTC offset (1h in winter, 2h in summer/DST).
 *
 * A value that already carries an offset/`Z` (e.g. from the REST API or an
 * external calendar sync) is unambiguous and passed straight to `new Date`.
 *
 * DST edge case: the offset is resolved from a first-pass UTC interpretation of
 * the wall-clock value, which is exact except for the ~1h skipped/repeated
 * locally at the spring/autumn transition — an acceptable, rare imprecision.
 */
export function fromDatetimeLocalValue(value: string): Date {
  const match = BARE_LOCAL_PATTERN.exec(value);
  if (!match?.groups) return new Date(value);

  // The pattern guarantees year/month/day/hour/minute are present when
  // `match.groups` exists; only `second` is truly optional.
  const { year, month, day, hour, minute, second = "0" } = match.groups as Record<
    "year" | "month" | "day" | "hour" | "minute",
    string
  > &
    Partial<Record<"second", string>>;
  const guessUtcMs = Date.UTC(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    Number.parseInt(hour, 10),
    Number.parseInt(minute, 10),
    Number.parseInt(second, 10),
  );
  return new Date(guessUtcMs - romeOffsetMs(guessUtcMs));
}
