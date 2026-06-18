import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * next-intl middleware: resolves the active locale (from the path prefix or, for
 * the default locale, its absence) and rewrites requests to the internal
 * `/[locale]/...` routes. With `localePrefix: 'as-needed'` the default locale
 * `it` stays prefix-less (`/dashboard`) and `en` is served at `/en/dashboard`.
 */
export default createMiddleware(routing);

export const config = {
  /**
   * Run on every path EXCEPT:
   * - `/api`, `/trpc` — API routes are not localized
   * - `/_next` — Next.js internals
   * - `/_vercel` — Vercel internals
   * - any path containing a dot (static files: favicon.ico, *.svg, *.png, ...)
   */
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
