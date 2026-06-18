import { defineRouting } from "next-intl/routing";

/**
 * Locale routing configuration (single source of truth for the rest of the
 * i18n layer and the middleware).
 *
 * - `it` is the platform default and is served **without** a path prefix
 *   (e.g. `/dashboard`), per the confirmed Fase 0 decision.
 * - `en` is served with the `/en/...` prefix.
 *
 * `localePrefix: 'as-needed'` implements exactly this: the default locale has
 * no prefix, every other locale does.
 */
export const routing = defineRouting({
  locales: ["it", "en"],
  defaultLocale: "it",
  localePrefix: "as-needed",
});

/** Union of the supported locale codes — use across the app instead of `string`. */
export type Locale = (typeof routing.locales)[number];
