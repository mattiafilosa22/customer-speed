/**
 * App display time zone (matches the i18n formatter + day helpers).
 */
const APP_TIME_ZONE = "Europe/Rome";

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
