import { getFormatter } from "next-intl/server";

/**
 * Server-side localized formatting helpers, thin wrappers over next-intl's
 * formatter (which itself wraps `Intl.*`, with the named formats from
 * `formats.ts` and the per-request locale / `Europe/Rome` time zone).
 *
 * Client Components should use the `useFormatter()` hook directly (it shares
 * the same named formats), so these helpers stay server-only to avoid pulling
 * `next-intl/server` into the client bundle.
 *
 * Currency is EUR for both locales; only the locale-specific presentation
 * (grouping, decimal separator, symbol placement) differs.
 */

/** EUR currency, e.g. IT "1.234,50 €" · EN "€1,234.50". */
export async function formatCurrency(amount: number): Promise<string> {
  const format = await getFormatter();
  return format.number(amount, "currency");
}

/** EUR currency without decimals, for KPI tiles / large sums. */
export async function formatCurrencyWhole(amount: number): Promise<string> {
  const format = await getFormatter();
  return format.number(amount, "currencyWhole");
}

/** Percentage from a 0–1 ratio, e.g. 0.42 → IT "42%" · EN "42%". */
export async function formatPercent(ratio: number): Promise<string> {
  const format = await getFormatter();
  return format.number(ratio, "percent");
}

/** Short date, e.g. IT "18 giu 2026" · EN "Jun 18, 2026". */
export async function formatDateShort(date: Date): Promise<string> {
  const format = await getFormatter();
  return format.dateTime(date, "short");
}

/** Date + time, e.g. for appointment start times. */
export async function formatDateTime(date: Date): Promise<string> {
  const format = await getFormatter();
  return format.dateTime(date, "dateTime");
}
