import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { formats } from "@/i18n/formats";
import { routing } from "@/i18n/routing";

/**
 * Per-request next-intl configuration (server-only). The locale typically comes
 * from the `[locale]` segment via `requestLocale`; we validate it against the
 * supported locales and fall back to the default otherwise.
 *
 * `timeZone` is pinned to Europe/Rome so SSR and client render dates/times
 * identically (no hydration mismatch) regardless of the server's zone.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats,
    timeZone: "Europe/Rome",
  };
});
