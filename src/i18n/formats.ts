import type { Formats } from "next-intl";

/**
 * App-wide named formats shared by every locale (IT + EN). Consumed via
 * next-intl's formatter (`useFormatter` / `getFormatter`) and through the
 * helpers in `format.ts`. Keeping them here (and registered as the global
 * `Formats` type in `global.d.ts`) means the format names are type-checked at
 * call sites and the presentation stays consistent across the app.
 *
 * Currency is **EUR for both locales** (CustomerSpeed is an EUR product), only
 * the locale-specific grouping/decimal/symbol placement differs — that is
 * handled automatically by `Intl` given the active locale.
 */
export const formats = {
  dateTime: {
    /** e.g. IT "18 giu 2026" · EN "Jun 18, 2026" */
    short: {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
    /** e.g. IT "18 giugno 2026" · EN "June 18, 2026" */
    long: {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
    /** Date + time, e.g. for appointment start times. */
    dateTime: {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  },
  number: {
    /** EUR currency. Locale decides symbol placement / grouping. */
    currency: {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    },
    /** Whole-euro currency (no decimals) for KPI tiles / large sums. */
    currencyWhole: {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    },
    /** Percentage (e.g. conversion rate). Pass a 0–1 ratio. */
    percent: {
      style: "percent",
      maximumFractionDigits: 1,
    },
  },
} satisfies Formats;
